import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";

import { connectionAtomRuntime } from "../connection/runtime";

export const managedSkillsList = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "environment-data:pulse-skills:list",
  tag: WS_METHODS.pulseSkillsList,
  staleTimeMs: 5_000,
  idleTtlMs: 60_000,
});

export const mutateManagedSkill = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:pulse-skills:mutate",
  tag: WS_METHODS.pulseSkillsMutate,
});
