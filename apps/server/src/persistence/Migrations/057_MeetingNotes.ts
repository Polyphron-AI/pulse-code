import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE meeting_notes (account_id TEXT NOT NULL, event_id TEXT NOT NULL, record_json TEXT NOT NULL, PRIMARY KEY(account_id, event_id))`;
});
