import type { ServerConfig } from "@t3tools/contracts";

import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  isProviderInstancePickerReady,
  sortProviderInstanceEntries,
  type ProviderInstanceEntry,
} from "../../providerInstances";

export function deriveDispatchReadyOmpEntries(
  config: Pick<ServerConfig, "providers" | "settings"> | null | undefined,
  isEnvironmentConnected: boolean,
): ReadonlyArray<ProviderInstanceEntry> {
  if (!config || !isEnvironmentConnected) return [];

  return sortProviderInstanceEntries(
    applyProviderInstanceSettings(deriveProviderInstanceEntries(config.providers), config.settings),
  ).filter(
    (entry) =>
      entry.driverKind === "omp" && isProviderInstancePickerReady(entry) && entry.models.length > 0,
  );
}
