import { EnvironmentId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  readDictationPreferences,
  resetDictationPreferencesForTests,
  resolveDictationBackend,
  writeDictationPreferences,
} from "./dictationPreferences";

const localStorage = (() => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
})();

beforeEach(() => {
  vi.stubGlobal("window", { localStorage });
  resetDictationPreferencesForTests();
});

describe("dictation preferences", () => {
  it("keeps session preferences when browser storage reads are denied", () => {
    writeDictationPreferences({
      enabled: true,
      backend: "groq",
      groqEnvironmentId: EnvironmentId.make("office"),
    });
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("Storage denied");
        },
      },
    });
    expect(resolveDictationBackend([EnvironmentId.make("office")])).toEqual({
      backend: "groq",
      environmentId: "office",
    });
  });
  it("persists only the backend and selected Groq environment", () => {
    writeDictationPreferences({
      enabled: true,
      backend: "groq",
      groqEnvironmentId: EnvironmentId.make("office"),
    });
    expect(readDictationPreferences()).toEqual({
      enabled: true,
      backend: "groq",
      groqEnvironmentId: "office",
    });
    expect(localStorage.getItem("pulse:dictation-preferences:v1")).not.toContain("apiKey");
  });

  it("never reroutes Groq when its selected environment is unavailable", () => {
    writeDictationPreferences({
      enabled: true,
      backend: "groq",
      groqEnvironmentId: EnvironmentId.make("office"),
    });
    expect(resolveDictationBackend([EnvironmentId.make("personal")])).toEqual({
      backend: "unavailable",
      reason: "groq-environment-unavailable",
    });
  });

  it("returns the selected backend as an immutable recording-start snapshot", () => {
    const office = EnvironmentId.make("office");
    writeDictationPreferences({ enabled: true, backend: "groq", groqEnvironmentId: office });
    const snapshot = resolveDictationBackend([office]);
    writeDictationPreferences({ enabled: true, backend: "parakeet", groqEnvironmentId: office });
    expect(snapshot).toEqual({ backend: "groq", environmentId: office });
  });

  it("disables dictation without changing the selected backend", () => {
    writeDictationPreferences({ enabled: false, backend: "parakeet", groqEnvironmentId: null });
    expect(resolveDictationBackend([])).toEqual({
      backend: "unavailable",
      reason: "dictation-disabled",
    });
  });
});
