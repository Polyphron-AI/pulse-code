import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE drive_connections (id TEXT PRIMARY KEY, nickname TEXT NOT NULL, nickname_key TEXT NOT NULL UNIQUE, client_id TEXT NOT NULL, client_secret_configured INTEGER NOT NULL DEFAULT 0, connected INTEGER NOT NULL DEFAULT 0, removed INTEGER NOT NULL DEFAULT 0, identity_json TEXT, generation INTEGER NOT NULL DEFAULT 1, error TEXT)`;
  yield* sql`CREATE TABLE drive_file_bindings (file_id TEXT PRIMARY KEY, connection_id TEXT NOT NULL, file_json TEXT NOT NULL)`;
});
