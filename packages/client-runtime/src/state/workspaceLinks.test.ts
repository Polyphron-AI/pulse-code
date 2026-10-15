import { EnvironmentId, ProjectId, WS_METHODS, type WorkspaceLinkView } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
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
  type PreparedConnection,
  type SupervisorConnectionState,
} from "../connection/model.ts";
import * as EnvironmentRegistry from "../connection/registry.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import type { WsRpcProtocolClient } from "../rpc/protocol.ts";
import type { RpcSession } from "../rpc/session.ts";
import { executeAtomQuery } from "./runtime.ts";
import { createWorkspaceLinkAtoms } from "./workspaceLinks.ts";

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

const makeTestRuntime = Effect.fn("makeTestRuntime")(function* (client: WsRpcProtocolClient) {
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
  const environmentRegistry = EnvironmentRegistry.EnvironmentRegistry.of({
    entries: yield* SubscriptionRef.make<ReadonlyMap<EnvironmentId, ConnectionCatalogEntry>>(
      new Map([[TARGET.environmentId, { target: TARGET, profile: Option.none(), enabled: true }]]),
    ),
    run: (_environmentId, effect) =>
      Effect.provideService(effect, EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
    runStream: (_environmentId, stream) =>
      Stream.provideService(stream, EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
    followStream: (_environmentId, stream) =>
      Stream.provideService(stream, EnvironmentSupervisor.EnvironmentSupervisor, supervisor),
  } as EnvironmentRegistry.EnvironmentRegistry["Service"]);
  const runtime = Atom.runtime(
    Layer.succeed(EnvironmentRegistry.EnvironmentRegistry, environmentRegistry),
  );
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), (registry) =>
    Effect.sync(() => registry.dispose()),
  );
  return { atoms: createWorkspaceLinkAtoms(runtime), registry };
});

const LINK: WorkspaceLinkView = {
  id: "wl_00000000-0000-4000-8000-000000000001",
  item: { ref: { type: "mail", accountId: "acct_1", messageId: "<a@b>" }, title: "Q3 brief" },
  status: "confirmed",
  source: { type: "user" },
  updatedAt: "2026-10-14T09:00:00.000Z",
};

it.effect("refetches an open list when a link changes anywhere in the environment", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const counter = yield* SubscriptionRef.make(0);
      let linked: ReadonlyArray<WorkspaceLinkView> = [];
      // Same shape as the server: the counter's current value first, with 0 skipped.
      const client = {
        [WS_METHODS.pulseLinksSubscribeChanges]: () =>
          SubscriptionRef.changes(counter).pipe(Stream.filter((count) => count > 0)),
        [WS_METHODS.pulseLinksList]: () =>
          Effect.sync(() => ({ linked, suggested: [], truncated: false })),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const list = atoms.list({
        environmentId: TARGET.environmentId,
        input: { item: { type: "project", projectId: ProjectId.make("project-1") } },
      });
      const unmount = registry.mount(list);
      yield* Effect.addFinalizer(() => Effect.sync(unmount));

      const initial = yield* Effect.promise(() => executeAtomQuery(registry, list));
      expect(AsyncResult.isSuccess(initial)).toBe(true);
      if (!AsyncResult.isSuccess(initial)) return yield* Effect.die("list did not load");
      expect(initial.value.linked).toEqual([]);

      const refreshed = Latch.makeUnsafe();
      const stop = registry.subscribe(list, (result) => {
        if (AsyncResult.isSuccess(result) && result.value.linked.length === 1) {
          refreshed.openUnsafe();
        }
      });
      yield* Effect.addFinalizer(() => Effect.sync(stop));

      // Another device links something: the server updates, then ticks the counter.
      linked = [LINK];
      yield* SubscriptionRef.set(counter, 1);
      yield* refreshed.await;
    }),
  ),
);
