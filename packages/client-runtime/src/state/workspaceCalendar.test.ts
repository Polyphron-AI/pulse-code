import {
  EnvironmentId,
  WS_METHODS,
  CalendarError,
  EnvironmentAuthorizationError,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Latch from "effect/Latch";
import * as Deferred from "effect/Deferred";
import * as TestClock from "effect/testing/TestClock";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { AsyncResult } from "effect/unstable/reactivity";

import { PrimaryConnectionTarget, RelayConnectionTarget } from "../connection/model.ts";
import type { WsRpcProtocolClient } from "../rpc/protocol.ts";
import { EnvironmentRpcUnavailableError } from "../rpc/client.ts";
import { executeAtomQuery, runAtomCommand } from "./runtime.ts";

import {
  TARGET,
  session,
  makeTestRuntime,
} from "../../../../apps/web/src/components/workspace/calendar/calendarRuntime.testHelpers.ts";

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

it.effect("replays a successful Load more that finishes during the first refresh read", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const moreStarted = yield* Deferred.make<void>();
      const moreRelease = yield* Deferred.make<void>();
      const refreshStarted = yield* Deferred.make<void>();
      const refreshRelease = yield* Deferred.make<void>();
      let refreshing = false;
      const second = { ...event, id: "wce_00000000-0000-0000-0000-000000000002", title: "Second" };
      const client = {
        [WS_METHODS.calendarSubscribeChanges]: () => Stream.never,
        [WS_METHODS.calendarRefresh]: () =>
          Effect.sync(() => {
            refreshing = true;
            return page();
          }),
        [WS_METHODS.calendarListRange]: (input: { cursor?: string }) =>
          Effect.gen(function* () {
            if (input.cursor) {
              if (!refreshing) {
                yield* Deferred.succeed(moreStarted, undefined);
                yield* Deferred.await(moreRelease);
              }
              return { ...page(), events: [second] };
            }
            if (refreshing) {
              yield* Deferred.succeed(refreshStarted, undefined);
              yield* Deferred.await(refreshRelease);
            }
            return { ...page(), nextCursor: "more" };
          }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const query = atoms.range(target);
      const stop = registry.mount(query);
      yield* Effect.addFinalizer(() => Effect.sync(stop));
      yield* Effect.promise(() => executeAtomQuery(registry, query));
      const more = runAtomCommand(registry, atoms.loadMore, {
        environmentId: target.environmentId,
        input: { range, kind: "events" },
      });
      yield* Deferred.await(moreStarted);
      yield* Effect.promise(() => runAtomCommand(registry, atoms.refresh, target));
      yield* Deferred.await(refreshStarted);
      yield* Deferred.succeed(moreRelease, undefined);
      expect((yield* Effect.promise(() => more))._tag).toBe("Success");
      yield* Deferred.succeed(refreshRelease, undefined);
      yield* Effect.promise(() => executeAtomQuery(registry, query));
      const value = AsyncResult.getOrThrow(registry.get(query));
      expect(value.events.map((e) => e.title)).toEqual(["Review", "Second"]);
    }),
  ),
);

