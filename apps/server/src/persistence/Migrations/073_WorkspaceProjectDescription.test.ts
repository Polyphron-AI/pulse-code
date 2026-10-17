import * as NodeServices from "@effect/platform-node/NodeServices";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { runMigrations } from "../Migrations.ts";

it.effect("upgrades pre-description settings and retains them after reopening the database", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: "t3-migration-073-" });
    const filename = path.join(directory, "state.sqlite");
    const storage = NodeSqliteClient.layer({ filename });
    const before = yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 72 });
      yield* sql`INSERT INTO workspace_project_config(project_id,columns_json,browser_thread_id,completed_column,revision,drive_root_json) VALUES('project','["Inbox","Released"]','browser-thread','Released',7,'saved-root')`;
      return yield* sql`SELECT * FROM workspace_project_config`;
    }).pipe(Effect.provide(storage));
    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      expect(yield* runMigrations({ toMigrationInclusive: 73 })).toEqual([
        [73, "WorkspaceProjectDescription"],
      ]);
      expect(yield* sql`SELECT * FROM workspace_project_config`).toEqual([
        { ...before[0], description: null },
      ]);
      yield* sql`UPDATE workspace_project_config SET description='Brand and growth' WHERE project_id='project'`;
    }).pipe(Effect.provide(storage));
    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      expect(yield* runMigrations({ toMigrationInclusive: 73 })).toEqual([]);
      expect(yield* sql`SELECT * FROM workspace_project_config`).toEqual([
        { ...before[0], description: "Brand and growth" },
      ]);
    }).pipe(Effect.provide(storage));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
