import { describe, expect, it, vi } from "vite-plus/test";

import {
  openWorkspaceFileWith,
  sanitizeWorkspaceFileName,
  type OpenWorkspaceFileWithDependencies,
  type WorkspaceFileCacheTarget,
} from "./openWorkspaceFileWith";

function createHarness(
  overrides: {
    readonly available?: boolean;
    readonly downloadFailure?: Error;
    readonly shareFailure?: Error;
  } = {},
) {
  const download = vi.fn(async () => {
    if (overrides.downloadFailure) {
      throw overrides.downloadFailure;
    }
  });
  const remove = vi.fn();
  const target: WorkspaceFileCacheTarget = {
    uri: "file:///cache/report.pdf",
    download,
    remove,
  };
  const createCacheTarget = vi.fn(async () => target);
  const share = vi.fn(async () => {
    if (overrides.shareFailure) {
      throw overrides.shareFailure;
    }
  });
  const dependencies: OpenWorkspaceFileWithDependencies = {
    createCacheTarget,
    isSharingAvailable: vi.fn(async () => overrides.available ?? true),
    share,
  };
  return { createCacheTarget, dependencies, download, remove, share };
}

describe("sanitizeWorkspaceFileName", () => {
  it("preserves the basename and extension while replacing unsafe characters", () => {
    expect(sanitizeWorkspaceFileName("reports/quarter:final?.pdf")).toBe("quarter_final_.pdf");
    expect(sanitizeWorkspaceFileName("C:\\repo\\output\\report.xlsx")).toBe("report.xlsx");
  });

  it("provides a fallback and bounds long names without losing a short extension", () => {
    expect(sanitizeWorkspaceFileName("..")).toBe("workspace-file");
    const result = sanitizeWorkspaceFileName(`reports/${"a".repeat(240)}.pdf`);
    expect(result).toHaveLength(180);
    expect(result.endsWith(".pdf")).toBe(true);
  });
});

describe("openWorkspaceFileWith", () => {
  it.each(["report.pdf", "report.xlsx", "notes.md", "WorkspaceFileSystem.ts"])(
    "downloads %s from its environment and invokes native sharing",
    async (fileName) => {
      const harness = createHarness();
      const sourceUrl = `https://environment.test/api/assets/${fileName}`;
      const resolveAssetUrl = vi.fn(async () => sourceUrl);

      await openWorkspaceFileWith(
        { key: fileName, path: `reports/${fileName}`, resolveAssetUrl },
        harness.dependencies,
      );

      expect(resolveAssetUrl).toHaveBeenCalledOnce();
      expect(harness.createCacheTarget).toHaveBeenCalledWith(fileName);
      expect(harness.download).toHaveBeenCalledWith(sourceUrl);
      expect(harness.share).toHaveBeenCalledWith("file:///cache/report.pdf");
      expect(harness.remove).not.toHaveBeenCalled();
    },
  );

  it("fails before requesting an asset when native sharing is unavailable", async () => {
    const harness = createHarness({ available: false });
    const resolveAssetUrl = vi.fn(async () => "https://environment.test/file");

    await expect(
      openWorkspaceFileWith(
        { key: "unavailable", path: "report.pdf", resolveAssetUrl },
        harness.dependencies,
      ),
    ).rejects.toThrow("unavailable");
    expect(resolveAssetUrl).not.toHaveBeenCalled();
    expect(harness.createCacheTarget).not.toHaveBeenCalled();
  });

  it("reports a missing capability URL without creating a cache file", async () => {
    const harness = createHarness();

    await expect(
      openWorkspaceFileWith(
        { key: "missing-url", path: "report.pdf", resolveAssetUrl: async () => null },
        harness.dependencies,
      ),
    ).rejects.toThrow("usable file URL");
    expect(harness.createCacheTarget).not.toHaveBeenCalled();
  });

  it.each([
    ["download", { downloadFailure: new Error("download failed") }],
    ["share", { shareFailure: new Error("share failed") }],
  ] as const)("removes the staged cache file after a %s failure", async (key, failures) => {
    const harness = createHarness(failures);

    await expect(
      openWorkspaceFileWith(
        {
          key,
          path: "report.pdf",
          resolveAssetUrl: async () => "https://environment.test/file",
        },
        harness.dependencies,
      ),
    ).rejects.toThrow(`${key} failed`);
    expect(harness.remove).toHaveBeenCalledOnce();
  });

  it("shares one in-flight operation for duplicate file taps", async () => {
    let finishDownload: (() => void) | undefined;
    const downloadPending = new Promise<void>((resolve) => {
      finishDownload = resolve;
    });
    const harness = createHarness();
    harness.download.mockImplementation(async () => downloadPending);
    const input = {
      key: "same-file",
      path: "report.pdf",
      resolveAssetUrl: async () => "https://environment.test/file",
    };

    const first = openWorkspaceFileWith(input, harness.dependencies);
    const second = openWorkspaceFileWith(input, harness.dependencies);
    await vi.waitFor(() => expect(harness.download).toHaveBeenCalledOnce());
    finishDownload?.();
    await Promise.all([first, second]);

    expect(harness.createCacheTarget).toHaveBeenCalledOnce();
    expect(harness.share).toHaveBeenCalledOnce();
  });
});
