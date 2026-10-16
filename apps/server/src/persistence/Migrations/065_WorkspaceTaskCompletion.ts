import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE workspace_tasks ADD COLUMN revision INTEGER NOT NULL DEFAULT 0`;
  yield* sql`ALTER TABLE workspace_project_config ADD COLUMN completed_column TEXT`;
  yield* sql`ALTER TABLE workspace_project_config ADD COLUMN revision INTEGER NOT NULL DEFAULT 0`;
  yield* sql`UPDATE workspace_project_config SET completed_column='Done' WHERE json(columns_json)=json('["To do","In progress","Done"]')`;
});
