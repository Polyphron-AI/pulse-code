import { expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import {
  EnvironmentId,
  WS_METHODS,
  workspaceItemKey,
  type ServerConfig,
  type WorkspaceItemRef,
  type WorkspaceSavedItem,
  type WorkspaceSavedItemPage,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Latch from "effect/Latch";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as TestClock from "effect/testing/TestClock";
import { Atom, AtomRegistry, AsyncResult } from "effect/unstable/reactivity";
import type { ConnectionCatalogEntry } from "../connection/catalog.ts";
import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type PreparedConnection,
  type SupervisorConnectionState,
} from "../connection/model.ts";
import * as EnvironmentRegistry from "../connection/registry.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import type { WsRpcProtocolClient } from "../rpc/protocol.ts";
import type { RpcSession } from "../rpc/session.ts";
import { createWorkspaceSavedItemAtoms } from "./workspaceSavedItems.ts";
import { executeAtomQuery } from "./runtime.ts";

const A = EnvironmentId.make("environment-a");
const B = EnvironmentId.make("environment-b");
const ref = { type: "mail", accountId: "acct_a", messageId: "<m@test>" } as const;
const target = (environmentId = A) => ({ environmentId, input: {} });
const makeSession = (
  client: WsRpcProtocolClient,
  supported: boolean | undefined = true,
): RpcSession => ({
  client,
  ready: Effect.void,
  probe: Effect.void,
  closed: Effect.never,
  initialConfig: Effect.succeed({
    pulseCapabilities: supported === undefined ? {} : { workspaceSavedItems: supported },
  } as ServerConfig),
  subscribeServerConfig: (input) => client.subscribeServerConfig(input),
});
const makeRuntime = Effect.fnUntraced(function* (clients: ReadonlyMap<EnvironmentId, RpcSession>) {
  const supervisors = new Map<
    EnvironmentId,
    EnvironmentSupervisor.EnvironmentSupervisor["Service"]
  >();
  const entries = new Map<EnvironmentId, ConnectionCatalogEntry>();
  for (const [environmentId, session] of clients) {
    const target = new PrimaryConnectionTarget({
      environmentId,
      label: environmentId,
      httpBaseUrl: "https://test.invalid",
      wsBaseUrl: "wss://test.invalid",
    });
    const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
      target,
      state: yield* SubscriptionRef.make<SupervisorConnectionState>({
        ...AVAILABLE_CONNECTION_STATE,
        phase: "connected",
        desired: true,
        network: "online",
        generation: 1,
      }),
      session: yield* SubscriptionRef.make(Option.some(session)),
      prepared: yield* SubscriptionRef.make(Option.none<PreparedConnection>()),
      connect: Effect.void,
      disconnect: Effect.void,
      retryNow: Effect.void,
    });
    supervisors.set(environmentId, supervisor);
    entries.set(environmentId, { target, profile: Option.none(), enabled: true });
  }
  const environmentRegistry = EnvironmentRegistry.EnvironmentRegistry.of({
    entries:
      yield* SubscriptionRef.make<ReadonlyMap<EnvironmentId, ConnectionCatalogEntry>>(entries),
    run: (id, effect) =>
      Effect.provideService(
        effect,
        EnvironmentSupervisor.EnvironmentSupervisor,
        supervisors.get(id)!,
      ),
    runStream: (id, stream) =>
      Stream.provideService(
        stream,
        EnvironmentSupervisor.EnvironmentSupervisor,
        supervisors.get(id)!,
      ),
    followStream: (id, stream) =>
      Stream.provideService(
        stream,
        EnvironmentSupervisor.EnvironmentSupervisor,
        supervisors.get(id)!,
      ),
  } as EnvironmentRegistry.EnvironmentRegistry["Service"]);
  const runtime = Atom.runtime(
    Layer.succeed(EnvironmentRegistry.EnvironmentRegistry, environmentRegistry),
  );
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), (registry) =>
    Effect.sync(() => registry.dispose()),
  );
  return { atoms: createWorkspaceSavedItemAtoms(runtime), registry, supervisors };
});
const makeServer = Effect.fnUntraced(function* () {
  const counter = yield* SubscriptionRef.make(0);
  const rows = new Map<string, WorkspaceSavedItem>();
  const calls: string[] = [];
  const observed = yield* SubscriptionRef.make({ revision: -1, deliveries: 0 });
  const client = {
    [WS_METHODS.workspaceSavedItemsList]: () =>
      Effect.sync(() => {
        calls.push("list");
        return { items: [...rows.values()] };
      }),
    [WS_METHODS.workspaceSavedItemsSubscribeChanges]: () => {
      calls.push("changes");
      return SubscriptionRef.changes(counter).pipe(
        Stream.tap((revision) =>
          SubscriptionRef.update(observed, (previous) => ({
            revision,
            deliveries: previous.deliveries + 1,
          })),
        ),
      );
    },
    [WS_METHODS.workspaceSavedItemsAdd]: ({ ref }: { ref: WorkspaceItemRef }) =>
      Effect.gen(function* () {
        calls.push("add");
        const key = workspaceItemKey(ref);
        rows.set(key, { key, ref, savedAt: "2026-10-17T00:00:00.000Z" });
        yield* SubscriptionRef.update(counter, (n) => n + 1);
      }),
    [WS_METHODS.workspaceSavedItemsRemove]: ({ key }: { key: string }) =>
      Effect.gen(function* () {
        calls.push("remove");
        rows.delete(key);
        yield* SubscriptionRef.update(counter, (n) => n + 1);
      }),
  } as unknown as WsRpcProtocolClient;
  return { client, calls, rows, counter, observed };
});
const waitFor = Effect.fnUntraced(function* <E>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<AsyncResult.AsyncResult<WorkspaceSavedItemPage, E>>,
  count: number,
) {
  const receipt = Latch.makeUnsafe();
  const stop = registry.subscribe(
    atom,
    (value) => {
      if (AsyncResult.isSuccess(value) && !value.waiting && value.value.items.length === count)
        receipt.openUnsafe();
    },
    { immediate: true },
  );
  yield* Effect.addFinalizer(() => Effect.sync(stop));
  yield* receipt.await;
});

