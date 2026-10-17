import { vi } from "vite-plus/test";
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Tools from "./WorkspaceTools.ts";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Stream from "effect/Stream";
import { CalendarError, ProjectId } from "@t3tools/contracts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as Calendar from "./WorkspaceCalendar.ts";

const source = { connectionId: "fake-a", calendarId: "primary", generation: 1 };
const occurrence = {
  externalEventId: "series_20261013T070000Z",
  occurrenceKey: "2026-10-13T07:00:00Z",
  title: "Marketing stand-up",
  status: "confirmed" as const,
  time: {
    kind: "timed" as const,
    start: "2026-10-13T07:00:00Z",
    end: "2026-10-13T07:30:00Z",
    sourceTimeZone: "Africa/Johannesburg",
  },
  sourceLabel: "Test calendar",
  attendees: [],
  attendeesTruncated: false,
  hasDescription: false,
};
const range = {
  startOn: "2026-10-13",
  endBefore: "2026-10-14",
  timeZone: "Africa/Johannesburg",
  limit: 100,
};
const layer = Layer.effect(
  Calendar.WorkspaceCalendar,
  Calendar.make({
    resolveSource: () => Effect.succeed({ connected: true, generation: 1, selected: true }),
  }),
).pipe(
  Layer.provideMerge(Tools.layer),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(NodeCrypto.layer),
);
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const isCalendarError = Schema.is(CalendarError);
const serializedBytes = (value: unknown) => Buffer.byteLength(encodeJson(value));

it.effect("keeps occurrence identity across moves and isolates source tuples", () =>
  Effect.gen(function* () {
    const calendar = yield* Calendar.WorkspaceCalendar;
    yield* calendar.ingestPage({ ...source, items: [occurrence] });
    const first = (yield* calendar.listRange(range)).events[0]!;
    expect(first).toMatchObject({ source: { connectionId: "fake-a", calendarId: "primary" } });
    yield* calendar.ingestPage({
      ...source,
      items: [
        {
          ...occurrence,
          title: "Moved",
          time: { ...occurrence.time, start: "2026-10-13T08:00:00Z", end: "2026-10-13T08:30:00Z" },
        },
      ],
    });
    expect((yield* calendar.listRange(range)).events[0]!.id).toBe(first.id);
    yield* calendar.ingestPage({ ...source, calendarId: "other", items: [occurrence] });
    yield* calendar.ingestPage({ ...source, connectionId: "fake-b", items: [occurrence] });
    yield* calendar.ingestPage({
      ...source,
      items: [{ ...occurrence, occurrenceKey: "2026-10-20T07:00:00Z" }],
    });
    expect(new Set((yield* calendar.listRange(range)).events.map((event) => event.id)).size).toBe(
      4,
    );
  }).pipe(Effect.provide(layer)),
);

it.effect("uses exclusive overlap boundaries for timed, cross-midnight and all-day events", () =>
  Effect.gen(function* () {
    const calendar = yield* Calendar.WorkspaceCalendar;
    const timed = (id: string, start: string, end: string) => ({
      ...occurrence,
      externalEventId: id,
      time: { ...occurrence.time, start, end },
    });
    yield* calendar.ingestPage({
      ...source,
      items: [
        timed("before", "2026-10-12T21:00:00Z", "2026-10-12T22:00:00Z"),
        timed("midnight", "2026-10-12T21:30:00Z", "2026-10-12T23:00:00Z"),
        timed("after", "2026-10-13T22:00:00Z", "2026-10-13T23:00:00Z"),
        {
          ...occurrence,
          externalEventId: "all-day",
          time: { kind: "all-day", startOn: "2026-10-12", endBefore: "2026-10-14" },
        },
        {
          ...occurrence,
          externalEventId: "ended",
          time: { kind: "all-day", startOn: "2026-10-12", endBefore: "2026-10-13" },
        },
      ],
    });
    expect((yield* calendar.listRange(range)).events).toHaveLength(2);
    expect((yield* calendar.listRange({ ...range, timeZone: "UTC" })).events).toHaveLength(2);
  }).pipe(Effect.provide(layer)),
);

