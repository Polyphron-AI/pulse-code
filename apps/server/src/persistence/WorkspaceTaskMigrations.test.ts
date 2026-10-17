import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { runMigrations } from "./Migrations.ts";
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
