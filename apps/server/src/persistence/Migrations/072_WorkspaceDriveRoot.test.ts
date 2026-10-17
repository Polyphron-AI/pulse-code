import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { runMigrations } from "../Migrations.ts";

it.effect("adds a nullable Drive root without changing existing project settings", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 71 });
    yield* sql`INSERT INTO workspace_project_config(project_id,columns_json,browser_thread_id,completed_column,revision) VALUES('project','["Inbox","Released"]','browser-thread','Released',7)`;
    const before = yield* sql`SELECT * FROM workspace_project_config`;
    expect(yield* runMigrations({ toMigrationInclusive: 72 })).toEqual([
      [72, "WorkspaceDriveRoot"],
    ]);
    expect(yield* sql`SELECT * FROM workspace_project_config`).toEqual([
      { ...before[0], drive_root_json: null },
    ]);
    yield* sql`UPDATE workspace_project_config SET drive_root_json='saved-root' WHERE project_id='project'`;
    expect(yield* runMigrations({ toMigrationInclusive: 72 })).toEqual([]);
    expect(yield* sql`SELECT * FROM workspace_project_config`).toEqual([
      { ...before[0], drive_root_json: "saved-root" },
    ]);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
