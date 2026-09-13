import type { EnvironmentId } from "@t3tools/contracts";

export type DictationBackendPreference = "parakeet" | "groq";

export interface DictationPreferences {
  readonly backend: DictationBackendPreference;
  readonly groqEnvironmentId: EnvironmentId | null;
}

const STORAGE_KEY = "pulse:dictation-preferences:v1";
const DEFAULT_PREFERENCES: DictationPreferences = {
  backend: "parakeet",
  groqEnvironmentId: null,
};

let memoryPreferences = DEFAULT_PREFERENCES;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readDictationPreferences(): DictationPreferences {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) return memoryPreferences;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    memoryPreferences = {
      backend: value.backend === "groq" ? "groq" : "parakeet",
      groqEnvironmentId:
        typeof value.groqEnvironmentId === "string"
          ? (value.groqEnvironmentId as EnvironmentId)
          : null,
    };
  } catch {
    memoryPreferences = DEFAULT_PREFERENCES;
  }
  return memoryPreferences;
}

export function writeDictationPreferences(preferences: DictationPreferences): void {
  memoryPreferences = preferences;
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Browser privacy settings can disable storage. The preference still works for this session.
  }
}

export function resolveDictationBackend(
  environmentIds: ReadonlyArray<EnvironmentId>,
):
  | { readonly backend: "parakeet" }
  | { readonly backend: "groq"; readonly environmentId: EnvironmentId }
  | { readonly backend: "unavailable"; readonly reason: "groq-environment-unavailable" } {
  const preference = readDictationPreferences();
  if (preference.backend === "groq") {
    if (preference.groqEnvironmentId && environmentIds.includes(preference.groqEnvironmentId)) {
      return { backend: "groq", environmentId: preference.groqEnvironmentId };
    }
    return { backend: "unavailable", reason: "groq-environment-unavailable" };
  }
  return { backend: "parakeet" };
}

export function resetDictationPreferencesForTests(): void {
  memoryPreferences = DEFAULT_PREFERENCES;
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Test storage may deliberately throw.
  }
}
