import {
  WorkspaceToolsError,
  type WorkspaceProjectConfigSave,
  type WorkspaceTaskTransition,
  ThreadId,
  type WorkspaceTaskUpsert,
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
  revision: number;
  done: number;
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
          completedColumn: string | null;
          revision: number;
        }>`SELECT columns_json AS "columnsJson",browser_thread_id AS "browserThreadId",completed_column AS "completedColumn",revision FROM workspace_project_config WHERE project_id=${projectId}`;
        const row = rows[0];
        const taskColumns = row
          ? yield* decodeColumns(row.columnsJson)
          : ["To do", "In progress", "Done"];
        const completedColumn = row ? row.completedColumn : "Done";
        return {
          projectId,
          taskColumns,
          browserThreadId: row?.browserThreadId ? ThreadId.make(row.browserThreadId) : null,
          completedColumn:
            completedColumn !== null && taskColumns.includes(completedColumn)
              ? completedColumn
              : null,
          revision: row?.revision ?? 0,
        };
      }),
    );
  const getTask = (id: string) =>
    safe(
      Effect.gen(function* () {
        const rows =
          yield* sql<TaskRow>`SELECT t.id,t.project_id AS "projectId",t.title,t.column_name AS "column",t.revision,COALESCE(t.column_name = CASE WHEN c.project_id IS NULL THEN 'Done' ELSE c.completed_column END,0) AS done FROM workspace_tasks t LEFT JOIN workspace_project_config c ON c.project_id=t.project_id WHERE t.id=${id} AND t.deleted=0`;
        const row = rows[0];
        if (!row)
          return yield* fail("not-found", "This task is unavailable. Its links have been kept.");
        yield* requireProject(row.projectId);
        return { ...row, done: row.done === 1 };
      }),
    );
  return {
    config,
    getTask,
    changes: SubscriptionRef.changes(counter).pipe(Stream.filter((n) => n > 0)),
    saveConfig: (input: WorkspaceProjectConfigSave) =>
      locks.withLock(
        input.projectId,
        safe(
          Effect.gen(function* () {
            const result = yield* sql.withTransaction(
              Effect.gen(function* () {
                const current = yield* config(input.projectId);
                if (
                  input.expectedRevision !== undefined &&
                  input.expectedRevision !== current.revision
                )
                  return yield* fail(
                    "conflict",
                    "Workspace settings changed on another client. Reload before saving.",
                  );
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
                const removedDesignation =
                  current.completedColumn !== null && !columns.includes(current.completedColumn);
                const requestedCompletedColumn =
                  input.completedColumn === undefined
                    ? current.completedColumn
                    : input.completedColumn;
                const completedColumn =
                  removedDesignation && requestedCompletedColumn === current.completedColumn
                    ? null
                    : requestedCompletedColumn;
                const designationChanged = completedColumn !== current.completedColumn;
                if (
                  completedColumn !== null &&
                  (!columns.includes(completedColumn) ||
                    !columns.some((column) => column !== completedColumn))
                )
                  return yield* fail(
                    "invalid-input",
                    "Choose a completed column and keep at least one open column, or clear the designation.",
                  );
                if (
                  designationChanged &&
                  input.expectedRevision === undefined &&
                  !(removedDesignation && completedColumn === null)
                )
                  return yield* fail(
                    "conflict",
                    "Reload workspace settings before changing completion.",
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
                const affected = designationChanged
                  ? yield* sql<{
                      total: number;
                    }>`SELECT COUNT(*) AS total FROM workspace_tasks WHERE project_id=${input.projectId} AND deleted=0 AND ((column_name IS ${current.completedColumn}) != (column_name IS ${completedColumn}))`
                  : [{ total: 0 }];
                const count = affected[0]!.total;
                if (count > 0 && input.confirmCompletionChanges !== true)
                  return yield* new WorkspaceToolsError({
                    kind: "conflict",
                    reason: "completion-confirmation-required",
                    message: `Changing the completed column changes completion for ${count} task${count === 1 ? "" : "s"}. Confirm to continue.`,
                  });
                if (
                  !designationChanged &&
                  encodeColumns(columns) === encodeColumns(current.taskColumns) &&
                  input.browserThreadId === current.browserThreadId
                )
                  return { value: current, changed: false };
                yield* sql`INSERT INTO workspace_project_config(project_id,columns_json,browser_thread_id,completed_column,revision) VALUES(${input.projectId},${encodeColumns(columns)},${input.browserThreadId},${completedColumn},${current.revision + 1}) ON CONFLICT(project_id) DO UPDATE SET columns_json=excluded.columns_json,browser_thread_id=excluded.browser_thread_id,completed_column=excluded.completed_column,revision=excluded.revision`;
                if (count > 0)
                  yield* sql`UPDATE workspace_tasks SET revision=revision+1 WHERE project_id=${input.projectId} AND deleted=0 AND ((column_name IS ${current.completedColumn}) != (column_name IS ${completedColumn}))`;
                return { value: yield* config(input.projectId), changed: true };
              }),
            );
            if (result.changed) yield* announce;
            return result.value;
          }),
        ),
      ),
    listTasks: (projectId: ProjectId) =>
      safe(
        Effect.gen(function* () {
          yield* requireProject(projectId);
          const rows =
            yield* sql<TaskRow>`SELECT t.id,t.project_id AS "projectId",t.title,t.column_name AS "column",t.revision,COALESCE(t.column_name = CASE WHEN c.project_id IS NULL THEN 'Done' ELSE c.completed_column END,0) AS done FROM workspace_tasks t LEFT JOIN workspace_project_config c ON c.project_id=t.project_id WHERE t.project_id=${projectId} AND t.deleted=0 ORDER BY t.id LIMIT 201`;
          return {
            tasks: rows.slice(0, 200).map((row) => ({
              ...row,
              done: row.done === 1,
            })),
            incomplete: rows.length > 200,
          };
        }),
      ),
    upsertTask: (input: WorkspaceTaskUpsert) =>
      locks.withLock(
        input.projectId,
        safe(
          Effect.gen(function* () {
            const result = yield* sql.withTransaction(
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
                    if (previous.title === title && previous.column === input.column)
                      return { value: previous, changed: false };
                  }
                }
                const id = input.id ?? `wskt_${yield* crypto.randomUUIDv4}`;
                yield* sql`INSERT INTO workspace_tasks(id,project_id,title,column_name) VALUES(${id},${input.projectId},${title},${input.column}) ON CONFLICT(id) DO UPDATE SET title=excluded.title,column_name=excluded.column_name,revision=workspace_tasks.revision+1`;
                return { value: yield* getTask(id), changed: true };
              }),
            );
            if (result.changed) yield* announce;
            return result.value;
          }),
        ),
      ),
    transitionTask: (input: WorkspaceTaskTransition) =>
      safe(
        Effect.gen(function* () {
          const owner = yield* getTask(input.id);
          return yield* locks.withLock(
            owner.projectId,
            Effect.gen(function* () {
              const result = yield* sql.withTransaction(
                Effect.gen(function* () {
                  const current = yield* getTask(input.id);
                  const settings = yield* config(current.projectId);
                  if (input.change.type === "completion" && settings.completedColumn === null)
                    return yield* fail(
                      "invalid-input",
                      "Choose a completed column in project workspace settings.",
                    );
                  const target =
                    input.change.type === "column"
                      ? input.change.column
                      : input.change.completed
                        ? settings.completedColumn
                        : settings.taskColumns.find((name) => name !== settings.completedColumn);
                  if (!target || !settings.taskColumns.includes(target))
                    return yield* fail(
                      "invalid-input",
                      "Choose a completed column in project workspace settings.",
                    );
                  if (
                    current.column === target ||
                    (input.change.type === "completion" && current.done === input.change.completed)
                  )
                    return { value: current, changed: false };
                  if (current.revision !== input.expectedRevision)
                    return yield* fail(
                      "conflict",
                      "This task changed on another client. Reload before saving.",
                    );
                  yield* sql`UPDATE workspace_tasks SET column_name=${target},revision=revision+1 WHERE id=${input.id} AND deleted=0 AND revision=${input.expectedRevision}`;
                  return { value: yield* getTask(input.id), changed: true };
                }),
              );
              if (result.changed) yield* announce;
              return result.value;
            }),
          );
        }),
      ),
    deleteTask: (id: string) =>
      safe(
        Effect.gen(function* () {
          const task = yield* getTask(id);
          yield* locks.withLock(
            task.projectId,
            Effect.gen(function* () {
              yield* sql.withTransaction(
                Effect.gen(function* () {
                  yield* getTask(id);
                  yield* sql`UPDATE workspace_tasks SET deleted=1,revision=revision+1 WHERE id=${id} AND deleted=0`;
                }),
              );
              yield* announce;
            }),
          );
        }),
      ),
  };
});
export class WorkspaceTools extends Context.Service<WorkspaceTools, Effect.Success<typeof make>>()(
  "t3/workspace/WorkspaceTools",
) {}
export const layer = Layer.effect(WorkspaceTools, make);
