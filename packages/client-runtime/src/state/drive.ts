import { WS_METHODS } from "@t3tools/contracts";
import type { Atom } from "effect/unstable/reactivity";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";
export function createDriveAtoms<R, E>(runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>) {
  const changes = createEnvironmentRpcSubscriptionAtomFamily(runtime, {
    label: "drive:changes",
    tag: WS_METHODS.driveSubscribeChanges,
  });
  const refreshTrigger = ({
    environmentId,
  }: {
    environmentId: import("@t3tools/contracts").EnvironmentId;
  }) => changes({ environmentId, input: {} });
  const scheduler = createAtomCommandScheduler();
  const concurrency = {
    mode: "serial",
    key: ({ environmentId }: { environmentId: string }) => environmentId,
  } as const;
  return {
    changes,
    connections: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "drive:connections",
      tag: WS_METHODS.driveListConnections,
      refreshTrigger,
      staleTimeMs: 30000,
    }),
    binding: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "drive:binding",
      tag: WS_METHODS.driveGetBinding,
      refreshTrigger,
      staleTimeMs: 30000,
    }),
    upsert: createEnvironmentRpcCommand(runtime, {
      label: "drive:upsert",
      tag: WS_METHODS.driveUpsertConnection,
      scheduler,
      concurrency,
    }),
    disconnect: createEnvironmentRpcCommand(runtime, {
      label: "drive:disconnect",
      tag: WS_METHODS.driveDisconnectConnection,
      scheduler,
      concurrency,
    }),
    remove: createEnvironmentRpcCommand(runtime, {
      label: "drive:remove",
      tag: WS_METHODS.driveRemoveConnection,
      scheduler,
      concurrency,
    }),
    startOAuth: createEnvironmentRpcCommand(runtime, {
      label: "drive:startOAuth",
      tag: WS_METHODS.driveStartOAuth,
      scheduler,
      concurrency,
    }),
    completeOAuth: createEnvironmentRpcCommand(runtime, {
      label: "drive:completeOAuth",
      tag: WS_METHODS.driveCompleteOAuth,
      scheduler,
      concurrency,
    }),
    cancelOAuth: createEnvironmentRpcCommand(runtime, {
      label: "drive:cancelOAuth",
      tag: WS_METHODS.driveCancelOAuth,
      scheduler,
      concurrency,
    }),
    search: createEnvironmentRpcCommand(runtime, {
      label: "drive:search",
      tag: WS_METHODS.driveSearch,
      scheduler,
      concurrency,
    }),
    bind: createEnvironmentRpcCommand(runtime, {
      label: "drive:bind",
      tag: WS_METHODS.driveBindFile,
      scheduler,
      concurrency,
    }),
    read: createEnvironmentRpcCommand(runtime, {
      label: "drive:read",
      tag: WS_METHODS.driveReadFile,
      scheduler,
      concurrency,
    }),
  };
}
