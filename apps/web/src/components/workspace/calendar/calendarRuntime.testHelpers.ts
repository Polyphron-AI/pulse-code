import { EnvironmentId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import type * as Scope from "effect/Scope";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";
import {
  EnvironmentRegistry,
  EnvironmentSupervisor,
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type ConnectionCatalogEntry,
  type ConnectionTarget,
  type PreparedConnection,
  type SupervisorConnectionState,
} from "@t3tools/client-runtime/connection";
import type { WsRpcProtocolClient, RpcSession } from "@t3tools/client-runtime/rpc";
import { createWorkspaceCalendarAtoms } from "@t3tools/client-runtime/state/workspaceCalendar";

export const TARGET = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("environment-1"),
  label: "Test environment",
  httpBaseUrl: "https://environment.example.test",
  wsBaseUrl: "wss://environment.example.test",
});

export function session(client: WsRpcProtocolClient): RpcSession {
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

interface TestRuntime {
  readonly atoms: ReturnType<typeof createWorkspaceCalendarAtoms<never, never>>;
  readonly runtime: Atom.AtomRuntime<EnvironmentRegistry.EnvironmentRegistry>;
  readonly registry: AtomRegistry.AtomRegistry;
  readonly supervisor: EnvironmentSupervisor.EnvironmentSupervisor["Service"];
  readonly other: EnvironmentSupervisor.EnvironmentSupervisor["Service"];
}

export const makeTestRuntime: (
  client: WsRpcProtocolClient,
  otherClient?: WsRpcProtocolClient,
  otherTarget?: ConnectionTarget,
  supported?: boolean,
) => Effect.Effect<TestRuntime, never, Scope.Scope> = Effect.fn("makeTestRuntime")(function* (
  client: WsRpcProtocolClient,
  otherClient = client,
  otherTarget: ConnectionTarget = TARGET,
  supported = true,
): Effect.fn.Return<TestRuntime, never, Scope.Scope> {
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
  return { atoms: createWorkspaceCalendarAtoms(runtime), runtime, registry, supervisor, other };
});
