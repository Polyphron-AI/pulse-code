import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE slack_connections (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    identity TEXT NOT NULL,
    label TEXT NOT NULL,
    connected INTEGER NOT NULL CHECK(connected IN (0,1)),
    generation INTEGER NOT NULL CHECK(generation >= 1),
    error TEXT,
    scopes_json TEXT NOT NULL,
    is_bot INTEGER NOT NULL CHECK(is_bot IN (0,1)),
    UNIQUE(workspace_id, subject_id)
  )`;
});
