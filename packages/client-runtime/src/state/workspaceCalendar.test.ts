import { EnvironmentId, WS_METHODS, CalendarError } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Latch from "effect/Latch";
import * as Deferred from "effect/Deferred";
import * as TestClock from "effect/testing/TestClock";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity";

import type { ConnectionCatalogEntry } from "../connection/catalog.ts";
import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  RelayConnectionTarget,
  type ConnectionTarget,
  type PreparedConnection,
  type SupervisorConnectionState,
} from "../connection/model.ts";
import * as EnvironmentRegistry from "../connection/registry.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import type { WsRpcProtocolClient } from "../rpc/protocol.ts";
import type { RpcSession } from "../rpc/session.ts";
import { executeAtomQuery, runAtomCommand } from "./runtime.ts";
import { createWorkspaceCalendarAtoms } from "./workspaceCalendar.ts";

const TARGET = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("environment-1"),
  label: "Test environment",
  httpBaseUrl: "https://environment.example.test",
  wsBaseUrl: "wss://environment.example.test",
});

function session(client: WsRpcProtocolClient): RpcSession {
  return {
    client,
    initialConfig: Effect.succeed({
      pulseCapabilities: { workspaceCalendar: true },
    } as import("@t3tools/contracts").ServerConfig),
    subscribeServerConfig: (input) => client.subscribeServerConfig(input),
    ready: Effect.void,
    probe: Effect.void,
    closed: Effect.never,
  };
}

const makeTestRuntime = Effect.fn("makeTestRuntime")(function* (
  client: WsRpcProtocolClient,
  otherClient = client,
  otherTarget: ConnectionTarget = TARGET,
  supported = true,
) {
  const connectionState: SupervisorConnectionState = {
    ...AVAILABLE_CONNECTION_STATE,
    desired: true,
    network: "online",
    phase: "connected",
    attempt: 1,
    generation: 1,
  };
  const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
    target: TARGET,
    state: yield* SubscriptionRef.make(connectionState),
    session: yield* SubscriptionRef.make<Option.Option<RpcSession>>(
      Option.some({
        ...session(client),
        initialConfig: Effect.succeed({
          pulseCapabilities: supported ? { workspaceCalendar: true } : {},
        } as import("@t3tools/contracts").ServerConfig),
      }),
    ),
    prepared: yield* SubscriptionRef.make(Option.none<PreparedConnection>()),
    connect: Effect.void,
    disconnect: Effect.void,
    retryNow: Effect.void,
  } satisfies EnvironmentSupervisor.EnvironmentSupervisor["Service"]);
  const other = {
    ...supervisor,
    target: otherTarget,
    session: yield* SubscriptionRef.make(Option.some(session(otherClient))),
  };
  const forEnvironment = (id: EnvironmentId) => (id === TARGET.environmentId ? supervisor : other);
  const environmentRegistry = EnvironmentRegistry.EnvironmentRegistry.of({
    entries: yield* SubscriptionRef.make<ReadonlyMap<EnvironmentId, ConnectionCatalogEntry>>(
      new Map([
        [TARGET.environmentId, { target: TARGET, profile: Option.none(), enabled: true }],
        [otherTarget.environmentId, { target: otherTarget, profile: Option.none(), enabled: true }],
      ]),
    ),
    run: (environmentId, effect) =>
      Effect.provideService(
        effect,
        EnvironmentSupervisor.EnvironmentSupervisor,
        forEnvironment(environmentId),
      ),
    runStream: (environmentId, stream) =>
      Stream.provideService(
        stream,
        EnvironmentSupervisor.EnvironmentSupervisor,
        forEnvironment(environmentId),
      ),
    followStream: (environmentId, stream) =>
      Stream.provideService(
        stream,
        EnvironmentSupervisor.EnvironmentSupervisor,
        forEnvironment(environmentId),
      ),
  } as EnvironmentRegistry.EnvironmentRegistry["Service"]);
  const runtime = Atom.runtime(
    Layer.succeed(EnvironmentRegistry.EnvironmentRegistry, environmentRegistry),
  );
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), (registry) =>
    Effect.sync(() => registry.dispose()),
  );
  return { atoms: createWorkspaceCalendarAtoms(runtime), registry, supervisor };
});

