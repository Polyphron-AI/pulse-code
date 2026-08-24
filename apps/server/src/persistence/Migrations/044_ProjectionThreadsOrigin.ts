import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/**
 * Who started a thread: "user" or "schedule:<scheduleId>". Set once at
 * creation and never updated, but it has to be a column — the read model is
 * rebuilt from projection tables, so an in-memory-only origin would drop the
 * scheduled badge on every restart.
 *
 * NULL on rows written before this column existed; readers treat that as
 * "user".
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;

  if (!columns.some((column) => column.name === "origin")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN origin TEXT
    `;
  }
});
