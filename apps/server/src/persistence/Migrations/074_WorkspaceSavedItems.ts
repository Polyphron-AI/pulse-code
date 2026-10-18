import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE workspace_saved_items (
    item_key TEXT PRIMARY KEY, ref_json TEXT NOT NULL, saved_at TEXT NOT NULL
  )`;
  yield* sql`CREATE INDEX workspace_saved_items_page
    ON workspace_saved_items(saved_at DESC, item_key ASC)`;
});
