import { describe, expect, it } from "vite-plus/test";
import {
  MOBILE_PRODUCT_IDENTITIES,
  PRODUCT_IDENTITY,
  DESKTOP_PRODUCT_IDENTITY,
  isPulsePreviewVersion,
  resolveDesktopReleaseIdentity,
  resolveProductUpdateChannel,
} from "./productIdentity.ts";

describe("product identity compatibility", () => {
  it.each([
    "0.0.38",
    "0.0.38-alpha.1",
    "0.0.33-pulse-preview.20260911.1",
    "0.0.38-nightly.20260911.1",
    "0.0.38-nightly.invalid",
  ])("retains release behavior for %s", (version) => {
    const preview = version.includes("-pulse-preview.");
    const nightly = /-nightly\.\d{8}\.\d+$/.test(version);
    expect(isPulsePreviewVersion(version)).toBe(preview);
    expect(resolveProductUpdateChannel(version)).toBe(nightly ? "nightly" : "latest");
    expect(resolveDesktopReleaseIdentity(version, "Custom")).toEqual({
      appId: preview ? "ai.polyphron.pulse.preview" : "ai.polyphron.pulsecode",
      artifactName: preview
        ? "Pulse-Preview-${version}-${arch}.${ext}"
        : "Pulse-Code-${version}-${arch}.${ext}",
      productName: preview ? "Pulse Preview" : nightly ? "Pulse Code (Nightly)" : "Custom",
    });
  });
  it("retains preview storage isolation and protocol aliases", () => {
    expect(DESKTOP_PRODUCT_IDENTITY.previewHomeDirectory).toBe(".pulse-preview");
    expect(DESKTOP_PRODUCT_IDENTITY.previewDataDirectory).toBe("pulse-preview");
    expect(DESKTOP_PRODUCT_IDENTITY.protocolSchemes).toEqual(["pulsecode", "pulsecode-dev"]);
  });
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
