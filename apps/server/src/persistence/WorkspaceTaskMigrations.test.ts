import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { runMigrations } from "./Migrations.ts";
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
