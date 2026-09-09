import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("050_ProjectionThreadBranchPullRequest", (it) => {
  it.effect("adds the nullable branch PR JSON after existing Pulse migrations", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 49 });
      assert.deepEqual(yield* runMigrations({ toMigrationInclusive: 50 }), [
        [50, "ProjectionThreadBranchPullRequest"],
      ]);
      assert.deepEqual(yield* runMigrations({ toMigrationInclusive: 50 }), []);

      const columns = yield* sql<{ readonly name: string; readonly notnull: number }>`
        PRAGMA table_info(projection_threads)
      `;
      const branchPullRequest = columns.find(
        (column) => column.name === "branch_pull_request_json",
      );

      assert.equal(branchPullRequest?.name, "branch_pull_request_json");
      assert.equal(branchPullRequest?.notnull, 0);
    }),
  );
});
