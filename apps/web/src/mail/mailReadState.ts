import { createEnvironmentRpcQueryAtomFamily } from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";

export const pulseMailFolders = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:pulse-mail:folders",
  tag: WS_METHODS.pulseMailListFolders,
  staleTimeMs: 60_000,
  idleTtlMs: 300_000,
});

/** One page of a folder or search. Each cursor is its own atom, so earlier pages stay cached. */
export const pulseMailMessages = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:pulse-mail:messages",
  tag: WS_METHODS.pulseMailListMessages,
  staleTimeMs: 30_000,
  idleTtlMs: 60_000,
});

/** One message, or one later chunk of its body when `offset` is set. */
export const pulseMailMessage = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:pulse-mail:message",
  tag: WS_METHODS.pulseMailReadMessage,
  staleTimeMs: 60_000,
  idleTtlMs: 60_000,
});

export const pulseMailConversations = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:pulse-mail:conversations",
  tag: WS_METHODS.pulseMailListConversations,
  staleTimeMs: 30_000,
  idleTtlMs: 60_000,
});