it.effect.each([
  ["spring", "2026-03-08", "2026-03-09", "2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z"],
  ["autumn", "2026-11-01", "2026-11-02", "2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z"],
] as const)(
  "uses display-zone midnight over the %s DST day",
  ([_name, startOn, endBefore, start, end]) =>
    Effect.gen(function* () {
      const calendar = yield* Calendar.WorkspaceCalendar;
      const event = (id: string, from: string, until: string) => ({
        ...occurrence,
        externalEventId: id,
        time: { ...occurrence.time, start: from, end: until },
      });
      yield* calendar.ingestPage({
        ...source,
        items: [
          event("inside", start, end),
          event("before", `${startOn}T00:00:00Z`, start),
          event("after", end, `${endBefore}T12:00:00Z`),
        ],
      });
      expect(
        (yield* calendar.listRange({ startOn, endBefore, timeZone: "America/New_York" })).events,
      ).toHaveLength(1);
    }).pipe(Effect.provide(layer)),
);

it.effect("pages 101 equal-time rows without omissions and rejects mismatched cursors", () =>
  Effect.gen(function* () {
    const calendar = yield* Calendar.WorkspaceCalendar;
    yield* calendar.ingestPage({
      ...source,
      items: Array.from({ length: 100 }, (_, n) => ({
        ...occurrence,
        externalEventId: `event-${n}`,
      })),
    });
    yield* calendar.ingestPage({
      ...source,
      items: [{ ...occurrence, externalEventId: "event-100" }],
    });
    const first = yield* calendar.listRange(range);
    expect(first.events).toHaveLength(100);
    expect(first.nextCursor).toBeDefined();
    const second = yield* calendar.listRange({ ...range, cursor: first.nextCursor! });
    expect(second.events).toHaveLength(1);
    expect(second.nextCursor).toBeUndefined();
    const otherInstance = yield* Calendar.make({
      resolveSource: () => Effect.succeed({ connected: true, selected: true, generation: 1 }),
    });
    expect(
      (yield* otherInstance.listRange({ ...range, cursor: first.nextCursor! }).pipe(Effect.flip))
        .kind,
    ).toBe("conflict");
    expect(new Set([...first.events, ...second.events].map((event) => event.id)).size).toBe(101);
    for (const input of [
      { ...range, limit: 50 },
      { ...range, timeZone: "UTC" },
      { ...range, endBefore: "2026-10-15" },
    ]) {
      expect(
        (yield* calendar.listRange({ ...input, cursor: first.nextCursor! }).pipe(Effect.flip)).kind,
      ).toBe("invalid-input");
    }
    expect((yield* calendar.listRange({ ...range, cursor: "broken" }).pipe(Effect.flip)).kind).toBe(
      "invalid-input",
    );
  }).pipe(Effect.provide(layer)),
);

it.effect(
  "preserves IDs and no-op revisions across restart, replay, cancellation and restoration",
  () =>
    Effect.gen(function* () {
      const calendar = yield* Calendar.WorkspaceCalendar;
      yield* calendar.ingestPage({ ...source, items: [occurrence] });
      const first = (yield* calendar.listRange(range)).events[0]!;
      yield* calendar.ingestPage({ ...source, items: [occurrence] });
      const restarted = yield* Calendar.make({
        resolveSource: () => Effect.succeed({ connected: true, selected: true, generation: 1 }),
      });
      expect(yield* restarted.get({ id: first.id })).toMatchObject({ id: first.id, revision: 1 });
      yield* restarted.ingestPage({
        ...source,
        items: [
          {
            status: "cancelled",
            externalEventId: occurrence.externalEventId,
            occurrenceKey: occurrence.occurrenceKey,
          },
        ],
      });
      expect((yield* restarted.listRange(range)).events).toEqual([]);
      const cancelled = yield* restarted.get({ id: first.id }).pipe(Effect.flip);
      expect(isCalendarError(cancelled)).toBe(true);
      expect(cancelled).toMatchObject({
        kind: "unavailable",
        message: expect.stringContaining("cancelled"),
      });
      yield* restarted.ingestPage({ ...source, items: [occurrence] });
      expect(yield* restarted.get({ id: first.id })).toMatchObject({ id: first.id, revision: 3 });
      yield* restarted.ingestPage({ ...source, items: [] });
      expect((yield* restarted.listRange(range)).events).toHaveLength(1);
      const sql = yield* SqlClient.SqlClient;
      expect((yield* sql`SELECT id FROM workspace_calendar_occurrences`).length).toBe(1);
    }).pipe(Effect.provide(layer)),
);

