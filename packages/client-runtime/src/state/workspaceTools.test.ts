import { ProjectId as importProjectId } from "@t3tools/contracts";
import { EnvironmentId, WS_METHODS, WorkspaceToolsError } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Latch from "effect/Latch";
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
import { createWorkspaceToolsAtoms } from "./workspaceTools.ts";

const TARGET = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("environment-1"),
  label: "Test environment",
  httpBaseUrl: "https://environment.example.test",
  wsBaseUrl: "wss://environment.example.test",
});

function session(client: WsRpcProtocolClient): RpcSession {
  return {
    client,
    initialConfig: Effect.never,
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
    session: yield* SubscriptionRef.make(Option.some(session(client))),
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
  return { atoms: createWorkspaceToolsAtoms(runtime), registry, supervisor };
});

it.effect("refreshes project task columns after another device changes the environment", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const counter = yield* SubscriptionRef.make(0);
      let text = "before";
      const client = {
        [WS_METHODS.workspaceSubscribeChanges]: () =>
          SubscriptionRef.changes(counter).pipe(Stream.filter((count) => count > 0)),
        [WS_METHODS.workspaceGetProjectConfig]: () =>
          Effect.sync(() => ({ projectId: "project", taskColumns: [text], browserThreadId: null })),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const message = atoms.config({
        environmentId: TARGET.environmentId,
        input: { projectId: importProjectId.make("project") },
      });
      const unmount = registry.mount(message);
      yield* Effect.addFinalizer(() => Effect.sync(unmount));
      const initial = yield* Effect.promise(() => executeAtomQuery(registry, message));
      expect(AsyncResult.isSuccess(initial) && initial.value.taskColumns[0]).toBe("before");
      const refreshed = Latch.makeUnsafe();
      const stop = registry.subscribe(message, (result) => {
        if (AsyncResult.isSuccess(result) && result.value.taskColumns[0] === "after")
          refreshed.openUnsafe();
      });
      yield* Effect.addFinalizer(() => Effect.sync(stop));
      text = "after";
      yield* SubscriptionRef.set(counter, 1);
      yield* refreshed.await;
    }),
  ),
);

it.effect.each(["transition", "metadata"] as const)(
  "refreshes a second registry after a persisted task $action",
  (action) =>
    Effect.scoped(
      Effect.gen(function* () {
        const counter = yield* SubscriptionRef.make(0);
        const projectId = importProjectId.make("project");
        let task = {
          id: "wskt_00000000-0000-0000-0000-000000000001",
          projectId,
          title: "Task",
          column: "To do",
          done: false,
          revision: 0,
          dueOn: null as string | null,
          areaLabel: null as string | null,
          owner: "environment-owner" as "environment-owner" | null,
        };
        const client = {
          [WS_METHODS.workspaceSubscribeChanges]: () =>
            SubscriptionRef.changes(counter).pipe(Stream.filter((count) => count > 0)),
          [WS_METHODS.workspaceGetTask]: () => Effect.sync(() => task),
          [WS_METHODS.workspacePatchTask]: () =>
            Effect.gen(function* () {
              task = {
                ...task,
                dueOn: "2026-10-16",
                areaLabel: "Marketing",
                owner: null,
                revision: 1,
              };
              yield* SubscriptionRef.update(counter, (n) => n + 1);
              return task;
            }),
          [WS_METHODS.workspaceTransitionTask]: () =>
            Effect.gen(function* () {
              task = { ...task, column: "Done", done: true, revision: 1 };
              yield* SubscriptionRef.update(counter, (n) => n + 1);
              return task;
            }),
        } as unknown as WsRpcProtocolClient;
        const first = yield* makeTestRuntime(client);
        const second = yield* makeTestRuntime(client);
        const query = second.atoms.task({
          environmentId: TARGET.environmentId,
          input: { id: task.id },
        });
        const unmount = second.registry.mount(query);
        yield* Effect.addFinalizer(() => Effect.sync(unmount));
        const initial = yield* Effect.promise(() => executeAtomQuery(second.registry, query));
        expect(AsyncResult.isSuccess(initial) && initial.value.revision).toBe(0);
        const refreshed = Latch.makeUnsafe();
        const stop = second.registry.subscribe(query, (result) => {
          if (
            AsyncResult.isSuccess(result) &&
            result.value.revision === 1 &&
            (action === "transition"
              ? result.value.done
              : result.value.dueOn === "2026-10-16" && result.value.owner === null)
          )
            refreshed.openUnsafe();
        });
        yield* Effect.addFinalizer(() => Effect.sync(stop));
        const result =
          action === "metadata"
            ? yield* Effect.promise(() =>
                runAtomCommand(first.registry, first.atoms.patchTask, {
                  environmentId: TARGET.environmentId,
                  input: {
                    id: task.id,
                    expectedRevision: 0,
                    dueOn: "2026-10-16",
                    areaLabel: "Marketing",
                    owner: null,
                  },
                }),
              )
            : yield* Effect.promise(() =>
                runAtomCommand(first.registry, first.atoms.transitionTask, {
                  environmentId: TARGET.environmentId,
                  input: {
                    id: task.id,
                    expectedRevision: 0,
                    change: { type: "completion", completed: true },
                  },
                }),
              );
        expect(result._tag).toBe("Success");
        yield* refreshed.await;
      }),
    ),
);

