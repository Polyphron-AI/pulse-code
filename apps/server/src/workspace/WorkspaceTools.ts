import {
  WorkspaceToolsError,
  WorkspaceTaskQuery,
  WorkspaceTaskDueOn,
  WorkspaceTaskId,
  ProjectId,
  type WorkspaceTaskPage,
  type WorkspaceProjectConfigSave,
  type WorkspaceTaskTransition,
  ThreadId,
  WorkspaceTaskUpsert,
  WorkspaceTaskPatch,
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
const decodeTaskUpsert = Schema.decodeEffect(WorkspaceTaskUpsert);
const decodeTaskPatch = Schema.decodeEffect(WorkspaceTaskPatch);
const decodeQuery = Schema.decodeUnknownEffect(WorkspaceTaskQuery);
const Cursor = Schema.fromJsonString(
  Schema.Struct({
    version: Schema.Literal(1),
    instance: Schema.String,
    generation: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    fingerprint: Schema.String,
    dueOn: Schema.NullOr(WorkspaceTaskDueOn),
    projectId: ProjectId,
    id: WorkspaceTaskId,
  }),
);
const encodeCursor = Schema.encodeSync(Cursor);
const encodeFingerprint = Schema.encodeSync(
  Schema.fromJsonString(Schema.Array(Schema.NullOr(Schema.Union([Schema.String, Schema.Number])))),
);
const decodeCursor = Schema.decodeUnknownEffect(Cursor);
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
  dueOn: string | null;
  areaLabel: string | null;
  owner: "environment-owner" | null;
}
export function taskQuerySql(
  sql: SqlClient.SqlClient,
  query: WorkspaceTaskQuery,
  cursor?: Pick<typeof Cursor.Type, "dueOn" | "projectId" | "id">,
) {
  const done = sql`COALESCE(t.column_name=CASE WHEN c.project_id IS NULL THEN 'Done' ELSE c.completed_column END,0)`;
  const filters = [sql`t.deleted=0`];
  if (query.projectId) filters.push(sql`t.project_id=${query.projectId}`);
  if (query.state !== "all") filters.push(sql`${done}=${query.state === "done" ? 1 : 0}`);
  if (query.owner === "unassigned") filters.push(sql`t.owner IS NULL`);
  if (query.owner === "environment-owner") filters.push(sql`t.owner=${query.owner}`);
  if (query.dueFrom)
    filters.push(sql`(t.due_on IS NULL)=0 AND COALESCE(t.due_on,'')>=${query.dueFrom}`);
  if (query.dueTo)
    filters.push(sql`(t.due_on IS NULL)=0 AND COALESCE(t.due_on,'')<=${query.dueTo}`);
  if (query.text) {
    const text = `%${query.text.replace(/[!%_]/g, (value) => `!${value}`)}%`;
    filters.push(
      sql`(t.title LIKE ${text} ESCAPE '!' OR t.area_label LIKE ${text} ESCAPE '!' OR p.title LIKE ${text} ESCAPE '!')`,
    );
  }
  const relation = sql`FROM workspace_tasks t JOIN projection_projects p ON p.project_id=t.project_id AND p.deleted_at IS NULL LEFT JOIN workspace_project_config c ON c.project_id=t.project_id`;
  const pageFilters = [...filters];
  if (cursor) {
    pageFilters.push(
      sql`(t.due_on IS NULL,COALESCE(t.due_on,''),t.project_id,t.id)>(${cursor.dueOn === null ? 1 : 0},${cursor.dueOn ?? ""},${cursor.projectId},${cursor.id})`,
    );
  }
  const order =
    query.dueFrom || query.dueTo
      ? sql`COALESCE(t.due_on,''),t.project_id,t.id`
      : sql`(t.due_on IS NULL),COALESCE(t.due_on,''),t.project_id,t.id`;
  const page = sql<
    TaskRow & { projectTitle: string }
  >`SELECT t.id,t.project_id AS "projectId",p.title AS "projectTitle",t.title,t.column_name AS "column",t.revision,t.due_on AS "dueOn",t.area_label AS "areaLabel",t.owner,${done} AS done ${relation} WHERE ${sql.and(pageFilters)} ORDER BY ${order} LIMIT ${query.limit + 1}`;
  return { done, filters, relation, page };
}
export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const crypto = yield* Crypto.Crypto;
  const instance = yield* crypto.randomUUIDv4;
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
          yield* sql<TaskRow>`SELECT t.id,t.project_id AS "projectId",t.title,t.column_name AS "column",t.revision,t.due_on AS "dueOn",t.area_label AS "areaLabel",t.owner,COALESCE(t.column_name = CASE WHEN c.project_id IS NULL THEN 'Done' ELSE c.completed_column END,0) AS done FROM workspace_tasks t LEFT JOIN workspace_project_config c ON c.project_id=t.project_id WHERE t.id=${id} AND t.deleted=0`;
        const row = rows[0];
        if (!row)
          return yield* fail("not-found", "This task is unavailable. Its links have been kept.");
        yield* requireProject(row.projectId);
        return { ...row, done: row.done === 1 };
      }),
    );
  const prepareTransition = (
    current: Effect.Success<ReturnType<typeof getTask>>,
    settings: Effect.Success<ReturnType<typeof config>>,
    input: WorkspaceTaskTransition,
    otherChanges = false,
  ) =>
    Effect.gen(function* () {
      if (input.change.type === "completion" && settings.completedColumn === null)
        return yield* fail(
          "invalid-input",
          "Choose a completed column in project workspace settings.",
        );
      const column =
        input.change.type === "column"
          ? input.change.column
          : input.change.completed
            ? settings.completedColumn
            : settings.taskColumns.find((name) => name !== settings.completedColumn);
      if (!column || !settings.taskColumns.includes(column))
        return yield* fail("invalid-input", "Choose a column from this project's task columns.");
      const changed =
        otherChanges ||
        (current.column !== column &&
          !(input.change.type === "completion" && current.done === input.change.completed));
      if (changed && current.revision !== input.expectedRevision)
        return yield* fail(
          "conflict",
          "This task changed on another client. Reload before saving.",
        );
      return { column, changed };
    });
  return {
    config,
    getTask,
    queryTasks: (input: typeof WorkspaceTaskQuery.Encoded) =>
      safe(
        sql.withTransaction(
          Effect.gen(function* () {
            const query = yield* decodeQuery(input).pipe(
              Effect.mapError(() =>
                fail("invalid-input", "Choose valid task filters and a page size from 1 to 100."),
              ),
            );
            if (query.projectId) yield* requireProject(query.projectId);
            const [{ generation } = { generation: 0 }] = yield* sql<{
              generation: number;
            }>`SELECT generation FROM workspace_task_query_generation WHERE id=1`;
            const fingerprint = encodeFingerprint([
              query.projectId ?? null,
              query.state,
              query.text || null,
              query.dueFrom ?? null,
              query.dueTo ?? null,
              query.owner,
              query.limit,
            ]);
            let cursor: typeof Cursor.Type | undefined;
            if (query.cursor !== undefined) {
              if (!/^[A-Za-z0-9_-]+$/.test(query.cursor))
                return yield* fail(
                  "invalid-input",
                  "This task page is unavailable. Restart from the first page.",
                );
              cursor = yield* decodeCursor(
                Buffer.from(query.cursor, "base64url").toString("utf8"),
              ).pipe(
                Effect.mapError(() =>
                  fail(
                    "invalid-input",
                    "This task page is unavailable. Restart from the first page.",
                  ),
                ),
              );
              if (
                cursor.instance !== instance ||
                cursor.generation !== generation ||
                cursor.fingerprint !== fingerprint
              )
                return yield* fail(
                  "invalid-input",
                  "Tasks or filters changed. Restart from the first page.",
                );
            }
            const { done, filters, relation, page } = taskQuerySql(sql, query, cursor);
            const [counts] = yield* sql<{
              total: number;
              openTotal: number;
            }>`SELECT COUNT(*) AS total,COALESCE(SUM(1-${done}),0) AS "openTotal" ${relation} WHERE ${sql.and(filters)}`;
            const rows = yield* page;
            const tasks = rows
              .slice(0, query.limit)
              .map((row) => ({ ...row, done: row.done === 1 }));
            const projectIds = [
              ...new Set([
                ...tasks.map((task) => task.projectId),
                ...(query.projectId ? [query.projectId] : []),
              ]),
            ];
            const projects: WorkspaceTaskPage["projects"][number][] = [];
            let laneTotals: WorkspaceTaskPage["laneTotals"] = [];
            if (projectIds.length) {
              const configs = yield* sql<{
                projectId: ProjectId;
                columnsJson: string | null;
                browserThreadId: string | null;
                completedColumn: string | null;
                revision: number | null;
              }>`SELECT p.project_id AS "projectId",c.columns_json AS "columnsJson",c.browser_thread_id AS "browserThreadId",CASE WHEN c.project_id IS NULL THEN 'Done' ELSE c.completed_column END AS "completedColumn",c.revision FROM projection_projects p LEFT JOIN workspace_project_config c ON c.project_id=p.project_id WHERE ${sql.in("p.project_id", projectIds)} AND p.deleted_at IS NULL ORDER BY p.project_id`;
              for (const row of configs) {
                const taskColumns =
                  row.columnsJson === null
                    ? ["To do", "In progress", "Done"]
                    : yield* decodeColumns(row.columnsJson);
                projects.push({
                  projectId: row.projectId,
                  taskColumns,
                  browserThreadId: row.browserThreadId ? ThreadId.make(row.browserThreadId) : null,
                  completedColumn:
                    row.completedColumn !== null && taskColumns.includes(row.completedColumn)
                      ? row.completedColumn
                      : null,
                  revision: row.revision ?? 0,
                });
              }
              laneTotals = yield* sql<
                WorkspaceTaskPage["laneTotals"][number]
              >`SELECT t.project_id AS "projectId",t.column_name AS "column",COUNT(*) AS total ${relation} WHERE ${sql.and([...filters, sql.in("t.project_id", projectIds)])} GROUP BY t.project_id,t.column_name ORDER BY t.project_id,t.column_name LIMIT 1200`;
            }
            const last = tasks.at(-1);
            return {
              tasks,
              total: counts?.total ?? 0,
              openTotal: counts?.openTotal ?? 0,
              projects,
              laneTotals,
              nextCursor:
                rows.length > query.limit && last
                  ? Buffer.from(
                      encodeCursor({
                        version: 1,
                        instance,
                        generation,
                        fingerprint,
                        dueOn: last.dueOn,
                        projectId: last.projectId,
                        id: last.id,
                      }),
                    ).toString("base64url")
                  : null,
            } satisfies WorkspaceTaskPage;
          }),
        ),
      ),
    currentChange: SubscriptionRef.get(counter),
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
                const legacyOnlyCompletedColumn =
                  input.completedColumn === undefined &&
                  current.completedColumn !== null &&
                  columns.length === 1 &&
                  columns[0] === current.completedColumn;
                if (
                  legacyOnlyCompletedColumn &&
                  used.some((row) => row.column === current.completedColumn)
                )
                  return yield* fail(
                    "conflict",
                    "Keep at least one open column, or move tasks out of the completed column.",
                  );
                const removedDesignation =
                  current.completedColumn !== null && !columns.includes(current.completedColumn);
                const requestedCompletedColumn =
                  input.completedColumn === undefined
                    ? current.completedColumn
                    : input.completedColumn;
                const completedColumn =
                  (removedDesignation || legacyOnlyCompletedColumn) &&
                  requestedCompletedColumn === current.completedColumn
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
                  !((removedDesignation || legacyOnlyCompletedColumn) && completedColumn === null)
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
                if (
                  (count > 0 && input.confirmCompletionChanges !== true) ||
                  (input.confirmCompletionChanges === true &&
                    input.expectedAffectedCount !== undefined &&
                    input.expectedAffectedCount !== count)
                )
                  return yield* new WorkspaceToolsError({
                    kind: "conflict",
                    reason: "completion-confirmation-required",
                    affectedCount: count,
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
            yield* sql<TaskRow>`SELECT t.id,t.project_id AS "projectId",t.title,t.column_name AS "column",t.revision,t.due_on AS "dueOn",t.area_label AS "areaLabel",t.owner,COALESCE(t.column_name = CASE WHEN c.project_id IS NULL THEN 'Done' ELSE c.completed_column END,0) AS done FROM workspace_tasks t LEFT JOIN workspace_project_config c ON c.project_id=t.project_id WHERE t.project_id=${projectId} AND t.deleted=0 ORDER BY t.id LIMIT 201`;
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
                const title = input.title.trim();
                if (!title || title.length > 240)
                  return yield* fail(
                    "invalid-input",
                    "Enter a task title and choose one of this project's columns.",
                  );
                input = yield* decodeTaskUpsert({ ...input, title }).pipe(
                  Effect.mapError(() => fail("invalid-input", "Enter valid task metadata.")),
                );
                const settings = yield* config(input.projectId);
                let dueOn = input.dueOn ?? null;
                let areaLabel = input.areaLabel ?? null;
                let owner = input.owner === undefined ? "environment-owner" : input.owner;
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
                    dueOn = input.dueOn === undefined ? previous.dueOn : input.dueOn;
                    areaLabel =
                      input.areaLabel === undefined ? previous.areaLabel : input.areaLabel;
                    owner = input.owner === undefined ? previous.owner : input.owner;
                    const { changed } = yield* prepareTransition(
                      previous,
                      settings,
                      {
                        id: input.id,
                        expectedRevision: previous.revision,
                        change: { type: "column", column: input.column },
                      },
                      previous.title !== title ||
                        previous.dueOn !== dueOn ||
                        previous.areaLabel !== areaLabel ||
                        previous.owner !== owner,
                    );
                    if (!changed) return { value: previous, changed: false };
                    yield* sql`UPDATE workspace_tasks SET ${sql.update({
                      title,
                      column_name: input.column,
                      revision: previous.revision + 1,
                      ...(input.dueOn === undefined ? {} : { due_on: dueOn }),
                      ...(input.areaLabel === undefined ? {} : { area_label: areaLabel }),
                      ...(input.owner === undefined ? {} : { owner }),
                    })} WHERE id=${input.id} AND deleted=0`;
                    return { value: yield* getTask(input.id), changed: true };
                  }
                }
                const id = input.id ?? `wskt_${yield* crypto.randomUUIDv4}`;
                yield* sql`INSERT INTO workspace_tasks(id,project_id,title,column_name,due_on,area_label,owner) VALUES(${id},${input.projectId},${title},${input.column},${dueOn},${areaLabel},${owner})`;
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
                  const { column: target, changed } = yield* prepareTransition(
                    current,
                    settings,
                    input,
                  );
                  if (!changed) return { value: current, changed: false };
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
    patchTask: (input: WorkspaceTaskPatch) =>
      safe(
        Effect.gen(function* () {
          input = yield* decodeTaskPatch(input).pipe(
            Effect.mapError(() => fail("invalid-input", "Enter valid task metadata.")),
          );
          const owner = yield* getTask(input.id);
          return yield* locks.withLock(
            owner.projectId,
            Effect.gen(function* () {
              const result = yield* sql.withTransaction(
                Effect.gen(function* () {
                  const current = yield* getTask(input.id);
                  const settings = yield* config(current.projectId);
                  const title = input.title === undefined ? current.title : input.title.trim();
                  if (!title) return yield* fail("invalid-input", "Enter a task title.");
                  const dueOn = input.dueOn === undefined ? current.dueOn : input.dueOn;
                  const areaLabel =
                    input.areaLabel === undefined ? current.areaLabel : input.areaLabel;
                  const owner = input.owner === undefined ? current.owner : input.owner;
                  const { column, changed } = yield* prepareTransition(
                    current,
                    settings,
                    {
                      id: input.id,
                      expectedRevision: input.expectedRevision,
                      change: { type: "column", column: input.column ?? current.column },
                    },
                    title !== current.title ||
                      dueOn !== current.dueOn ||
                      areaLabel !== current.areaLabel ||
                      owner !== current.owner,
                  );
                  if (!changed) return { value: current, changed: false };
                  yield* sql`UPDATE workspace_tasks SET title=${title},column_name=${column},due_on=${dueOn},area_label=${areaLabel},owner=${owner},revision=revision+1 WHERE id=${input.id} AND deleted=0 AND revision=${input.expectedRevision}`;
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
