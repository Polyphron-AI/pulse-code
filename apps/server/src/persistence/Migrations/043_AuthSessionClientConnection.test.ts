import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("043_AuthSessionClientConnection", (it) => {
  it.effect("adds nullable client surface and app version columns to auth sessions", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 42 });
      yield* sql`INSERT INTO pulse_issue_connection VALUES (1, 'https://issues.example', '2026-09-09T00:00:00Z')`;
      yield* sql`INSERT INTO integration_connections
        (environment_id, connection_id, provider_id, state, health_state, updated_at)
        VALUES ('env', 'connection', 'linear', 'connected', 'healthy', '2026-09-09T00:00:00Z')`;
      const issuesBefore = yield* sql`SELECT * FROM pulse_issue_connection`;
      const integrationsBefore = yield* sql`SELECT * FROM integration_connections`;
      const applied = yield* runMigrations({ toMigrationInclusive: 43 });
      assert.deepEqual(applied, [[43, "AuthSessionClientConnection"]]);
      assert.deepEqual(yield* runMigrations({ toMigrationInclusive: 43 }), []);
      assert.deepEqual(yield* sql`SELECT * FROM pulse_issue_connection`, issuesBefore);
      assert.deepEqual(yield* sql`SELECT * FROM integration_connections`, integrationsBefore);

      const columns = yield* sql<{ readonly name: string; readonly notnull: number }>`
        PRAGMA table_info(auth_sessions)
      `;
      const surface = columns.find((column) => column.name === "client_surface");
      const appVersion = columns.find((column) => column.name === "client_app_version");

      assert.equal(surface?.name, "client_surface");
      assert.equal(surface?.notnull, 0);
      assert.equal(appVersion?.name, "client_app_version");
      assert.equal(appVersion?.notnull, 0);
    }),
  );
});
