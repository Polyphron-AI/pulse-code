import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { ProviderAuthCompleteInput, ProviderInstallState } from "./providerSetup.ts";
import { AntigravitySettings, ServerSettings, ServerSettingsPatch } from "./settings.ts";

describe("Antigravity setup compatibility", () => {
  it("defaults to disabled without changing OMP", () => {
    const settings = Schema.decodeUnknownSync(ServerSettings)({});
    expect(settings.providers.antigravity.enabled).toBe(false);
    expect(settings.providers.omp.enabled).toBe(true);
    expect(settings.providers.antigravity.authMethod).toBe("oauth-personal");
  });

  it.each(["oauth-personal", "oauth-business", "gemini-api-key", "agent-platform"])(
    "accepts the %s authentication method",
    (authMethod) => {
      expect(Schema.decodeUnknownSync(AntigravitySettings)({ authMethod }).authMethod).toBe(
        authMethod,
      );
      expect(
        Schema.decodeUnknownSync(ServerSettingsPatch)({
          providers: { antigravity: { authMethod } },
        }).providers?.antigravity?.authMethod,
      ).toBe(authMethod);
    },
  );

  it("retains Pulse custom model objects alongside legacy slugs", () => {
    const customModels = ["legacy-model", { slug: "custom-model", name: "Custom" }];
    expect(Schema.decodeUnknownSync(AntigravitySettings)({ customModels }).customModels).toEqual(
      customModels,
    );
  });

  it("bounds callback input and rejects negative download progress", () => {
    expect(() =>
      Schema.decodeUnknownSync(ProviderAuthCompleteInput)({
        instanceId: "antigravity",
        flowId: "flow",
        callbackUrl: "x".repeat(16385),
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(ProviderInstallState)({
        driver: "antigravity",
        operationId: null,
        phase: "downloading",
        downloadedBytes: -1,
        totalBytes: null,
        version: null,
        installedVersion: null,
        canRemove: false,
        message: null,
      }),
    ).toThrow();
  });
});
