import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { runMigrations } from "../Migrations.ts";

it.effect(
  "upgrades 074 without losing saved refs and reopens Slack metadata without credentials",
  () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-migration-075-" });
      const storage = NodeSqliteClient.layer({ filename: path.join(dir, "state.sqlite") });
      yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* runMigrations({ toMigrationInclusive: 74 });
        yield* sql`INSERT INTO workspace_saved_items VALUES('task:retained','{"type":"task","taskId":"retained"}','2026-10-18T00:00:00.000Z')`;
      }).pipe(Effect.provide(storage));
      yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        expect(yield* runMigrations({ toMigrationInclusive: 75 })).toEqual([
          [75, "SlackConnections"],
        ]);
        expect(yield* sql`SELECT item_key FROM workspace_saved_items`).toEqual([
          { item_key: "task:retained" },
        ]);
        expect(
          (yield* sql<{ name: string }>`PRAGMA table_info(slack_connections)`).map(
            (row) => row.name,
          ),
        ).toEqual([
          "id",
          "workspace_id",
          "subject_id",
          "identity",
          "label",
          "connected",
          "generation",
          "error",
          "scopes_json",
          "is_bot",
        ]);
        yield* sql`INSERT INTO slack_connections VALUES('slack_a','T1','U1','Asha','Team',1,1,NULL,'["channels:read","channels:history"]',0)`;
        expect(
          (yield* sql`INSERT INTO slack_connections VALUES('slack_b','T1','U1','Other','Team',1,1,NULL,'[]',0)`.pipe(
            Effect.exit,
          ))._tag,
        ).toBe("Failure");
        expect(
          (yield* sql`INSERT INTO slack_connections VALUES('slack_b','T2','U1','Other','Team',2,1,NULL,'[]',0)`.pipe(
            Effect.exit,
          ))._tag,
        ).toBe("Failure");
      }).pipe(Effect.provide(storage));
      yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        expect(yield* runMigrations()).toEqual([]);
        expect(
          yield* sql`SELECT id,workspace_id,subject_id,connected,generation FROM slack_connections`,
        ).toEqual([
          { id: "slack_a", workspace_id: "T1", subject_id: "U1", connected: 1, generation: 1 },
        ]);
        yield* sql`UPDATE slack_connections SET connected=0,generation=generation+1 WHERE id='slack_a'`;
        expect(yield* sql`SELECT item_key FROM workspace_saved_items`).toEqual([
          { item_key: "task:retained" },
        ]);
      }).pipe(Effect.provide(storage));
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);
