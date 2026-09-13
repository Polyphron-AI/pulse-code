import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";

export const pulseMcpList = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:list",
  tag: WS_METHODS.pulseMcpList,
  staleTimeMs: 5_000,
  idleTtlMs: 60_000,
});

export const upsertPulseMcp = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:upsert",
  tag: WS_METHODS.pulseMcpUpsert,
});

export const removePulseMcp = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:remove",
  tag: WS_METHODS.pulseMcpRemove,
});

export const pulseMcpProviderDefault = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:provider-default",
  tag: WS_METHODS.pulseMcpGetProviderDefault,
  staleTimeMs: 5_000,
  idleTtlMs: 60_000,
});

export const pulseMcpThreadOverride = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:thread-override",
  tag: WS_METHODS.pulseMcpGetThreadOverride,
  staleTimeMs: 5_000,
  idleTtlMs: 60_000,
});

export const setPulseMcpThreadOverride = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:set-thread-override",
  tag: WS_METHODS.pulseMcpSetThreadOverride,
});

export const resetPulseMcpThreadOverride = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:reset-thread-override",
  tag: WS_METHODS.pulseMcpResetThreadOverride,
});

export const preparePulseMcpTurn = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:prepare-turn",
  tag: WS_METHODS.pulseMcpPrepareTurn,
});