const emptyPage = (total: number, nextCursor: string | null = null) => ({
  tasks: [],
  total,
  openTotal: total,
  nextCursor,
  projects: [],
  laneTotals: [],
});
it.effect("shares normalized global summaries and one subscription without project fanout", () =>
  Effect.scoped(
    Effect.gen(function* () {
      let reads = 0,
        subscriptions = 0,
        lists = 0;
      const counter = yield* SubscriptionRef.make(0);
      const client = {
        [WS_METHODS.workspaceSubscribeChanges]: () => {
          subscriptions++;
          return SubscriptionRef.changes(counter).pipe(Stream.filter((n) => n > 0));
        },
        [WS_METHODS.workspaceQueryTasks]: () =>
          Effect.sync(() => {
            reads++;
            return emptyPage(250);
          }),
        [WS_METHODS.workspaceListTasks]: () =>
          Effect.sync(() => {
            lists++;
            return { tasks: [], incomplete: false };
          }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const first = atoms.queryTasks({
        environmentId: TARGET.environmentId,
        input: { text: " launch " },
      });
      const second = atoms.queryTasks({
        environmentId: TARGET.environmentId,
        input: { state: "all", owner: "all", limit: 50, text: "launch" },
      });
      expect(first).toBe(second);
      const stops = [registry.mount(first), registry.mount(second)];
      yield* Effect.addFinalizer(() => Effect.sync(() => stops.forEach((stop) => stop())));
      expect(
        AsyncResult.getOrThrow(yield* Effect.promise(() => executeAtomQuery(registry, first)))
          .total,
      ).toBe(250);
      expect({ reads, subscriptions, lists }).toEqual({ reads: 1, subscriptions: 1, lists: 0 });
    }),
  ),
);
it.effect("clears obsolete cursor pages on changes and refreshes the first page on reconnect", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const counter = yield* SubscriptionRef.make(0);
      const changed = Latch.makeUnsafe(),
        release = Latch.makeUnsafe();
      let generation = 0;
      const calls: (string | undefined)[] = [];
      const client = {
        [WS_METHODS.workspaceSubscribeChanges]: () =>
          SubscriptionRef.changes(counter).pipe(Stream.filter((n) => n > 0)),
        [WS_METHODS.workspaceQueryTasks]: (input: { cursor?: string }) =>
          Effect.gen(function* () {
            calls.push(input.cursor);
            if (generation > 0) {
              if (input.cursor) changed.openUnsafe();
              yield* release.await;
            }
            if (input.cursor && generation > 0)
              return yield* new WorkspaceToolsError({
                kind: "invalid-input",
                message: "Restart pagination",
              });
            return {
              ...emptyPage(generation + 1, input.cursor ? null : "old"),
              tasks: [
                { id: "kept-row", title: "Keep focus", projectTitle: `Project ${generation}` },
              ],
            };
          }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry, supervisor } = yield* makeTestRuntime(client);
      const first = atoms.queryTasks({ environmentId: TARGET.environmentId, input: {} });
      const page = atoms.queryTasks({
        environmentId: TARGET.environmentId,
        input: { cursor: "old" },
      });
      const stops = [registry.mount(first), registry.mount(page)];
      yield* Effect.addFinalizer(() => Effect.sync(() => stops.forEach((stop) => stop())));
      yield* Effect.promise(() => executeAtomQuery(registry, first));
      yield* Effect.promise(() => executeAtomQuery(registry, page));
      const firstStates: string[] = [];
      const stopFirst = registry.subscribe(first, (result) => firstStates.push(result._tag));
      yield* Effect.addFinalizer(() => Effect.sync(stopFirst));
      const cleared = Latch.makeUnsafe();
      const stopCleared = registry.subscribe(page, (result) => {
        if (result.waiting && Option.isNone(AsyncResult.value(result))) cleared.openUnsafe();
      });
      yield* Effect.addFinalizer(() => Effect.sync(stopCleared));
      generation = 1;
      yield* SubscriptionRef.set(counter, 1);
      yield* changed.await;
      yield* cleared.await;
      expect(Option.isNone(AsyncResult.value(registry.get(page)))).toBe(true);
      expect(firstStates).not.toContain("Initial");
      expect(AsyncResult.getOrThrow(registry.get(first)).tasks).toEqual([
        { id: "kept-row", title: "Keep focus", projectTitle: "Project 0" },
      ]);
      release.openUnsafe();
      const failed = yield* Effect.promise(() => executeAtomQuery(registry, page));
      expect(AsyncResult.isFailure(failed)).toBe(true);
      expect(Option.isNone(AsyncResult.value(failed))).toBe(true);
      expect(
        AsyncResult.getOrThrow(yield* Effect.promise(() => executeAtomQuery(registry, first)))
          .total,
      ).toBe(2);
      generation = 2;
      const refreshed = Latch.makeUnsafe();
      const stop = registry.subscribe(first, (result) => {
        if (AsyncResult.isSuccess(result) && result.value.total === 3) refreshed.openUnsafe();
      });
      yield* Effect.addFinalizer(() => Effect.sync(stop));
      yield* SubscriptionRef.update(supervisor.state, (state) => ({
        ...state,
        generation: state.generation + 1,
      }));
      yield* refreshed.await;
      expect(calls.filter((cursor) => cursor === undefined)).toHaveLength(4);
      expect(firstStates).not.toContain("Initial");
    }),
  ),
);
it.effect.each([
  { text: "x".repeat(241) },
  { dueFrom: "2026-10-18", dueTo: "2026-10-17" },
  { limit: 0 },
])("returns a recoverable typed failure for invalid filters %j", (input) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = {
        [WS_METHODS.workspaceSubscribeChanges]: () => Stream.never,
        [WS_METHODS.workspaceQueryTasks]: () => Effect.succeed(emptyPage(1)),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const result = registry.get(atoms.queryTasks({ environmentId: TARGET.environmentId, input }));
      expect(AsyncResult.isFailure(result)).toBe(true);
      if (AsyncResult.isFailure(result)) {
        const error = Cause.squash(result.cause);
        expect(error).toBeInstanceOf(WorkspaceToolsError);
        expect((error as WorkspaceToolsError).kind).toBe("invalid-input");
      }
      const valid = atoms.queryTasks({ environmentId: TARGET.environmentId, input: {} });
      expect(
        AsyncResult.getOrThrow(yield* Effect.promise(() => executeAtomQuery(registry, valid)))
          .total,
      ).toBe(1);
    }),
  ),
);
it.effect.each(["local", "direct", "relay", "tunnel"])(
  "keeps late %s summary responses bound to their environment",
  (mode) =>
    Effect.scoped(
      Effect.gen(function* () {
        const started = Latch.makeUnsafe(),
          finish = Latch.makeUnsafe();
        const slow = {
          [WS_METHODS.workspaceSubscribeChanges]: () => Stream.never,
          [WS_METHODS.workspaceQueryTasks]: () =>
            Effect.gen(function* () {
              started.openUnsafe();
              yield* finish.await;
              return emptyPage(1);
            }),
        } as unknown as WsRpcProtocolClient;
        const fast = {
          [WS_METHODS.workspaceSubscribeChanges]: () => Stream.never,
          [WS_METHODS.workspaceQueryTasks]: () => Effect.succeed(emptyPage(2)),
        } as unknown as WsRpcProtocolClient;
        const environmentId = EnvironmentId.make(mode);
        const origin =
          mode === "local"
            ? "http://127.0.0.1:3773"
            : mode === "direct"
              ? "http://remote.tailnet.test:3773"
              : "https://tunnel.example.test/environment";
        const target =
          mode === "relay"
            ? new RelayConnectionTarget({ environmentId, label: mode })
            : new PrimaryConnectionTarget({
                environmentId,
                label: mode,
                httpBaseUrl: origin,
                wsBaseUrl: origin.replace(/^http/, "ws"),
              });
        const { atoms, registry } = yield* makeTestRuntime(slow, fast, target);
        const old = atoms.queryTasks({ environmentId: TARGET.environmentId, input: {} });
        const current = atoms.queryTasks({ environmentId, input: {} });
        const stops = [registry.mount(old), registry.mount(current)];
        yield* Effect.addFinalizer(() => Effect.sync(() => stops.forEach((stop) => stop())));
        yield* started.await;
        expect(
          AsyncResult.getOrThrow(yield* Effect.promise(() => executeAtomQuery(registry, current)))
            .total,
        ).toBe(2);
        finish.openUnsafe();
        expect(
          AsyncResult.getOrThrow(yield* Effect.promise(() => executeAtomQuery(registry, old)))
            .total,
        ).toBe(1);
        expect(AsyncResult.getOrThrow(registry.get(current)).total).toBe(2);
      }),
    ),
);
it.effect("restarts the first page after a generation mismatch without a change event", () =>
  Effect.scoped(
    Effect.gen(function* () {
      let title = "Before";
      const client = {
        [WS_METHODS.workspaceSubscribeChanges]: () => Stream.never,
        [WS_METHODS.workspaceQueryTasks]: (input: { cursor?: string }) =>
          input.cursor
            ? Effect.fail(
                new WorkspaceToolsError({ kind: "invalid-input", message: "Restart pagination" }),
              )
            : Effect.succeed({ ...emptyPage(1, title), tasks: [{ projectTitle: title }] }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const first = atoms.queryTasks({ environmentId: TARGET.environmentId, input: {} });
      const unmount = registry.mount(first);
      yield* Effect.addFinalizer(() => Effect.sync(unmount));
      yield* Effect.promise(() => executeAtomQuery(registry, first));
      title = "After";
      const page = atoms.queryTasks({
        environmentId: TARGET.environmentId,
        input: { cursor: "Before" },
      });
      const failure = yield* Effect.promise(() => executeAtomQuery(registry, page));
      expect(AsyncResult.isFailure(failure)).toBe(true);
      expect(Option.isNone(AsyncResult.value(failure))).toBe(true);
      const refreshed = yield* Effect.promise(() => executeAtomQuery(registry, first));
      expect(AsyncResult.getOrThrow(refreshed).tasks).toEqual([{ projectTitle: "After" }]);
      expect(AsyncResult.getOrThrow(refreshed).nextCursor).toBe("After");
    }),
  ),
);