it.effect.each(["events", "dueTasks", "unselected", "removed"] as const)(
  "keeps bounded saved %s when a continuation replay fails",
  (side) =>
    Effect.scoped(
      Effect.gen(function* () {
        const kind = side === "dueTasks" ? "dueTasks" : "events";
        let fail = false;
        const source = { connectionId: "known", calendarId: "calendar" };
        const second = {
          ...event,
          id: "wce_00000000-0000-0000-0000-000000000002",
          title: "Saved page",
          source,
        };
        const task = {
          ref: { type: "task" as const, taskId: "saved-task" },
          title: "Saved due",
          projectId: "fixture-project",
          dueOn: "2026-10-13",
          done: false,
          revision: 1,
        };
        const client = {
          [WS_METHODS.calendarSubscribeChanges]: () => Stream.never,
          [WS_METHODS.calendarRefresh]: () =>
            Effect.sync(() => {
              fail = true;
              return page();
            }),
          [WS_METHODS.calendarListRange]: (input: { cursor?: string; dueCursor?: string }) => {
            if (input.cursor || input.dueCursor)
              return fail
                ? Effect.fail(
                    new CalendarError({ kind: "unavailable", message: "Continuation failed" }),
                  )
                : Effect.succeed({
                    ...page(),
                    events: kind === "events" ? [second] : [],
                    dueTasks: kind === "dueTasks" ? [task] : [],
                  });
            return Effect.succeed({
              ...page(fail ? "Fresh" : "Review"),
              sourceStates:
                fail && side === "removed"
                  ? []
                  : [
                      {
                        ...source,
                        generation: 1,
                        state: fail && side === "unselected" ? "unselected" : "ready",
                      },
                    ],
              ...(kind === "events" ? { nextCursor: "more" } : { nextDueCursor: "more" }),
            });
          },
        } as unknown as WsRpcProtocolClient;
        const { atoms, registry } = yield* makeTestRuntime(client);
        const query = atoms.range(target);
        const stop = registry.mount(query);
        yield* Effect.addFinalizer(() => Effect.sync(stop));
        yield* Effect.promise(() => executeAtomQuery(registry, query));
        yield* Effect.promise(() =>
          runAtomCommand(registry, atoms.loadMore, {
            environmentId: target.environmentId,
            input: { range, kind },
          }),
        );
        yield* Effect.promise(() => runAtomCommand(registry, atoms.refresh, target));
        const read = yield* Effect.promise(() => executeAtomQuery(registry, query));
        expect(read._tag).toBe("Success");
        const result = AsyncResult.getOrThrow(registry.get(query));
        expect(result.events[0]?.title).toBe("Fresh");
        const titles =
          kind === "events"
            ? result.events.map((e) => e.title)
            : result.dueTasks.map((t) => t.title);
        if (side === "unselected" || side === "removed") expect(titles).not.toContain("Saved page");
        else expect(titles).toContain(kind === "events" ? "Saved page" : "Saved due");
        expect(kind === "events" ? result.incomplete : result.dueIncomplete).toBe(true);
        expect(kind === "events" ? result.nextCursor : result.nextDueCursor).toBeUndefined();
      }),
    ),
);

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
                : {
                    ...page(title),
                    events: [{ ...event, title, revision: title === "Restarted" ? 2 : 1 }],
                    nextCursor: "more",
                  };
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
        expect(restarted.events.map((e) => e.title)).toEqual(["Restarted", "Review"]);
        expect(reads).toBe(5);
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
        revision = 1,
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
            return { ...page(title), events: [{ ...event, title, revision }] };
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
      revision = 2;
      const changed = Latch.makeUnsafe();
      const watch = registry.subscribe(query, (r) => {
        if (AsyncResult.isSuccess(r) && !r.waiting && r.value.events[0]?.revision === 2)
          changed.openUnsafe();
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
      expect(AsyncResult.getOrThrow(registry.get(query)).events[0]).toMatchObject({
        title: "After",
        revision: 2,
      });
      expect(query).toBe(atoms.range({ environmentId: TARGET.environmentId, input: range }));
      expect(supervisor.target.environmentId).toBe(TARGET.environmentId);
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
it.effect("discards a pending continuation after an equal first-page revalidation", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const counter = yield* SubscriptionRef.make(0);
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let reads = 0;
      const client = {
        [WS_METHODS.calendarSubscribeChanges]: () => SubscriptionRef.changes(counter),
        [WS_METHODS.calendarListRange]: (input: { cursor?: string }) =>
          Effect.gen(function* () {
            reads++;
            if (input.cursor) {
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(release);
              return {
                ...page(),
                events: [
                  {
                    ...event,
                    id: "wce_00000000-0000-0000-0000-000000000002",
                    title: "Stale continuation",
                  },
                ],
              };
            }
            return { ...page(), nextCursor: "second" };
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
      const settled = Latch.makeUnsafe();
      const watch = registry.subscribe(query, (r) => {
        if (AsyncResult.isSuccess(r) && !r.waiting && reads === 3) settled.openUnsafe();
      });
      yield* Effect.addFinalizer(() => Effect.sync(watch));
      yield* SubscriptionRef.set(counter, 1);
      yield* settled.await;
      yield* Deferred.succeed(release, undefined);
      yield* Effect.promise(() => pending);
      expect(AsyncResult.getOrThrow(registry.get(query)).events.map((row) => row.title)).toEqual([
        "Review",
      ]);
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
it.effect("revalidates both requested sides after a combined invalidation", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const counter = yield* SubscriptionRef.make(0);
      let reads = 0;
      const due = {
        ref: { type: "task" as const, taskId: "wskt_00000000-0000-0000-0000-000000000002" },
        title: "Second due task",
        projectId: "project",
        dueOn: "2026-10-13",
        done: false,
        revision: 1,
      };
      const client = {
        [WS_METHODS.calendarSubscribeChanges]: () => SubscriptionRef.changes(counter),
        [WS_METHODS.calendarListRange]: (input: { cursor?: string; dueCursor?: string }) =>
          Effect.sync(() => {
            reads++;
            return input.cursor
              ? {
                  ...page("Second"),
                  events: [
                    { ...event, id: "wce_00000000-0000-0000-0000-000000000002", title: "Second" },
                  ],
                  nextCursor: "third",
                }
              : input.dueCursor
                ? { ...page(), events: [], dueTasks: [due], nextDueCursor: "third-due" }
                : { ...page(), nextCursor: "second", nextDueCursor: "second-due" };
          }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const query = atoms.range(target);
      const stop = registry.mount(query);
      yield* Effect.addFinalizer(() => Effect.sync(stop));
      yield* Effect.promise(() => executeAtomQuery(registry, query));
      for (const kind of ["events", "dueTasks"] as const)
        yield* Effect.promise(() =>
          runAtomCommand(registry, atoms.loadMore, {
            environmentId: target.environmentId,
            input: { range, kind },
          }),
        );
      const savedValue = AsyncResult.getOrThrow(registry.get(query));
      const updated = Latch.makeUnsafe();
      const watch = registry.subscribe(query, (r) => {
        if (AsyncResult.isSuccess(r) && !r.waiting && reads >= 4) updated.openUnsafe();
      });
      yield* Effect.addFinalizer(() => Effect.sync(watch));
      yield* SubscriptionRef.set(counter, 1);
      yield* updated.await;
      const result = AsyncResult.getOrThrow(registry.get(query));
      expect(result.events.map((e) => e.title)).toEqual(["Review", "Second"]);
      expect(result.dueTasks.map((t) => t.title)).toEqual(["Second due task"]);
      expect(result.nextDueCursor).toBe("third-due");
      expect(reads).toBe(6);
      expect(result).toBe(savedValue);
    }),
  ),
);

it.effect.each(["events", "dueTasks"] as const)(
  "replays unchanged first pages for %s and stops at loaded depth or exhaustion",
  (kind) =>
    Effect.scoped(
      Effect.gen(function* () {
        const counter = yield* SubscriptionRef.make(0);
        let version = 0;
        const calls: string[] = [];
        const second = {
          ...event,
          id: "wce_00000000-0000-0000-0000-000000000002",
          title: "Old second",
        };
        const task = {
          ref: { type: "task", taskId: "second-task" },
          title: "Old second",
          projectId: "project",
          dueOn: "2026-10-13",
          done: false,
          revision: 1,
        };
        const client = {
          [WS_METHODS.calendarSubscribeChanges]: () => SubscriptionRef.changes(counter),
          [WS_METHODS.calendarListRange]: (input: { cursor?: string; dueCursor?: string }) =>
            Effect.sync(() => {
              const cursor = input.cursor ?? input.dueCursor;
              calls.push(cursor ?? "first");
              return {
                ...page(),
                events:
                  kind === "events"
                    ? cursor
                      ? version === 2
                        ? []
                        : [
                            {
                              ...second,
                              title: version ? "Fresh second" : "Old second",
                              revision: version + 1,
                            },
                            ...(version === 1
                              ? [
                                  {
                                    ...second,
                                    id: "wce_00000000-0000-0000-0000-000000000003",
                                    title: "Inserted",
                                  },
                                ]
                              : []),
                          ]
                      : [event]
                    : [],
                dueTasks:
                  kind === "dueTasks" && cursor && version !== 2
                    ? [
                        {
                          ...task,
                          title: version ? "Fresh second" : "Old second",
                          revision: version + 1,
                        },
                        ...(version === 1
                          ? [
                              {
                                ...task,
                                ref: { type: "task", taskId: "inserted-task" },
                                title: "Inserted",
                              },
                            ]
                          : []),
                      ]
                    : [],
                ...(kind === "events"
                  ? { nextCursor: version === 2 ? undefined : cursor ? "third" : "second" }
                  : { nextDueCursor: version === 2 ? undefined : cursor ? "third" : "second" }),
              };
            }),
        } as unknown as WsRpcProtocolClient;
        const { atoms, registry } = yield* makeTestRuntime(client);
        const query = atoms.range(target);
        const stop = registry.mount(query);
        yield* Effect.addFinalizer(() => Effect.sync(stop));
        yield* Effect.promise(() => executeAtomQuery(registry, query));
        yield* Effect.promise(() =>
          runAtomCommand(registry, atoms.loadMore, {
            environmentId: target.environmentId,
            input: { range, kind },
          }),
        );
        for (version = 1; version <= 2; version++) {
          const settled = Latch.makeUnsafe();
          const before = calls.length;
          const watch = registry.subscribe(query, (r) => {
            if (AsyncResult.isSuccess(r) && !r.waiting && calls.length > before)
              settled.openUnsafe();
          });
          yield* SubscriptionRef.set(counter, version);
          yield* settled.await;
          watch();
          const value = AsyncResult.getOrThrow(registry.get(query));
          expect(
            (kind === "events" ? value.events : value.dueTasks).map((row) => row.title),
          ).toEqual(
            version === 1
              ? kind === "events"
                ? ["Review", "Fresh second", "Inserted"]
                : ["Fresh second", "Inserted"]
              : kind === "events"
                ? ["Review"]
                : [],
          );
        }
        expect(calls).toEqual(["first", "second", "first", "second", "first"]);
      }),
    ),
);

it.effect.each([
  { failedState: "disconnected", fillsCap: false },
  { failedState: "unavailable", fillsCap: true },
] as const)(
  "replaces healthy-source rows and retains only failed-source rows after fresh rows within the cap: %s",
  ({ failedState, fillsCap }) =>
    Effect.scoped(
      Effect.gen(function* () {
        const counter = yield* SubscriptionRef.make(0);
        let refreshed = false;
        const row = (id: string, connectionId: string, start: string) => ({
          ...event,
          id,
          title: id,
          source: { connectionId, calendarId: "same-label" },
          time: {
            kind: "timed" as const,
            start: `2026-10-13T${start}:00Z`,
            end: "2026-10-13T20:00:00Z",
            sourceTimeZone: "UTC",
          },
        });
        const client = {
          [WS_METHODS.calendarSubscribeChanges]: () => SubscriptionRef.changes(counter),
          [WS_METHODS.calendarListRange]: () =>
            Effect.sync(() => ({
              ...page(),
              incomplete: refreshed,
              sourceStates: [
                {
                  connectionId: "healthy",
                  calendarId: "same-label",
                  generation: 1,
                  state: "ready",
                },
                {
                  connectionId: "failed",
                  calendarId: "same-label",
                  generation: 1,
                  state: refreshed ? failedState : "ready",
                },
                {
                  connectionId: "removed",
                  calendarId: "same-label",
                  generation: 1,
                  state: refreshed ? "unselected" : "ready",
                },
              ],
              events: refreshed
                ? [
                    row("fresh-b", "healthy", "10:00"),
                    row("fresh-a", "healthy", "10:00"),
                    ...(fillsCap ? [row("fresh-c", "healthy", "11:00")] : []),
                  ]
                : [
                    row("cancelled", "healthy", "08:00"),
                    row("saved", "failed", "09:00"),
                    row("unselected", "removed", "07:00"),
                  ],
            })),
        } as unknown as WsRpcProtocolClient;
        const { atoms, registry } = yield* makeTestRuntime(client);
        const query = atoms.range({ ...target, input: { ...range, limit: 3 } });
        const stop = registry.mount(query);
        yield* Effect.addFinalizer(() => Effect.sync(stop));
        yield* Effect.promise(() => executeAtomQuery(registry, query));
        const settled = Latch.makeUnsafe();
        const watch = registry.subscribe(query, (r) => {
          if (AsyncResult.isSuccess(r) && !r.waiting && r.value.incomplete) settled.openUnsafe();
        });
        yield* Effect.addFinalizer(() => Effect.sync(watch));
        refreshed = true;
        yield* SubscriptionRef.set(counter, 1);
        yield* settled.await;
        expect(AsyncResult.getOrThrow(registry.get(query)).events.map((row) => row.id)).toEqual(
          fillsCap ? ["fresh-a", "fresh-b", "fresh-c"] : ["saved", "fresh-a", "fresh-b"],
        );
      }),
    ),
);

it.effect("releases loaded depth on unmount before the same range remounts and revalidates", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const stopped = yield* Deferred.make<void>();
      const calls: string[] = [];
      const client = {
        [WS_METHODS.calendarSubscribeChanges]: () =>
          Stream.never.pipe(Stream.ensuring(Deferred.succeed(stopped, undefined))),
        [WS_METHODS.calendarListRange]: (input: { cursor?: string }) =>
          Effect.sync(() => {
            calls.push(input.cursor ?? "first");
            return input.cursor
              ? { ...page(), events: [{ ...event, id: "second" }] }
              : { ...page(), nextCursor: "second" };
          }),
        [WS_METHODS.calendarRefresh]: () => Effect.succeed(page()),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const query = atoms.range(target);
      const stop = registry.mount(query);
      yield* Effect.promise(() => executeAtomQuery(registry, query));
      yield* Effect.promise(() =>
        runAtomCommand(registry, atoms.loadMore, {
          environmentId: target.environmentId,
          input: { range, kind: "events" },
        }),
      );
      stop();
      yield* Deferred.await(stopped);
      const stopAgain = registry.mount(query);
      yield* Effect.addFinalizer(() => Effect.sync(stopAgain));
      yield* Effect.promise(() => runAtomCommand(registry, atoms.refresh, target));
      const result = AsyncResult.getOrThrow(
        yield* Effect.promise(() => executeAtomQuery(registry, query)),
      );
      expect(result.events.map((event) => event.id)).toEqual([event.id]);
      expect(calls).toEqual(["first", "second", "first"]);
    }),
  ),
);

it.effect("replays changed source and task cursor chains only to the requested depth", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const counter = yield* SubscriptionRef.make(0);
      let revision = 1;
      const calls: string[] = [];
      const source = () => [
        {
          connectionId: "calendar",
          calendarId: "work",
          generation: revision,
          state: "ready" as const,
        },
      ];
      const client = {
        [WS_METHODS.calendarSubscribeChanges]: () => SubscriptionRef.changes(counter),
        [WS_METHODS.calendarListRange]: (input: { cursor?: string; dueCursor?: string }) =>
          Effect.sync(() => {
            calls.push(
              input.cursor
                ? `events-${revision}`
                : input.dueCursor
                  ? `due-${revision}`
                  : `first-${revision}`,
            );
            return {
              ...page(),
              sourceStates: source(),
              events: input.dueCursor
                ? []
                : [
                    {
                      ...event,
                      id: input.cursor ? "wce_00000000-0000-0000-0000-000000000002" : event.id,
                      revision,
                      title: `${input.cursor ? "Second" : "First"} ${revision}`,
                    },
                  ],
              dueTasks: input.dueCursor
                ? [
                    {
                      ref: { type: "task", taskId: "second-task" },
                      title: `Due ${revision}`,
                      projectId: "project",
                      dueOn: "2026-10-13",
                      done: false,
                      revision,
                    },
                  ]
                : [],
              nextCursor: input.cursor ? `third-${revision}` : `second-${revision}`,
              nextDueCursor: input.dueCursor ? `third-due-${revision}` : `second-due-${revision}`,
            };
          }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const query = atoms.range(target);
      const stop = registry.mount(query);
      yield* Effect.addFinalizer(() => Effect.sync(stop));
      yield* Effect.promise(() => executeAtomQuery(registry, query));
      for (const kind of ["events", "dueTasks"] as const)
        yield* Effect.promise(() =>
          runAtomCommand(registry, atoms.loadMore, {
            environmentId: target.environmentId,
            input: { range, kind },
          }),
        );
      const settled = Latch.makeUnsafe();
      const watch = registry.subscribe(query, (r) => {
        if (AsyncResult.isSuccess(r) && !r.waiting && r.value.events[0]?.revision === 2)
          settled.openUnsafe();
      });
      yield* Effect.addFinalizer(() => Effect.sync(watch));
      revision = 2;
      yield* SubscriptionRef.set(counter, 1);
      yield* settled.await;
      const value = AsyncResult.getOrThrow(registry.get(query));
      expect(value.events.map((e) => e.title)).toEqual(["First 2", "Second 2"]);
      expect(value.dueTasks.map((t) => t.title)).toEqual(["Due 2"]);
      expect(calls).toEqual(["first-1", "events-1", "due-1", "first-2", "events-2", "due-2"]);
    }),
  ),
);
it.effect(
  "keeps saved due rows when a refreshed due read is incomplete without a continuation",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const counter = yield* SubscriptionRef.make(0);
        let failed = false;
        const client = {
          [WS_METHODS.calendarSubscribeChanges]: () => SubscriptionRef.changes(counter),
          [WS_METHODS.calendarListRange]: () =>
            Effect.sync(() => ({
              ...page(),
              dueIncomplete: failed,
              dueTasks: failed
                ? []
                : [
                    {
                      ref: { type: "task", taskId: "due" },
                      title: "Saved due",
                      projectId: "project",
                      dueOn: "2026-10-13",
                      done: false,
                      revision: 1,
                    },
                  ],
            })),
        } as unknown as WsRpcProtocolClient;
        const { atoms, registry } = yield* makeTestRuntime(client);
        const query = atoms.range(target);
        const stop = registry.mount(query);
        yield* Effect.addFinalizer(() => Effect.sync(stop));
        yield* Effect.promise(() => executeAtomQuery(registry, query));
        const settled = Latch.makeUnsafe();
        const watch = registry.subscribe(query, (r) => {
          if (AsyncResult.isSuccess(r) && !r.waiting && r.value.dueIncomplete) settled.openUnsafe();
        });
        yield* Effect.addFinalizer(() => Effect.sync(watch));
        failed = true;
        yield* SubscriptionRef.set(counter, 1);
        yield* settled.await;
        const value = AsyncResult.getOrThrow(registry.get(query));
        expect(value.dueTasks.map((t) => t.title)).toEqual(["Saved due"]);
        expect(value.nextDueCursor).toBeUndefined();
      }),
    ),
);

