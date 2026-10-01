import type {
  MeetingId,
  MeetingSegment,
  MeetingStatus,
  MeetingSummaryRow,
  MeetingSummaryStatus,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import type * as Statement from "effect/unstable/sql/Statement";

import { toPersistenceSqlError, type ProjectionRepositoryError } from "../persistence/Errors.ts";

export const MEETING_SUMMARY_PREVIEW_CHARS = 200;

/** The stored meeting without segments. `titleIsDefault` lets a summary rename an unnamed meeting. */
export interface MeetingRecord extends MeetingSummaryRow {
  readonly titleIsDefault: boolean;
  readonly summary: string | null;
  readonly summaryError: string | null;
  readonly summaryModel: string | null;
}

export interface MeetingSummaryState {
  readonly summaryStatus: MeetingSummaryStatus;
  readonly summary: string | null;
  readonly summaryError: string | null;
  readonly summaryModel: string | null;
}

interface MeetingDbRow {
  readonly id: string;
  readonly title: string;
  readonly titleIsDefault: number;
  readonly status: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly durationMs: number | null;
  readonly segmentCount: number;
  readonly summaryStatus: string;
  readonly summary: string | null;
  readonly summaryError: string | null;
  readonly summaryModel: string | null;
}

function toRecord(row: MeetingDbRow): MeetingRecord {
  return {
    id: row.id as MeetingId,
    title: row.title,
    titleIsDefault: row.titleIsDefault === 1,
    status: row.status as MeetingStatus,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationMs: row.durationMs,
    segmentCount: row.segmentCount,
    summaryStatus: row.summaryStatus as MeetingSummaryStatus,
    summaryPreview:
      row.summary === null ? null : row.summary.slice(0, MEETING_SUMMARY_PREVIEW_CHARS),
    summary: row.summary,
    summaryError: row.summaryError,
    summaryModel: row.summaryModel,
  };
}

export function toSummaryRow(record: MeetingRecord): MeetingSummaryRow {
  return {
    id: record.id,
    title: record.title,
    status: record.status,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    durationMs: record.durationMs,
    segmentCount: record.segmentCount,
    summaryStatus: record.summaryStatus,
    summaryPreview: record.summaryPreview,
  };
}

export class MeetingRepository extends Context.Service<
  MeetingRepository,
  {
    readonly list: Effect.Effect<ReadonlyArray<MeetingRecord>, ProjectionRepositoryError>;
    readonly get: (id: MeetingId) => Effect.Effect<MeetingRecord | null, ProjectionRepositoryError>;
    readonly listSegments: (
      id: MeetingId,
    ) => Effect.Effect<ReadonlyArray<MeetingSegment>, ProjectionRepositoryError>;
    readonly create: (input: {
      readonly id: MeetingId;
      readonly title: string;
      readonly titleIsDefault: boolean;
      readonly startedAt: string;
      readonly now: string;
    }) => Effect.Effect<void, ProjectionRepositoryError>;
    /** Insert or overwrite segments by (meeting, index). */
    readonly upsertSegments: (
      id: MeetingId,
      segments: ReadonlyArray<MeetingSegment>,
      now: string,
    ) => Effect.Effect<void, ProjectionRepositoryError>;
    readonly finish: (input: {
      readonly id: MeetingId;
      readonly endedAt: string;
      readonly durationMs: number;
      readonly now: string;
    }) => Effect.Effect<void, ProjectionRepositoryError>;
    readonly setSummaryState: (
      id: MeetingId,
      state: MeetingSummaryState,
      now: string,
    ) => Effect.Effect<void, ProjectionRepositoryError>;
    readonly rename: (
      id: MeetingId,
      title: string,
      now: string,
    ) => Effect.Effect<void, ProjectionRepositoryError>;
    /** Apply a generated title only while the meeting still has its default title. */
    readonly applySuggestedTitle: (
      id: MeetingId,
      title: string,
      now: string,
    ) => Effect.Effect<void, ProjectionRepositoryError>;
    readonly delete: (id: MeetingId) => Effect.Effect<void, ProjectionRepositoryError>;
    /** Summaries cannot survive a restart; mark the interrupted ones failed so they can be retried. */
    readonly failPendingSummaries: (
      summaryError: string,
      now: string,
    ) => Effect.Effect<number, ProjectionRepositoryError>;
  }
>()("t3/meetings/MeetingRepository") {}

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const query =
    (operation: string) =>
    <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(Effect.mapError(toPersistenceSqlError(`MeetingRepository.${operation}:query`)));

  const selectMeetings = (where: Statement.Fragment) => sql<MeetingDbRow>`
    SELECT
      m.meeting_id AS "id",
      m.title AS "title",
      m.title_is_default AS "titleIsDefault",
      m.status AS "status",
      m.started_at AS "startedAt",
      m.ended_at AS "endedAt",
      m.duration_ms AS "durationMs",
      (SELECT COUNT(*) FROM pulse_meeting_segments s WHERE s.meeting_id = m.meeting_id)
        AS "segmentCount",
      m.summary_status AS "summaryStatus",
      m.summary AS "summary",
      m.summary_error AS "summaryError",
      m.summary_model AS "summaryModel"
    FROM pulse_meetings m
    ${where}
    ORDER BY m.started_at DESC, m.created_at DESC
  `;

  return MeetingRepository.of({
    list: selectMeetings(sql``).pipe(
      Effect.map((rows) => rows.map(toRecord)),
      query("list"),
    ),
    get: (id) =>
      selectMeetings(sql`WHERE m.meeting_id = ${id}`).pipe(
        Effect.map((rows) => (rows[0] === undefined ? null : toRecord(rows[0]))),
        query("get"),
      ),
    listSegments: (id) =>
      sql<MeetingSegment>`
        SELECT
          segment_index AS "index",
          start_ms AS "startMs",
          end_ms AS "endMs",
          text
        FROM pulse_meeting_segments
        WHERE meeting_id = ${id}
        ORDER BY segment_index ASC
      `.pipe(query("listSegments")),
    create: ({ id, title, titleIsDefault, startedAt, now }) =>
      sql`
        INSERT INTO pulse_meetings (
          meeting_id, title, title_is_default, status, started_at, ended_at, duration_ms,
          summary_status, summary, summary_error, summary_model, created_at, updated_at
        )
        VALUES (
          ${id}, ${title}, ${titleIsDefault ? 1 : 0}, 'recording', ${startedAt}, NULL, NULL,
          'none', NULL, NULL, NULL, ${now}, ${now}
        )
      `.pipe(Effect.asVoid, query("create")),
    upsertSegments: (id, segments, now) =>
      sql
        .withTransaction(
          Effect.gen(function* () {
            for (const segment of segments) {
              yield* sql`
                INSERT INTO pulse_meeting_segments (meeting_id, segment_index, start_ms, end_ms, text)
                VALUES (${id}, ${segment.index}, ${segment.startMs}, ${segment.endMs}, ${segment.text})
                ON CONFLICT (meeting_id, segment_index)
                DO UPDATE SET
                  start_ms = excluded.start_ms,
                  end_ms = excluded.end_ms,
                  text = excluded.text
              `;
            }
            yield* sql`UPDATE pulse_meetings SET updated_at = ${now} WHERE meeting_id = ${id}`;
          }),
        )
        .pipe(query("upsertSegments")),
    finish: ({ id, endedAt, durationMs, now }) =>
      sql`
        UPDATE pulse_meetings
        SET status = 'ready', ended_at = ${endedAt}, duration_ms = ${durationMs}, updated_at = ${now}
        WHERE meeting_id = ${id}
      `.pipe(Effect.asVoid, query("finish")),
    setSummaryState: (id, state, now) =>
      sql`
        UPDATE pulse_meetings
        SET
          summary_status = ${state.summaryStatus},
          summary = ${state.summary},
          summary_error = ${state.summaryError},
          summary_model = ${state.summaryModel},
          updated_at = ${now}
        WHERE meeting_id = ${id}
      `.pipe(Effect.asVoid, query("setSummaryState")),
    rename: (id, title, now) =>
      sql`
        UPDATE pulse_meetings
        SET title = ${title}, title_is_default = 0, updated_at = ${now}
        WHERE meeting_id = ${id}
      `.pipe(Effect.asVoid, query("rename")),
    applySuggestedTitle: (id, title, now) =>
      sql`
        UPDATE pulse_meetings
        SET title = ${title}, title_is_default = 0, updated_at = ${now}
        WHERE meeting_id = ${id} AND title_is_default = 1
      `.pipe(Effect.asVoid, query("applySuggestedTitle")),
    delete: (id) =>
      sql
        .withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM pulse_meeting_segments WHERE meeting_id = ${id}`;
            yield* sql`DELETE FROM pulse_meetings WHERE meeting_id = ${id}`;
          }),
        )
        .pipe(query("delete")),
    failPendingSummaries: (summaryError, now) =>
      sql<{ readonly id: string }>`
        UPDATE pulse_meetings
        SET summary_status = 'failed', summary_error = ${summaryError}, updated_at = ${now}
        WHERE summary_status = 'pending'
        RETURNING meeting_id AS "id"
      `.pipe(
        Effect.map((rows) => rows.length),
        query("failPendingSummaries"),
      ),
  });
});

export const layer = Layer.effect(MeetingRepository, make);
