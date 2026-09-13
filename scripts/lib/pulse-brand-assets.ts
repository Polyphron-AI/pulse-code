// The Pulse-owned brand artwork seam.
//
// `brand-assets.ts` keeps describing T3's files, because `export-brand-icons.ts`
// writes into those paths from the T3 Icon Composer projects and must keep
// working untouched. This module names the Pulse files instead, so a consumer
// that should ship the Pulse mark switches by swapping one table reference
// rather than by editing a path in several places.
//
// Every file listed here is generated from the committed SVG sources by
// `scripts/generate-pulse-brand-icons.ts`. The SVG is the source of truth: to
// restyle Pulse Next, edit the SVG and re-run the generator. Nothing here is
// traced, and nothing requires macOS tooling.

import { WEB_ASSET_CHANNELS, type WebAssetBrand } from "./brand-assets.ts";

/** Channels that get their own mark. Mirrors `WebAssetBrand`. */
export const PULSE_BRANDS = ["development", "nightly", "production"] as const;

/** Hand-authored artwork, one per channel. The only artwork input Pulse has. */
export const PULSE_MARK_SVG_PATHS = {
  development: "assets/pulse/pulse-mark-development.svg",
  nightly: "assets/pulse/pulse-mark-nightly.svg",
  production: "assets/pulse/pulse-mark-production.svg",
} as const satisfies Record<WebAssetBrand, string>;

/**
 * Pulse rasters live under their own directory rather than beside the T3 files
 * in `assets/prod`, so an upstream commit that adds an asset can never collide
 * with one of ours.
 */
function pulseAssetDirectory(brand: WebAssetBrand): string {
  return `assets/pulse/${brand}`;
}

function pulseBrandSlots(brand: WebAssetBrand) {
  const directory = pulseAssetDirectory(brand);
  return {
    iosIconPng: `${directory}/pulse-ios-1024.png`,
    macIconPng: `${directory}/pulse-macos-1024.png`,
    linuxIconPng: `${directory}/pulse-universal-1024.png`,
    windowsIconIco: `${directory}/pulse-windows.ico`,
    webFaviconIco: `${directory}/pulse-web-favicon.ico`,
    webFavicon16Png: `${directory}/pulse-web-favicon-16x16.png`,
    webFavicon32Png: `${directory}/pulse-web-favicon-32x32.png`,
    webAppleTouchIconPng: `${directory}/pulse-web-apple-touch-180.png`,
  } as const;
}

export type PulseBrandSlots = ReturnType<typeof pulseBrandSlots>;

const WEB_ICON_TARGETS = {
  webFaviconIco: "favicon.ico",
  webFavicon16Png: "favicon-16x16.png",
  webFavicon32Png: "favicon-32x32.png",
  webAppleTouchIconPng: "apple-touch-icon.png",
} as const;

/**
 * Every Pulse raster slot, keyed the way `BRAND_ASSET_PATHS` keys its own, so a
 * consumer reads the same slot name whichever table it points at.
 *
 * There is deliberately no `iconComposerProject` slot: that is a macOS Icon
 * Composer bundle, and Pulse's equivalent input is the SVG above.
 */
export const PULSE_BRAND_ASSET_PATHS = {
  developmentIosIconPng: pulseBrandSlots("development").iosIconPng,
  developmentMacIconPng: pulseBrandSlots("development").macIconPng,
  developmentLinuxIconPng: pulseBrandSlots("development").linuxIconPng,
  developmentWindowsIconIco: pulseBrandSlots("development").windowsIconIco,
  developmentWebFaviconIco: pulseBrandSlots("development").webFaviconIco,
  developmentWebFavicon16Png: pulseBrandSlots("development").webFavicon16Png,
  developmentWebFavicon32Png: pulseBrandSlots("development").webFavicon32Png,
  developmentWebAppleTouchIconPng: pulseBrandSlots("development").webAppleTouchIconPng,

  nightlyIosIconPng: pulseBrandSlots("nightly").iosIconPng,
  nightlyMacIconPng: pulseBrandSlots("nightly").macIconPng,
  nightlyLinuxIconPng: pulseBrandSlots("nightly").linuxIconPng,
  nightlyWindowsIconIco: pulseBrandSlots("nightly").windowsIconIco,
  nightlyWebFaviconIco: pulseBrandSlots("nightly").webFaviconIco,
  nightlyWebFavicon16Png: pulseBrandSlots("nightly").webFavicon16Png,
  nightlyWebFavicon32Png: pulseBrandSlots("nightly").webFavicon32Png,
  nightlyWebAppleTouchIconPng: pulseBrandSlots("nightly").webAppleTouchIconPng,

  productionIosIconPng: pulseBrandSlots("production").iosIconPng,
  productionMacIconPng: pulseBrandSlots("production").macIconPng,
  productionLinuxIconPng: pulseBrandSlots("production").linuxIconPng,
  productionWindowsIconIco: pulseBrandSlots("production").windowsIconIco,
  productionWebFaviconIco: pulseBrandSlots("production").webFaviconIco,
  productionWebFavicon16Png: pulseBrandSlots("production").webFavicon16Png,
  productionWebFavicon32Png: pulseBrandSlots("production").webFavicon32Png,
  productionWebAppleTouchIconPng: pulseBrandSlots("production").webAppleTouchIconPng,
} as const;

/** Square PNG slots and the edge length each one must be rendered at. */
export const PULSE_PNG_SLOT_SIZES = {
  iosIconPng: 1024,
  macIconPng: 1024,
  linuxIconPng: 1024,
  webAppleTouchIconPng: 180,
  webFavicon32Png: 32,
  webFavicon16Png: 16,
} as const satisfies Partial<Record<keyof PulseBrandSlots, number>>;

/** Everything the generator writes for one channel, in one place. */
export function resolvePulseBrandOutputs(brand: WebAssetBrand) {
  return {
    markSvgPath: PULSE_MARK_SVG_PATHS[brand],
    slots: pulseBrandSlots(brand),
  };
}

/** Copies the Pulse web slots into the stable filenames referenced by index.html. */
export function resolvePulseWebIconOverrides(brand: WebAssetBrand, targetDirectory: string) {
  const slots = pulseBrandSlots(brand);
  return Object.entries(WEB_ICON_TARGETS).map(([slot, target]) => ({
    sourceRelativePath: slots[slot as keyof typeof WEB_ICON_TARGETS],
    targetRelativePath: `${targetDirectory}/${target}`,
  }));
}

// Re-exported so a caller iterating web channels does not have to import from
// both tables.
export { WEB_ASSET_CHANNELS };
