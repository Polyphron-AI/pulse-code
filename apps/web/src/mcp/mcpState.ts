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

export const discoverPulseMcp = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:discover",
  tag: WS_METHODS.pulseMcpDiscover,
  staleTimeMs: 0,
  idleTtlMs: 60_000,
});

export const importDiscoveredPulseMcp = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:import-discovered",
  tag: WS_METHODS.pulseMcpImportDiscovered,
});

export const pulseMcpNativeInventory = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:native-inventory",
  tag: WS_METHODS.pulseMcpNativeInventory,
  staleTimeMs: 5_000,
  idleTtlMs: 60_000,
});
export const setPulseMcpDiscoveryFollow = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:set-discovery-follow",
  tag: WS_METHODS.pulseMcpSetDiscoveryFollow,
});

export const pulseMcpProviderDefault = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:provider-default",
  tag: WS_METHODS.pulseMcpGetProviderDefault,
  staleTimeMs: 5_000,
  idleTtlMs: 60_000,
});

export const setPulseMcpProviderDefault = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:set-provider-default",
  tag: WS_METHODS.pulseMcpSetProviderDefault,
});

export const pulseMcpProjectDefault = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:project-default",
  tag: WS_METHODS.pulseMcpGetProjectDefault,
  staleTimeMs: 5_000,
  idleTtlMs: 60_000,
});

export const setPulseMcpProjectDefault = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:set-project-default",
  tag: WS_METHODS.pulseMcpSetProjectDefault,
});

export const resetPulseMcpProjectDefault = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-mcp:reset-project-default",
  tag: WS_METHODS.pulseMcpResetProjectDefault,
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
