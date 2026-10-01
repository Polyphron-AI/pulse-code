import { type EnvironmentId, WS_METHODS } from "@t3tools/contracts";
import type { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

/**
 * Meeting reads and commands for one client runtime. The server publishes a bare revision on
 * every meeting change, so reads refetch from it instead of receiving transcripts over the stream.
 */
export function createMeetingEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const revisions = createEnvironmentRpcSubscriptionAtomFamily(runtime, {
    label: "environment-data:pulse-meetings:revisions",
    tag: WS_METHODS.pulseMeetingsRevisions,
  });
  const refreshTrigger = ({ environmentId }: { readonly environmentId: EnvironmentId }) =>
    revisions({ environmentId, input: {} });
  return {
    revisions,
    list: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:pulse-meetings:list",
      tag: WS_METHODS.pulseMeetingsList,
      staleTimeMs: 30_000,
      idleTtlMs: 60_000,
      refreshTrigger,
    }),
    detail: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:pulse-meetings:detail",
      tag: WS_METHODS.pulseMeetingsGet,
      staleTimeMs: 30_000,
      idleTtlMs: 60_000,
      refreshTrigger,
    }),
    create: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:pulse-meetings:create",
      tag: WS_METHODS.pulseMeetingsCreate,
    }),
    appendSegments: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:pulse-meetings:append-segments",
      tag: WS_METHODS.pulseMeetingsAppendSegments,
    }),
    finish: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:pulse-meetings:finish",
      tag: WS_METHODS.pulseMeetingsFinish,
    }),
    summarize: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:pulse-meetings:summarize",
      tag: WS_METHODS.pulseMeetingsSummarize,
    }),
    rename: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:pulse-meetings:rename",
      tag: WS_METHODS.pulseMeetingsRename,
    }),
    delete: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:pulse-meetings:delete",
      tag: WS_METHODS.pulseMeetingsDelete,
    }),
  };
}
