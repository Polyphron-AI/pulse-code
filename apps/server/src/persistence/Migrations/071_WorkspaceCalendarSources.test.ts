import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
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
    const plan = yield* sql<{
      detail: string;
    }>`EXPLAIN QUERY PLAN SELECT id,summary_json FROM workspace_calendar_occurrences WHERE status='confirmed' AND sort_key<100 AND ((connection_id='connection' AND calendar_id='calendar') OR (connection_id='other' AND calendar_id='other')) AND ((time_kind='timed' AND start_ms<100 AND end_ms>10) OR (time_kind='all-day' AND start_on<'2026-10-14' AND end_before>'2026-10-13')) AND (sort_key,id)>(10,'event') ORDER BY sort_key,id LIMIT 101`;
    expect(plan.map((row) => row.detail).join(" ")).toMatch(
      /workspace_calendar_range.*\(sort_key,id\)>.*sort_key</,
    );
    expect(plan.some((row) => /SCAN|TEMP B-TREE/.test(row.detail))).toBe(false);
    const indexes = yield* sql<{ name: string }>`PRAGMA index_list(workspace_calendar_occurrences)`;
    expect(indexes.map((row) => row.name)).not.toContain("workspace_calendar_timed");
    expect(indexes.map((row) => row.name)).not.toContain("workspace_calendar_dates");
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
);
