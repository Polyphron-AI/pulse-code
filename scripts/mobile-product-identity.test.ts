import { afterEach, expect, it, vi } from "vite-plus/test";
import { MOBILE_PRODUCT_IDENTITIES } from "../packages/shared/src/productIdentity";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it.each(["development", "preview", "production"] as const)(
  "composes the %s mobile identity into Expo configuration",
  async (variant) => {
    vi.stubEnv("APP_VARIANT", variant);
    vi.stubEnv("PULSE_CODE_IOS_PERSONAL_TEAM", "0");
    vi.stubEnv("T3CODE_IOS_PERSONAL_TEAM", "0");
    const { default: config } = await import("../apps/mobile/app.config");
    const expected = MOBILE_PRODUCT_IDENTITIES[variant];
    expect(config.name).toBe(expected.appName);
    expect(config.scheme).toEqual(expected.schemes);
    expect(config.ios?.bundleIdentifier).toBe(expected.iosBundleIdentifier);
    expect(config.android?.package).toBe(expected.androidPackage);
  },
);