it.effect.each(["events", "dueTasks"] as const)(
  "does not resurrect deleted %s before a failed unread tail",
  (kind) =>
    Effect.scoped(
      Effect.gen(function* () {
        let refresh = false;
        const source = { connectionId: "known", calendarId: "calendar" };
        const events = ["A", "B", "C", "D"].map((title, index) => ({
          ...event,
          id: `row-${index}`,
          title,
          source,
        }));
        const tasks = events.map((row) => ({
          ref: { type: "task" as const, taskId: row.id },
          title: row.title,
          dueOn: "2026-10-13",
          done: false,
          revision: 1,
          projectId: "fixture",
        }));
        const client = {
          [WS_METHODS.calendarSubscribeChanges]: () => Stream.never,
          [WS_METHODS.calendarRefresh]: () =>
            Effect.sync(() => {
              refresh = true;
              return page();
            }),
          [WS_METHODS.calendarListRange]: (input: { cursor?: string; dueCursor?: string }) => {
            const continuation = Boolean(input.cursor || input.dueCursor);
            if (refresh && continuation)
              return Effect.fail(new CalendarError({ kind: "rate-limited", message: "Try later" }));
            const indices = continuation ? [2, 3] : refresh ? [0, 2] : [0, 1];
            return Effect.succeed({
              ...page(),
              events: kind === "events" ? indices.map((i) => events[i]!) : [],
              dueTasks: kind === "dueTasks" ? indices.map((i) => tasks[i]!) : [],
              sourceStates: [{ ...source, generation: 1, state: "ready" }],
              ...(!continuation
                ? kind === "events"
                  ? { nextCursor: "more" }
                  : { nextDueCursor: "more" }
                : {}),
            });
          },
        } as unknown as WsRpcProtocolClient;
        const { atoms, registry } = yield* makeTestRuntime(client);
        const query = atoms.range(target);
        const stop = registry.mount(query);
        yield* Effect.addFinalizer(() => Effect.sync(stop));
        yield* Effect.promise(() => executeAtomQuery(registry, query));
        yield* Effect.promise(() =>
          runAtomCommand(registry, atoms.loadMore, {
            environmentId: target.environmentId,
            input: { range, kind },
          }),
        );
        yield* Effect.promise(() => runAtomCommand(registry, atoms.refresh, target));
        yield* Effect.promise(() => executeAtomQuery(registry, query));
        const value = AsyncResult.getOrThrow(registry.get(query));
        expect((kind === "events" ? value.events : value.dueTasks).map((row) => row.title)).toEqual(
          ["A", "C", "D"],
        );
      }),
    ),
);