const waitForFailure = Effect.fnUntraced(function* <A, E>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
) {
  const receipt = Latch.makeUnsafe();
  const stop = registry.subscribe(
    atom,
    (value) => {
      if (AsyncResult.isFailure(value) && !value.waiting) receipt.openUnsafe();
    },
    { immediate: true },
  );
  yield* Effect.addFinalizer(() => Effect.sync(stop));
  yield* receipt.await;
  return registry.get(atom);
});
const expectUnsupported = <A, E>(result: AsyncResult.AsyncResult<A, E>) => {
  expect(AsyncResult.isFailure(result) && Cause.squash(result.cause)).toMatchObject({
    _tag: "WorkspaceSavedItemsError",
    kind: "unsupported",
  });
};
const waitForRevision = (
  server: Effect.Success<ReturnType<typeof makeServer>>,
  revision: number,
  deliveries = 1,
) =>
  SubscriptionRef.changes(server.observed).pipe(
    Stream.filter((value) => value.revision === revision && value.deliveries >= deliveries),
    Stream.take(1),
    Stream.runDrain,
  );

it.effect("loads exactly once on mount and refreshes only for later distinct revisions", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const server = yield* makeServer();
      const device = yield* makeRuntime(new Map([[A, makeSession(server.client)]]));
      const list = device.atoms.list(target());
      const stop = device.registry.mount(list);
      yield* Effect.addFinalizer(() => Effect.sync(stop));
      yield* waitForRevision(server, 0);
      yield* waitFor(device.registry, list, 0);
      expect(server.calls.filter((call) => call === "list")).toHaveLength(1);
      yield* server.client[WS_METHODS.workspaceSavedItemsAdd]({ ref });
      yield* waitFor(device.registry, list, 1);
      expect(server.calls.filter((call) => call === "list")).toHaveLength(2);
      yield* SubscriptionRef.set(server.counter, 1);
      yield* waitForRevision(server, 1, 3);
      yield* TestClock.adjust("2 hours");
      expect(server.calls.filter((call) => call === "list")).toHaveLength(2);
    }),
  ),
);