it.effect("reports source availability and rejects stale generations without losing mappings", () =>
  Effect.gen(function* () {
    let state = { connected: true, selected: true, generation: 1 };
    const calendar = yield* Calendar.make({ resolveSource: () => Effect.sync(() => state) });
    yield* calendar.ingestPage({
      ...source,
      items: [occurrence, { ...occurrence, externalEventId: "second" }],
    });
    const first = yield* calendar.listRange({ ...range, limit: 1 });
    const id = first.events[0]!.id;
    state = { ...state, connected: false, generation: 2 };
    expect((yield* calendar.get({ id }).pipe(Effect.flip)).kind).toBe("disconnected");
    expect(yield* calendar.listRange(range)).toMatchObject({
      events: [],
      incomplete: true,
      sourceStates: [{ state: "disconnected" }],
    });
    expect(
      (yield* calendar.ingestPage({ ...source, items: [occurrence] }).pipe(Effect.flip)).kind,
    ).toBe("disconnected");
    state = { ...state, connected: true };
    expect(
      (yield* calendar
        .listRange({ ...range, limit: 1, cursor: first.nextCursor! })
        .pipe(Effect.flip)).kind,
    ).toBe("conflict");
    expect(
      (yield* calendar.ingestPage({ ...source, items: [occurrence] }).pipe(Effect.flip)).kind,
    ).toBe("conflict");
    yield* calendar.ingestPage({ ...source, generation: 2, items: [occurrence] });
    expect(yield* calendar.get({ id })).toMatchObject({ id });
    state = { ...state, selected: false };
    expect((yield* calendar.get({ id }).pipe(Effect.flip)).kind).toBe("unavailable");
    expect(yield* calendar.listRange(range)).toMatchObject({
      events: [],
      sourceStates: [{ state: "unselected" }],
    });
    const unavailable = yield* Calendar.make();
    expect((yield* unavailable.get({ id }).pipe(Effect.flip)).kind).toBe("unavailable");
    expect(yield* unavailable.listRange(range)).toMatchObject({ events: [], incomplete: true });
  }).pipe(Effect.provide(layer)),
);

