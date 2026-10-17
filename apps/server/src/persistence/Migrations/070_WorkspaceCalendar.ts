import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE IF NOT EXISTS workspace_calendar_occurrences (
    id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL,
    calendar_id TEXT NOT NULL,
    external_event_id TEXT NOT NULL,
    occurrence_key TEXT NOT NULL,
    status TEXT NOT NULL CONSTRAINT calendar_status CHECK(status IN ('confirmed','cancelled')),
    payload_json TEXT NOT NULL CONSTRAINT calendar_payload CHECK(length(CAST(payload_json AS BLOB))<=48000),
    summary_json TEXT NOT NULL CONSTRAINT calendar_summary CHECK(length(CAST(summary_json AS BLOB))<=32000),
    fingerprint TEXT NOT NULL CONSTRAINT calendar_fingerprint CHECK(length(fingerprint)=64),
    revision INTEGER NOT NULL CONSTRAINT calendar_revision CHECK(revision>=1),
    source_generation INTEGER NOT NULL CONSTRAINT calendar_generation CHECK(source_generation>=0),
    time_kind TEXT,
    start_ms INTEGER,
    end_ms INTEGER,
    start_on TEXT,
    end_before TEXT,
    sort_key INTEGER NOT NULL,
    CONSTRAINT calendar_time CHECK(status='cancelled' OR (
      (time_kind IS NOT NULL AND time_kind='timed' AND start_ms IS NOT NULL AND end_ms IS NOT NULL AND start_ms<end_ms AND start_on IS NULL AND end_before IS NULL) OR
      (time_kind IS NOT NULL AND time_kind='all-day' AND start_on IS NOT NULL AND end_before IS NOT NULL AND start_on<end_before AND start_ms IS NULL AND end_ms IS NULL)
    )),
    UNIQUE(connection_id,calendar_id,external_event_id,occurrence_key)
  )`;
  yield* sql`CREATE INDEX IF NOT EXISTS workspace_calendar_range ON workspace_calendar_occurrences(status,sort_key,id)`;
  yield* sql`CREATE INDEX IF NOT EXISTS workspace_calendar_timed ON workspace_calendar_occurrences(connection_id,calendar_id,status,time_kind,start_ms,end_ms)`;
  yield* sql`CREATE INDEX IF NOT EXISTS workspace_calendar_dates ON workspace_calendar_occurrences(connection_id,calendar_id,status,time_kind,start_on,end_before)`;
});