it.effect("reconnecting to a restarted server refreshes even when its revision collides", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const before = yield* makeServer();
      const device = yield* makeRuntime(new Map([[A, makeSession(before.client)]]));
      const list = device.atoms.list(target());
      const stop = device.registry.mount(list);
      yield* Effect.addFinalizer(() => Effect.sync(stop));
      yield* waitForRevision(before, 0);
      yield* waitFor(device.registry, list, 0);
      yield* Effect.promise(() =>
        device.atoms.add.run(device.registry, { environmentId: A, input: { ref } }),
      );
      yield* waitFor(device.registry, list, 1);
      const supervisor = device.supervisors.get(A)!;
      yield* SubscriptionRef.set(supervisor.session, Option.none());
      const after = yield* makeServer();
      for (const [key, value] of before.rows) after.rows.set(key, value);
      yield* after.client[WS_METHODS.workspaceSavedItemsRemove]({ key: workspaceItemKey(ref) });
      expect(yield* SubscriptionRef.get(after.counter)).toBe(1);
      yield* SubscriptionRef.set(supervisor.session, Option.some(makeSession(after.client)));
      yield* waitForRevision(after, 1);
      yield* waitFor(device.registry, list, 0);
      expect(after.calls.filter((call) => call === "list")).toHaveLength(1);
      // A later change on the restarted process must not be dropped as its seed.
      yield* after.client[WS_METHODS.workspaceSavedItemsAdd]({ ref });
      yield* waitFor(device.registry, list, 1);
      expect(after.calls.filter((call) => call === "list")).toHaveLength(2);
    }),
  ),
);

it.effect(
  "two clients refresh saved lists after committed saves/removes and reconnect without body requests",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const server = yield* makeServer();
        const first = yield* makeRuntime(new Map([[A, makeSession(server.client)]]));
        const second = yield* makeRuntime(new Map([[A, makeSession(server.client)]]));
        expect(first.registry).not.toBe(second.registry);
        const lists = [first, second].map(({ atoms }) => atoms.list(target()));
        for (const [i, device] of [first, second].entries()) {
          const stop = device.registry.mount(lists[i]!);
          yield* Effect.addFinalizer(() => Effect.sync(stop));
          yield* Effect.promise(() => executeAtomQuery(device.registry, lists[i]!));
        }
        expect(
          AsyncResult.isSuccess(
            yield* Effect.promise(() =>
              first.atoms.add.run(first.registry, { environmentId: A, input: { ref } }),
            ),
          ),
        ).toBe(true);
        yield* waitFor(first.registry, lists[0]!, 1);
        yield* waitFor(second.registry, lists[1]!, 1);
        expect(AsyncResult.getOrThrow(second.registry.get(lists[1]!)).items[0]!.key).toBe(
          workspaceItemKey(ref),
        );
        const supervisor = second.supervisors.get(A)!;
        yield* SubscriptionRef.set(supervisor.session, Option.none());
        expect(
          AsyncResult.isSuccess(
            yield* Effect.promise(() =>
              first.atoms.remove.run(first.registry, {
                environmentId: A,
                input: { key: workspaceItemKey(ref) },
              }),
            ),
          ),
        ).toBe(true);
        yield* waitFor(first.registry, lists[0]!, 0);
        yield* SubscriptionRef.set(supervisor.session, Option.some(makeSession(server.client)));
        yield* waitFor(second.registry, lists[1]!, 0);

        expect(new Set(server.calls)).toEqual(new Set(["list", "changes", "add", "remove"]));
      }),
    ),
);

it.effect("identical refs and cached lists remain scoped to their environments", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const one = yield* makeServer();
      const two = yield* makeServer();
      const device = yield* makeRuntime(
        new Map([
          [A, makeSession(one.client)],
          [B, makeSession(two.client)],
        ]),
      );
      const a = device.atoms.list(target(A));
      const b = device.atoms.list(target(B));
      expect(a).not.toBe(b);
      for (const atom of [a, b]) {
        const stop = device.registry.mount(atom);
        yield* Effect.addFinalizer(() => Effect.sync(stop));
        yield* Effect.promise(() => executeAtomQuery(device.registry, atom));
      }
      const otherCalls = [...two.calls];
      yield* Effect.promise(() =>
        device.atoms.add.run(device.registry, { environmentId: A, input: { ref } }),
      );
      yield* waitFor(device.registry, a, 1);
      expect(two.calls).toEqual(otherCalls);
      expect(AsyncResult.getOrThrow(device.registry.get(b)).items).toEqual([]);
      expect(two.calls).not.toContain("add");
    }),
  ),
);

