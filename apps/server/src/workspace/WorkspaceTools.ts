import {
  WorkspaceToolsError,
  type WorkspaceProjectConfig,
  type WorkspaceTaskUpsert,
  type WorkspaceTask,
  type ProjectId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { makeKeyedSerialExecutor } from "../orchestration-v2/KeyedSerialExecutor.ts";
const Columns = Schema.fromJsonString(Schema.Array(Schema.String));
const decodeColumns = Schema.decodeUnknownEffect(Columns);
const encodeColumns = Schema.encodeSync(Columns);
const isToolsError = Schema.is(WorkspaceToolsError);
const fail = (kind: WorkspaceToolsError["kind"], message: string) =>
  new WorkspaceToolsError({ kind, message });
interface TaskRow {
  id: string;
  projectId: ProjectId;
  title: string;
  column: string;
}
export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const crypto = yield* Crypto.Crypto;
  const locks = yield* makeKeyedSerialExecutor<string>();
  const counter = yield* SubscriptionRef.make(0);
  const announce = SubscriptionRef.update(counter, (n) => n + 1);
  const safe = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.mapError((error) =>
        isToolsError(error)
          ? error
          : fail("unavailable", "Workspace settings or tasks could not be saved or read."),
      ),
    );
  const requireProject = (projectId: ProjectId) =>
    Effect.gen(function* () {
      const rows =
        yield* sql`SELECT project_id FROM projection_projects WHERE project_id=${projectId} AND deleted_at IS NULL`;
      if (!rows.length) return yield* fail("not-found", "This project is unavailable.");
    });
  const config = (projectId: ProjectId) =>
    safe(
      Effect.gen(function* () {
        yield* requireProject(projectId);
        const rows = yield* sql<{
          columnsJson: string;
          browserThreadId: string | null;
        }>`SELECT columns_json AS "columnsJson",browser_thread_id AS "browserThreadId" FROM workspace_project_config WHERE project_id=${projectId}`;
        const row = rows[0];
        return {
          projectId,
          taskColumns: row
            ? yield* decodeColumns(row.columnsJson)
            : ["To do", "In progress", "Done"],
          browserThreadId: row?.browserThreadId ?? null,
        } as WorkspaceProjectConfig;
      }),
    );
  const getTask = (id: string) =>
    safe(
      Effect.gen(function* () {
        const rows =
          yield* sql<TaskRow>`SELECT id,project_id AS "projectId",title,column_name AS "column" FROM workspace_tasks WHERE id=${id} AND deleted=0`;
        const row = rows[0];
        if (!row)
          return yield* fail("not-found", "This task is unavailable. Its links have been kept.");
        yield* requireProject(row.projectId);
        return row as WorkspaceTask;
      }),
    );
  return {
    config,
    getTask,
    changes: SubscriptionRef.changes(counter).pipe(Stream.filter((n) => n > 0)),
    saveConfig: (input: WorkspaceProjectConfig) =>
      locks.withLock(
        input.projectId,
        safe(
          Effect.gen(function* () {
            yield* requireProject(input.projectId);
            const columns = input.taskColumns.map((value) => value.trim());
            if (
              columns.length < 1 ||
              columns.length > 12 ||
              columns.some((value) => !value || value.length > 40) ||
              new Set(columns).size !== columns.length
            )
              return yield* fail(
                "invalid-input",
                "Use one to twelve unique task columns, each up to forty characters.",
              );
            const used = yield* sql<{
              column: string;
            }>`SELECT DISTINCT column_name AS "column" FROM workspace_tasks WHERE project_id=${input.projectId} AND deleted=0`;
            if (used.some((row) => !columns.includes(row.column)))
              return yield* fail(
                "conflict",
                "Move tasks out of a column before removing or renaming it.",
              );
            if (input.browserThreadId) {
              const thread =
                yield* sql`SELECT thread_id FROM orchestration_v2_projection_threads WHERE thread_id=${input.browserThreadId} AND project_id=${input.projectId} AND deleted_at IS NULL`;
              if (!thread.length)
                return yield* fail(
                  "invalid-input",
                  "Choose an existing thread from this project for Browser.",
                );
            }
            yield* sql`INSERT INTO workspace_project_config(project_id,columns_json,browser_thread_id) VALUES(${input.projectId},${encodeColumns(columns)},${input.browserThreadId}) ON CONFLICT(project_id) DO UPDATE SET columns_json=excluded.columns_json,browser_thread_id=excluded.browser_thread_id`;
            yield* announce;
            return { ...input, taskColumns: columns };
          }),
        ),
      ),
    listTasks: (projectId: ProjectId) =>
      safe(
        Effect.gen(function* () {
          yield* requireProject(projectId);
          const rows =
            yield* sql<TaskRow>`SELECT id,project_id AS "projectId",title,column_name AS "column" FROM workspace_tasks WHERE project_id=${projectId} AND deleted=0 ORDER BY id LIMIT 201`;
          return { tasks: rows.slice(0, 200) as WorkspaceTask[], incomplete: rows.length > 200 };
        }),
      ),
    upsertTask: (input: WorkspaceTaskUpsert) =>
      locks.withLock(
        input.projectId,
        safe(
          Effect.gen(function* () {
            const settings = yield* config(input.projectId);
            const title = input.title.trim();
            if (!title || title.length > 240 || !settings.taskColumns.includes(input.column))
              return yield* fail(
                "invalid-input",
                "Enter a task title and choose one of this project's columns.",
              );
            if (input.id) {
              const existing = yield* sql`SELECT id FROM workspace_tasks WHERE id=${input.id}`;
              if (existing.length) {
                const previous = yield* getTask(input.id);
                if (previous.projectId !== input.projectId)
                  return yield* fail("conflict", "A task cannot be moved to another project.");
              }
            }
            const id = input.id ?? `wskt_${yield* crypto.randomUUIDv4}`;
            yield* sql`INSERT INTO workspace_tasks(id,project_id,title,column_name) VALUES(${id},${input.projectId},${title},${input.column}) ON CONFLICT(id) DO UPDATE SET title=excluded.title,column_name=excluded.column_name`;
            yield* announce;
            return { id, projectId: input.projectId, title, column: input.column } as WorkspaceTask;
          }),
        ),
      ),
    deleteTask: (id: string) =>
      safe(
        Effect.gen(function* () {
          const task = yield* getTask(id);
          yield* locks.withLock(
            task.projectId,
            sql`UPDATE workspace_tasks SET deleted=1 WHERE id=${id}`,
          );
          yield* announce;
        }),
      ),
  };
});
export class WorkspaceTools extends Context.Service<WorkspaceTools, Effect.Success<typeof make>>()(
  "t3/workspace/WorkspaceTools",
) {}
export const layer = Layer.effect(WorkspaceTools, make);
