import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { runMigrations } from "../Migrations.ts";
import workspaceNotesMigration from "./069_WorkspaceNotes.ts";

it.effect(
  "adds durable notes and a unique request journal without changing prior tasks or links",
  () =>
    Effect.gen(function* () {
      yield* runMigrations({ toMigrationInclusive: 68 });
      const sql = yield* SqlClient.SqlClient;
      yield* sql`INSERT INTO workspace_tasks(id,project_id,title,column_name,revision) VALUES('kept','p','Kept','Done',7)`;
      yield* runMigrations();
      yield* workspaceNotesMigration;
      yield* sql`INSERT INTO workspace_notes(id,title,body,revision,created_at,updated_at) VALUES('note','Title','Body',1,'created','updated')`;
      yield* sql`INSERT INTO workspace_note_requests(request_id,fingerprint,result_json) VALUES('request','fingerprint','null')`;
      expect(
        (yield* Effect.exit(
          sql`INSERT INTO workspace_note_requests(request_id,fingerprint,result_json) VALUES('request','other','null')`,
        ))._tag,
      ).toBe("Failure");
      yield* workspaceNotesMigration;
      yield* runMigrations();
      expect(yield* sql`SELECT title,revision FROM workspace_tasks`).toEqual([
        { title: "Kept", revision: 7 },
      ]);
      expect(yield* sql`SELECT title,body,revision,deleted FROM workspace_notes`).toEqual([
        { title: "Title", body: "Body", revision: 1, deleted: 0 },
      ]);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect.each([
  ["empty title", "", "Body", 1, 0],
  ["oversized title", "😀".repeat(301), "Body", 1, 0],
  ["oversized body", "Title", "a".repeat(65537), 1, 0],
  ["zero revision", "Title", "Body", 0, 0],
  ["invalid tombstone", "Title", "Body", 1, 2],
] as const)(
  "rejects a note with %s at the database boundary",
  ([_name, title, body, revision, deleted]) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* workspaceNotesMigration;
      expect(
        (yield* Effect.exit(
          sql`INSERT INTO workspace_notes(id,title,body,revision,created_at,updated_at,deleted)
        VALUES('invalid',${title},${body},${revision},'created','updated',${deleted})`,
        ))._tag,
      ).toBe("Failure");
      expect(yield* sql`SELECT id FROM workspace_notes`).toEqual([]);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("accepts exact byte bounds and rejects an oversized journal result", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* workspaceNotesMigration;
    yield* sql`INSERT INTO workspace_notes(id,title,body,revision,created_at,updated_at,deleted)
      VALUES('bounds',${"😀".repeat(300)},${"😀".repeat(16384)},1,'created','updated',1)`;
    const maximum = "a".repeat(400000);
    yield* sql`INSERT INTO workspace_note_requests(request_id,fingerprint,result_json) VALUES('exact','fingerprint',${maximum})`;
    expect(
      (yield* Effect.exit(
        sql`INSERT INTO workspace_note_requests(request_id,fingerprint,result_json) VALUES('oversized','fingerprint',${maximum + "a"})`,
      ))._tag,
    ).toBe("Failure");
    expect(yield* sql`SELECT request_id FROM workspace_note_requests`).toEqual([
      { request_id: "exact" },
    ]);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
