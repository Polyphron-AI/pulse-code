import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { runMigrations } from "../Migrations.ts";

it.effect(
  "adds durable notes and a unique request journal without changing prior tasks or links",
  () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 68 });
      const sql = yield* SqlClient.SqlClient;
      yield* sql`INSERT INTO workspace_tasks(id,project_id,title,column_name,revision) VALUES('kept','p','Kept','Done',7)`;
      yield* runMigrations();
      yield* sql`INSERT INTO workspace_notes(id,title,body,revision,created_at,updated_at) VALUES('note','Title','Body',1,'created','updated')`;
      yield* sql`INSERT INTO workspace_note_requests(request_id,fingerprint,result_json) VALUES('request','fingerprint','null')`;
      expect(
        (yield* Effect.exit(
          sql`INSERT INTO workspace_note_requests(request_id,fingerprint,result_json) VALUES('request','other','null')`,
        ))._tag,
      ).toBe("Failure");
      yield* runMigrations();
      expect(yield* sql`SELECT title,revision FROM workspace_tasks`).toEqual([
        { title: "Kept", revision: 7 },
      ]);
      expect(yield* sql`SELECT title,body,revision,deleted FROM workspace_notes`).toEqual([
        { title: "Title", body: "Body", revision: 1, deleted: 0 },
      ]);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
