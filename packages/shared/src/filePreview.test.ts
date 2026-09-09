import { describe, expect, it } from "vite-plus/test";
import {
  isWorkspaceBrowserPreviewPath,
  isWorkspaceDownloadOnlyPath,
  isWorkspaceImagePreviewPath,
  isWorkspacePreviewEntryPath,
} from "./filePreview.ts";

describe("workspace file previews", () => {
  it.each(["report.html", "report.HTM", "document.pdf?download=1"])(
    "recognizes browser preview path %s",
    (path) => {
      expect(isWorkspaceBrowserPreviewPath(path)).toBe(true);
      expect(isWorkspacePreviewEntryPath(path)).toBe(true);
    },
  );

  it.each([
    "icon.png",
    "photo.JPEG",
    "animation.gif",
    "vector.svg#mark",
    "texture.webp",
    "image.avif",
  ])("recognizes image preview path %s", (path) => {
    expect(isWorkspaceImagePreviewPath(path)).toBe(true);
    expect(isWorkspacePreviewEntryPath(path)).toBe(true);
  });

  it.each(["README.md", "src/index.ts", "image.png.ts", "png"])(
    "rejects non-preview path %s",
    (path) => {
      expect(isWorkspacePreviewEntryPath(path)).toBe(false);
    },
  );
});

describe("download-only files", () => {
  it("routes office documents and archives away from the text reader", () => {
    for (const path of [
      "report.XLSX",
      "notes.docx",
      "slides.pptx",
      "archive.zip",
      "state.sqlite",
    ]) {
      expect(isWorkspaceDownloadOnlyPath(path)).toBe(true);
    }
  });
  it("preserves text, image and browser previews", () => {
    for (const path of [
      "notes.md",
      "WorkspaceFileSystem.ts",
      "README",
      "photo.png",
      "report.pdf",
      "index.html",
    ]) {
      expect(isWorkspaceDownloadOnlyPath(path)).toBe(false);
    }
  });
});