it.effect.each([undefined, false])(
  "skips every saved RPC when capability is %s, including a replacement session",
  (capability) =>
    Effect.scoped(
      Effect.gen(function* () {
        const server = yield* makeServer();
        const old = {
          ...makeSession(server.client, capability),
          initialConfig: Effect.succeed({
            pulseCapabilities: capability === undefined ? {} : { workspaceSavedItems: capability },
          } as ServerConfig),
        };
        const device = yield* makeRuntime(new Map([[A, old]]));
        const atom = device.atoms.list(target());
        const stop = device.registry.mount(atom);
        yield* Effect.addFinalizer(() => Effect.sync(stop));
        expectUnsupported(yield* Effect.promise(() => executeAtomQuery(device.registry, atom)));
        expectUnsupported(
          yield* Effect.promise(() =>
            device.atoms.add.run(device.registry, { environmentId: A, input: { ref } }),
          ),
        );
        expectUnsupported(
          yield* Effect.promise(() =>
            device.atoms.remove.run(device.registry, {
              environmentId: A,
              input: { key: workspaceItemKey(ref) },
            }),
          ),
        );
        yield* SubscriptionRef.set(device.supervisors.get(A)!.session, Option.some({ ...old }));
        yield* Effect.promise(() => executeAtomQuery(device.registry, atom));
        expect(server.calls).toEqual([]);
      }),
    ),
);

it.effect("serializes save/remove in one environment while another environment can progress", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const began = yield* Deferred.make<void>();
      const finish = yield* Deferred.make<void>();
      const other = yield* makeServer();
      const order: string[] = [];
      const client = {
        [WS_METHODS.workspaceSavedItemsAdd]: () =>
          Effect.gen(function* () {
            order.push("add:start");
            yield* Deferred.succeed(began, undefined);
            yield* Deferred.await(finish);
            order.push("add:commit");
          }),
        [WS_METHODS.workspaceSavedItemsRemove]: () =>
          Effect.sync(() => {
            order.push("remove");
          }),
      } as unknown as WsRpcProtocolClient;
      const device = yield* makeRuntime(
        new Map([
          [A, makeSession(client)],
          [B, makeSession(other.client)],
        ]),
      );
      const add = device.atoms.add.run(device.registry, { environmentId: A, input: { ref } });
      yield* Deferred.await(began);
      const remove = device.atoms.remove.run(device.registry, {
        environmentId: A,
        input: { key: workspaceItemKey(ref) },
      });
      expect(
        AsyncResult.isSuccess(
          yield* Effect.promise(() =>
            device.atoms.add.run(device.registry, { environmentId: B, input: { ref } }),
          ),
        ),
      ).toBe(true);
      expect(order).toEqual(["add:start"]);
      yield* Deferred.succeed(finish, undefined);
      yield* Effect.promise(() => Promise.all([add, remove]));
      expect(order).toEqual(["add:start", "add:commit", "remove"]);
    }),
  ),
);

it.effect("mounted list and changes subscriptions do not schedule timer-driven RPCs", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const server = yield* makeServer();
      const device = yield* makeRuntime(new Map([[A, makeSession(server.client)]]));
      const list = device.atoms.list(target());
      // withRefresh schedules a real setTimeout, which TestClock cannot advance.
      const timers = vi.spyOn(globalThis, "setTimeout");
      yield* Effect.addFinalizer(() => Effect.sync(() => timers.mockRestore()));
      const stops = [
        device.registry.mount(device.atoms.changes(target())),
        device.registry.mount(list),
      ];
      for (const stop of stops) {
        yield* Effect.addFinalizer(() => Effect.sync(stop));
      }
      yield* waitForRevision(server, 0);
      yield* waitFor(device.registry, list, 0);
      const before = [...server.calls];
      yield* TestClock.adjust("2 hours");
      expect(server.calls).toEqual(before);
      expect([...before].sort()).toEqual(["changes", "list"]);
      expect(timers.mock.calls.filter(([, ms]) => (ms ?? 0) >= 1_000)).toEqual([]);
    }),
  ),
);

it.effect("rechecks capability when a supported session is replaced by an old server", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const server = yield* makeServer();
      yield* server.client[WS_METHODS.workspaceSavedItemsAdd]({ ref });
      const device = yield* makeRuntime(new Map([[A, makeSession(server.client)]]));
      const list = device.atoms.list(target());
      const stop = device.registry.mount(list);
      yield* Effect.addFinalizer(() => Effect.sync(stop));
      yield* waitFor(device.registry, list, 1);
      const calls = [...server.calls];
      yield* SubscriptionRef.set(
        device.supervisors.get(A)!.session,
        Option.some({
          ...makeSession(server.client),
          initialConfig: Effect.succeed({ pulseCapabilities: {} } as ServerConfig),
        }),
      );
      expectUnsupported(yield* waitForFailure(device.registry, list));
      expect(server.calls).toEqual(calls);
      expectUnsupported(
        yield* Effect.promise(() =>
          device.atoms.add.run(device.registry, { environmentId: A, input: { ref } }),
        ),
      );
      expect(server.calls).toEqual(calls);
    }),
  ),
);
