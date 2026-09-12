import type { ModelSelection, ServerProvider } from "@t3tools/contracts";

import { PROVIDER_DISPLAY_NAMES, ProviderDriverKind } from "@t3tools/contracts";

import type { ProviderGroup } from "./modelOptions";

/**
 * `"select"` picks the option for the current session as it always has.
 * `"switch"` means the option lives outside the thread's continuation group
 * (or the provider otherwise requires a new thread for a model change), so
 * choosing it must go through the handoff sheet instead of a plain draft
 * update.
 */
export type ThreadModelPickClassification = "select" | "switch";

export type ThreadModelSwitchProviderInfo = Pick<
  ServerProvider,
  "instanceId" | "continuation" | "requiresNewThreadForModelChange"
>;

function isSameModelSelection(a: ModelSelection, b: ModelSelection): boolean {
  return a.instanceId === b.instanceId && a.model === b.model;
}

/**
 * Classifies picking `candidate` while `current` is the thread's live model
 * selection. A thread with no started session can move freely (there is no
 * harness bound to it yet). Once a session exists, an in-place model change is
 * only safe within the same continuation group, and only when the provider
 * does not otherwise require a new thread for a model change; anything else
 * needs a handoff.
 */
export function classifyThreadModelPick(input: {
  readonly hasStartedSession: boolean;
  readonly current: ModelSelection;
  readonly candidate: ModelSelection;
  readonly providers: ReadonlyArray<ThreadModelSwitchProviderInfo>;
}): ThreadModelPickClassification {
  if (!input.hasStartedSession) {
    return "select";
  }
  if (isSameModelSelection(input.current, input.candidate)) {
    return "select";
  }

  const currentProvider = input.providers.find(
    (provider) => provider.instanceId === input.current.instanceId,
  );
  const candidateProvider = input.providers.find(
    (provider) => provider.instanceId === input.candidate.instanceId,
  );

  if (input.current.instanceId === input.candidate.instanceId) {
    return currentProvider?.requiresNewThreadForModelChange === true ? "switch" : "select";
  }

  const currentGroupKey = currentProvider?.continuation?.groupKey ?? null;
  const candidateGroupKey = candidateProvider?.continuation?.groupKey ?? null;
  const sameContinuationGroup =
    currentGroupKey !== null && candidateGroupKey !== null && currentGroupKey === candidateGroupKey;

  if (!sameContinuationGroup) {
    return "switch";
  }

  return candidateProvider?.requiresNewThreadForModelChange === true ? "switch" : "select";
}

/**
 * Which provider groups the composer's model picker should offer. Without
 * the handoff capability (or before a session exists), a started thread stays
 * pinned to its own provider instance, matching the harness it is bound to.
 * With the capability on, every enabled instance is offered once the thread
 * has a session: entries outside the continuation group are still listed, but
 * `classifyThreadModelPick` marks them as a switch rather than a plain pick.
 */
export function resolveComposerProviderGroups(input: {
  readonly capabilityEnabled: boolean;
  readonly hasStartedSession: boolean;
  readonly providerGroups: ReadonlyArray<ProviderGroup>;
  readonly currentInstanceId: string;
}): ReadonlyArray<ProviderGroup> {
  if (!input.hasStartedSession || input.capabilityEnabled) {
    return input.providerGroups;
  }
  return input.providerGroups.filter((group) => group.providerKey === input.currentInstanceId);
}

function providerLabel(
  provider: Pick<ServerProvider, "instanceId" | "driver" | "displayName"> | undefined,
  fallbackInstanceId: string,
): string {
  if (!provider) {
    return fallbackInstanceId;
  }
  if (provider.displayName) {
    return provider.displayName;
  }
  return PROVIDER_DISPLAY_NAMES[ProviderDriverKind.make(provider.driver)] ?? provider.instanceId;
}

/**
 * Human label for a model selection, "<provider> / <model>", resolved
 * against the providers list from the server config. Falls back to the raw
 * instance id or model slug when the provider or model can no longer be
 * found (for example an old handoff activity naming a provider that was
 * since disabled), since this is used to render history, not just live
 * pickers.
 */
export function resolveModelSelectionLabel(
  providers: ReadonlyArray<
    Pick<ServerProvider, "instanceId" | "driver" | "displayName" | "models">
  >,
  selection: ModelSelection | null,
): string {
  if (!selection) {
    return "none";
  }
  const provider = providers.find((candidate) => candidate.instanceId === selection.instanceId);
  const model = provider?.models.find((candidate) => candidate.slug === selection.model);
  const label = providerLabel(provider, selection.instanceId);
  return `${label} / ${model?.name ?? selection.model}`;
}
