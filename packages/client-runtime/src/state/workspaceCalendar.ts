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
import {
  EnvironmentRpcUnavailableError,
  getInitialServerConfig,
  request,
  subscribeDynamic,
  type EnvironmentRpcInput,
} from "../rpc/client.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentCommand,
  createEnvironmentQueryAtomFamily,
  createEnvironmentRpcCommand,
  createEnvironmentSubscriptionAtomFamily,
} from "./runtime.ts";

const hasCalendarCapability = Schema.is(
  Schema.Struct({
    pulseCapabilities: Schema.Struct({ workspaceCalendar: Schema.Literal(true) }),
  }),
);
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
  return hasCalendarCapability(config);
});
const isCalendarError = Schema.is(CalendarError);
const recoverableContinuations = new Set([
  "unavailable",
  "disconnected",
  "rate-limited",
  "conflict",
]);
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
  const changes = createEnvironmentSubscriptionAtomFamily(runtime, {
    label: "workspace-calendar:changes",
    idleTtlMs: 0,
    subscribe: (input: EnvironmentRpcInput<typeof WS_METHODS.calendarSubscribeChanges>) =>
      subscribeDynamic(
        WS_METHODS.calendarSubscribeChanges,
        Effect.fnUntraced(function* (session) {
          // Each replacement session must wait for its own live capability before subscribing.
          const config = yield* session.initialConfig.pipe(Effect.catch(() => Effect.never));
          return hasCalendarCapability(config) ? input : yield* Effect.never;
        }),
      ).pipe(Stream.drop(1)),
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
  const compareKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const compareEvents = (a: CalendarPage["events"][number], b: CalendarPage["events"][number]) =>
    eventStart(a) - eventStart(b) || compareKey(a.id, b.id);
  const compareDue = (a: CalendarPage["dueTasks"][number], b: CalendarPage["dueTasks"][number]) =>
    compareKey(a.dueOn, b.dueOn) ||
    compareKey(a.projectId, b.projectId) ||
    compareKey(a.ref.taskId, b.ref.taskId);
  const sortEvents = (events: CalendarPage["events"][number][]) => events.sort(compareEvents);
  const retainRows = <T>(
    fresh: readonly T[],
    saved: readonly T[],
    id: (row: T) => string,
    keep: (row: T) => boolean,
    cap: number,
  ) => {
    const ids = new Set(fresh.map(id));
    return [...fresh, ...saved.filter((row) => !ids.has(id(row)) && keep(row))].slice(0, cap);
  };
  const sourceState = (fresh: RangeState, event: CalendarPage["events"][number]) =>
    fresh.sourceStates.find(
      (source) =>
        source.connectionId === event.source?.connectionId &&
        source.calendarId === event.source.calendarId,
    );
  const retainFailedSources = (
    fresh: RangeState,
    saved: RangeState | undefined,
    cap: number,
  ): RangeState => ({
    ...fresh,
    events: sortEvents(
      retainRows(
        fresh.events,
        saved?.events ?? [],
        (event) => event.id,
        (event) => {
          const source = sourceState(fresh, event);
          return source?.state === "unavailable" || source?.state === "disconnected";
        },
        cap,
      ),
    ),
  });
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
              (error) => isCalendarError(error) && recoverableContinuations.has(error.kind),
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
      const read = combine(page, events, due);
      const fresh = retainFailedSources(
        read,
        previous?.value,
        ((previous?.eventDepth ?? 0) + 1) * input.limit,
      );
      const dueFailed = page.dueIncomplete && !page.nextDueCursor && page.dueTasks.length === 0;
      const combined = {
        ...fresh,
        ...(previous && dueFailed ? { dueTasks: previous.value.dueTasks } : {}),
      };
      if (failed.events) {
        const last = read.events.at(-1);
        combined.events = sortEvents(
          retainRows(
            combined.events,
            previous?.value.events ?? [],
            (event) => event.id,
            (event) => {
              const source = sourceState(page, event);
              return (
                (!event.source || Boolean(source && source.state !== "unselected")) &&
                (!last || compareEvents(event, last) > 0)
              );
            },
            (requested("events") + 1) * input.limit,
          ),
        );
        combined.incomplete = true;
        delete combined.nextCursor;
      }
      if (failed.due) {
        const last = read.dueTasks.at(-1);
        combined.dueTasks = retainRows(
          combined.dueTasks,
          previous?.value.dueTasks ?? [],
          (task) => task.ref.taskId,
          (task) => !last || compareDue(task, last) > 0,
          (requested("due") + 1) * input.limit,
        );
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
      return AsyncResult.map(result, (value) =>
        pages?.queryValue === value ? pages.value : value,
      );
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
        const depth = depths.get(key);
        if (
          !AsyncResult.isSuccess(current) ||
          current.value !== first.value ||
          !depth ||
          depth.first !== pages.first ||
          depth.queryValue !== first.value
        )
          return yield* new CalendarError({
            kind: "conflict",
            message: "Calendar changed while loading more. Try again.",
          });
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
