import { describe, expect, it } from "vite-plus/test";
import { MOBILE_PRODUCT_IDENTITIES, PRODUCT_IDENTITY } from "./productIdentity.ts";

describe("product identity compatibility", () => {
  it("preserves published branding", () => {
    expect(PRODUCT_IDENTITY).toEqual({
      baseName: "Pulse Code",
      desktopPreviewBaseName: "Pulse",
      desktopPreviewDisplayName: "Pulse Preview",
    });
  });

  it.each([
    ["development", "Pulse Code Dev", "-dev", ".dev"],
    ["preview", "Pulse Code Preview", "-preview", ".preview"],
    ["production", "Pulse Code", "", ""],
  ] as const)(
    "preserves %s store IDs and both deep-link schemes",
    (variant, name, schemeSuffix, idSuffix) => {
      expect(MOBILE_PRODUCT_IDENTITIES[variant]).toEqual({
        appName: name,
        schemes: [`pulsecode${schemeSuffix}`, `t3code${schemeSuffix}`],
        iosBundleIdentifier: `com.t3tools.t3code${idSuffix}`,
        androidPackage: `com.t3tools.t3code${idSuffix}`,
        relyingParty: "clerk.t3.codes",
      });
    },
  );
});