it.effect("bounds serialized pages and detail reads while deriving previews at ingestion", () =>
  Effect.gen(function* () {
    const calendar = yield* Calendar.WorkspaceCalendar;
    yield* calendar.ingestPage({
      ...source,
      items: Array.from({ length: 100 }, (_, n) => ({
        ...occurrence,
        externalEventId: `large-${n}`,
        title: "\u0000".repeat(300),
        description: "\u0000".repeat(2000),
        hasDescription: true,
        attendees: Array.from({ length: 20 }, () => ({ name: "\u0000".repeat(200) })),
      })),
    });
    const page = yield* calendar.listRange(range);
    expect(serializedBytes(page)).toBeLessThanOrEqual(65536);
    expect(page.events.length).toBeGreaterThan(0);
    expect(page.events.length).toBeLessThan(100);
    expect(page.nextCursor).toBeDefined();
    const ids = new Set(page.events.map((event) => event.id));
    let nextCursor = page.nextCursor;
    for (let n = 0; n < 100 && nextCursor; n++) {
      const next = yield* calendar.listRange({ ...range, cursor: nextCursor });
      expect(serializedBytes(next)).toBeLessThanOrEqual(65536);
      for (const event of next.events) ids.add(event.id);
      nextCursor = next.nextCursor;
    }
    expect(ids.size).toBe(100);
    expect(nextCursor).toBeUndefined();
    expect(page.events[0]!.descriptionPreview).toHaveLength(160);
    expect(page.events[0]).not.toHaveProperty("description");
    const detail = yield* calendar.get({ id: page.events[0]!.id });
    expect(page.events[0]).toHaveProperty("source");
    expect(detail).not.toHaveProperty("source");
    expect(serializedBytes(detail)).toBeLessThanOrEqual(32000);
    const read = yield* calendar.read({ id: detail.id });
    expect(read).not.toHaveProperty("source");
    expect(read).toMatchObject({
      time: occurrence.time,
      sourceLabel: "Test calendar",
      status: "confirmed",
    });
    expect(read).not.toHaveProperty("description");
    expect(read.body.text).toBe("\u0000".repeat(2000));
    expect(serializedBytes(read)).toBeLessThanOrEqual(32000);
    expect((yield* calendar.read({ id: detail.id, offset: 8001 }).pipe(Effect.flip)).kind).toBe(
      "invalid-input",
    );
  }).pipe(Effect.provide(layer)),
);

it.effect("rejects invalid adapter data atomically and validates Join URLs at admission", () =>
  Effect.gen(function* () {
    const calendar = yield* Calendar.WorkspaceCalendar;
    expect(
      (yield* calendar
        .ingestPage({ ...source, items: [occurrence, { ...occurrence, title: "x".repeat(301) }] })
        .pipe(Effect.flip)).kind,
    ).toBe("invalid-input");
    expect((yield* calendar.listRange(range)).events).toEqual([]);
    yield* calendar.ingestPage({
      ...source,
      items: [{ ...occurrence, joinUrl: "https://meet.google.com.evil.test/abc-defg-hij" }],
    });
    expect((yield* calendar.listRange(range)).events[0]).not.toHaveProperty("joinUrl");
    expect(
      (yield* calendar
        .ingestPage({ ...source, items: Array.from({ length: 101 }, () => ({ ...occurrence })) })
        .pipe(Effect.flip)).kind,
    ).toBe("invalid-input");
  }).pipe(Effect.provide(layer)),
);

it.effect("derives a Unicode-safe preview without splitting a surrogate pair", () =>
  Effect.gen(function* () {
    const calendar = yield* Calendar.WorkspaceCalendar;
    yield* calendar.ingestPage({
      ...source,
      items: [{ ...occurrence, description: `${"x".repeat(159)}😀 tail`, hasDescription: true }],
    });
    const event = (yield* calendar.listRange(range)).events[0]!;
    expect(event.descriptionPreview).toBe("x".repeat(159));
    expect((yield* calendar.get({ id: event.id })).description).toBe(`${"x".repeat(159)}😀 tail`);
  }).pipe(Effect.provide(layer)),
);

