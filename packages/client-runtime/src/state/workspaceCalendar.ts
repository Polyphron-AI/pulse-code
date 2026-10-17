import {
  CalendarError,
  CalendarRangeInput,
  WS_METHODS,
  CalendarPage,
  type EnvironmentId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { Atom, AsyncResult, type AtomRegistry } from "effect/unstable/reactivity";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import { EnvironmentRpcUnavailableError, getInitialServerConfig, request } from "../rpc/client.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentCommand,
  createEnvironmentQueryAtomFamily,
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

const supported = Effect.gen(function* () {
  const supervisor = yield* EnvironmentSupervisor.EnvironmentSupervisor;
  const config = yield* getInitialServerConfig().pipe(
    Effect.mapError(
      () =>
        new EnvironmentRpcUnavailableError({
          environmentId: supervisor.target.environmentId,
          message: "Calendar configuration is unavailable.",
        }),
    ),
  );
  return config.pulseCapabilities?.workspaceCalendar === true;
});
const isCalendarError = Schema.is(CalendarError);
const unavailableReason = "Calendar is unavailable on this server.";
const unavailable = { unavailableReason };
type LoadMoreInput = { readonly range: CalendarRangeInput; readonly kind: "events" | "dueTasks" };
type RangeState = CalendarPage & { readonly unavailableReason?: string };
const sameRange = Schema.toEquivalence(
  Schema.Struct({
    ...CalendarPage.fields,
    unavailableReason: Schema.optionalKey(Schema.String),
  }),
);
const decodeRange = Schema.decodeUnknownOption(CalendarRangeInput);
const normalizeRange = (input: CalendarRangeInput) => {
  const decoded = decodeRange(input);
  if (Option.isNone(decoded)) return undefined;
  const value = decoded.value;
  return {
    startOn: value.startOn,
    endBefore: value.endBefore,
    timeZone: value.timeZone.toLowerCase(),
    limit: value.limit ?? 50,
    ...(value.cursor ? { cursor: value.cursor } : {}),
    ...(value.dueCursor ? { dueCursor: value.dueCursor } : {}),
  };
};
type NormalizedRange = NonNullable<ReturnType<typeof normalizeRange>>;
export function createWorkspaceCalendarAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const changes = createEnvironmentRpcSubscriptionAtomFamily(runtime, {
    label: "workspace-calendar:changes",
    tag: WS_METHODS.calendarSubscribeChanges,
    idleTtlMs: 0,
    transform: (stream) =>
      Stream.unwrap(
        supported.pipe(
          Effect.orElseSucceed(() => false),
          Effect.map((available) => (available ? stream.pipe(Stream.drop(1)) : Stream.empty)),
        ),
      ),
  });
  const refreshTrigger = ({ environmentId }: { environmentId: EnvironmentId }) =>
    changes({ environmentId, input: {} });
  type Depth = {
    first: RangeState;
    events: CalendarPage[];
    due: CalendarPage[];
    value: RangeState;
    eventDepth: number;
    dueDepth: number;
    queryValue: RangeState;
  };
  // Revalidation follows only the depth explicitly loaded in this mounted range.
  const depths = new Map<string, Depth>();
  const depthKey = (environmentId: EnvironmentId, input: CalendarRangeInput) =>
    JSON.stringify([environmentId, normalizeRange(input)]);
  const eventStart = (event: CalendarPage["events"][number]) =>
    Date.parse(event.time.kind === "timed" ? event.time.start : `${event.time.startOn}T00:00:00Z`);
  const sortEvents = (events: CalendarPage["events"][number][]) =>
    events.sort((a, b) => eventStart(a) - eventStart(b) || a.id.localeCompare(b.id));
  const retainFailedSources = (
    fresh: RangeState,
    saved: RangeState | undefined,
    cap: number,
  ): RangeState => {
    const freshIds = new Set(fresh.events.map((event) => event.id));
    const retained =
      saved?.events.filter(
        (event) =>
          !freshIds.has(event.id) &&
          event.source &&
          fresh.sourceStates.some(
            (source) =>
              source.connectionId === event.source?.connectionId &&
              source.calendarId === event.source.calendarId &&
              (source.state === "unavailable" || source.state === "disconnected"),
          ),
      ) ?? [];
    return { ...fresh, events: sortEvents([...fresh.events, ...retained].slice(0, cap)) };
  };
  const combine = (
    first: RangeState,
    events: readonly CalendarPage[],
    due: readonly CalendarPage[],
  ): RangeState => {
    const { nextCursor: _, nextDueCursor: __, ...base } = first;
    const lastEvents = events.at(-1) ?? first;
    const lastDue = due.at(-1) ?? first;
    const eventRows = new Map<string, CalendarPage["events"][number]>();
    for (const event of [first, ...events].flatMap((page) => page.events)) {
      const saved = eventRows.get(event.id);
      if (!saved || event.revision >= saved.revision) eventRows.set(event.id, event);
    }
    const dueRows = new Map<string, CalendarPage["dueTasks"][number]>();
    for (const task of [first, ...due].flatMap((page) => page.dueTasks)) {
      const saved = dueRows.get(task.ref.taskId);
      if (!saved || task.revision >= saved.revision) dueRows.set(task.ref.taskId, task);
    }
    return {
      ...base,
      events: sortEvents([...eventRows.values()]),
      dueTasks: [...dueRows.values()],
      dueIncomplete: lastDue.dueIncomplete,
      ...(lastEvents.nextCursor ? { nextCursor: lastEvents.nextCursor } : {}),
      ...(lastDue.nextDueCursor ? { nextDueCursor: lastDue.nextDueCursor } : {}),
    };
  };
  const queries = createEnvironmentQueryAtomFamily(runtime, {
    label: "workspace-calendar:range",
    refreshTrigger,
    staleTimeMs: 30000,
    idleTtlMs: 0,
    execute: Effect.fnUntraced(function* (input: NormalizedRange) {
      if (!(yield* supported))
        return {
          ...unavailable,
          events: [],
          sourceStates: [],
          incomplete: true,
          dueTasks: [],
          dueIncomplete: true,
        } as RangeState;
      const supervisor = yield* EnvironmentSupervisor.EnvironmentSupervisor;
      const key = depthKey(supervisor.target.environmentId, input);
      const page: RangeState = yield* request(WS_METHODS.calendarListRange, input);
      const events: CalendarPage[] = [];
      const due: CalendarPage[] = [];
      const failed = { events: false, due: false };
      const requested = (kind: "events" | "due") => {
        const latest = depths.get(key);
        return (kind === "events" ? latest?.eventDepth : latest?.dueDepth) ?? 0;
      };
      const replay = Effect.fnUntraced(function* (kind: "events" | "due", pages: CalendarPage[]) {
        // The shared counter cannot prove either side unchanged, even with an equal first page.
        while (pages.length < requested(kind) && !failed[kind]) {
          const last = pages.at(-1) ?? page;
          const cursor = kind === "events" ? last.nextCursor : last.nextDueCursor;
          if (!cursor) break;
          const next = yield* request(WS_METHODS.calendarListRange, {
            ...input,
            ...(kind === "events" ? { cursor } : { dueCursor: cursor }),
          }).pipe(
            Effect.catchIf(
              (error) =>
                isCalendarError(error) &&
                ["unavailable", "disconnected", "rate-limited", "conflict"].includes(error.kind),
              () => Effect.void,
            ),
          );
          if (next) pages.push(next);
          else failed[kind] = true;
        }
      });
      const needsReplay = (kind: "events" | "due", pages: CalendarPage[]) =>
        !failed[kind] &&
        pages.length < requested(kind) &&
        Boolean(
          kind === "events"
            ? (pages.at(-1) ?? page).nextCursor
            : (pages.at(-1) ?? page).nextDueCursor,
        );
      do {
        yield* replay("events", events);
        yield* replay("due", due);
        // Load more can finish during either side's read. Admit its latest depth before publishing.
      } while (needsReplay("events", events) || needsReplay("due", due));
      const previous = depths.get(key);
      const fresh = retainFailedSources(
        combine(page, events, due),
        previous?.value,
        ((previous?.eventDepth ?? 0) + 1) * input.limit,
      );
      const dueFailed = page.dueIncomplete && !page.nextDueCursor && page.dueTasks.length === 0;
      const combined = {
        ...fresh,
        ...(previous && dueFailed ? { dueTasks: previous.value.dueTasks } : {}),
      };
      if (failed.events) {
        const rows = new Map(combined.events.map((event) => [event.id, event]));
        for (const event of previous?.value.events ?? []) {
          const source = event.source;
          const state = source
            ? page.sourceStates.find(
                (state) =>
                  state.connectionId === source.connectionId &&
                  state.calendarId === source.calendarId,
              )
            : undefined;
          if (source && (!state || state.state === "unselected")) continue;
          if (!rows.has(event.id)) rows.set(event.id, event);
        }
        combined.events = sortEvents(
          [...rows.values()].slice(0, (requested("events") + 1) * input.limit),
        );
        combined.incomplete = true;
        delete combined.nextCursor;
      }
      if (failed.due) {
        const rows = new Map(combined.dueTasks.map((task) => [task.ref.taskId, task]));
        for (const task of previous?.value.dueTasks ?? [])
          if (!rows.has(task.ref.taskId)) rows.set(task.ref.taskId, task);
        combined.dueTasks = [...rows.values()].slice(0, (requested("due") + 1) * input.limit);
        combined.dueIncomplete = true;
        delete combined.nextDueCursor;
      }
      const value = previous && sameRange(previous.value, combined) ? previous.value : combined;
      depths.set(key, {
        first: page,
        events,
        due,
        value,
        eventDepth: previous?.eventDepth ?? 0,
        dueDepth: previous?.dueDepth ?? 0,
        queryValue: value,
      });
      return value;
    }),
  });
  const invalidRange = Atom.make(() =>
    AsyncResult.fail(
      new CalendarError({
        kind: "invalid-input",
        message: "Choose a valid calendar range of up to 31 days.",
      }),
    ),
  );
  type Query = ReturnType<typeof queries>;
  // This atom only notifies readers. The range lifetime owns the single page store above.
  const loaded = Atom.family((_query: Query) => Atom.make(0).pipe(Atom.setIdleTTL(0)));
  const queryKeys = new WeakMap<Query, string>();
  const lifetimes = Atom.family((query: Query) =>
    Atom.make((get) => {
      get.addFinalizer(() => {
        const key = queryKeys.get(query);
        if (key) depths.delete(key);
      });
      return { active: false };
    }).pipe(Atom.setIdleTTL(0)),
  );
  const views = Atom.family((query: Query) =>
    Atom.make((get) => {
      const lifetime = get(lifetimes(query));
      lifetime.active = true;
      get.addFinalizer(() => {
        lifetime.active = false;
      });
      const result = get(query);
      get(loaded(query));
      const key = queryKeys.get(query);
      const pages = key ? depths.get(key) : undefined;
      if (!AsyncResult.isSuccess(result) || result.waiting || pages?.queryValue !== result.value)
        return result;
      return AsyncResult.success(pages.value);
    }).pipe(Atom.setIdleTTL(0)),
  );
  const range = ({
    environmentId,
    input,
  }: {
    environmentId: EnvironmentId;
    input: CalendarRangeInput;
  }) => {
    const normalized = normalizeRange(input);
    if (!normalized) return invalidRange;
    const query = queries({ environmentId, input: normalized });
    queryKeys.set(query, depthKey(environmentId, normalized));
    return views(query);
  };
  const scheduler = createAtomCommandScheduler();
  return {
    changes,
    range,
    loadMore: createEnvironmentCommand(runtime, {
      label: "workspace-calendar:loadMore",
      scheduler,
      concurrency: {
        mode: "singleFlight",
        key: ({ environmentId, input }: { environmentId: EnvironmentId; input: LoadMoreInput }) =>
          JSON.stringify([environmentId, normalizeRange(input.range), input.kind]),
      },
      execute: Effect.fnUntraced(function* (
        input: LoadMoreInput,
        registry: AtomRegistry.AtomRegistry,
        environmentId: EnvironmentId,
      ) {
        const normalized = normalizeRange(input.range);
        if (!normalized)
          return yield* new CalendarError({
            kind: "invalid-input",
            message: "Choose a valid calendar range.",
          });
        const query = queries({ environmentId, input: normalized });
        const lifetime = registry.get(lifetimes(query));
        if (!lifetime.active)
          return yield* new CalendarError({
            kind: "conflict",
            message: "Open this calendar range before loading more.",
          });
        const first = registry.get(query);
        if (!AsyncResult.isSuccess(first) || first.waiting)
          return yield* new CalendarError({
            kind: "conflict",
            message: "Wait for this calendar range to finish loading.",
          });
        if (first.value.unavailableReason)
          return yield* new CalendarError({
            kind: "unavailable",
            message: first.value.unavailableReason,
          });
        const key = depthKey(environmentId, normalized);
        const pages = depths.get(key);
        if (!pages || pages.queryValue !== first.value) return;
        const last = (input.kind === "events" ? pages.events : pages.due).at(-1) ?? first.value;
        const cursor = input.kind === "events" ? last.nextCursor : last.nextDueCursor;
        if (!cursor) return;
        const next = yield* request(WS_METHODS.calendarListRange, {
          ...normalized,
          ...(input.kind === "events" ? { cursor } : { dueCursor: cursor }),
        }).pipe(
          Effect.catch((error) => {
            if (lifetime.active && isCalendarError(error) && error.kind === "conflict") {
              registry.refresh(query);
            }
            return Effect.fail(error);
          }),
        );
        if (!lifetime.active) return;
        const current = registry.get(query);
        if (AsyncResult.isSuccess(current) && current.value === first.value) {
          const depth = depths.get(key);
          if (!depth || depth.first !== pages.first || depth.queryValue !== first.value) return;
          const events = input.kind === "events" ? [...depth.events, next] : depth.events;
          const due = input.kind === "dueTasks" ? [...depth.due, next] : depth.due;
          const eventDepth = depth.eventDepth + (input.kind === "events" ? 1 : 0);
          const dueDepth = depth.dueDepth + (input.kind === "dueTasks" ? 1 : 0);
          depths.set(key, {
            ...depth,
            events,
            due,
            eventDepth,
            dueDepth,
            value: retainFailedSources(
              combine(depth.first, events, due),
              depth.value,
              (eventDepth + 1) * normalized.limit,
            ),
          });
          registry.update(loaded(query), (version) => version + 1);
        }
      }),
    }),
    detail: createEnvironmentQueryAtomFamily(runtime, {
      label: "workspace-calendar:detail",
      refreshTrigger,
      idleTtlMs: 0,
      execute: Effect.fnUntraced(function* (input: {
        id: import("@t3tools/contracts").CalendarOccurrenceId;
      }) {
        return (yield* supported) ? yield* request(WS_METHODS.calendarGet, input) : unavailable;
      }),
    }),
    refresh: createEnvironmentRpcCommand(runtime, {
      label: "workspace-calendar:refresh",
      tag: WS_METHODS.calendarRefresh,
      scheduler,
      concurrency: {
        mode: "singleFlight",
        key: ({ environmentId, input }) => JSON.stringify([environmentId, normalizeRange(input)]),
      },
      execute: Effect.fnUntraced(function* (input) {
        if (!(yield* supported))
          return yield* new CalendarError({ kind: "unavailable", message: unavailableReason });
        const normalized = normalizeRange(input);
        if (!normalized)
          return yield* new CalendarError({
            kind: "invalid-input",
            message: "Choose a valid calendar range.",
          });
        return yield* request(WS_METHODS.calendarRefresh, normalized);
      }),
      onSuccess: (target, registry) =>
        Effect.sync(() => {
          const query = queries({
            environmentId: target.environmentId,
            input: normalizeRange(target.input)!,
          });
          if (registry.get(lifetimes(query)).active) registry.refresh(query);
        }),
    }),
  };
}
