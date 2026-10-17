import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE IF NOT EXISTS workspace_calendar_sources (
    connection_id TEXT NOT NULL,
    calendar_id TEXT NOT NULL,
    PRIMARY KEY(connection_id,calendar_id)
  ) WITHOUT ROWID`;
  yield* sql`INSERT OR IGNORE INTO workspace_calendar_sources(connection_id,calendar_id) SELECT connection_id,calendar_id FROM workspace_calendar_occurrences GROUP BY connection_id,calendar_id`;
  yield* sql`CREATE INDEX IF NOT EXISTS workspace_calendar_range ON workspace_calendar_occurrences(status,sort_key,id)`;
  yield* sql`DROP INDEX IF EXISTS workspace_calendar_timed`;
  yield* sql`DROP INDEX IF EXISTS workspace_calendar_dates`;
});
