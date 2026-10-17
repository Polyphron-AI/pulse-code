import {
  CalendarError,
  NonNegativeInt,
  WorkspaceToolsError,
  CalendarGetInput,
  CalendarIngestItem,
  CalendarOccurrence,
  CalendarOccurrenceId,
  CalendarOccurrenceSummary,
  CalendarPage,
  CalendarRangeInput,
  CalendarReadInput,
  CalendarReadResult,
  CalendarSourceState,
} from "@t3tools/contracts";
import { validatedConferenceUrl } from "@t3tools/shared/calendarLinks";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeCrypto from "node:crypto";
import { WorkspaceTools } from "./WorkspaceTools.ts";
import { dueTaskItem, dueTaskQuery, hasDueOn } from "./calendar/dueTasks.ts";
import { sliceUtf8 } from "../mail/MailImapRead.ts";

const Source = Schema.Struct({
  connectionId: CalendarSourceState.fields.connectionId,
  calendarId: CalendarSourceState.fields.calendarId,
  generation: CalendarSourceState.fields.generation,
});
const Ingest = Schema.Struct({
  ...Source.fields,
  items: Schema.Array(CalendarIngestItem).check(Schema.isMaxLength(100)),
});
type Ingest = typeof Ingest.Type;
const Cursor = Schema.Struct({
  version: Schema.Literal(1),
  instance: Schema.String,
  query: Schema.String,
  sources: Schema.String,
  sortKey: Schema.Number,
  id: CalendarOccurrenceId,
});
const DueCursor = Schema.Struct({
  version: Schema.Literal(1),
  instance: Schema.String,
  query: Schema.String,
  toolsCursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(8192))),
  offset: NonNegativeInt.check(Schema.isLessThanOrEqualTo(100)),
  page: Schema.String,
});
const isToolsError = Schema.is(WorkspaceToolsError);
const SummaryJson = Schema.fromJsonString(CalendarOccurrenceSummary);
const DetailJson = Schema.fromJsonString(CalendarOccurrence);
const decodeDetailJson = Schema.decodeEffect(DetailJson);
const encodeDetailJson = Schema.encodeEffect(DetailJson);
const decodeSummaryJson = Schema.decodeEffect(SummaryJson);
const encodeSummaryJson = Schema.encodeEffect(SummaryJson);
const decodeDetail = Schema.decodeEffect(CalendarOccurrence);
const decodeSummary = Schema.decodeEffect(CalendarOccurrenceSummary);
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const isCalendarError = Schema.is(CalendarError);
const fail = (kind: CalendarError["kind"], message: string) => new CalendarError({ kind, message });
const hash = (input: unknown) =>
  NodeCrypto.createHash("sha256").update(encodeJson(input)).digest("hex");
const bytes = (input: unknown) => Buffer.byteLength(encodeJson(input), "utf8");
// Leave room for the exact occurrence key and type in workspace_read_item.
const READ_MAX_BYTES = 31800;
const boundAttendees = <A extends CalendarOccurrenceSummary>(occurrence: A, maxBytes = 32000) => {
  const result = {
    ...occurrence,
    attendees: [...occurrence.attendees],
    attendeesTruncated: occurrence.attendeesTruncated,
  };
  while (bytes(result) > maxBytes && result.attendees.length) {
    result.attendees.pop();
    result.attendeesTruncated = true;
  }
  return result;
};
const decode = <S extends Schema.Top>(schema: S, input: unknown) =>
  Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError(() =>
      fail("invalid-input", "Use valid calendar dates, a time zone and bounded event data."),
    ),
  );
const safe = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.mapError((error) =>
      isCalendarError(error)
        ? error
        : fail("unavailable", "Calendar is unavailable. Its links have been kept."),
    ),
  );
const dayStart = (date: string, timeZone: string) =>
  DateTime.toEpochMillis(
    DateTime.makeZonedUnsafe(`${date}T00:00:00.000Z`, {
      timeZone,
      adjustForTimeZone: true,
      disambiguation: "compatible",
    }),
  );
const canonicalZone = (timeZone: string) =>
  Effect.try({
    try: () => new Intl.DateTimeFormat("en", { timeZone }).resolvedOptions().timeZone,
    catch: () => fail("invalid-input", "Choose a supported IANA time zone."),
  });