const range = { startOn: "2026-10-13", endBefore: "2026-10-14", timeZone: "Africa/Johannesburg" };
const event = {
  id: "wce_00000000-0000-0000-0000-000000000001",
  title: "Review",
  status: "confirmed" as const,
  revision: 1,
  time: { kind: "all-day" as const, startOn: "2026-10-13", endBefore: "2026-10-14" },
  sourceLabel: "Test",
  attendees: [],
  attendeesTruncated: false,
  hasDescription: false,
};
const page = (title = "Review") => ({
  events: [{ ...event, title }],
  sourceStates: [],
  incomplete: false,
  dueTasks: [],
  dueIncomplete: false,
});
const target = { environmentId: TARGET.environmentId, input: range };

it.effect("shares changes and never refreshes on clock advance", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const stopped = yield* Deferred.make<void>();
      const counter = yield* SubscriptionRef.make(7);
      let reads = 0,
        starts = 0,
        refreshes = 0;
      let title = "Before";
      const client = {
        [WS_METHODS.calendarSubscribeChanges]: () =>
          Stream.unwrap(
            Effect.sync(() => {
              starts++;
              return SubscriptionRef.changes(counter);
            }),
          ).pipe(Stream.ensuring(Deferred.succeed(stopped, undefined))),
        [WS_METHODS.calendarListRange]: () =>
          Effect.gen(function* () {
            reads++;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);
            return page(title);
          }),
        [WS_METHODS.calendarRefresh]: () =>
          Effect.sync(() => {
            refreshes++;
            return page();
          }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const first = atoms.range(target);
      expect(first).toBe(atoms.range({ ...target, input: { ...range, limit: 50 } }));
      const a = registry.mount(first),
        b = registry.mount(first);
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          a();
          b();
        }),
      );
      yield* Deferred.await(entered);
      expect({ reads, starts }).toEqual({ reads: 1, starts: 1 });
      yield* Deferred.succeed(release, undefined);
      yield* Effect.promise(() => executeAtomQuery(registry, first));
      expect(reads).toBe(1);
      a();
      const updated = Latch.makeUnsafe();
      const watch = registry.subscribe(first, (result) => {
        if (AsyncResult.isSuccess(result) && result.value.events[0]?.title === "After")
          updated.openUnsafe();
      });
      title = "After";
      yield* SubscriptionRef.set(counter, 8);
      yield* updated.await;
      yield* TestClock.adjust("1 hour");
      expect({ reads, starts, refreshes }).toEqual({ reads: 2, starts: 1, refreshes: 0 });
      watch();
      b();
      yield* Deferred.await(stopped);
      yield* SubscriptionRef.set(counter, 2);
      yield* TestClock.adjust("1 hour");
      expect(reads).toBe(2);
    }),
  ),
);

