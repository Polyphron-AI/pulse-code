import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { runMigrations } from "../Migrations.ts";
import calendarMigration from "./070_WorkspaceCalendar.ts";

const insert = `INSERT INTO workspace_calendar_occurrences(id,connection_id,calendar_id,external_event_id,occurrence_key,status,payload_json,fingerprint,revision,source_generation,time_kind,start_ms,end_ms,start_on,end_before,sort_key,summary_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
const valid = [
  "event",
  "connection",
  "calendar",
  "external",
  "original",
  "confirmed",
  "{}",
  "a".repeat(64),
  1,
  1,
  "timed",
  10,
  20,
  null,
  null,
  10,
  "{}",
];

it.effect(
  "registers an idempotent migration preserving tasks and notes with indexed source and range keys",
  () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 69 });
      yield* sql`INSERT INTO workspace_tasks(id,project_id,title,column_name,revision) VALUES('kept','p','Kept','Done',7)`;
      yield* sql`INSERT INTO workspace_notes(id,title,body,revision,created_at,updated_at) VALUES('note','Title','Body',1,'created','updated')`;
      yield* runMigrations();
      yield* calendarMigration;
      yield* sql.unsafe(insert, valid);
      yield* calendarMigration;
      expect(yield* sql`SELECT title,revision FROM workspace_tasks`).toEqual([
        { title: "Kept", revision: 7 },
      ]);
      expect(yield* sql`SELECT body FROM workspace_notes`).toEqual([{ body: "Body" }]);
      expect(yield* sql`SELECT id FROM workspace_calendar_occurrences`).toEqual([{ id: "event" }]);
      const indexes = yield* sql<{
        name: string;
      }>`PRAGMA index_list(workspace_calendar_occurrences)`;
      expect(indexes.map((index) => index.name)).toEqual(
        expect.arrayContaining([
          "workspace_calendar_range",
          "workspace_calendar_timed",
          "workspace_calendar_dates",
        ]),
      );
      expect(
        (yield* sql<{ name: string }>`PRAGMA index_info(workspace_calendar_range)`).map(
          (column) => column.name,
        ),
      ).toEqual(["status", "sort_key", "id"]);
      expect(
        (yield* sql<{ name: string }>`PRAGMA index_info(workspace_calendar_timed)`).map(
          (column) => column.name,
        ),
      ).toEqual(["connection_id", "calendar_id", "status", "time_kind", "start_ms", "end_ms"]);
      expect(
        (yield* sql<{ name: string }>`PRAGMA index_info(workspace_calendar_dates)`).map(
          (column) => column.name,
        ),
      ).toEqual(["connection_id", "calendar_id", "status", "time_kind", "start_on", "end_before"]);
      expect((yield* Effect.exit(sql.unsafe(insert, ["other", ...valid.slice(1)])))._tag).toBe(
        "Failure",
      );
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect("accepts exclusive all-day dates and payload-free cancellation tombstones", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* calendarMigration;
    const allDay = [...valid];
    allDay[10] = "all-day";
    allDay[11] = null;
    allDay[12] = null;
    allDay[13] = "2026-10-13";
    allDay[14] = "2026-10-14";
    yield* sql.unsafe(insert, allDay);
    yield* sql`DELETE FROM workspace_calendar_occurrences`;
    expect(
      (yield* Effect.exit(
        sql.unsafe(
          insert,
          allDay.map((value, index) => (index === 14 ? "2026-10-13" : value)),
        ),
      ))._tag,
    ).toBe("Failure");
    const cancelled = [...valid];
    cancelled[5] = "cancelled";
    for (let index = 10; index <= 14; index++) cancelled[index] = null;
    yield* sql.unsafe(insert, cancelled);
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);

it.effect.each([
  ["status", 5, "deleted"],
  ["payload size", 6, "x".repeat(48001)],
  ["fingerprint", 7, "bad"],
  ["revision", 8, 0],
  ["generation", 9, -1],
  ["time kind", 10, "local"],
  ["timed order", 12, 5],
  ["mixed axes", 13, "2026-10-13"],
  ["summary size", 16, "x".repeat(32001)],
] as const)("rejects invalid %s at the database boundary", ([name, index, value]) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* calendarMigration;
    const params = [...valid];
    params[index] = value;
    const exit = yield* Effect.exit(sql.unsafe(insert, params));
    expect(exit._tag, name).toBe("Failure");
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
