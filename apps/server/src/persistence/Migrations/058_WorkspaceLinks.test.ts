import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

import { runMigrations } from "../Migrations.ts";

it.layer(NodeSqliteClient.layer({ filename: ":memory:" }))("058_WorkspaceLinks", (it) => {
  it.effect("stores one row per unordered pair", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 58 });
      const insert = (id: string, a: string, b: string) => sql`
        INSERT INTO workspace_links (
          link_id, key_a, key_b, ref_a_json, ref_b_json, status, source_json, created_at, updated_at
        ) VALUES (${id}, ${a}, ${b}, '{}', '{}', 'confirmed', '{}', 'now', 'now')
      `;
      yield* insert("wl_1", "a", "b");
      const duplicate = yield* insert("wl_2", "a", "b").pipe(Effect.flip);
      assert.ok(duplicate);
      const reversed = yield* insert("wl_3", "b", "a").pipe(Effect.flip);
      assert.ok(reversed, "key_a must sort before key_b");
      const badStatus = yield* sql`
        INSERT INTO workspace_links (
          link_id, key_a, key_b, ref_a_json, ref_b_json, status, source_json, created_at, updated_at
        ) VALUES ('wl_4', 'c', 'd', '{}', '{}', 'maybe', '{}', 'now', 'now')
      `.pipe(Effect.flip);
      assert.ok(badStatus);
    }),
  );
});
