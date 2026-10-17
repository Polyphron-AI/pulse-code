import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { WorkspaceTaskQuery, ProjectId, WorkspaceTaskId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { taskQuerySql } from "../workspace/WorkspaceTools.ts";
import { runMigrations } from "./Migrations.ts";
const decodeQuery = Schema.decodeUnknownEffect(WorkspaceTaskQuery);
it.effect("keeps pre-owner tasks unassigned and constrains new owner values", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 66 });
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO workspace_tasks(id,project_id,title,column_name,revision,due_on,area_label) VALUES('legacy','project','Kept','Done',7,'2026-10-16','Marketing'),('deleted','project','Deleted','To do',3,NULL,NULL)`;
    yield* sql`UPDATE workspace_tasks SET deleted=1 WHERE id='deleted'`;
    yield* runMigrations();
    expect(yield* sql`SELECT id,owner,revision FROM workspace_tasks ORDER BY id`).toEqual([
      { id: "deleted", owner: null, revision: 3 },
      { id: "legacy", owner: null, revision: 7 },
    ]);
    expect(yield* sql`SELECT due_on,area_label FROM workspace_tasks WHERE id='legacy'`).toEqual([
      { due_on: "2026-10-16", area_label: "Marketing" },
    ]);
    expect((yield* Effect.exit(sql`UPDATE workspace_tasks SET owner='maya'`))._tag).toBe("Failure");
    yield* sql`UPDATE workspace_tasks SET owner='environment-owner' WHERE id='legacy'`;
    yield* runMigrations();
    expect(yield* sql`SELECT owner FROM workspace_tasks WHERE id='legacy'`).toEqual([
      { owner: "environment-owner" },
    ]);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
it.effect("upgrades default columns but leaves custom columns undesignated", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 64 });
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO workspace_project_config(project_id,columns_json) VALUES('default','["To do","In progress","Done"]'),('custom','["Backlog","Done"]')`;
    yield* sql`INSERT INTO workspace_tasks(id,project_id,title,column_name) VALUES('old','custom','Old task','Done')`;
    yield* runMigrations();
    expect(
      yield* sql`SELECT project_id,completed_column,revision FROM workspace_project_config ORDER BY project_id`,
    ).toEqual([
      { project_id: "custom", completed_column: null, revision: 0 },
      { project_id: "default", completed_column: "Done", revision: 0 },
    ]);
    expect(yield* sql`SELECT revision FROM workspace_tasks`).toEqual([{ revision: 0 }]);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("adds nullable civil-date metadata without rewriting existing tasks", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 65 });
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO workspace_tasks(id,project_id,title,column_name,revision) VALUES('old','project','Kept','Done',7)`;
    yield* runMigrations();
    expect(yield* sql`SELECT title,revision,due_on,area_label FROM workspace_tasks`).toEqual([
      { title: "Kept", revision: 7, due_on: null, area_label: null },
    ]);
    yield* sql`UPDATE workspace_tasks SET due_on='2024-02-29',area_label='Marketing'`;
    yield* runMigrations();
    expect(yield* sql`SELECT due_on,area_label FROM workspace_tasks`).toEqual([
      { due_on: "2024-02-29", area_label: "Marketing" },
    ]);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("indexes project, date and owner queries and invalidates task/config generations", () =>
  Effect.gen(function* () {
    yield* runMigrations({ toMigrationInclusive: 67 });
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO workspace_tasks(id,project_id,title,column_name,owner) VALUES('kept','p','Kept','To do','environment-owner')`;
    yield* runMigrations();
    expect(yield* sql`SELECT title,owner,revision FROM workspace_tasks`).toEqual([
      { title: "Kept", owner: "environment-owner", revision: 0 },
    ]);
    for (const input of [
      {},
      { dueFrom: "2026-10-16", dueTo: "2026-10-18" },
      { projectId: "p" },
      { owner: "unassigned" },
      { owner: "environment-owner" },
    ]) {
      const query = yield* decodeQuery(input);
      for (const cursor of [
        undefined,
        {
          dueOn: "2026-10-16",
          projectId: ProjectId.make("p"),
          id: WorkspaceTaskId.make("wskt_00000000-0000-0000-0000-000000000001"),
        },
        {
          dueOn: null,
          projectId: ProjectId.make("p"),
          id: WorkspaceTaskId.make("wskt_00000000-0000-0000-0000-000000000001"),
        },
      ]) {
        const [statement, parameters] = taskQuerySql(sql, query, cursor).page.compile();
        const plan = yield* sql.unsafe<{ detail: string }>(
          `EXPLAIN QUERY PLAN ${statement}`,
          parameters,
        );
        expect(
          plan.some(
            (row) => row.detail.includes("workspace_tasks_") && row.detail.includes("query"),
          ),
        ).toBe(true);
        expect(plan.filter((row) => row.detail.includes("TEMP B-TREE"))).toEqual([]);
        if (query.dueFrom && query.dueTo)
          expect(
            plan.some((row) => row.detail.includes("<expr>>?") && row.detail.includes("<expr><?")),
          ).toBe(true);
      }
    }
    const bounded = yield* decodeQuery({ dueFrom: "2026-10-16", dueTo: "2026-10-18" });
    const { done, relation, filters } = taskQuerySql(sql, bounded);
    const [countStatement, countParameters] =
      sql`SELECT COUNT(*) AS total,COALESCE(SUM(1-${done}),0) AS "openTotal" ${relation} WHERE ${sql.and(filters)}`.compile();
    const countPlan = yield* sql.unsafe<{ detail: string }>(
      `EXPLAIN QUERY PLAN ${countStatement}`,
      countParameters,
    );
    expect(
      countPlan.some((row) => row.detail.includes("<expr>>?") && row.detail.includes("<expr><?")),
    ).toBe(true);
    yield* sql`UPDATE workspace_tasks SET owner=NULL WHERE id='kept'`;
    yield* sql`INSERT INTO workspace_project_config(project_id,columns_json) VALUES('p','["To do","Done"]')`;
    expect(yield* sql`SELECT generation FROM workspace_task_query_generation`).toEqual([
      { generation: 2 },
    ]);
    yield* runMigrations();
    expect(yield* sql`SELECT generation FROM workspace_task_query_generation`).toEqual([
      { generation: 2 },
    ]);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
