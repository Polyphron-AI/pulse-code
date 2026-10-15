import { EnvironmentId, WS_METHODS } from "@t3tools/contracts";
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
import { createTelegramAtoms } from "./telegram.ts";

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
  return { atoms: createTelegramAtoms(runtime), registry };
});

it.effect(
  "refreshes received messages after another device or poller changes the environment",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const counter = yield* SubscriptionRef.make(0);
        let text = "before";
        const client = {
          [WS_METHODS.telegramSubscribeChanges]: () =>
            SubscriptionRef.changes(counter).pipe(Stream.filter((count) => count > 0)),
          [WS_METHODS.telegramReadMessage]: () =>
            Effect.sync(() => ({
              connectionId: "telegram_1000",
              chatId: "-42",
              messageId: "2",
              sender: "Member",
              text,
              sentAt: 1,
              edited: false,
              truncated: false,
            })),
        } as unknown as WsRpcProtocolClient;
        const { atoms, registry } = yield* makeTestRuntime(client);
        const message = atoms.message({
          environmentId: TARGET.environmentId,
          input: { connectionId: "telegram_1000", chatId: "-42", messageId: "2" },
        });
        const unmount = registry.mount(message);
        yield* Effect.addFinalizer(() => Effect.sync(unmount));
        const initial = yield* Effect.promise(() => executeAtomQuery(registry, message));
        expect(AsyncResult.isSuccess(initial) && initial.value.text).toBe("before");
        const refreshed = Latch.makeUnsafe();
        const stop = registry.subscribe(message, (result) => {
          if (AsyncResult.isSuccess(result) && result.value.text === "after")
            refreshed.openUnsafe();
        });
        yield* Effect.addFinalizer(() => Effect.sync(stop));
        text = "after";
        yield* SubscriptionRef.set(counter, 1);
        yield* refreshed.await;
      }),
    ),
);