it.effect("rolls back an entire ingest page when persistence fails", () =>
  Effect.gen(function* () {
    const calendar = yield* Calendar.WorkspaceCalendar;
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TRIGGER reject_calendar_row BEFORE INSERT ON workspace_calendar_occurrences WHEN NEW.external_event_id='rejected' BEGIN SELECT RAISE(ABORT,'unavailable'); END`;
    expect(
      (yield* calendar
        .ingestPage({
          ...source,
          items: [occurrence, { ...occurrence, externalEventId: "rejected" }],
        })
        .pipe(Effect.flip)).kind,
    ).toBe("unavailable");
    expect((yield* calendar.listRange(range)).events).toEqual([]);
    yield* sql`DROP TRIGGER reject_calendar_row`;
    yield* calendar.ingestPage({ ...source, items: [occurrence] });
    const event = (yield* calendar.listRange(range)).events[0]!;
    expect(event.revision).toBe(1);
    expect(
      (yield* calendar.get({ id: "wce_00000000-0000-0000-0000-000000000000" }).pipe(Effect.flip))
        .kind,
    ).toBe("not-found");
  }).pipe(Effect.provide(layer)),
);

it.effect("admits maximal escaped metadata while bounding summary and detail records", () =>
  Effect.gen(function* () {
    const calendar = yield* Calendar.WorkspaceCalendar;
    yield* calendar.ingestPage({
      ...source,
      items: [
        {
          ...occurrence,
          title: "\u0000".repeat(300),
          sourceLabel: "\u0000".repeat(200),
          attendees: Array.from({ length: 20 }, () => ({
            name: "\u0000".repeat(200),
            initials: "\u0000".repeat(10),
          })),
          hasDescription: true,
          description: "\u0000".repeat(2000),
          joinUrl: `https://zoom.us/j/123?q=${'"'.repeat(1900)}`,
        },
      ],
    });
    const event = (yield* calendar.listRange(range)).events[0]!;
    expect(event.attendeesTruncated).toBe(true);
    expect(serializedBytes(event)).toBeLessThanOrEqual(32000);
    const detail = yield* calendar.get({ id: event.id });
    expect(detail.description).toHaveLength(2000);
    expect(detail.attendeesTruncated).toBe(true);
    expect(serializedBytes(detail)).toBeLessThanOrEqual(32000);
  }).pipe(Effect.provide(layer)),
);

it.effect("caps known source enumeration and reports partial results without inventing rows", () =>
  Effect.gen(function* () {
    const empty = yield* Calendar.make();
    expect(yield* empty.listRange(range)).toEqual({
      events: [],
      dueTasks: [],
      dueIncomplete: false,
      sourceStates: [],
      incomplete: true,
    });
    const calendar = yield* Calendar.WorkspaceCalendar;
    expect(yield* calendar.listRange(range)).toEqual({
      events: [],
      dueTasks: [],
      dueIncomplete: false,
      sourceStates: [],
      incomplete: false,
    });
    for (let n = 0; n < 101; n++) {
      yield* calendar.ingestPage({ ...source, calendarId: `calendar-${n}`, items: [occurrence] });
    }
    const page = yield* calendar.listRange(range);
    expect(page.incomplete).toBe(true);
    expect(page.sourceStates).toHaveLength(100);
    expect(page.events).toHaveLength(100);
    expect(serializedBytes(page)).toBeLessThanOrEqual(65536);
  }).pipe(Effect.provide(layer)),
);

it.effect("canonicalizes zones at admission and rejects unknown zones", () =>
  Effect.gen(function* () {
    const calendar = yield* Calendar.WorkspaceCalendar;
    const item = {
      ...occurrence,
      time: { ...occurrence.time, sourceTimeZone: "africa/johannesburg" },
    };
    yield* calendar.ingestPage({ ...source, items: [item] });
    const first = (yield* calendar.listRange({ ...range, timeZone: "africa/johannesburg" }))
      .events[0]!;
    expect(first.time).toMatchObject({ sourceTimeZone: "Africa/Johannesburg" });
    expect((yield* calendar.get({ id: first.id })).revision).toBe(1);
    expect(yield* Stream.runHead(calendar.changes)).toMatchObject({ value: 1 });
    expect(
      (yield* calendar.listRange({ ...range, timeZone: "Not/AZone" }).pipe(Effect.flip)).kind,
    ).toBe("invalid-input");
    expect(
      (yield* calendar
        .ingestPage({
          ...source,
          items: [{ ...occurrence, time: { ...occurrence.time, sourceTimeZone: "Not/AZone" } }],
        })
        .pipe(Effect.flip)).kind,
    ).toBe("invalid-input");
  }).pipe(Effect.provide(layer)),
);
it.effect("keeps a ready source visible when another resolver fails", () =>
  Effect.gen(function* () {
    let broken = false;
    const calendar = yield* Calendar.make({
      resolveSource: (connectionId) =>
        broken && connectionId === "fake-b"
          ? Effect.fail(new CalendarError({ kind: "rate-limited", message: "Unavailable" }))
          : Effect.succeed({ connected: true, selected: true, generation: 1 }),
    });
    yield* calendar.ingestPage({ ...source, items: [occurrence] });
    yield* calendar.ingestPage({ ...source, connectionId: "fake-b", items: [occurrence] });
    broken = true;
    const page = yield* calendar.listRange(range);
    expect(page.events).toHaveLength(1);
    expect(page.incomplete).toBe(true);
    expect(page.sourceStates.map((s) => s.state)).toEqual(["ready", "unavailable"]);
  }).pipe(Effect.provide(layer)),
);

