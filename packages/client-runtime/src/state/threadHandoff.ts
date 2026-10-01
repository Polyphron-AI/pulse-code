/**
 * Shared shape of a provider handoff, the "continue this thread somewhere
 * else" flow. Web and mobile both need the target list; the rest of the
 * flow (summarize, open a draft, seed it) stays per-client because each
 * surface opens new threads its own way.
 */
import type { ModelSelection, ProviderInstanceId, ServerProvider } from "@t3tools/contracts";

import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  isProviderInstancePickerReady,
  isProviderInstancePickerVisible,
  sortProviderInstanceEntries,
} from "./providerInstances.ts";

export interface ThreadHandoffTarget {
  readonly instanceId: ProviderInstanceId;
  readonly label: string;
  /** The instance cannot start right now, so the menu shows it greyed out. */
  readonly disabled: boolean;
}

/**
 * The provider instances a thread can be handed off to: everything the model
 * picker would show for that environment. Callers drop the thread's own
 * instance, which they know from the thread snapshot they are acting on.
 */
export function buildThreadHandoffTargets(
  providers: ReadonlyArray<ServerProvider>,
  settings: Parameters<typeof applyProviderInstanceSettings>[1],
): ReadonlyArray<ThreadHandoffTarget> {
  return sortProviderInstanceEntries(
    applyProviderInstanceSettings(deriveProviderInstanceEntries(providers), settings),
  )
    .filter(isProviderInstancePickerVisible)
    .map((entry) => ({
      instanceId: entry.instanceId,
      label: entry.displayName,
      disabled: !isProviderInstancePickerReady(entry),
    }));
}

/** A started session can only continue on compatible harnesses and model-change capabilities. */
export function threadModelSelectionNeedsSummary(input: {
  providers: ReadonlyArray<ServerProvider>;
  currentModelSelection: ModelSelection;
  currentProviderInstanceId?: ProviderInstanceId | null;
  nextModelSelection: ModelSelection;
  hasStartedSession: boolean;
}): boolean {
  if (!input.hasStartedSession) return false;
  const currentId = input.currentProviderInstanceId ?? input.currentModelSelection.instanceId;
  if (
    currentId === input.nextModelSelection.instanceId &&
    input.currentModelSelection.model === input.nextModelSelection.model
  )
    return false;
  const source = input.providers.find((provider) => provider.instanceId === currentId);
  const destination = input.providers.find(
    (provider) => provider.instanceId === input.nextModelSelection.instanceId,
  );
  if (!source || !destination) return true;
  return (
    source.driver !== destination.driver ||
    Boolean(
      source.continuation?.groupKey &&
      destination.continuation?.groupKey &&
      source.continuation.groupKey !== destination.continuation.groupKey,
    ) ||
    source.requiresNewThreadForModelChange === true ||
    destination.requiresNewThreadForModelChange === true
  );
}
