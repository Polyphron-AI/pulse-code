import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS pulse_meetings (
      meeting_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      title_is_default INTEGER NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_ms INTEGER,
      summary_status TEXT NOT NULL,
      summary TEXT,
      summary_error TEXT,
      summary_model TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_pulse_meetings_started_at
    ON pulse_meetings(started_at DESC)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS pulse_meeting_segments (
      meeting_id TEXT NOT NULL REFERENCES pulse_meetings(meeting_id) ON DELETE CASCADE,
      segment_index INTEGER NOT NULL,
      start_ms INTEGER NOT NULL,
      end_ms INTEGER NOT NULL,
      text TEXT NOT NULL,
      PRIMARY KEY (meeting_id, segment_index)
    )
  `;
});
