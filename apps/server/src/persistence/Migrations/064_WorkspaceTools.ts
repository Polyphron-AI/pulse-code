import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE workspace_project_config (project_id TEXT PRIMARY KEY, columns_json TEXT NOT NULL, browser_thread_id TEXT)`;
  yield* sql`CREATE TABLE workspace_tasks (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, column_name TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0)`;
  yield* sql`CREATE TABLE workspace_automation_starts (request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL)`;
  yield* sql`CREATE INDEX workspace_tasks_project ON workspace_tasks(project_id,deleted,id)`;
});
