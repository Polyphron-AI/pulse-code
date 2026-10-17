import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE workspace_tasks ADD COLUMN owner TEXT CHECK(owner IS NULL OR owner='environment-owner')`;
});
