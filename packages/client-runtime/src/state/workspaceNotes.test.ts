import { EnvironmentId, WS_METHODS, WorkspaceNotesError } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Latch from "effect/Latch";
import * as Deferred from "effect/Deferred";
import * as TestClock from "effect/testing/TestClock";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
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
import { createWorkspaceNoteAtoms } from "./workspaceNotes.ts";

const TARGET = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("environment-1"),
  label: "Test environment",
  httpBaseUrl: "https://environment.example.test",
  wsBaseUrl: "wss://environment.example.test",
});
const isNotesError = Schema.is(WorkspaceNotesError);

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
  return { atoms: createWorkspaceNoteAtoms(runtime), registry, supervisor };
});

const input = { requestId: "00000000-0000-0000-0000-000000000001", title: "Review", body: "Draft" };
const note = {
  id: `wsn_${input.requestId}`,
  title: input.title,
  body: input.body,
  revision: 1,
  createdAt: "2026-10-13T12:00:00Z",
  updatedAt: "2026-10-13T12:00:00Z",
};

it.effect.each(["local", "direct", "relay", "tunnel"])(
  "keeps late %s note responses bound to their environment",
  (mode) =>
    Effect.scoped(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const slow = {
          [WS_METHODS.notesSubscribeChanges]: () => Stream.never,
          [WS_METHODS.notesGet]: () =>
            Effect.gen(function* () {
              yield* Deferred.succeed(started, undefined);
              yield* Deferred.await(release);
              return note;
            }),
        } as unknown as WsRpcProtocolClient;
        const fast = {
          [WS_METHODS.notesSubscribeChanges]: () => Stream.never,
          [WS_METHODS.notesGet]: () => Effect.succeed({ ...note, title: "Other environment" }),
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
        const old = atoms.get({ environmentId: TARGET.environmentId, input: { id: note.id } });
        const current = atoms.get({ environmentId, input: { id: note.id } });
        const stops = [registry.mount(old), registry.mount(current)];
        yield* Effect.addFinalizer(() => Effect.sync(() => stops.forEach((stop) => stop())));
        yield* Deferred.await(started);
        expect(
          AsyncResult.getOrThrow(yield* Effect.promise(() => executeAtomQuery(registry, current)))
            .title,
        ).toBe("Other environment");
        yield* Deferred.succeed(release, undefined);
        expect(
          AsyncResult.getOrThrow(yield* Effect.promise(() => executeAtomQuery(registry, old)))
            .title,
        ).toBe(note.title);
        expect(AsyncResult.getOrThrow(registry.get(current)).title).toBe("Other environment");
      }),
    ),
);

