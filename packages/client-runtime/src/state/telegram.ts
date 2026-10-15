import { WS_METHODS } from "@t3tools/contracts";
import type { Atom } from "effect/unstable/reactivity";
import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

export function createTelegramAtoms<R, E>(runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>) {
  const changes = createEnvironmentRpcSubscriptionAtomFamily(runtime, {
    label: "telegram:changes",
    tag: WS_METHODS.telegramSubscribeChanges,
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
      label: "telegram:connections",
      tag: WS_METHODS.telegramListConnections,
      refreshTrigger,
      staleTimeMs: 30_000,
    }),
    chats: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "telegram:chats",
      tag: WS_METHODS.telegramListChats,
      refreshTrigger,
      staleTimeMs: 30_000,
    }),
    messages: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "telegram:messages",
      tag: WS_METHODS.telegramListMessages,
      refreshTrigger,
      staleTimeMs: 30_000,
    }),
    message: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "telegram:message",
      tag: WS_METHODS.telegramReadMessage,
      refreshTrigger,
      staleTimeMs: 30_000,
    }),
    connect: createEnvironmentRpcCommand(runtime, {
      label: "telegram:connect",
      tag: WS_METHODS.telegramConnect,
      scheduler,
      concurrency,
    }),
    disconnect: createEnvironmentRpcCommand(runtime, {
      label: "telegram:disconnect",
      tag: WS_METHODS.telegramDisconnect,
      scheduler,
      concurrency,
    }),
    startPairing: createEnvironmentRpcCommand(runtime, {
      label: "telegram:pair",
      tag: WS_METHODS.telegramStartPairing,
      scheduler,
      concurrency,
    }),
    cancelPairing: createEnvironmentRpcCommand(runtime, {
      label: "telegram:cancel-pair",
      tag: WS_METHODS.telegramCancelPairing,
      scheduler,
      concurrency,
    }),
    removeChat: createEnvironmentRpcCommand(runtime, {
      label: "telegram:remove-chat",
      tag: WS_METHODS.telegramRemoveChat,
      scheduler,
      concurrency,
    }),
  };
}
