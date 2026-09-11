/** Product values shared by runtime branding and native build configuration. */
export const PRODUCT_IDENTITY = {
  baseName: "Pulse Code",
  desktopPreviewBaseName: "Pulse",
  desktopPreviewDisplayName: "Pulse Preview",
} as const;

export const DESKTOP_PRODUCT_IDENTITY = {
  appId: "ai.polyphron.pulsecode",
  developmentAppId: "ai.polyphron.pulsecode.dev",
  previewAppId: "ai.polyphron.pulse.preview",
  executableName: "pulsecode",
  dataDirectory: "pulsecode",
  developmentDataDirectory: "pulsecode-dev",
  previewDataDirectory: "pulse-preview",
  previewHomeDirectory: ".pulse-preview",
  protocolSchemes: ["pulsecode", "pulsecode-dev"],
  artifactName: "Pulse-Code-${version}-${arch}.${ext}",
  previewArtifactName: "Pulse-Preview-${version}-${arch}.${ext}",
} as const;

export function isPulsePreviewVersion(version: string) {
  return version.includes("-pulse-preview.");
}

export function resolveProductUpdateChannel(version: string): "latest" | "nightly" {
  return /-nightly\.\d{8}\.\d+$/.test(version) ? "nightly" : "latest";
}

export function resolveDesktopReleaseIdentity(
  version: string,
  productName: string = PRODUCT_IDENTITY.baseName,
) {
  const preview = isPulsePreviewVersion(version);
  return {
    appId: preview ? DESKTOP_PRODUCT_IDENTITY.previewAppId : DESKTOP_PRODUCT_IDENTITY.appId,
    artifactName: preview
      ? DESKTOP_PRODUCT_IDENTITY.previewArtifactName
      : DESKTOP_PRODUCT_IDENTITY.artifactName,
    productName: preview
      ? PRODUCT_IDENTITY.desktopPreviewDisplayName
      : resolveProductUpdateChannel(version) === "nightly"
        ? `${PRODUCT_IDENTITY.baseName} (Nightly)`
        : productName,
  };
}

// Existing store IDs and legacy deep links are compatibility contracts, not branding.
export const MOBILE_PRODUCT_IDENTITIES = {
  development: {
    appName: "Pulse Code Dev",
    schemes: ["pulsecode-dev", "t3code-dev"],
    iosBundleIdentifier: "com.t3tools.t3code.dev",
    androidPackage: "com.t3tools.t3code.dev",
    relyingParty: "clerk.t3.codes",
  },
  preview: {
    appName: "Pulse Code Preview",
    schemes: ["pulsecode-preview", "t3code-preview"],
    iosBundleIdentifier: "com.t3tools.t3code.preview",
    androidPackage: "com.t3tools.t3code.preview",
    relyingParty: "clerk.t3.codes",
  },
  production: {
    appName: PRODUCT_IDENTITY.baseName,
    schemes: ["pulsecode", "t3code"],
    iosBundleIdentifier: "com.t3tools.t3code",
    androidPackage: "com.t3tools.t3code",
    relyingParty: "clerk.t3.codes",
  },
} as const;
