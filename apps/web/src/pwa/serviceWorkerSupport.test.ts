import { describe, expect, it } from "@effect/vitest";

import { DEV_PROXIED_PATH_PREFIXES } from "@t3tools/shared/devProxy";

import swSource from "../../public/sw.js?raw";
import {
  resolveServiceWorkerAction,
  serviceWorkerScriptUrl,
  type ServiceWorkerEnvironment,
} from "./serviceWorkerSupport";

const baseEnvironment: ServiceWorkerEnvironment = {
  hasServiceWorkerApi: true,
  isElectron: false,
  isDev: false,
  isSecureContext: true,
};

describe("resolveServiceWorkerAction", () => {
  it("registers in a secure production browser", () => {
    expect(resolveServiceWorkerAction(baseEnvironment)).toBe("register");
  });

  it("skips entirely when the browser has no service worker API", () => {
    expect(resolveServiceWorkerAction({ ...baseEnvironment, hasServiceWorkerApi: false })).toBe(
      "skip",
    );
  });

  it("skips an insecure origin instead of failing a registration", () => {
    expect(resolveServiceWorkerAction({ ...baseEnvironment, isSecureContext: false })).toBe("skip");
  });

  it("clears any leftover worker in the Electron renderer", () => {
    expect(resolveServiceWorkerAction({ ...baseEnvironment, isElectron: true })).toBe("unregister");
  });

  it("clears any leftover worker in dev, where Vite serves unbundled modules", () => {
    expect(resolveServiceWorkerAction({ ...baseEnvironment, isDev: true })).toBe("unregister");
  });

  it("prefers unregistering over skipping when both apply", () => {
    expect(
      resolveServiceWorkerAction({ ...baseEnvironment, isDev: true, isSecureContext: false }),
    ).toBe("unregister");
  });
});

describe("serviceWorkerScriptUrl", () => {
  it("carries the app version so a new build installs a new worker", () => {
    expect(serviceWorkerScriptUrl("0.0.33")).toBe("/sw.js?v=0.0.33");
  });

  it("encodes versions that contain URL-significant characters", () => {
    expect(serviceWorkerScriptUrl("1.0.0-nightly.20260823+1")).toBe(
      "/sw.js?v=1.0.0-nightly.20260823%2B1",
    );
  });
});

describe("sw.js", () => {
  it("bypasses every backend prefix the rest of the stack proxies", () => {
    const bypassed = swSource.match(/const BYPASS_PREFIXES = \[(.*?)\];/s);

    expect(bypassed).not.toBeNull();
    const listed = [...(bypassed?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    expect(listed).toEqual([...DEV_PROXIED_PATH_PREFIXES]);
  });
});