const encodeItem = Schema.encodeSync(CalendarIngestItem);
const normalize = (item: CalendarIngestItem) => {
  if (item.status === "cancelled") return item;
  const { joinUrl, ...fields } = item;
  const validatedJoin = joinUrl ? validatedConferenceUrl(joinUrl) : undefined;
  return {
    ...fields,
    ...(item.description !== undefined
      ? {
          hasDescription: item.description.length > 0,
          descriptionPreview: item.description.slice(0, 160).replace(/[\ud800-\udbff]$/, ""),
        }
      : {}),
    ...(validatedJoin ? { joinUrl: validatedJoin } : {}),
  };
};

/** The range query is shared with the index-plan regression test. */
export function calendarRangeSql(
  sql: SqlClient.SqlClient,
  input: CalendarRangeInput,
  selected: readonly { connectionId: string; calendarId: string }[],
  cursor?: Pick<typeof Cursor.Type, "sortKey" | "id">,
) {
  const from = dayStart(input.startOn, input.timeZone);
  const until = dayStart(input.endBefore, input.timeZone);
  const upperSortKey = Math.max(until, dayStart(input.endBefore, "UTC"));
  return sql<{
    id: string;
    payload: string;
    revision: number;
    sortKey: number;
  }>`SELECT id,summary_json AS payload,revision,sort_key AS "sortKey" FROM workspace_calendar_occurrences WHERE status='confirmed' AND sort_key<${upperSortKey} AND ${sql.or(selected.map((source) => sql`(connection_id=${source.connectionId} AND calendar_id=${source.calendarId})`))} AND ((time_kind='timed' AND start_ms<${until} AND end_ms>${from}) OR (time_kind='all-day' AND start_on<${input.endBefore} AND end_before>${input.startOn})) AND ${cursor ? sql`(sort_key,id)>(${cursor.sortKey},${cursor.id})` : sql`1=1`} ORDER BY sort_key,id LIMIT ${(input.limit ?? 50) + 1}`;
}

interface SourceAvailability {
  readonly connected: boolean;
  readonly selected: boolean;
  readonly generation: number;
}
interface Options {
  readonly resolveSource?: (
    connectionId: string,
    calendarId: string,
  ) => Effect.Effect<SourceAvailability, CalendarError>;
}