it.effect("refetches the selected note on reconnect and does not send disconnected writes", () =>
  Effect.scoped(
    Effect.gen(function* () {
      let title = "Before";
      let writes = 0;
      const client = {
        [WS_METHODS.notesSubscribeChanges]: () => Stream.never,
        [WS_METHODS.notesGet]: () => Effect.sync(() => ({ ...note, title })),
        [WS_METHODS.notesCreate]: () =>
          Effect.sync(() => {
            writes++;
            return note;
          }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry, supervisor } = yield* makeTestRuntime(client);
      const selected = atoms.get({ environmentId: TARGET.environmentId, input: { id: note.id } });
      const stop = registry.mount(selected);
      yield* Effect.addFinalizer(() => Effect.sync(stop));
      yield* Effect.promise(() => executeAtomQuery(registry, selected));
      yield* SubscriptionRef.update(supervisor.state, (state) => ({
        ...state,
        phase: "offline" as const,
        network: "offline" as const,
      }));
      yield* SubscriptionRef.set(supervisor.session, Option.none());
      const denied = yield* Effect.promise(() =>
        runAtomCommand(registry, atoms.create, { environmentId: TARGET.environmentId, input }),
      );
      expect(AsyncResult.isFailure(denied)).toBe(true);
      expect(writes).toBe(0);
      title = "After";
      const refreshed = Latch.makeUnsafe();
      const stopWatch = registry.subscribe(selected, (result) => {
        if (AsyncResult.isSuccess(result) && result.value.title === "After") refreshed.openUnsafe();
      });
      yield* Effect.addFinalizer(() => Effect.sync(stopWatch));
      yield* SubscriptionRef.set(supervisor.session, Option.some(session(client)));
      yield* SubscriptionRef.update(supervisor.state, (state) => ({
        ...state,
        phase: "connected" as const,
        network: "online" as const,
        generation: state.generation + 1,
      }));
      yield* refreshed.await;
      expect(AsyncResult.getOrThrow(registry.get(selected)).title).toBe("After");
    }),
  ),
);

it.effect("selects lazily, shares one change stream and stops listeners while unmounted", () =>
  Effect.scoped(
    Effect.gen(function* () {
      let reads = 0;
      let starts = 0;
      const stopped = yield* Deferred.make<void>();
      const client = {
        [WS_METHODS.notesGet]: () =>
          Effect.sync(() => {
            reads++;
            return note;
          }),
        [WS_METHODS.notesRead]: () =>
          Effect.sync(() => {
            reads++;
            return { ...note, body: { text: note.body, truncated: false } };
          }),
        [WS_METHODS.notesSubscribeChanges]: () =>
          Stream.unwrap(
            Effect.sync(() => {
              starts++;
              return Stream.never;
            }),
          ).pipe(Stream.ensuring(Deferred.succeed(stopped, undefined))),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const target = { environmentId: TARGET.environmentId, input: { id: note.id } };
      const selected = atoms.get(target);
      const body = atoms.read(target);
      expect(reads).toBe(0);
      expect(starts).toBe(0);
      const unmount = registry.mount(selected);
      const unmountBody = registry.mount(body);
      yield* Effect.promise(() => executeAtomQuery(registry, selected));
      yield* Effect.promise(() => executeAtomQuery(registry, body));
      expect(starts).toBe(1);
      expect(reads).toBe(2);
      yield* TestClock.adjust("1 hour");
      expect(reads).toBe(2);
      unmount();
      unmountBody();
      yield* Deferred.await(stopped);
      yield* TestClock.adjust("1 hour");
      expect(reads).toBe(2);
    }),
  ),
);

it.effect(
  "invalidates selected notes on two clients and preserves typed edit conflicts and deletion",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const counter = yield* SubscriptionRef.make(0);
        let current = { ...note };
        let deleted = false;
        const client = {
          [WS_METHODS.notesSubscribeChanges]: () =>
            SubscriptionRef.changes(counter).pipe(Stream.filter((n) => n > 0)),
          [WS_METHODS.notesGet]: () =>
            deleted
              ? Effect.fail(
                  new WorkspaceNotesError({
                    kind: "not-found",
                    message: "Its links have been kept.",
                  }),
                )
              : Effect.sync(() => current),
          [WS_METHODS.notesUpdate]: (update: { expectedRevision: number; body: string }) =>
            Effect.gen(function* () {
              if (update.expectedRevision !== current.revision)
                return yield* new WorkspaceNotesError({
                  kind: "conflict",
                  message: "Your draft has been kept.",
                });
              current = { ...current, body: update.body, revision: current.revision + 1 };
              yield* SubscriptionRef.update(counter, (n) => n + 1);
              return current;
            }),
          [WS_METHODS.notesDelete]: () =>
            Effect.gen(function* () {
              deleted = true;
              yield* SubscriptionRef.update(counter, (n) => n + 1);
            }),
        } as unknown as WsRpcProtocolClient;
        const first = yield* makeTestRuntime(client);
        const second = yield* makeTestRuntime(client);
        const target = { environmentId: TARGET.environmentId, input: { id: note.id } };
        const a = first.atoms.get(target);
        const b = second.atoms.get(target);
        const unmountA = first.registry.mount(a);
        const unmountB = second.registry.mount(b);
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            unmountA();
            unmountB();
          }),
        );
        yield* Effect.promise(() => executeAtomQuery(first.registry, a));
        yield* Effect.promise(() => executeAtomQuery(second.registry, b));
        const changed = Latch.makeUnsafe();
        const unavailable = Latch.makeUnsafe();
        const stop = second.registry.subscribe(b, (result) => {
          if (AsyncResult.isSuccess(result) && result.value.revision === 2) changed.openUnsafe();
          if (AsyncResult.isFailure(result) && isNotesError(Cause.squash(result.cause)))
            unavailable.openUnsafe();
        });
        yield* Effect.addFinalizer(() => Effect.sync(stop));
        const update = {
          environmentId: TARGET.environmentId,
          input: { ...input, id: note.id, expectedRevision: 1, body: "Reviewed" },
        };
        expect(
          AsyncResult.isSuccess(
            yield* Effect.promise(() => runAtomCommand(first.registry, first.atoms.update, update)),
          ),
        ).toBe(true);
        yield* changed.await;
        const stale = yield* Effect.promise(() =>
          runAtomCommand(second.registry, second.atoms.update, update),
        );
        expect(AsyncResult.isFailure(stale) && Cause.squash(stale.cause)).toMatchObject({
          kind: "conflict",
        });
        yield* Effect.promise(() =>
          runAtomCommand(first.registry, first.atoms.delete, {
            environmentId: TARGET.environmentId,
            input: { requestId: input.requestId, id: note.id, expectedRevision: 2 },
          }),
        );
        yield* unavailable.await;
      }),
    ),
);

it.effect(
  "serializes mutations per captured environment without blocking another environment",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const seen: string[] = [];
        const client = {
          [WS_METHODS.notesCreate]: () =>
            Effect.gen(function* () {
              seen.push("create");
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(release);
              return note;
            }),
          [WS_METHODS.notesUpdate]: () =>
            Effect.sync(() => {
              seen.push("update");
              return note;
            }),
        } as unknown as WsRpcProtocolClient;
        const otherClient = {
          [WS_METHODS.notesCreate]: () => Effect.succeed({ ...note, title: "Other environment" }),
        } as unknown as WsRpcProtocolClient;
        const { atoms, registry } = yield* makeTestRuntime(client, otherClient);
        const pending = runAtomCommand(registry, atoms.create, {
          environmentId: TARGET.environmentId,
          input,
        });
        yield* Deferred.await(entered);
        const queued = runAtomCommand(registry, atoms.update, {
          environmentId: TARGET.environmentId,
          input: { ...input, id: note.id, expectedRevision: 1 },
        });
        const other = yield* Effect.promise(() =>
          runAtomCommand(registry, atoms.create, {
            environmentId: EnvironmentId.make("other"),
            input,
          }),
        );
        expect(AsyncResult.isSuccess(other) && other.value.title).toBe("Other environment");
        expect(seen).toEqual(["create"]);
        yield* Deferred.succeed(release, undefined);
        yield* Effect.promise(() => Promise.all([pending, queued]));
        expect(seen).toEqual(["create", "update"]);
      }),
    ),
);