it.effect(
  "loads pages only on request, deduplicates IDs and restarts after a cursor conflict",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        let title = "Before",
          reads = 0;
        const client = {
          [WS_METHODS.calendarSubscribeChanges]: () => Stream.never,
          [WS_METHODS.calendarListRange]: (input: { cursor?: string }) =>
            Effect.sync(() => {
              reads++;
              return input.cursor
                ? {
                    ...page(),
                    events: [
                      { ...event, title: "Moved" },
                      { ...event, id: "wce_00000000-0000-0000-0000-000000000002" },
                    ],
                    nextCursor: "expired",
                  }
                : { ...page(title), nextCursor: "more" };
            }).pipe(
              Effect.flatMap((result) =>
                input.cursor === "expired"
                  ? Effect.fail(new CalendarError({ kind: "conflict", message: "Restart" }))
                  : Effect.succeed(result),
              ),
            ),
        } as unknown as WsRpcProtocolClient;
        const { atoms, registry } = yield* makeTestRuntime(client);
        const query = atoms.range(target);
        const stop = registry.mount(query);
        yield* Effect.addFinalizer(() => Effect.sync(stop));
        yield* Effect.promise(() => executeAtomQuery(registry, query));
        expect(reads).toBe(1);
        const more = {
          environmentId: target.environmentId,
          input: { range, kind: "events" as const },
        };
        yield* Effect.promise(() => runAtomCommand(registry, atoms.loadMore, more));
        const loaded = AsyncResult.getOrThrow(registry.get(query));
        expect(loaded.events).toHaveLength(2);
        expect(loaded.events[0]?.title).toBe("Moved");
        expect(reads).toBe(2);
        title = "Restarted";
        const failure = yield* Effect.promise(() => runAtomCommand(registry, atoms.loadMore, more));
        expect(AsyncResult.isFailure(failure)).toBe(true);
        const restarted = AsyncResult.getOrThrow(
          yield* Effect.promise(() => executeAtomQuery(registry, query)),
        );
        expect(restarted.events.map((e) => e.title)).toEqual(["Restarted"]);
        expect(reads).toBe(4);
      }),
    ),
);
it.effect("renders old capability absence as unavailable without calling missing endpoints", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const { atoms, registry } = yield* makeTestRuntime(
        {} as WsRpcProtocolClient,
        undefined,
        TARGET,
        false,
      );
      const query = atoms.range(target);
      const result = yield* Effect.promise(() => executeAtomQuery(registry, query));
      expect(AsyncResult.isSuccess(result)).toBe(true);
      expect(AsyncResult.getOrThrow(result)).toMatchObject({
        unavailableReason: "Calendar is unavailable on this server.",
        events: [],
        incomplete: true,
        dueIncomplete: true,
      });
    }),
  ),
);
it.effect("revalidates saved metadata and resubscribes on reconnect without provider refresh", () =>
  Effect.scoped(
    Effect.gen(function* () {
      let title = "Before",
        refreshes = 0,
        starts = 0,
        reads = 0;
      const stopped = yield* Deferred.make<void>();
      const client = {
        [WS_METHODS.calendarSubscribeChanges]: () =>
          Stream.unwrap(
            Effect.sync(() => {
              starts++;
              return Stream.concat(Stream.succeed(7), Stream.never);
            }),
          ).pipe(Stream.ensuring(Deferred.succeed(stopped, undefined))),
        [WS_METHODS.calendarListRange]: () =>
          Effect.sync(() => {
            reads++;
            return page(title);
          }),
        [WS_METHODS.calendarRefresh]: () =>
          Effect.sync(() => {
            refreshes++;
            return page();
          }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry, supervisor } = yield* makeTestRuntime(client);
      const query = atoms.range(target);
      const stop = registry.mount(query);
      yield* Effect.addFinalizer(() => Effect.sync(stop));
      yield* Effect.promise(() => executeAtomQuery(registry, query));
      yield* SubscriptionRef.set(supervisor.session, Option.none());
      yield* SubscriptionRef.update(supervisor.state, (s) => ({
        ...s,
        phase: "offline" as const,
        network: "offline" as const,
      }));
      yield* Deferred.await(stopped);
      title = "After";
      const changed = Latch.makeUnsafe();
      const watch = registry.subscribe(query, (r) => {
        if (AsyncResult.isSuccess(r) && r.value.events[0]?.title === "After") changed.openUnsafe();
      });
      yield* Effect.addFinalizer(() => Effect.sync(watch));
      yield* SubscriptionRef.set(supervisor.session, Option.some(session(client)));
      yield* SubscriptionRef.update(supervisor.state, (s) => ({
        ...s,
        phase: "connected" as const,
        network: "online" as const,
        generation: s.generation + 1,
      }));
      yield* changed.await;
      expect(refreshes).toBe(0);
      expect(starts).toBe(2);
      expect(reads).toBe(2);
    }),
  ),
);

it.effect.each(["local", "direct", "relay", "tunnel"])(
  "keeps late %s results bound to their environment and range",
  (mode) =>
    Effect.scoped(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>(),
          release = yield* Deferred.make<void>();
        const slow = {
          [WS_METHODS.calendarSubscribeChanges]: () => Stream.never,
          [WS_METHODS.calendarListRange]: (input: typeof range) =>
            input.startOn === range.startOn
              ? Effect.gen(function* () {
                  yield* Deferred.succeed(started, undefined);
                  yield* Deferred.await(release);
                  return page("Old range");
                })
              : Effect.succeed(page("New range")),
        } as unknown as WsRpcProtocolClient;
        const fast = {
          [WS_METHODS.calendarSubscribeChanges]: () => Stream.never,
          [WS_METHODS.calendarListRange]: () => Effect.succeed(page("Other environment")),
        } as unknown as WsRpcProtocolClient;
        const environmentId = EnvironmentId.make(mode);
        const origin =
          mode === "local"
            ? "http://127.0.0.1:3773"
            : mode === "direct"
              ? "http://host.tailnet.test:3773"
              : "https://tunnel.example.test/environment";
        const otherTarget =
          mode === "relay"
            ? new RelayConnectionTarget({ environmentId, label: mode })
            : new PrimaryConnectionTarget({
                environmentId,
                label: mode,
                httpBaseUrl: origin,
                wsBaseUrl: origin.replace(/^http/, "ws"),
              });
        const { atoms, registry } = yield* makeTestRuntime(slow, fast, otherTarget);
        const old = atoms.range(target);
        const next = atoms.range({
          ...target,
          input: { ...range, startOn: "2026-10-14", endBefore: "2026-10-15" },
        });
        const other = atoms.range({ environmentId, input: range });
        const stops = [registry.mount(old), registry.mount(next), registry.mount(other)];
        yield* Effect.addFinalizer(() => Effect.sync(() => stops.forEach((s) => s())));
        yield* Deferred.await(started);
        expect(
          AsyncResult.getOrThrow(yield* Effect.promise(() => executeAtomQuery(registry, next)))
            .events[0]?.title,
        ).toBe("New range");
        expect(
          AsyncResult.getOrThrow(yield* Effect.promise(() => executeAtomQuery(registry, other)))
            .events[0]?.title,
        ).toBe("Other environment");
        yield* Deferred.succeed(release, undefined);
        yield* Effect.promise(() => executeAtomQuery(registry, old));
        expect(AsyncResult.getOrThrow(registry.get(next)).events[0]?.title).toBe("New range");
        expect(AsyncResult.getOrThrow(registry.get(other)).events[0]?.title).toBe(
          "Other environment",
        );
      }),
    ),
);
it.effect("shares one explicit refresh and updates mounted reads on two clients", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const counter = yield* SubscriptionRef.make(0);
      const entered = yield* Deferred.make<void>(),
        release = yield* Deferred.make<void>();
      let refreshes = 0,
        title = "Before";
      const client = {
        [WS_METHODS.calendarSubscribeChanges]: () => SubscriptionRef.changes(counter),
        [WS_METHODS.calendarListRange]: () => Effect.sync(() => page(title)),
        [WS_METHODS.calendarRefresh]: () =>
          Effect.gen(function* () {
            refreshes++;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);
            title = "After";
            yield* SubscriptionRef.set(counter, 1);
            return page(title);
          }),
      } as unknown as WsRpcProtocolClient;
      const a = yield* makeTestRuntime(client),
        b = yield* makeTestRuntime(client);
      const first = a.atoms.range(target),
        second = b.atoms.range(target);
      const stops = [a.registry.mount(first), b.registry.mount(second)];
      yield* Effect.addFinalizer(() => Effect.sync(() => stops.forEach((s) => s())));
      yield* Effect.promise(() => executeAtomQuery(a.registry, first));
      yield* Effect.promise(() => executeAtomQuery(b.registry, second));
      const changed = Latch.makeUnsafe();
      const watch = b.registry.subscribe(second, (r) => {
        if (AsyncResult.isSuccess(r) && r.value.events[0]?.title === "After") changed.openUnsafe();
      });
      yield* Effect.addFinalizer(() => Effect.sync(watch));
      const one = runAtomCommand(a.registry, a.atoms.refresh, target);
      yield* Deferred.await(entered);
      const two = runAtomCommand(a.registry, a.atoms.refresh, {
        ...target,
        input: { ...range, limit: 50 },
      });
      expect(refreshes).toBe(1);
      yield* Deferred.succeed(release, undefined);
      yield* Effect.promise(() => Promise.all([one, two]));
      yield* changed.await;
      expect(refreshes).toBe(1);
    }),
  ),
);

