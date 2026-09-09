// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";
import * as NodeEvents from "node:events";
import type { WebContents } from "electron";
import { describe, expect, it, vi } from "vite-plus/test";
import { availableDownloadPath, installWorkspaceDownloads } from "./WorkspaceDownloads.ts";

describe("workspace downloads", () => {
  it("saves native downloads directly and reserves names for concurrent transfers", () => {
    const session = new NodeEvents.EventEmitter();
    const contents = { session } as unknown as WebContents;
    const directory = NodePath.resolve(".download-test-missing");
    const remove = installWorkspaceDownloads(contents, directory);
    const makeItem = () =>
      Object.assign(new NodeEvents.EventEmitter(), {
        getURL: () => "https://remote.example/api/assets/token/report.xlsx",
        getContentDisposition: () => "attachment; filename*=UTF-8''report.xlsx",
        getFilename: () => "report.xlsx",
        setSavePath: vi.fn(),
      });
    const first = makeItem();
    const second = makeItem();
    session.emit("will-download", {}, first, contents);
    session.emit("will-download", {}, second, contents);
    expect(first.setSavePath).toHaveBeenCalledWith(NodePath.join(directory, "report.xlsx"));
    expect(second.setSavePath).toHaveBeenCalledWith(NodePath.join(directory, "report (1).xlsx"));
    const unrelated = makeItem();
    session.emit("will-download", {}, unrelated, {});
    expect(unrelated.setSavePath).not.toHaveBeenCalled();
    remove();
    expect(session.listenerCount("will-download")).toBe(0);
  });

  it("keeps existing downloads and in-flight names", () => {
    const directory = NodePath.resolve("Downloads");
    const occupied = new Set([
      NodePath.join(directory, "report.xlsx"),
      NodePath.join(directory, "report (1).xlsx"),
    ]);
    expect(availableDownloadPath(directory, "report.xlsx", (path) => occupied.has(path))).toBe(
      NodePath.join(directory, "report (2).xlsx"),
    );
  });
  it("keeps filenames within Downloads", () => {
    const directory = NodePath.resolve("Downloads");
    expect(availableDownloadPath(directory, "..\\..\\report.xlsx", () => false)).toBe(
      NodePath.join(directory, "report.xlsx"),
    );
  });
});
