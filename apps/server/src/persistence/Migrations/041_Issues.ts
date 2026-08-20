import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/**
 * Server-authoritative metadata for the native Pulse Issues integration.
 *
 * The Pulse PAT deliberately does not live here. It is persisted through
 * ServerSecretStore so database copies and diagnostics never expose it.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS pulse_issue_connection (
      singleton_key INTEGER PRIMARY KEY CHECK (singleton_key = 1),
      endpoint TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS pulse_issue_project_mappings (
      project_id TEXT PRIMARY KEY,
      pulse_project_id TEXT NOT NULL,
      pulse_project_name TEXT NOT NULL,
      pulse_project_slug TEXT NOT NULL,
      ingest_public_key TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_pulse_issue_project_mappings_pulse_project
    ON pulse_issue_project_mappings(pulse_project_id, project_id)
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS pulse_issue_thread_links (
      project_id TEXT NOT NULL,
      pulse_project_id TEXT NOT NULL,
      issue_id TEXT NOT NULL,
      thread_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project_id, issue_id)
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_pulse_issue_thread_links_issue
    ON pulse_issue_thread_links(pulse_project_id, issue_id)
  `;
});
