import { describe, expect, it } from "vite-plus/test";
import { ProviderDriverKind } from "@t3tools/contracts";
import { PROVIDER_ICON_BY_PROVIDER, PROVIDER_PRESENTATIONS } from "../providerPresentation";
import { PROVIDER_CLIENT_DEFINITIONS, getDriverOption } from "./providerDriverMeta";

describe("provider presentation composition", () => {
  it("preserves settings order and labels", () => {
    expect(PROVIDER_CLIENT_DEFINITIONS.map(({ value, label }) => [value, label])).toEqual([
      ["codex", "Codex"],
      ["claudeAgent", "Claude"],
      ["cursor", "Cursor"],
      ["grok", "Grok"],
      ["opencode", "OpenCode"],
      ["omp", "Oh My Pi"],
      ["antigravity", "Antigravity"],
    ]);
  });
  it("registers every presentation once with a schema and the same chat icon", () => {
    expect(new Set(PROVIDER_PRESENTATIONS.map(({ value }) => value)).size).toBe(
      PROVIDER_PRESENTATIONS.length,
    );
    for (const definition of PROVIDER_CLIENT_DEFINITIONS) {
      expect(definition.settingsSchema.fields).toBeDefined();
      expect(PROVIDER_ICON_BY_PROVIDER[definition.value]).toBe(definition.icon);
      expect(getDriverOption(definition.value)).toBe(definition);
    }
  });
  it("keeps unknown-driver fallback and preview badges", () => {
    expect(getDriverOption(undefined)).toBeUndefined();
    expect(getDriverOption(ProviderDriverKind.make("fork-driver"))).toBeUndefined();
    expect(
      PROVIDER_CLIENT_DEFINITIONS.filter((item) => item.badgeLabel).map((item) => item.value),
    ).toEqual(["cursor", "grok", "omp"]);
  });
});
