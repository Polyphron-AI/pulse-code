import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { calendarRangeSql } from "../../workspace/WorkspaceCalendar.ts";
import migration from "./071_WorkspaceCalendarSources.ts";
import { runMigrations } from "../Migrations.ts";

it.effect("backfills a small source registry and seeks bounded calendar continuations", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: 70 });
    yield* sql`INSERT INTO workspace_calendar_occurrences(id,connection_id,calendar_id,external_event_id,occurrence_key,status,payload_json,summary_json,fingerprint,revision,source_generation,sort_key) VALUES('event','connection','calendar','external','original','cancelled','{}','{}',${"a".repeat(64)},1,1,0)`;
    yield* runMigrations();
    yield* migration;
    expect(yield* sql`SELECT connection_id,calendar_id FROM workspace_calendar_sources`).toEqual([
      { connection_id: "connection", calendar_id: "calendar" },
    ]);
    const [statement, parameters] = calendarRangeSql(
      sql,
      {
        startOn: "2026-10-13",
        endBefore: "2026-10-14",
        timeZone: "UTC",
        limit: 100,
      },
      [
        { connectionId: "connection", calendarId: "calendar" },
        { connectionId: "other", calendarId: "other" },
      ],
      {
        sortKey: 10,
        id: "wce_00000000-0000-0000-0000-000000000001",
      },
    ).compile();
    const plan = yield* sql.unsafe<{ detail: string }>(
      `EXPLAIN QUERY PLAN ${statement}`,
      parameters,
    );
    expect(plan.map((row) => row.detail).join(" ")).toMatch(
      /workspace_calendar_range.*\(sort_key,id\)>.*sort_key</,
    );
    expect(plan.some((row) => /SCAN|TEMP B-TREE/.test(row.detail))).toBe(false);
    const indexes = yield* sql<{ name: string }>`PRAGMA index_list(workspace_calendar_occurrences)`;
    expect(indexes.map((row) => row.name)).not.toContain("workspace_calendar_timed");
    expect(indexes.map((row) => row.name)).not.toContain("workspace_calendar_dates");
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
