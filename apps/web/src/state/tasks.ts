import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";
import { connectionAtomRuntime } from "../connection/runtime";

export const tasksSubscription = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  label: "environment-data:tasks",
  tag: WS_METHODS.tasksSubscribe,
  idleTtlMs: 0,
});
export const mutateTask = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:tasks:mutate",
  tag: WS_METHODS.tasksMutate,
});
