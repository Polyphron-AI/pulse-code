import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE IF NOT EXISTS workspace_notes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL CHECK(length(CAST(title AS BLOB)) BETWEEN 1 AND 1200),
    body TEXT NOT NULL CHECK(length(CAST(body AS BLOB))<=65536),
    revision INTEGER NOT NULL CHECK(revision>=1),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1))
  )`;
  yield* sql`CREATE TABLE IF NOT EXISTS workspace_note_requests (
    request_id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL,
    result_json TEXT NOT NULL CHECK(length(CAST(result_json AS BLOB))<=400000)
  )`;
});