it.effect(
  "projects due dates and reversible completion through TOOLS without creating events",
  () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const projectId = ProjectId.make("due-project");
      yield* sql`INSERT INTO projection_projects(project_id,title,workspace_root,scripts_json,created_at,updated_at) VALUES(${projectId},'Due','/synthetic','[]','now','now')`;
      const tools = yield* Tools.WorkspaceTools;
      const calendar = yield* Calendar.WorkspaceCalendar;
      let task = yield* tools.upsertTask({
        projectId,
        title: "Review",
        column: "To do",
        dueOn: "2026-10-13",
      });
      yield* tools.upsertTask({
        projectId,
        title: "Tomorrow",
        column: "To do",
        dueOn: "2026-10-14",
      });
      yield* tools.upsertTask({ projectId, title: "Undated", column: "To do" });
      expect((yield* calendar.listRange(range)).dueTasks).toEqual([
        {
          ref: { type: "task", taskId: task.id },
          projectId,
          title: "Review",
          dueOn: "2026-10-13",
          done: false,
          revision: task.revision,
        },
      ]);
      task = yield* tools.transitionTask({
        id: task.id,
        expectedRevision: task.revision!,
        change: { type: "completion", completed: true },
      });
      expect((yield* calendar.listRange(range)).dueTasks[0]).toMatchObject({ done: true });
      task = yield* tools.transitionTask({
        id: task.id,
        expectedRevision: task.revision!,
        change: { type: "completion", completed: false },
      });
      expect((yield* calendar.listRange(range)).dueTasks[0]).toMatchObject({ done: false });
      task = yield* tools.patchTask({
        id: task.id,
        expectedRevision: task.revision!,
        dueOn: "2026-10-12",
      });
      expect((yield* calendar.listRange(range)).dueTasks).toEqual([]);
      task = yield* tools.patchTask({
        id: task.id,
        expectedRevision: task.revision!,
        dueOn: "2026-10-13",
      });
      task = yield* tools.patchTask({ id: task.id, expectedRevision: task.revision!, dueOn: null });
      expect((yield* calendar.listRange(range)).dueTasks).toEqual([]);
      expect(yield* sql`SELECT id FROM workspace_calendar_occurrences`).toEqual([]);
      expect(yield* sql`SELECT * FROM scheduled_tasks`).toEqual([]);
      expect(yield* Stream.runHead(calendar.changes)).toMatchObject({ value: 8 });
    }).pipe(Effect.provide(layer)),
);
it.effect("announces only committed changed pages including cancellation and restoration", () =>
  Effect.gen(function* () {
    const calendar = yield* Calendar.WorkspaceCalendar;
    const sql = yield* SqlClient.SqlClient;
    const count = (n: number) =>
      Stream.runHead(calendar.changes).pipe(
        Effect.map((value) => expect(value).toMatchObject({ value: n })),
      );
    yield* calendar.ingestPage({ ...source, items: [occurrence] });
    yield* count(1);
    yield* calendar.ingestPage({ ...source, items: [occurrence] });
    yield* count(1);
    yield* calendar.ingestPage({ ...source, generation: 2, items: [occurrence] }).pipe(Effect.flip);
    yield* count(1);
    yield* sql`CREATE TRIGGER reject_change BEFORE INSERT ON workspace_calendar_occurrences WHEN NEW.external_event_id='rejected' BEGIN SELECT RAISE(ABORT,'unavailable'); END`;
    yield* calendar
      .ingestPage({
        ...source,
        items: [
          { ...occurrence, title: "Rolled back" },
          { ...occurrence, externalEventId: "rejected" },
        ],
      })
      .pipe(Effect.flip);
    yield* count(1);
    expect((yield* calendar.listRange(range)).events[0]!.revision).toBe(1);
    yield* calendar.ingestPage({
      ...source,
      items: [
        {
          status: "cancelled",
          externalEventId: occurrence.externalEventId,
          occurrenceKey: occurrence.occurrenceKey,
        },
      ],
    });
    yield* count(2);
    yield* calendar.ingestPage({ ...source, items: [occurrence] });
    yield* count(3);
    yield* calendar.invalidate;
    yield* count(4);
  }).pipe(Effect.provide(layer)),
);

