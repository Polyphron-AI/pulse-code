import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  // One row per unordered pair of items, with key_a sorting first. Unlinked rows stay as
  // 'dismissed' so linking again keeps the first origin.
  yield* sql`
    CREATE TABLE IF NOT EXISTS workspace_links (
      link_id TEXT PRIMARY KEY,
      key_a TEXT NOT NULL,
      key_b TEXT NOT NULL,
      ref_a_json TEXT NOT NULL,
      ref_b_json TEXT NOT NULL,
      title_a TEXT,
      title_b TEXT,
      status TEXT NOT NULL CHECK (status IN ('confirmed', 'suggested', 'dismissed')),
      source_json TEXT NOT NULL,
      origin_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (key_a < key_b),
      UNIQUE (key_a, key_b)
    )
  `;
  yield* sql`CREATE INDEX IF NOT EXISTS workspace_links_by_key_b ON workspace_links (key_b)`;
});
