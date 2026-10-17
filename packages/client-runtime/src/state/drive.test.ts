import {
  EnvironmentId,
  ProjectId,
  WS_METHODS,
  type DriveProjectRootResult,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
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
import { createDriveAtoms } from "./drive.ts";

const TARGET = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("environment-1"),
  label: "Test environment",
  httpBaseUrl: "https://environment.example.test",
  wsBaseUrl: "wss://environment.example.test",
});
const OTHER_TARGET = new PrimaryConnectionTarget({
  environmentId: EnvironmentId.make("environment-2"),
  label: "Other",
  httpBaseUrl: "https://other.example.test",
  wsBaseUrl: "wss://other.example.test",
});
it.effect("keeps a deferred browse result attached to its originating environment and input", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const calls: string[] = [];
      const input = {
        projectId: ProjectId.make("same-project"),
        connectionId: "drv_00000000-0000-0000-0000-000000000001",
        parentId: "root-a",
        path: [],
        sort: "name" as const,
        direction: "asc" as const,
        limit: 20,
      };
      const slow = {
        [WS_METHODS.driveListChildren]: (value: typeof input) =>
          Effect.gen(function* () {
            calls.push(value.parentId);
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);
            return {
              files: [],
              rootFile: {
                id: value.parentId,
                name: "Original root",
                mimeType: "application/vnd.google-apps.folder",
                url: `https://drive.google.com/drive/folders/${value.parentId}`,
              },
              incomplete: false,
            };
          }),
      } as unknown as WsRpcProtocolClient;
      const fast = {
        [WS_METHODS.driveListChildren]: () => Effect.succeed({ files: [], incomplete: true }),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(slow, fast);
      expect(atoms.listChildren).toBeDefined();
      const old = yield* Effect.promise(() =>
        runAtomCommand(registry, atoms.listChildren, {
          environmentId: TARGET.environmentId,
          input,
        }),
      ).pipe(Effect.forkChild);
      yield* Deferred.await(entered);
      const current = yield* Effect.promise(() =>
        runAtomCommand(registry, atoms.listChildren, {
          environmentId: OTHER_TARGET.environmentId,
          input: { ...input, parentId: "root-b" },
        }),
      );
      expect(AsyncResult.getOrThrow(current)).toEqual({ files: [], incomplete: true });
      yield* Deferred.succeed(release, undefined);
      expect(AsyncResult.getOrThrow(yield* Fiber.join(old)).rootFile?.id).toBe("root-a");
      expect(input.parentId).toBe("root-a");
      expect(calls).toEqual(["root-a"]);
    }),
  ),
);

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
  otherClient?: WsRpcProtocolClient,
  otherTarget: ConnectionTarget = OTHER_TARGET,
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
  const otherSupervisor = {
    ...supervisor,
    target: otherTarget,
    session: yield* SubscriptionRef.make(Option.some(session(otherClient ?? client))),
  };
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
        environmentId === TARGET.environmentId ? supervisor : otherSupervisor,
      ),
    runStream: (environmentId, stream) =>
      Stream.provideService(
        stream,
        EnvironmentSupervisor.EnvironmentSupervisor,
        environmentId === TARGET.environmentId ? supervisor : otherSupervisor,
      ),
    followStream: (environmentId, stream) =>
      Stream.provideService(
        stream,
        EnvironmentSupervisor.EnvironmentSupervisor,
        environmentId === TARGET.environmentId ? supervisor : otherSupervisor,
      ),
  } as EnvironmentRegistry.EnvironmentRegistry["Service"]);
  const runtime = Atom.runtime(
    Layer.succeed(EnvironmentRegistry.EnvironmentRegistry, environmentRegistry),
  );
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), (registry) =>
    Effect.sync(() => registry.dispose()),
  );
  return { atoms: createDriveAtoms(runtime), registry };
});
it.effect.each(["local", "direct", "relay", "tunnel"])(
  "keeps late %s root responses in the originating environment",
  (mode) =>
    Effect.scoped(
      Effect.gen(function* () {
        const entered = Latch.makeUnsafe(),
          release = Latch.makeUnsafe();
        const slow = {
          [WS_METHODS.driveSubscribeChanges]: () => Stream.never,
          [WS_METHODS.driveGetProjectRoot]: () =>
            Effect.gen(function* () {
              entered.openUnsafe();
              yield* release.await;
              return { root: null, state: "unconfigured" };
            }),
        } as unknown as WsRpcProtocolClient;
        const fast = {
          ...slow,
          [WS_METHODS.driveGetProjectRoot]: () =>
            Effect.succeed({
              root: {
                linkId: "wl_00000000-0000-0000-0000-000000000001",
                connectionId: "drv_00000000-0000-0000-0000-000000000001",
                fileId: "current-root",
              },
              state: "available",
            }),
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
        const input = { projectId: ProjectId.make("same-project") };
        const oldQuery = atoms.projectRoot({ environmentId: TARGET.environmentId, input });
        const currentQuery = atoms.projectRoot({ environmentId, input });
        const stops = [registry.mount(oldQuery), registry.mount(currentQuery)];
        yield* Effect.addFinalizer(() => Effect.sync(() => stops.forEach((stop) => stop())));
        yield* entered.await;
        expect(
          AsyncResult.getOrThrow(
            yield* Effect.promise(() => executeAtomQuery(registry, currentQuery)),
          ).root?.fileId,
        ).toBe("current-root");
        release.openUnsafe();
        expect(
          AsyncResult.getOrThrow(yield* Effect.promise(() => executeAtomQuery(registry, oldQuery)))
            .root,
        ).toBeNull();
        expect(AsyncResult.getOrThrow(registry.get(currentQuery)).root?.fileId).toBe(
          "current-root",
        );
      }),
    ),
);
it.effect(
  "refreshes designated project roots across clients without mixing identical project IDs in other environments",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const counter = yield* SubscriptionRef.make(0);
        let result: DriveProjectRootResult = { root: null, state: "unconfigured" };
        const otherResult: DriveProjectRootResult = {
          root: {
            linkId: "wl_00000000-0000-0000-0000-000000000002",
            connectionId: "drv_00000000-0000-0000-0000-000000000002",
            fileId: "other-root",
          },
          state: "available",
        };
        const client = {
          [WS_METHODS.driveSubscribeChanges]: () =>
            SubscriptionRef.changes(counter).pipe(Stream.filter((value) => value > 0)),
          [WS_METHODS.driveGetProjectRoot]: () => Effect.sync(() => result),
          [WS_METHODS.driveSetProjectRoot]: () => Effect.succeed(result),
        } as unknown as WsRpcProtocolClient;
        const otherClient = {
          ...client,
          [WS_METHODS.driveGetProjectRoot]: () => Effect.succeed(otherResult),
        } as unknown as WsRpcProtocolClient;
        const { atoms, registry } = yield* makeTestRuntime(client, otherClient);
        const input = { projectId: ProjectId.make("same-project") };
        const query = atoms.projectRoot({ environmentId: TARGET.environmentId, input });
        const otherQuery = atoms.projectRoot({
          environmentId: EnvironmentId.make("environment-2"),
          input,
        });
        const unmount = registry.mount(query);
        const unmountOther = registry.mount(otherQuery);
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            unmount();
            unmountOther();
          }),
        );
        const initial = yield* Effect.promise(() => executeAtomQuery(registry, query));
        expect(AsyncResult.isSuccess(initial) && initial.value.root).toBeNull();
        const other = yield* Effect.promise(() => executeAtomQuery(registry, otherQuery));
        expect(AsyncResult.isSuccess(other) && other.value.root?.fileId).toBe("other-root");
        const updated = Latch.makeUnsafe();
        const stop = registry.subscribe(query, (value) => {
          if (AsyncResult.isSuccess(value) && value.value.root?.fileId === "chosen-root")
            updated.openUnsafe();
        });
        yield* Effect.addFinalizer(() => Effect.sync(stop));
        result = {
          root: {
            linkId: "wl_00000000-0000-0000-0000-000000000001",
            connectionId: "drv_00000000-0000-0000-0000-000000000001",
            fileId: "chosen-root",
          },
          state: "available",
        };
        yield* SubscriptionRef.set(counter, 1);
        yield* updated.await;
        const stillOther = registry.get(otherQuery);
        expect(AsyncResult.isSuccess(stillOther) && stillOther.value.root?.fileId).toBe(
          "other-root",
        );
      }),
    ),
);

