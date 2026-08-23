import { describe, expect, it } from "@effect/vitest";

import {
  buildWebAppManifest,
  resolveManifestStageLabel,
  serializeWebAppManifest,
} from "./webAppManifest";

describe("resolveManifestStageLabel", () => {
  it("names the nightly channel", () => {
    expect(resolveManifestStageLabel({ hostedAppChannel: "nightly", isDev: false })).toBe(
      "Nightly",
    );
  });

  it("names the latest channel, which formats away to the bare brand", () => {
    expect(resolveManifestStageLabel({ hostedAppChannel: "latest", isDev: false })).toBe("Latest");
    expect(buildWebAppManifest({ baseName: "Pulse Code", stageLabel: "Latest" }).name).toBe(
      "Pulse Code",
    );
  });

  it("falls back to the build mode when no channel is configured", () => {
    expect(resolveManifestStageLabel({ hostedAppChannel: undefined, isDev: true })).toBe("Dev");
    expect(resolveManifestStageLabel({ hostedAppChannel: "  ", isDev: false })).toBe("Alpha");
  });
});

describe("buildWebAppManifest", () => {
  const manifest = buildWebAppManifest({ baseName: "Pulse Code", stageLabel: "Nightly" });

  it("shows the stage in the install dialog but keeps the home-screen label short", () => {
    expect(manifest.name).toBe("Pulse Code (Nightly)");
    expect(manifest.short_name).toBe("Pulse Code");
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  it("installs at the app root so every route stays in scope", () => {
    expect(manifest.id).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.start_url).toBe("/");
  });

  it("ships an icon large enough for Android to offer an install", () => {
    const installable = manifest.icons.filter(
      (icon) => icon.sizes === "any" || Number.parseInt(icon.sizes, 10) >= 192,
    );
    expect(installable.length).toBeGreaterThan(0);
  });

  it("ships exactly one maskable icon", () => {
    expect(manifest.icons.filter((icon) => icon.purpose === "maskable")).toHaveLength(1);
  });

  it("points every shortcut at a route the app actually serves", () => {
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual([
      "/",
      "/issues",
      "/pull-requests",
      "/settings/general",
    ]);
  });
});

describe("serializeWebAppManifest", () => {
  it("emits parseable JSON with a trailing newline", () => {
    const serialized = serializeWebAppManifest({ baseName: "Pulse Code", stageLabel: "Alpha" });
    expect(serialized.endsWith("\n")).toBe(true);
    expect(JSON.parse(serialized).name).toBe("Pulse Code (Alpha)");
  });
});
