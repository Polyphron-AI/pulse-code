// Renders every Pulse raster slot from the committed SVG marks.
//
// This is the Pulse counterpart to `export-brand-icons.ts`, which drives Icon
// Composer's `ictool` and therefore only runs on a Mac with Icon Composer
// installed. Pulse's input is an SVG, so `sharp` renders it anywhere the repo
// installs, including the Windows hosts that build the Windows artifact.
//
// Run: `node scripts/generate-pulse-brand-icons.ts`
// Check without writing: `node scripts/generate-pulse-brand-icons.ts --check`

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import type { WebAssetBrand } from "./lib/brand-assets.ts";
import { encodePngIco, WINDOWS_ICON_SIZES, type PngIconImage } from "./lib/icon-export.ts";
import {
  PULSE_BRANDS,
  PULSE_PNG_SLOT_SIZES,
  resolvePulseBrandOutputs,
} from "./lib/pulse-brand-assets.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * `density` scales librsvg's rasterization grid. The marks are authored on a
 * 1024 viewBox, so rendering small sizes straight from the SVG at the default
 * 72dpi would quantize the geometry before the resize ever runs. Rendering at
 * the full 1024 and downsampling with a Lanczos kernel keeps the capsule edges
 * smooth at 16px.
 */
async function renderSquarePng(markSvg: Buffer, size: number): Promise<Buffer> {
  const base = sharp(markSvg, { density: 384 }).resize(1024, 1024, { fit: "fill" });
  if (size === 1024) {
    return await base.png({ compressionLevel: 9 }).toBuffer();
  }
  return await base
    .resize(size, size, { fit: "fill", kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function renderWindowsIco(markSvg: Buffer): Promise<Buffer> {
  const images: PngIconImage[] = [];
  for (const size of WINDOWS_ICON_SIZES) {
    images.push({ size, contents: await renderSquarePng(markSvg, size) });
  }
  return encodePngIco(images);
}

interface GeneratedFile {
  readonly relativePath: string;
  readonly contents: Buffer;
}

async function generateBrand(brand: WebAssetBrand): Promise<ReadonlyArray<GeneratedFile>> {
  const { markSvgPath, slots } = resolvePulseBrandOutputs(brand);
  const markSvg = await readFile(path.join(repoRoot, markSvgPath));

  const files: GeneratedFile[] = [];
  for (const [slot, size] of Object.entries(PULSE_PNG_SLOT_SIZES)) {
    files.push({
      relativePath: slots[slot as keyof typeof slots],
      contents: await renderSquarePng(markSvg, size),
    });
  }

  // The web favicon and the Windows icon are the same multi-resolution ICO;
  // browsers and Explorer both pick the rendition they want out of it.
  const ico = await renderWindowsIco(markSvg);
  files.push({ relativePath: slots.windowsIconIco, contents: ico });
  files.push({ relativePath: slots.webFaviconIco, contents: ico });
  return files;
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes("--check");
  const stale: string[] = [];

  for (const brand of PULSE_BRANDS) {
    const files = await generateBrand(brand);
    for (const file of files) {
      const absolutePath = path.join(repoRoot, file.relativePath);
      if (checkOnly) {
        const existing = await readFile(absolutePath).catch(() => undefined);
        if (!existing || !existing.equals(file.contents)) {
          stale.push(file.relativePath);
        }
        continue;
      }
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, file.contents);
      console.log(`[pulse-icons] wrote ${file.relativePath} (${file.contents.length} bytes)`);
    }
  }

  if (!checkOnly) {
    return;
  }
  if (stale.length > 0) {
    console.error(
      `[pulse-icons] ${stale.length} file(s) do not match the SVG sources:\n  ${stale.join("\n  ")}\n` +
        "Run `node scripts/generate-pulse-brand-icons.ts` and commit the result.",
    );
    process.exitCode = 1;
    return;
  }
  console.log("[pulse-icons] all generated icons match their SVG sources.");
}

await main();
