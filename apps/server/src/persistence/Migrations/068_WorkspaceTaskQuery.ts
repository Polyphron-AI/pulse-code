import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE INDEX workspace_tasks_due_query ON workspace_tasks(deleted,due_on,project_id,id)`;
  yield* sql`CREATE INDEX workspace_tasks_project_query ON workspace_tasks(project_id,deleted,column_name,due_on,id)`;
  yield* sql`CREATE INDEX workspace_tasks_owner_query ON workspace_tasks(owner,deleted,due_on,project_id,id)`;
  yield* sql`CREATE TABLE workspace_task_query_generation(id INTEGER PRIMARY KEY CHECK(id=1),generation INTEGER NOT NULL)`;
  yield* sql`INSERT INTO workspace_task_query_generation VALUES(1,0)`;
  // Invalidate cursors even for project projection writes and legacy task callers.
  for (const table of ["workspace_tasks", "workspace_project_config", "projection_projects"]) {
    for (const operation of ["INSERT", "UPDATE", "DELETE"]) {
      yield* sql.unsafe(
        `CREATE TRIGGER ${table}_query_${operation.toLowerCase()} AFTER ${operation} ON ${table} BEGIN UPDATE workspace_task_query_generation SET generation=generation+1 WHERE id=1; END`,
      );
    }
  }
});
