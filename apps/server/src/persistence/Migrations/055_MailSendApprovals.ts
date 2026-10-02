import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  // One row per outgoing message a user must approve. `mime_blob` holds the exact bytes that
  // `digest` covers, so an approval can only ever submit what the user saw.
  yield* sql`
    CREATE TABLE IF NOT EXISTS mail_send_approvals (
      id TEXT PRIMARY KEY,
      environment_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      mime_blob BLOB NOT NULL,
      digest TEXT NOT NULL,
      source_draft_json TEXT,
      status TEXT NOT NULL,
      error_json TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      decided_at TEXT,
      completed_at TEXT
    )
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS mail_send_approvals_thread
    ON mail_send_approvals (thread_id, created_at)
  `;
  yield* sql`
    CREATE INDEX IF NOT EXISTS mail_send_approvals_status
    ON mail_send_approvals (status)
  `;
});