it.effect("refreshes explicit file bindings after another device changes the environment", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const counter = yield* SubscriptionRef.make(0);
      let text = "before";
      const client = {
        [WS_METHODS.driveSubscribeChanges]: () =>
          SubscriptionRef.changes(counter).pipe(Stream.filter((count) => count > 0)),
        [WS_METHODS.driveGetBinding]: () =>
          Effect.sync(() => ({
            binding: {
              connectionId: "drv_00000000-0000-0000-0000-000000000001",
              file: {
                id: "file",
                name: text,
                mimeType: "text/plain",
                url: "https://drive.google.com/file/d/file/view",
              },
            },
          })),
      } as unknown as WsRpcProtocolClient;
      const { atoms, registry } = yield* makeTestRuntime(client);
      const message = atoms.binding({
        environmentId: TARGET.environmentId,
        input: { fileId: "file" },
      });
      const unmount = registry.mount(message);
      yield* Effect.addFinalizer(() => Effect.sync(unmount));
      const initial = yield* Effect.promise(() => executeAtomQuery(registry, message));
      expect(AsyncResult.isSuccess(initial) && initial.value.binding?.file.name).toBe("before");
      const refreshed = Latch.makeUnsafe();
      const stop = registry.subscribe(message, (result) => {
        if (AsyncResult.isSuccess(result) && result.value.binding?.file.name === "after")
          refreshed.openUnsafe();
      });
      yield* Effect.addFinalizer(() => Effect.sync(stop));
      text = "after";
      yield* SubscriptionRef.set(counter, 1);
      yield* refreshed.await;
    }),
  ),
);