it.effect("pages due references independently within the byte budget with one global query", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const projectId = ProjectId.make("paged-due");
    yield* sql`INSERT INTO projection_projects(project_id,title,workspace_root,scripts_json,created_at,updated_at) VALUES(${projectId},'Due','/synthetic','[]','now','now')`;
    const tools = yield* Tools.WorkspaceTools;
    const calendar = yield* Calendar.WorkspaceCalendar;
    for (let n = 0; n < 101; n++)
      yield* tools.upsertTask({
        projectId,
        title: "\u0000".repeat(240),
        column: "To do",
        dueOn: "2026-10-13",
      });
    yield* calendar.ingestPage({
      ...source,
      items: [
        {
          ...occurrence,
          attendees: Array.from({ length: 20 }, () => ({ name: "\u0000".repeat(200) })),
        },
      ],
    });
    const query = vi.spyOn(tools, "queryTasks");
    try {
      const first = yield* calendar.listRange(range);
      expect(query).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenLastCalledWith({
        state: "all",
        dueFrom: "2026-10-13",
        dueTo: "2026-10-13",
        limit: 100,
      });
      expect(first.dueIncomplete).toBe(true);
      expect(first.nextDueCursor).toBeDefined();
      const ids = new Set(first.dueTasks.map((task) => task.ref.taskId));
      let cursor = first.nextDueCursor;
      for (let n = 0; cursor && n < 20; n++) {
        const next = yield* calendar.listRange({ ...range, dueCursor: cursor });
        expect(serializedBytes(next)).toBeLessThanOrEqual(65536);
        for (const task of next.dueTasks) {
          expect(ids.has(task.ref.taskId)).toBe(false);
          ids.add(task.ref.taskId);
        }
        cursor = next.nextDueCursor;
        if (!cursor) expect(next.dueIncomplete).toBe(false);
      }
      expect(cursor).toBeUndefined();
      expect(ids.size).toBe(101);
      expect(
        (yield* calendar
          .listRange({ ...range, endBefore: "2026-10-15", dueCursor: first.nextDueCursor! })
          .pipe(Effect.flip)).kind,
      ).toBe("invalid-input");
      yield* tools.upsertTask({
        projectId,
        title: "Changed",
        column: "To do",
        dueOn: "2026-10-13",
      });
      expect(
        (yield* calendar.listRange({ ...range, dueCursor: first.nextDueCursor! }).pipe(Effect.flip))
          .kind,
      ).toBe("conflict");
    } finally {
      query.mockRestore();
    }
  }).pipe(Effect.provide(layer)),
);

