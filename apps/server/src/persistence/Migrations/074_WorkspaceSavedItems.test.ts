import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { runMigrations } from "../Migrations.ts";

it.effect("upgrades 073 without losing existing rows and retains saved refs when reopening", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-migration-074-" });
    const storage = NodeSqliteClient.layer({ filename: path.join(dir, "state.sqlite") });
    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 73 });
      yield* sql`INSERT INTO workspace_project_config(project_id,columns_json,revision,description) VALUES('project','["Inbox","Done"]',2,'Keep me')`;
    }).pipe(Effect.provide(storage));
    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      expect(yield* runMigrations({ toMigrationInclusive: 74 })).toEqual([
        [74, "WorkspaceSavedItems"],
      ]);
      expect(
        yield* sql`SELECT project_id,description,revision FROM workspace_project_config`,
      ).toEqual([{ project_id: "project", description: "Keep me", revision: 2 }]);
      expect(
        (yield* sql<{ name: string }>`PRAGMA table_info(workspace_saved_items)`).map(
          (row) => row.name,
        ),
      ).toEqual(["item_key", "ref_json", "saved_at"]);
      expect(
        yield* sql`SELECT name FROM sqlite_master WHERE type='index' AND name='workspace_saved_items_page'`,
      ).toEqual([{ name: "workspace_saved_items_page" }]);
      yield* sql`INSERT INTO workspace_saved_items VALUES('task:missing','{"type":"task","taskId":"missing"}','2026-10-17T00:00:00.000Z')`;
    }).pipe(Effect.provide(storage));
    yield* Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      expect(yield* runMigrations({ toMigrationInclusive: 74 })).toEqual([]);
      expect(yield* sql`SELECT item_key,ref_json,saved_at FROM workspace_saved_items`).toEqual([
        {
          item_key: "task:missing",
          ref_json: '{"type":"task","taskId":"missing"}',
          saved_at: "2026-10-17T00:00:00.000Z",
        },
      ]);
    }).pipe(Effect.provide(storage));
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