it.effect("keeps loaded pages while page one is waiting and after it fails", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let refresh = false;
      const client = {
        [WS_METHODS.calendarSubscribeChanges]: () => Stream.never,
        [WS_METHODS.calendarRefresh]: () =>
          Effect.sync(() => {
            refresh = true;
            return page();
          }),
        [WS_METHODS.calendarListRange]: (input: { cursor?: string }) =>
          Effect.gen(function* () {
            if (refresh) {
              yield* Deferred.succeed(started, undefined);
              yield* Deferred.await(release);
              return yield* new CalendarError({
                kind: "unavailable",
                message: "First page failed",
              });
            }
            return input.cursor
              ? {
                  ...page(),
                  events: [
                    { ...event, id: "wce_00000000-0000-0000-0000-000000000002", title: "Second" },
                  ],
                }
              : { ...page(), nextCursor: "more" };
          }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const query = atoms.range(target);
      const stop = registry.mount(query);
      yield* Effect.addFinalizer(() => Effect.sync(stop));
      yield* Effect.promise(() => executeAtomQuery(registry, query));
      yield* Effect.promise(() =>
        runAtomCommand(registry, atoms.loadMore, {
          environmentId: target.environmentId,
          input: { range, kind: "events" },
        }),
      );
      const observed: string[][] = [];
      const unsubscribe = registry.subscribe(query, (value) => {
        const rows = AsyncResult.value(value);
        if (Option.isSome(rows)) observed.push(rows.value.events.map((row) => row.title));
      });
      yield* Effect.addFinalizer(() => Effect.sync(unsubscribe));
      yield* Effect.promise(() => runAtomCommand(registry, atoms.refresh, target));
      yield* Deferred.await(started);
      expect(
        Option.getOrThrow(AsyncResult.value(registry.get(query))).events.map((row) => row.title),
      ).toEqual(["Review", "Second"]);
      yield* Deferred.succeed(release, undefined);
      const read = yield* Effect.promise(() => executeAtomQuery(registry, query));
      expect(read._tag).toBe("Failure");
      expect(AsyncResult.isFailure(read) && Cause.squash(read.cause)).toMatchObject({
        _tag: "CalendarError",
        kind: "unavailable",
        message: "First page failed",
      });
      expect(
        Option.getOrThrow(AsyncResult.value(registry.get(query))).events.map((row) => row.title),
      ).toEqual(["Review", "Second"]);
      expect(observed.length).toBeGreaterThan(0);
      expect(observed.every((rows) => rows.join() === "Review,Second")).toBe(true);
    }),
  ),
);

