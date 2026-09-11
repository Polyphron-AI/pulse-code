import { afterEach, expect, it, vi } from "vite-plus/test";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it.each([
  ["development", "Pulse Code Dev", "-dev", ".dev"],
  ["preview", "Pulse Code Preview", "-preview", ".preview"],
  ["production", "Pulse Code", "", ""],
] as const)(
  "composes the %s mobile identity into Expo configuration",
  async (variant, name, schemeSuffix, idSuffix) => {
    vi.stubEnv("APP_VARIANT", variant);
    vi.stubEnv("PULSE_CODE_IOS_PERSONAL_TEAM", "0");
    vi.stubEnv("T3CODE_IOS_PERSONAL_TEAM", "0");
    // Expo config uses bundler module semantics, not this scripts project's NodeNext mode.
    const { default: config } = await vi.importActual<{
      default: {
        name: string;
        scheme: readonly string[];
        ios?: { bundleIdentifier?: string };
        android?: { package?: string };
      };
    }>("../apps/mobile/app.config.ts");
    expect(config.name).toBe(name);
    expect(config.scheme).toEqual([`pulsecode${schemeSuffix}`, `t3code${schemeSuffix}`]);
    expect(config.ios?.bundleIdentifier).toBe(`com.t3tools.t3code${idSuffix}`);
    expect(config.android?.package).toBe(`com.t3tools.t3code${idSuffix}`);
  },
);
