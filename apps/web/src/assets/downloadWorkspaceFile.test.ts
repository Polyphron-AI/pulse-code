import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { startFileDownload } from "./downloadWorkspaceFile";

afterEach(() => vi.unstubAllGlobals());

describe("file download transport", () => {
  it("uses native desktop downloads without loading a remote frame", async () => {
    const downloadFile = vi.fn(async () => true);
    vi.stubGlobal("window", { desktopBridge: { downloadFile } });
    const url = "https://remote.example/api/assets/token/report.xlsx";
    await startFileDownload(url);
    expect(downloadFile).toHaveBeenCalledWith(url);
  });

  it("reports failure to start a desktop download", async () => {
    vi.stubGlobal("window", { desktopBridge: { downloadFile: async () => false } });
    await expect(
      startFileDownload("https://remote.example/api/assets/token/report.xlsx"),
    ).rejects.toThrow("Could not start");
  });

  it("uses the system browser when connected through an older desktop shell", async () => {
    const openExternal = vi.fn(async () => true);
    vi.stubGlobal("window", { desktopBridge: { openExternal } });
    const url = "https://remote.example/api/assets/token/report.xlsx";
    await startFileDownload(url);
    expect(openExternal).toHaveBeenCalledWith(url);
  });

  it("keeps the thread page open while the browser downloads from a remote environment", async () => {
    const frame = { src: "" };
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { querySelector: () => frame });
    const url = "https://remote.example/api/assets/token/notes.md";
    await startFileDownload(url);
    expect(frame.src).toBe(url);
  });
});