it.effect.each(["not-found", "invalid-input", "authorization", "transport"] as const)(
  "fails refresh on non-recoverable %s continuation errors",
  (kind) =>
    Effect.scoped(
      Effect.gen(function* () {
        let refresh = false;
        const error =
          kind === "transport"
            ? new EnvironmentRpcUnavailableError({
                environmentId: TARGET.environmentId,
                message: "Transport failed",
              })
            : kind === "authorization"
              ? new EnvironmentAuthorizationError({
                  requiredScope: "orchestration:read",
                  message: "Read denied",
                })
              : new CalendarError({ kind, message: "Read denied" });
        const client = {
          [WS_METHODS.calendarSubscribeChanges]: () => Stream.never,
          [WS_METHODS.calendarRefresh]: () =>
            Effect.sync(() => {
              refresh = true;
              return page();
            }),
          [WS_METHODS.calendarListRange]: (input: { cursor?: string }) =>
            input.cursor && refresh
              ? Effect.fail(error)
              : Effect.succeed({ ...page(), ...(input.cursor ? {} : { nextCursor: "more" }) }),
        } as unknown as WsRpcProtocolClient;
        const { atoms, registry } = yield* makeTestRuntime(client);
        const query = atoms.range(target);
        const stop = registry.mount(query);
        yield* Effect.addFinalizer(() => Effect.sync(stop));
        yield* Effect.promise(() => executeAtomQuery(registry, query));
        yield* Effect.promise(() =>
          runAtomCommand(registry, atoms.loadMore, {
            environmentId: target.environmentId,
            input: { range, kind: "events" },
          }),
        );
        yield* Effect.promise(() => runAtomCommand(registry, atoms.refresh, target));
        const read = yield* Effect.promise(() => executeAtomQuery(registry, query));
        expect(AsyncResult.isFailure(read) && Cause.squash(read.cause)).toEqual(error);
      }),
    ),
);

