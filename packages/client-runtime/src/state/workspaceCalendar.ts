import {
  CalendarError,
  CalendarRangeInput,
  WS_METHODS,
  type CalendarPage,
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
    forceReplay: boolean;
  };
  // Revalidation follows only the depth explicitly loaded in this mounted range.
  const depths = new Map<string, Depth>();
  const depthKey = (environmentId: EnvironmentId, input: CalendarRangeInput) =>
    JSON.stringify([environmentId, normalizeRange(input)]);
  const signature = (page: CalendarPage, kind: "events" | "due") =>
    JSON.stringify(
      kind === "events"
        ? [page.sourceStates, page.nextCursor, page.events.map((e) => [e.id, e.revision, e])]
        : [page.nextDueCursor, page.dueTasks.map((t) => [t.ref.taskId, t.revision, t])],
    );
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
      events: [...eventRows.values()],
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
    execute: Effect.fnUntraced(function* (input: CalendarRangeInput) {
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
      const previous = depths.get(key);
      const page: RangeState = yield* request(WS_METHODS.calendarListRange, input);
      const replay = Effect.fnUntraced(function* (kind: "events" | "due") {
        const old = previous?.[kind] ?? [];
        if (
          previous &&
          !previous.forceReplay &&
          signature(previous.first, kind) === signature(page, kind)
        )
          return old;
        const pages: CalendarPage[] = [];
        const requested = previous
          ? kind === "events"
            ? previous.eventDepth
            : previous.dueDepth
          : 0;
        for (let i = 0; i < requested; i++) {
          const last = pages.at(-1) ?? page;
          const cursor = kind === "events" ? last.nextCursor : last.nextDueCursor;
          if (!cursor) break;
          pages.push(
            yield* request(WS_METHODS.calendarListRange, {
              ...input,
              ...(kind === "events" ? { cursor } : { dueCursor: cursor }),
            }),
          );
        }
        return pages;
      });
      const events = yield* replay("events");
      const due = yield* replay("due");
      const fresh = combine(page, events, due);
      const dueFailed = page.dueIncomplete && !page.nextDueCursor && page.dueTasks.length === 0;
      const combined = {
        ...fresh,
        ...(previous && page.incomplete
          ? {
              events: [
                ...new Map(
                  [...previous.value.events, ...fresh.events].map((event) => [event.id, event]),
                ).values(),
              ].slice(0, ((previous.eventDepth ?? 0) + 1) * (input.limit ?? 50)),
            }
          : {}),
        ...(previous && dueFailed ? { dueTasks: previous.value.dueTasks } : {}),
      };
      const value =
        previous &&
        signature(previous.value, "events") === signature(combined, "events") &&
        signature(previous.value, "due") === signature(combined, "due") &&
        previous.value.incomplete === combined.incomplete &&
        previous.value.dueIncomplete === combined.dueIncomplete
          ? previous.value
          : combined;
      depths.set(key, {
        first: page,
        events,
        due,
        value,
        eventDepth: previous?.eventDepth ?? 0,
        dueDepth: previous?.dueDepth ?? 0,
        forceReplay: false,
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
  type Loaded = {
    readonly first: RangeState;
    readonly events: readonly CalendarPage[];
    readonly due: readonly CalendarPage[];
  };
  const loaded = Atom.family((_query: Query) =>
    Atom.make<Loaded | undefined>(undefined).pipe(Atom.setIdleTTL(0)),
  );
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
      const pages = get(loaded(query));
      if (!AsyncResult.isSuccess(result) || result.waiting || pages?.first !== result.value)
        return result;
      return AsyncResult.success(combine(result.value, pages.events, pages.due));
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
        const stored = registry.get(loaded(query));
        const pages =
          stored?.first === first.value ? stored : { first: first.value, events: [], due: [] };
        const last = (input.kind === "events" ? pages.events : pages.due).at(-1) ?? first.value;
        const cursor = input.kind === "events" ? last.nextCursor : last.nextDueCursor;
        if (!cursor) return;
        const next = yield* request(WS_METHODS.calendarListRange, {
          ...normalized,
          ...(input.kind === "events" ? { cursor } : { dueCursor: cursor }),
        }).pipe(
          Effect.catch((error) => {
            if (lifetime.active && isCalendarError(error) && error.kind === "conflict") {
              const key = depthKey(environmentId, normalized);
              const previous = depths.get(key);
              if (previous) depths.set(key, { ...previous, forceReplay: true });
              registry.refresh(query);
            }
            return Effect.fail(error);
          }),
        );
        if (!lifetime.active) return;
        const current = registry.get(query);
        if (AsyncResult.isSuccess(current) && !current.waiting && current.value === first.value) {
          const latest = registry.get(loaded(query));
          const keep = latest?.first === first.value ? latest : pages;
          const depth = depths.get(depthKey(environmentId, normalized));
          if (depth)
            depths.set(
              depthKey(environmentId, normalized),
              input.kind === "events"
                ? {
                    ...depth,
                    events: [...depth.events, next],
                    eventDepth: depth.eventDepth + 1,
                    value: combine(depth.first, [...depth.events, next], depth.due),
                  }
                : {
                    ...depth,
                    due: [...depth.due, next],
                    dueDepth: depth.dueDepth + 1,
                    value: combine(depth.first, depth.events, [...depth.due, next]),
                  },
            );
          registry.set(
            loaded(query),
            input.kind === "events"
              ? { ...keep, events: [...keep.events, next] }
              : { ...keep, due: [...keep.due, next] },
          );
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
