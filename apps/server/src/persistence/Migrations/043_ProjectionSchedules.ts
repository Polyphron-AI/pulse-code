import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/**
 * Scheduled-chat definitions. The engine hydrates its in-memory read model from
 * projection tables only, so a schedule that lives nowhere but memory stops
 * firing after a restart — this table is what makes a schedule durable.
 *
 * Nested contract shapes (scope union, per-project occurrence state, model
 * selection) are JSON columns; everything the editor lists or sorts by is a
 * real column.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS projection_schedules (
      schedule_id TEXT PRIMARY KEY,
      scope_json TEXT NOT NULL,
      hour_local INTEGER NOT NULL,
      minute_local INTEGER NOT NULL,
      timezone TEXT NOT NULL,
      prompt TEXT NOT NULL,
      workflow_script_ref TEXT,
      handoff_path_template TEXT NOT NULL,
      model_selection_json TEXT,
      max_run_minutes INTEGER NOT NULL,
      max_turn_minutes INTEGER NOT NULL,
      skip_if_dirty INTEGER,
      paused_at TEXT,
      auto_paused_reason TEXT,
      project_states_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      CHECK (skip_if_dirty IS NULL OR skip_if_dirty IN (0, 1))
    )
  `;

  // The sweep reads every live schedule on each tick; deleted rows stay for
  // history but never need scanning.
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_schedules_live
    ON projection_schedules(deleted_at, created_at ASC)
  `;
});