it.effect("does not revive a hidden range when a pending page returns", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>(),
        release = yield* Deferred.make<void>(),
        stopped = yield* Deferred.make<void>();
      let reads = 0,
        starts = 0;
      const client = {
        [WS_METHODS.calendarSubscribeChanges]: () => {
          starts++;
          return Stream.never.pipe(Stream.ensuring(Deferred.succeed(stopped, undefined)));
        },
        [WS_METHODS.calendarListRange]: (input: { cursor?: string }) =>
          Effect.gen(function* () {
            reads++;
            if (input.cursor) {
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(release);
            }
            return { ...page(), nextCursor: "more" };
          }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const query = atoms.range(target);
      const stop = registry.mount(query);
      yield* Effect.promise(() => executeAtomQuery(registry, query));
      const pending = runAtomCommand(registry, atoms.loadMore, {
        environmentId: target.environmentId,
        input: { range, kind: "events" },
      });
      yield* Deferred.await(entered);
      stop();
      yield* Deferred.await(stopped);
      yield* Deferred.succeed(release, undefined);
      yield* Effect.promise(() => pending);
      yield* TestClock.adjust("1 hour");
      expect({ reads, starts }).toEqual({ reads: 2, starts: 1 });
    }),
  ),
);

it.effect("discards a pending continuation after an invalidation", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const counter = yield* SubscriptionRef.make(0);
      const entered = yield* Deferred.make<void>(),
        release = yield* Deferred.make<void>();
      let title = "Before",
        reads = 0;
      const client = {
        [WS_METHODS.calendarSubscribeChanges]: () => SubscriptionRef.changes(counter),
        [WS_METHODS.calendarListRange]: (input: { cursor?: string }) =>
          Effect.gen(function* () {
            reads++;
            if (input.cursor) {
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(release);
              return { ...page("Stale continuation"), nextCursor: "invalid" };
            }
            return { ...page(title), nextCursor: "more" };
          }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const query = atoms.range(target);
      const stop = registry.mount(query);
      yield* Effect.addFinalizer(() => Effect.sync(stop));
      yield* Effect.promise(() => executeAtomQuery(registry, query));
      const pending = runAtomCommand(registry, atoms.loadMore, {
        environmentId: target.environmentId,
        input: { range, kind: "events" },
      });
      yield* Deferred.await(entered);
      title = "After";
      const changed = Latch.makeUnsafe();
      const watch = registry.subscribe(query, (r) => {
        if (AsyncResult.isSuccess(r) && r.value.events[0]?.title === "After") changed.openUnsafe();
      });
      yield* Effect.addFinalizer(() => Effect.sync(watch));
      yield* SubscriptionRef.set(counter, 1);
      yield* changed.await;
      yield* Deferred.succeed(release, undefined);
      yield* Effect.promise(() => pending);
      expect(AsyncResult.getOrThrow(registry.get(query)).events.map((e) => e.title)).toEqual([
        "After",
      ]);
      expect(reads).toBe(3);
    }),
  ),
);
it.effect(
  "loads due continuations separately and preserves the latest completed task reference",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        let reads = 0;
        const due = {
          ref: { type: "task", taskId: "wskt_00000000-0000-0000-0000-000000000001" },
          title: "Due",
          projectId: "project",
          dueOn: "2026-10-13",
          done: false,
          revision: 0,
        };
        const client = {
          [WS_METHODS.calendarSubscribeChanges]: () => Stream.never,
          [WS_METHODS.calendarListRange]: (input: { dueCursor?: string }) =>
            Effect.sync(() => {
              reads++;
              return input.dueCursor
                ? { ...page(), dueTasks: [{ ...due, done: true, revision: 1 }] }
                : { ...page(), dueTasks: [due], dueIncomplete: true, nextDueCursor: "tasks" };
            }),
        } as unknown as WsRpcProtocolClient;
        const { atoms, registry } = yield* makeTestRuntime(client);
        const query = atoms.range(target);
        const stop = registry.mount(query);
        yield* Effect.addFinalizer(() => Effect.sync(stop));
        yield* Effect.promise(() => executeAtomQuery(registry, query));
        expect(reads).toBe(1);
        yield* Effect.promise(() =>
          runAtomCommand(registry, atoms.loadMore, {
            environmentId: target.environmentId,
            input: { range, kind: "dueTasks" },
          }),
        );
        const result = AsyncResult.getOrThrow(registry.get(query));
        expect(result.dueTasks).toEqual([{ ...due, done: true, revision: 1 }]);
        expect(result.dueIncomplete).toBe(false);
        expect(result.nextDueCursor).toBeUndefined();
        expect(result.events).toHaveLength(1);
        expect(reads).toBe(2);
      }),
    ),
);
it.effect("does not restart on a cursor reused with the wrong range", () =>
  Effect.scoped(
    Effect.gen(function* () {
      let reads = 0;
      const client = {
        [WS_METHODS.calendarSubscribeChanges]: () => Stream.never,
        [WS_METHODS.calendarListRange]: (input: { cursor?: string }) => {
          reads++;
          return input.cursor
            ? Effect.fail(new CalendarError({ kind: "invalid-input", message: "Wrong range" }))
            : Effect.succeed({ ...page(), nextCursor: "wrong" });
        },
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const query = atoms.range(target);
      const stop = registry.mount(query);
      yield* Effect.addFinalizer(() => Effect.sync(stop));
      yield* Effect.promise(() => executeAtomQuery(registry, query));
      const result = yield* Effect.promise(() =>
        runAtomCommand(registry, atoms.loadMore, {
          environmentId: target.environmentId,
          input: { range, kind: "events" },
        }),
      );
      expect(AsyncResult.isFailure(result) && Cause.squash(result.cause)).toMatchObject({
        kind: "invalid-input",
      });
      expect(reads).toBe(2);
    }),
  ),
);

it.effect("treats the replayed counter as a baseline without overlapping reads", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const counter = yield* SubscriptionRef.make(1);
      const entered = yield* Deferred.make<void>(),
        release = yield* Deferred.make<void>();
      let reads = 0,
        active = 0,
        peak = 0;
      const client = {
        [WS_METHODS.calendarSubscribeChanges]: () => SubscriptionRef.changes(counter),
        [WS_METHODS.calendarListRange]: () =>
          Effect.gen(function* () {
            reads++;
            active++;
            peak = Math.max(peak, active);
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);
            return page();
          }).pipe(
            Effect.ensuring(
              Effect.sync(() => {
                active--;
              }),
            ),
          ),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const query = atoms.range(target);
      const stops = [registry.mount(query), registry.mount(atoms.range(target))];
      yield* Effect.addFinalizer(() => Effect.sync(() => stops.forEach((s) => s())));
      yield* Deferred.await(entered);
      expect({ reads, peak }).toEqual({ reads: 1, peak: 1 });
      yield* Deferred.succeed(release, undefined);
      yield* Effect.promise(() => executeAtomQuery(registry, query));
    }),
  ),
);