export const make = Effect.fnUntraced(function* (options: Options = {}) {
  const sql = yield* SqlClient.SqlClient;
  const tools = yield* WorkspaceTools;
  const counter = yield* SubscriptionRef.make(0);
  const announce = SubscriptionRef.update(counter, (n) => n + 1);
  const crypto = yield* Crypto.Crypto;
  const instance = yield* crypto.randomUUIDv4;
  const resolve =
    options.resolveSource ??
    (() => Effect.succeed({ connected: false, selected: false, generation: 0 }));
  const requireSource = Effect.fnUntraced(function* (
    connectionId: string,
    calendarId: string,
    generation?: number,
  ) {
    if (!options.resolveSource)
      return yield* fail("unavailable", "No calendar adapter is available. Links have been kept.");
    const source = yield* resolve(connectionId, calendarId);
    if (!source.connected)
      return yield* fail(
        "disconnected",
        "This calendar is disconnected. Its links have been kept.",
      );
    if (!source.selected)
      return yield* fail("unavailable", "This calendar is not selected. Its links have been kept.");
    if (generation !== undefined && source.generation !== generation)
      return yield* fail("conflict", "The calendar connection changed. Refresh this range.");
    return source;
  });
  const get = Effect.fnUntraced(function* (raw: typeof CalendarGetInput.Type) {
    const { id } = yield* decode(CalendarGetInput, raw);
    const [row] = yield* sql<{
      connectionId: string;
      calendarId: string;
      generation: number;
      status: string;
      payload: string;
      revision: number;
    }>`SELECT connection_id AS "connectionId",calendar_id AS "calendarId",source_generation AS generation,status,payload_json AS payload,revision FROM workspace_calendar_occurrences WHERE id=${id}`;
    if (!row)
      return yield* fail("not-found", "This event is unavailable. Its links have been kept.");
    yield* requireSource(row.connectionId, row.calendarId);
    if (row.status === "cancelled")
      return yield* fail("unavailable", "This event was cancelled. Its links have been kept.");
    const detail = {
      ...(yield* decodeDetailJson(row.payload)),
      id,
      revision: row.revision,
    };
    return boundAttendees(detail);
  }, safe);

  const changes = SubscriptionRef.changes(counter).pipe(
    Stream.zipLatest(
      Stream.unwrap(
        tools.currentChange.pipe(
          Effect.map((current) => Stream.concat(Stream.succeed(current), tools.changes)),
        ),
      ),
    ),
    Stream.map(([calendar, tasks]) => calendar + tasks),
    Stream.changes,
  );
  const service = {
    get,
    changes,
    // Account adapters call this after committing availability or selection changes.
    invalidate: announce,
    read: Effect.fnUntraced(function* (raw: CalendarReadInput) {
      const input = yield* decode(CalendarReadInput, raw);
      const detail = yield* get({ id: input.id });
      const { description, ...metadata } = detail;
      const text = description ?? "";
      const offset = input.offset ?? 0;
      const buffer = Buffer.from(text, "utf8");
      if (offset > buffer.length || (offset < buffer.length && (buffer[offset]! & 0xc0) === 0x80))
        return yield* fail("invalid-input", "Use a valid calendar text offset.");
      return yield* decode(
        CalendarReadResult,
        boundAttendees(
          {
            ...metadata,
            body: sliceUtf8(text, offset, 8000),
          },
          READ_MAX_BYTES,
        ),
      );
    }, safe),
    ingestPage: Effect.fnUntraced(
      function* (raw: Ingest) {
        const decoded = yield* decode(Ingest, raw);
        const items: CalendarIngestItem[] = [];
        for (const item of decoded.items) {
          items.push(
            item.status === "confirmed" && item.time.kind === "timed"
              ? {
                  ...item,
                  time: {
                    ...item.time,
                    sourceTimeZone: yield* canonicalZone(item.time.sourceTimeZone),
                  },
                }
              : item,
          );
        }
        const input = { ...decoded, items };
        yield* requireSource(input.connectionId, input.calendarId, input.generation);
        const changed = yield* sql.withTransaction(
          Effect.gen(function* () {
            let changed = false;
            yield* requireSource(input.connectionId, input.calendarId, input.generation);
            yield* sql`INSERT OR IGNORE INTO workspace_calendar_sources(connection_id,calendar_id) VALUES(${input.connectionId},${input.calendarId})`;
            for (const item of input.items) {
              const [previous] = yield* sql<{
                id: string;
                fingerprint: string;
                revision: number;
              }>`SELECT id,fingerprint,revision FROM workspace_calendar_occurrences WHERE connection_id=${input.connectionId} AND calendar_id=${input.calendarId} AND external_event_id=${item.externalEventId} AND occurrence_key=${item.occurrenceKey}`;
              const id = previous?.id ?? `wce_${yield* crypto.randomUUIDv4}`;
              const revision = (previous?.revision ?? 0) + 1;
              const normalized = normalize(item);
              const fingerprint = hash([input.generation, encodeItem(normalized)]);
              if (previous?.fingerprint === fingerprint) continue;
              changed = true;
              const detail =
                normalized.status === "confirmed"
                  ? yield* decodeDetail({ ...normalized, id, revision })
                  : undefined;
              const payload = detail ? yield* encodeDetailJson(detail) : "{}";
              const summary = detail
                ? yield* encodeSummaryJson(boundAttendees(yield* decodeSummary(detail)))
                : "{}";
              const time = normalized.status === "confirmed" ? normalized.time : undefined;
              const startMs = time?.kind === "timed" ? Date.parse(time.start) : null;
              const endMs = time?.kind === "timed" ? Date.parse(time.end) : null;
              const startOn = time?.kind === "all-day" ? time.startOn : null;
              const endBefore = time?.kind === "all-day" ? time.endBefore : null;
              const sortKey = startMs ?? (startOn ? dayStart(startOn, "UTC") : 0);
              // The mapping row is the bounded replay journal: identity, fingerprint and revision
              // update with the current payload, never another full copy per ingestion.
              if (previous) {
                const rows =
                  yield* sql`UPDATE workspace_calendar_occurrences SET status=${item.status},payload_json=${payload},summary_json=${summary},fingerprint=${fingerprint},revision=${revision},source_generation=${input.generation},time_kind=${time?.kind ?? null},start_ms=${startMs},end_ms=${endMs},start_on=${startOn},end_before=${endBefore},sort_key=${sortKey} WHERE id=${id} AND revision=${previous.revision} RETURNING id`;
                if (!rows.length)
                  return yield* fail(
                    "conflict",
                    "This event changed during ingestion. Refresh this range.",
                  );
              } else {
                yield* sql`INSERT INTO workspace_calendar_occurrences(id,connection_id,calendar_id,external_event_id,occurrence_key,status,payload_json,summary_json,fingerprint,revision,source_generation,time_kind,start_ms,end_ms,start_on,end_before,sort_key) VALUES(${id},${input.connectionId},${input.calendarId},${item.externalEventId},${item.occurrenceKey},${item.status},${payload},${summary},${fingerprint},${revision},${input.generation},${time?.kind ?? null},${startMs},${endMs},${startOn},${endBefore},${sortKey})`;
              }
            }
            return changed;
          }),
        );
        if (changed) yield* announce;
      },
      Effect.uninterruptible,
      safe,
    ),
    listRange: Effect.fnUntraced(function* (raw: CalendarRangeInput) {
      const decoded = yield* decode(CalendarRangeInput, raw);
      const input = { ...decoded, timeZone: yield* canonicalZone(decoded.timeZone) };
      const limit = input.limit ?? 50;
      const query = hash([input.startOn, input.endBefore, input.timeZone, limit]);
      const sources = yield* sql<{
        connectionId: string;
        calendarId: string;
      }>`SELECT connection_id AS "connectionId",calendar_id AS "calendarId" FROM workspace_calendar_sources ORDER BY connection_id,calendar_id LIMIT 101`;
      const sourceStates: CalendarSourceState[] = [];
      for (const source of sources.slice(0, 100)) {
        const state = yield* resolve(source.connectionId, source.calendarId).pipe(
          Effect.catch(() => Effect.succeed(undefined)),
        );
        sourceStates.push({
          ...source,
          generation: state?.generation ?? 0,
          state:
            !options.resolveSource || !state
              ? "unavailable"
              : !state.connected
                ? "disconnected"
                : !state.selected
                  ? "unselected"
                  : "ready",
        });
      }
      const selection = hash(sourceStates);
      let cursor: typeof Cursor.Type | undefined;
      if (input.cursor !== undefined) {
        cursor = yield* decode(
          Schema.fromJsonString(Cursor),
          Buffer.from(input.cursor, "base64url").toString("utf8"),
        );
        if (cursor.instance !== instance)
          return yield* fail(
            "conflict",
            "The calendar server changed. Restart from the first page.",
          );
        if (cursor.query !== query)
          return yield* fail(
            "invalid-input",
            "This page belongs to a different calendar range or page size.",
          );
        if (cursor.sources !== selection)
          return yield* fail(
            "conflict",
            "The calendar selection changed. Restart from the first page.",
          );
      }
      const selected = sourceStates.filter((state) => state.state === "ready");
      const rows =
        (input.dueCursor !== undefined && input.cursor === undefined) || !selected.length
          ? []
          : yield* calendarRangeSql(sql, input, selected, cursor);
      let dueCursor: typeof DueCursor.Type | undefined;
      if (input.dueCursor) {
        dueCursor = yield* decode(
          Schema.fromJsonString(DueCursor),
          Buffer.from(input.dueCursor, "base64url").toString("utf8"),
        );
        if (dueCursor.instance !== instance)
          return yield* fail(
            "conflict",
            "The calendar server changed. Restart from the first page.",
          );
        if (dueCursor.query !== query)
          return yield* fail(
            "invalid-input",
            "This task page belongs to a different calendar range.",
          );
      }
      const taskResult =
        input.cursor !== undefined && input.dueCursor === undefined
          ? undefined
          : yield* tools
              .queryTasks({
                ...dueTaskQuery(input.startOn, input.endBefore),
                ...(dueCursor?.toolsCursor ? { cursor: dueCursor.toolsCursor } : {}),
              })
              .pipe(Effect.result);
      if (
        taskResult?._tag === "Failure" &&
        isToolsError(taskResult.failure) &&
        taskResult.failure.kind === "invalid-input"
      )
        return yield* fail(
          input.dueCursor ? "conflict" : "invalid-input",
          "Tasks changed. Restart from the first page.",
        );
      const taskPage = taskResult?._tag === "Success" ? taskResult.success : undefined;
      const dueItems = taskPage?.tasks.filter(hasDueOn).map(dueTaskItem) ?? [];
      const dueFingerprint = hash(dueItems);
      if (
        dueCursor &&
        dueCursor.offset > 0 &&
        (dueCursor.page !== dueFingerprint || dueCursor.offset >= dueItems.length)
      )
        return yield* fail("conflict", "Tasks changed. Restart from the first page.");
      const dueOffset = dueCursor?.offset ?? 0;
      const encodeDueCursor = (toolsCursor: string | undefined, offset: number, page: string) =>
        Buffer.from(
          encodeJson({
            version: 1,
            instance,
            query,
            ...(toolsCursor ? { toolsCursor } : {}),
            offset,
            page,
          }),
        ).toString("base64url");
      const states: CalendarSourceState[] = [];
      let stateBytes = 2;
      for (const state of sourceStates) {
        const size = bytes(state) + (states.length ? 1 : 0);
        if (stateBytes + size > 16000) break;
        states.push(state);
        stateBytes += size;
      }
      const page = {
        events: [] as CalendarOccurrenceSummary[],
        dueTasks: [] as ReturnType<typeof dueTaskItem>[],
        dueIncomplete: !taskPage,
        sourceStates: states,
        incomplete:
          !options.resolveSource ||
          sources.length > states.length ||
          sourceStates.some((state) => state.state !== "ready" && state.state !== "unselected"),
      };
      const continuation = (sortKey: number, id: string) =>
        Buffer.from(
          encodeJson({
            version: 1,
            instance,
            query,
            sources: selection,
            sortKey,
            id,
          }),
        ).toString("base64url");
      const dueReserve = Math.max(
        encodeDueCursor(dueCursor?.toolsCursor, 100, dueFingerprint).length,
        encodeDueCursor(taskPage?.nextCursor ?? undefined, 0, "").length,
      );
      let pageBytes = bytes({
        ...page,
        dueIncomplete: false,
        nextCursor: continuation(Number.MIN_SAFE_INTEGER, `wce_${"f".repeat(36)}`),
        nextDueCursor: "x".repeat(dueReserve),
      });
      const firstEvent = rows[0]
        ? {
            ...(yield* decodeSummaryJson(rows[0].payload)),
            id: rows[0].id,
            revision: rows[0].revision,
          }
        : undefined;
      const eventReserve = firstEvent ? bytes(firstEvent) : 0;
      for (const task of dueItems.slice(dueOffset)) {
        const size = bytes(task) + (page.dueTasks.length ? 1 : 0);
        if (pageBytes + size + eventReserve > 65536) break;
        page.dueTasks.push(task);
        pageBytes += size;
      }
      for (const [index, row] of rows.slice(0, limit).entries()) {
        const event =
          index === 0
            ? firstEvent!
            : { ...(yield* decodeSummaryJson(row.payload)), id: row.id, revision: row.revision };
        const size = (index === 0 ? eventReserve : bytes(event)) + (page.events.length ? 1 : 0);
        if (pageBytes + size > 65536) break;
        page.events.push(event);
        pageBytes += size;
      }
      const consumed = dueOffset + page.dueTasks.length;
      const nextDueCursor =
        consumed < dueItems.length
          ? encodeDueCursor(dueCursor?.toolsCursor, consumed, dueFingerprint)
          : taskPage?.nextCursor
            ? encodeDueCursor(taskPage.nextCursor, 0, "")
            : undefined;
      const last = rows[page.events.length - 1];
      return yield* decode(CalendarPage, {
        ...page,
        dueIncomplete: taskResult !== undefined && (!taskPage || nextDueCursor !== undefined),
        ...(nextDueCursor ? { nextDueCursor } : {}),
        ...(last && rows.length > page.events.length
          ? { nextCursor: continuation(last.sortKey, last.id) }
          : {}),
      });
    }, safe),
  };
  return { ...service, refresh: service.listRange };
});
export class WorkspaceCalendar extends Context.Service<
  WorkspaceCalendar,
  Effect.Success<ReturnType<typeof make>>
>()("t3/workspace/WorkspaceCalendar") {}
export const layer = Layer.effect(WorkspaceCalendar, make());