it.effect.each([true, false])(
  "reports conflict when Load more resolves after a refresh publishes changed=%s",
  (changed) =>
    Effect.scoped(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        let refresh = false;
        const client = {
          [WS_METHODS.calendarSubscribeChanges]: () => Stream.never,
          [WS_METHODS.calendarRefresh]: () =>
            Effect.sync(() => {
              refresh = true;
              return page();
            }),
          [WS_METHODS.calendarListRange]: (input: { cursor?: string }) =>
            Effect.gen(function* () {
              if (input.cursor) {
                yield* Deferred.succeed(started, undefined);
                yield* Deferred.await(release);
                return { ...page(), events: [{ ...event, id: "second", title: "Second" }] };
              }
              return { ...page(refresh && changed ? "Fresh" : "Review"), nextCursor: "more" };
            }),
        } as unknown as WsRpcProtocolClient;
        const { atoms, registry } = yield* makeTestRuntime(client);
        const query = atoms.range(target);
        const stop = registry.mount(query);
        yield* Effect.addFinalizer(() => Effect.sync(stop));
        yield* Effect.promise(() => executeAtomQuery(registry, query));
        const more = runAtomCommand(registry, atoms.loadMore, {
          environmentId: target.environmentId,
          input: { range, kind: "events" },
        });
        yield* Deferred.await(started);
        yield* Effect.promise(() => runAtomCommand(registry, atoms.refresh, target));
        yield* Effect.promise(() => executeAtomQuery(registry, query));
        yield* Deferred.succeed(release, undefined);
        const result = yield* Effect.promise(() => more);
        expect(AsyncResult.isFailure(result) && Cause.squash(result.cause)).toMatchObject({
          _tag: "CalendarError",
          kind: "conflict",
        });
        expect(AsyncResult.getOrThrow(registry.get(query)).events.map((row) => row.title)).toEqual([
          changed ? "Fresh" : "Review",
        ]);
      }),
    ),
);
