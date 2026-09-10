import { afterEach, describe, expect, it, vi } from "vite-plus/test";
const environment = vi.hoisted(() => ({ current: {} as Record<string, string> }));
vi.mock("../../scripts/lib/public-config.ts", () => ({ loadRepoEnv: () => environment.current }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe("mobile Keychain access groups", () => {
  it.each(["development", "preview", "production"])(
    "matches the generated %s bundle identifier",
    async (variant) => {
      vi.stubEnv("APP_VARIANT", variant);
      environment.current = { APP_VARIANT: variant };
      vi.resetModules();
      const { default: config } = await import("./app.config");
      expect(config.ios?.entitlements?.["keychain-access-groups"]).toEqual([
        `$(AppIdentifierPrefix)${config.ios?.bundleIdentifier}`,
      ]);
      expect(config.ios?.bundleIdentifier).toBeTruthy();
    },
  );
  it("uses the resolved personal-team bundle identifier", async () => {
    vi.stubEnv("PULSE_CODE_IOS_PERSONAL_TEAM", "1");
    vi.stubEnv("PULSE_CODE_IOS_PERSONAL_TEAM_BUNDLE_ID", "com.example.pulse.test");
    vi.stubEnv("APP_VARIANT", "development");
    environment.current = {
      APP_VARIANT: "development",
      PULSE_CODE_IOS_PERSONAL_TEAM: "1",
      PULSE_CODE_IOS_PERSONAL_TEAM_BUNDLE_ID: "com.example.pulse.test",
    };
    vi.resetModules();
    const { default: config } = await import("./app.config");
    expect(config.ios?.bundleIdentifier).toBe("com.example.pulse.test");
    expect(config.ios?.entitlements?.["keychain-access-groups"]).toEqual([
      "$(AppIdentifierPrefix)com.example.pulse.test",
    ]);
  });
});
