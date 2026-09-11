/** Product values shared by runtime branding and native build configuration. */
export const PRODUCT_IDENTITY = {
  baseName: "Pulse Code",
  desktopPreviewBaseName: "Pulse",
  desktopPreviewDisplayName: "Pulse Preview",
} as const;

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