it.effect("emits one combined subscribe baseline and preserves TOOLS stream emissions", () =>
  Effect.gen(function* () {
    const tools = yield* Tools.WorkspaceTools;
    expect(yield* tools.currentChange).toBe(0);
    const sql = yield* SqlClient.SqlClient;
    const projectId = ProjectId.make("baseline");
    yield* sql`INSERT INTO projection_projects(project_id,title,workspace_root,scripts_json,created_at,updated_at) VALUES(${projectId},'Test','/synthetic','[]','now','now')`;
    yield* tools.upsertTask({ projectId, title: "One", column: "To do" });
    yield* tools.upsertTask({ projectId, title: "Two", column: "To do" });
    expect(yield* tools.currentChange).toBe(2);
    const calendar = yield* Calendar.WorkspaceCalendar;
    yield* calendar.ingestPage({ ...source, items: [occurrence] });
    const baseline = yield* Deferred.make<void>();
    const values = yield* calendar.changes.pipe(
      Stream.tap(() => Deferred.succeed(baseline, undefined)),
      Stream.take(2),
      Stream.runCollect,
      Effect.forkChild,
    );
    yield* Deferred.await(baseline);
    yield* calendar.invalidate;
    expect(yield* Fiber.join(values)).toEqual([3, 4]);
    expect(yield* Stream.runHead(tools.changes)).toMatchObject({ value: 2 });
  }).pipe(Effect.provide(layer)),
);

it.effect("does not repeat the other side when paging events or due tasks", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const projectId = ProjectId.make("independent");
    yield* sql`INSERT INTO projection_projects(project_id,title,workspace_root,scripts_json,created_at,updated_at) VALUES(${projectId},'Test','/synthetic','[]','now','now')`;
    const tools = yield* Tools.WorkspaceTools;
    for (let n = 0; n < 101; n++)
      yield* tools.upsertTask({
        projectId,
        title: `Task ${n}`,
        column: "To do",
        dueOn: "2026-10-13",
      });
    const calendar = yield* Calendar.WorkspaceCalendar;
    yield* calendar.ingestPage({
      ...source,
      items: [occurrence, { ...occurrence, externalEventId: "second" }],
    });
    const first = yield* calendar.listRange({ ...range, limit: 1 });
    const query = vi.spyOn(tools, "queryTasks");
    try {
      const events = yield* calendar.listRange({ ...range, limit: 1, cursor: first.nextCursor! });
      expect(events.events).toHaveLength(1);
      expect(events.dueTasks).toEqual([]);
      expect(query).not.toHaveBeenCalled();
      // A due continuation must not even attempt an occurrence query.
      yield* sql`ALTER TABLE workspace_calendar_occurrences RENAME TO hidden_occurrences`;
      const due = yield* calendar.listRange({
        ...range,
        limit: 1,
        dueCursor: first.nextDueCursor!,
      });
      expect(due.events).toEqual([]);
      expect(due.dueTasks.length).toBeGreaterThan(0);
      expect(query).toHaveBeenCalledTimes(1);
    } finally {
      query.mockRestore();
    }
  }).pipe(Effect.provide(layer)),
);

it.effect("reads exact multibyte body offsets and leaves room for the MCP envelope", () =>
  Effect.gen(function* () {
    const calendar = yield* Calendar.WorkspaceCalendar;
    const description = "\u{1F600}".repeat(1000);
    yield* calendar.ingestPage({
      ...source,
      items: [
        {
          ...occurrence,
          description,
          hasDescription: true,
          title: "\u0000".repeat(300),
          sourceLabel: "\u0000".repeat(200),
          attendees: Array.from({ length: 20 }, () => ({
            name: "\u0000".repeat(199),
            initials: "\u0000".repeat(10),
          })),
        },
      ],
    });
    const id = (yield* calendar.listRange(range)).events[0]!.id;
    const read = yield* calendar.read({ id });
    expect(read.body.text).toBe(description);
    expect(Buffer.byteLength(read.body.text)).toBeLessThanOrEqual(8000);
    expect(
      serializedBytes({
        ...read,
        key: `provider-resource:workspace-calendar:${id}`,
        type: "calendar-event",
      }),
    ).toBeLessThanOrEqual(32000);
    expect((yield* calendar.read({ id, offset: 1 }).pipe(Effect.flip)).kind).toBe("invalid-input");
    expect((yield* calendar.read({ id, offset: 4 })).body.text).toBe(description.slice(2));
  }).pipe(Effect.provide(layer)),
);
