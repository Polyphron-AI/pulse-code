import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/** Provider-neutral, server-owned integration lifecycle metadata. Credentials remain in ServerSecretStore. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS integration_connections (
      environment_id TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      account_hint TEXT,
      endpoint_hint TEXT,
      secret_ref TEXT,
      state TEXT NOT NULL,
      health_state TEXT NOT NULL,
      health_last_checked_at TEXT,
      health_last_successful_at TEXT,
      health_failure_reason TEXT,
      health_failure_detail TEXT,
      health_failure_retryable INTEGER,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (environment_id, connection_id),
      UNIQUE (environment_id, provider_id),
      CHECK (health_failure_retryable IS NULL OR health_failure_retryable IN (0, 1)),
      CHECK (
        (health_failure_reason IS NULL AND health_failure_detail IS NULL AND health_failure_retryable IS NULL)
        OR
        (health_failure_reason IS NOT NULL AND health_failure_detail IS NOT NULL AND health_failure_retryable IS NOT NULL)
      )
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS integration_connection_capabilities (
      environment_id TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      capability TEXT NOT NULL,
      PRIMARY KEY (environment_id, connection_id, capability),
      FOREIGN KEY (environment_id, connection_id)
        REFERENCES integration_connections(environment_id, connection_id)
        ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS integration_health_required_capabilities (
      environment_id TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      capability TEXT NOT NULL,
      PRIMARY KEY (environment_id, connection_id, capability),
      FOREIGN KEY (environment_id, connection_id)
        REFERENCES integration_connections(environment_id, connection_id)
        ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE TABLE IF NOT EXISTS integration_project_mappings (
      environment_id TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      provider_workspace_id TEXT,
      provider_project_id TEXT NOT NULL,
      provider_project_name TEXT NOT NULL,
      source_url TEXT,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (environment_id, connection_id, project_id),
      FOREIGN KEY (environment_id, connection_id)
        REFERENCES integration_connections(environment_id, connection_id)
        ON DELETE CASCADE
    )
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_integration_connections_environment
    ON integration_connections(environment_id, updated_at DESC)
  `;

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_integration_project_mappings_project
    ON integration_project_mappings(environment_id, project_id)
  `;
});
