import { describe, expect, it } from "vite-plus/test";

import * as ProductIdentity from "./productIdentity.ts";

const IDENTITY_VALUES = Object.values(ProductIdentity).filter(
  (value): value is string => typeof value === "string",
);

describe("product identity", () => {
  it("never reuses a T3 Code identity string", () => {
    // A Pulse Next installer that carried any of these would claim T3 Code's
    // install folder, URL scheme or roaming data on the same machine.
    expect(IDENTITY_VALUES.length).toBeGreaterThan(0);
    for (const value of IDENTITY_VALUES) {
      expect(value.toLowerCase()).not.toContain("t3code");
      expect(value.toLowerCase()).not.toContain("t3tools");
      expect(value).not.toContain("T3 Code");
      expect(value).not.toBe(".t3");
    }
  });

  it("selects development identities only in development", () => {
    expect(ProductIdentity.desktopAppId(false)).toBe("ai.polyphron.pulsenext");
    expect(ProductIdentity.desktopAppId(true)).toBe("ai.polyphron.pulsenext.dev");
    expect(ProductIdentity.desktopUrlScheme(false)).toBe("pulsenext");
    expect(ProductIdentity.desktopUrlScheme(true)).toBe("pulsenext-dev");
    expect(ProductIdentity.desktopExecutableName(false)).toBe("pulsenext");
    expect(ProductIdentity.desktopUserDataDirName(false)).toBe("pulsenext");
    expect(ProductIdentity.desktopUserDataDirName(true)).toBe("pulsenext-dev");
    expect(ProductIdentity.desktopLinuxDesktopEntryName(false)).toBe("pulsenext.desktop");
    expect(ProductIdentity.desktopLinuxDesktopEntryName(true)).toBe("pulsenext-dev.desktop");
  });

  it("keeps the production and development identities disjoint", () => {
    expect(ProductIdentity.desktopAppId(true)).not.toBe(ProductIdentity.desktopAppId(false));
    expect(ProductIdentity.desktopUserDataDirName(true)).not.toBe(
      ProductIdentity.desktopUserDataDirName(false),
    );
    expect(new Set(ProductIdentity.DESKTOP_URL_SCHEMES).size).toBe(
      ProductIdentity.DESKTOP_URL_SCHEMES.length,
    );
  });

  it("keeps electron-builder's placeholders literal in the artifact template", () => {
    expect(ProductIdentity.DESKTOP_ARTIFACT_NAME_TEMPLATE).toBe(
      "Pulse-Next-${version}-${arch}.${ext}",
    );
  });
});