it.effect("mounts only the selected detail and releases its shared stream while hidden", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const counter = yield* SubscriptionRef.make(5);
      const stopped = yield* Deferred.make<void>();
      const requested: string[] = [];
      let starts = 0;
      const client = {
        [WS_METHODS.calendarSubscribeChanges]: () => {
          starts++;
          return SubscriptionRef.changes(counter).pipe(
            Stream.ensuring(Deferred.succeed(stopped, undefined)),
          );
        },
        [WS_METHODS.calendarGet]: ({ id }: { id: string }) =>
          Effect.sync(() => {
            requested.push(id);
            return { ...event, id, revision: requested.length };
          }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const selected = atoms.detail({
        environmentId: target.environmentId,
        input: { id: event.id },
      });
      atoms.detail({
        environmentId: target.environmentId,
        input: { id: "wce_00000000-0000-0000-0000-000000000002" },
      });
      const stop = registry.mount(selected);
      yield* Effect.promise(() => executeAtomQuery(registry, selected));
      expect(requested).toEqual([event.id]);
      const changed = Latch.makeUnsafe();
      const watch = registry.subscribe(selected, (result) => {
        if (
          AsyncResult.isSuccess(result) &&
          "revision" in result.value &&
          result.value.revision === 2
        )
          changed.openUnsafe();
      });
      yield* SubscriptionRef.set(counter, 6);
      yield* changed.await;
      watch();
      stop();
      yield* Deferred.await(stopped);
      yield* SubscriptionRef.set(counter, 7);
      yield* TestClock.adjust("1 hour");
      expect(requested).toEqual([event.id, event.id]);
      expect(starts).toBe(1);
    }),
  ),
);
