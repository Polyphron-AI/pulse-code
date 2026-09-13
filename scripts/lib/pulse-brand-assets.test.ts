import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vite-plus/test";

import { readPngDimensions, WINDOWS_ICON_SIZES } from "./icon-export.ts";
import {
  PULSE_BRANDS,
  PULSE_BRAND_ASSET_PATHS,
  PULSE_PNG_SLOT_SIZES,
  resolvePulseBrandOutputs,
  resolvePulseWebIconOverrides,
} from "./pulse-brand-assets.ts";

function readIcoRenditions(contents: Buffer) {
  const count = contents.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 16;
    const declared = contents.readUInt8(offset) || 256;
    const length = contents.readUInt32LE(offset + 8);
    const imageOffset = contents.readUInt32LE(offset + 12);
    const png = contents.subarray(imageOffset, imageOffset + length);
    return { declared, ...readPngDimensions(png) };
  });
}

describe("pulse-brand-assets", () => {
  it("maps every web slot to the filenames shipped by hosted and desktop builds", () => {
    for (const brand of PULSE_BRANDS) {
      expect(resolvePulseWebIconOverrides(brand, "dist/client")).toEqual([
        {
          sourceRelativePath: PULSE_BRAND_ASSET_PATHS[`${brand}WebFaviconIco`],
          targetRelativePath: "dist/client/favicon.ico",
        },
        {
          sourceRelativePath: PULSE_BRAND_ASSET_PATHS[`${brand}WebFavicon16Png`],
          targetRelativePath: "dist/client/favicon-16x16.png",
        },
        {
          sourceRelativePath: PULSE_BRAND_ASSET_PATHS[`${brand}WebFavicon32Png`],
          targetRelativePath: "dist/client/favicon-32x32.png",
        },
        {
          sourceRelativePath: PULSE_BRAND_ASSET_PATHS[`${brand}WebAppleTouchIconPng`],
          targetRelativePath: "dist/client/apple-touch-icon.png",
        },
      ]);
    }
  });

  it("commits every generated PNG at its declared dimensions", async () => {
    for (const brand of PULSE_BRANDS) {
      const { slots } = resolvePulseBrandOutputs(brand);
      for (const [slot, size] of Object.entries(PULSE_PNG_SLOT_SIZES)) {
        expect(readPngDimensions(await readFile(slots[slot as keyof typeof slots]))).toEqual({
          width: size,
          height: size,
        });
      }
    }
  });

  it("commits Windows icons with a correctly sized PNG rendition per ICO slot", async () => {
    for (const brand of PULSE_BRANDS) {
      const { slots } = resolvePulseBrandOutputs(brand);
      const renditions = readIcoRenditions(await readFile(slots.windowsIconIco));
      expect(renditions).toEqual(
        WINDOWS_ICON_SIZES.map((size) => ({ declared: size, width: size, height: size })),
      );
      expect(await readFile(slots.webFaviconIco)).toEqual(await readFile(slots.windowsIconIco));
    }
  });
});
