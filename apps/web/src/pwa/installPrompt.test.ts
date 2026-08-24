import { describe, expect, it } from "@effect/vitest";

import { resolveInstallAvailability, supportsManualHomeScreenInstall } from "./installPrompt";

const base = {
  isElectron: false,
  isStandalone: false,
  isSecureContext: true,
  hasDeferredPrompt: false,
  supportsManualInstall: false,
};

describe("resolveInstallAvailability", () => {
  it("never offers install inside the desktop shell", () => {
    expect(resolveInstallAvailability({ ...base, isElectron: true })).toBe("unsupported");
    expect(resolveInstallAvailability({ ...base, isElectron: true, hasDeferredPrompt: true })).toBe(
      "unsupported",
    );
  });

  it("reports an already-installed app before offering to install it", () => {
    expect(
      resolveInstallAvailability({ ...base, isStandalone: true, hasDeferredPrompt: true }),
    ).toBe("installed");
  });

  it("prefers a replayable prompt over manual instructions", () => {
    expect(
      resolveInstallAvailability({
        ...base,
        hasDeferredPrompt: true,
        supportsManualInstall: true,
      }),
    ).toBe("prompt");
  });

  it("falls back to manual instructions, then to nothing", () => {
    expect(resolveInstallAvailability({ ...base, supportsManualInstall: true })).toBe("manual");
    expect(resolveInstallAvailability(base)).toBe("unsupported");
  });

  it("does not recommend Add to Home Screen on an insecure origin", () => {
    expect(
      resolveInstallAvailability({
        ...base,
        supportsManualInstall: true,
        isSecureContext: false,
      }),
    ).toBe("unsupported");
  });
});

describe("supportsManualHomeScreenInstall", () => {
  it("detects iPhone and iPad", () => {
    expect(
      supportsManualHomeScreenInstall({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
  });

  it("treats a touch-capable Macintosh user agent as iPadOS", () => {
    const userAgent =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15";
    expect(supportsManualHomeScreenInstall({ userAgent, maxTouchPoints: 5 })).toBe(true);
    expect(supportsManualHomeScreenInstall({ userAgent, maxTouchPoints: 0 })).toBe(false);
  });

  it("leaves Chromium desktop and Android to the deferred prompt", () => {
    expect(
      supportsManualHomeScreenInstall({
        userAgent:
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
        maxTouchPoints: 5,
      }),
    ).toBe(false);
    expect(
      supportsManualHomeScreenInstall({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        maxTouchPoints: 0,
      }),
    ).toBe(false);
  });
});
