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
