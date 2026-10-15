import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE workspace_suggestion_cache (item_key TEXT PRIMARY KEY, revision TEXT NOT NULL, model TEXT NOT NULL, completed_at TEXT NOT NULL, incomplete INTEGER NOT NULL DEFAULT 0)`;
});
