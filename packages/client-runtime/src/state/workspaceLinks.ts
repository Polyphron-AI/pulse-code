import { WS_METHODS } from "@t3tools/contracts";
import type { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

/**
 * Link lists for one environment. Every open list refetches when the environment's
 * change counter ticks, so a link made on another device shows up without a reload.
 */
export function createWorkspaceLinkAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const changes = createEnvironmentRpcSubscriptionAtomFamily(runtime, {
    label: "environment-data:workspace-links:changes",
    tag: WS_METHODS.pulseLinksSubscribeChanges,
  });
  const scheduler = createAtomCommandScheduler();
  const serialPerEnvironment = {
    mode: "serial",
    key: ({ environmentId }: { readonly environmentId: string }) => environmentId,
  } as const;
  return {
    suggestions: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "workspace-links:suggestions",
      tag: WS_METHODS.pulseLinksSuggest,
      staleTimeMs: 0,
      idleTtlMs: 0,
    }),
    refreshSuggestions: createEnvironmentRpcCommand(runtime, {
      label: "workspace-links:refresh-suggestions",
      tag: WS_METHODS.pulseLinksSuggest,
      scheduler,
      concurrency: serialPerEnvironment,
    }),
    acceptSuggestion: createEnvironmentRpcCommand(runtime, {
      label: "workspace-links:accept-suggestion",
      tag: WS_METHODS.pulseLinksAcceptSuggestion,
      scheduler,
      concurrency: serialPerEnvironment,
    }),
    dismissSuggestion: createEnvironmentRpcCommand(runtime, {
      label: "workspace-links:dismiss-suggestion",
      tag: WS_METHODS.pulseLinksDismissSuggestion,
      scheduler,
      concurrency: serialPerEnvironment,
    }),
    changes,
    projectHub: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:workspace-links:project-hub",
      tag: WS_METHODS.pulseLinksProjectHub,
      staleTimeMs: 30_000,
      idleTtlMs: 60_000,
      refreshTrigger: ({ environmentId }) => changes({ environmentId, input: {} }),
    }),
    listMany: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:workspace-links:list-many",
      tag: WS_METHODS.pulseLinksListMany,
      staleTimeMs: 30_000,
      idleTtlMs: 60_000,
      refreshTrigger: ({ environmentId }) => changes({ environmentId, input: {} }),
    }),
    list: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:workspace-links:list",
      tag: WS_METHODS.pulseLinksList,
      staleTimeMs: 30_000,
      idleTtlMs: 60_000,
      refreshTrigger: ({ environmentId }) => changes({ environmentId, input: {} }),
    }),
    link: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:workspace-links:link",
      tag: WS_METHODS.pulseLinksLink,
      scheduler,
      concurrency: serialPerEnvironment,
    }),
    unlink: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:workspace-links:unlink",
      tag: WS_METHODS.pulseLinksUnlink,
      scheduler,
      concurrency: serialPerEnvironment,
    }),
  };
}
