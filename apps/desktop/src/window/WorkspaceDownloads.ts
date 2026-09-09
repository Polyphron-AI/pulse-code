// @effect-diagnostics nodeBuiltinImport:off
// Electron requires setSavePath synchronously during will-download.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import type { DownloadItem, Event, WebContents } from "electron";

export function availableDownloadPath(
  directory: string,
  name: string,
  occupied: (path: string) => boolean,
): string {
  const basename = NodePath.basename(name.replaceAll("\\", "/"));
  const safeName =
    Array.from(basename, (character) =>
      character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? "_" : character,
    )
      .join("")
      .replace(/[. ]+$/, "") || "download";
  const { name: stem, ext } = NodePath.parse(safeName);
  let candidate = NodePath.join(directory, safeName);
  for (let suffix = 1; occupied(candidate); suffix += 1) {
    candidate = NodePath.join(directory, `${stem} (${suffix})${ext}`);
  }
  return candidate;
}

/** Save this window's workspace downloads without opening a Save As dialog. */
export function installWorkspaceDownloads(contents: WebContents, directory: string): () => void {
  const pending = new Set<string>();
  const onDownload = (_event: Event, item: DownloadItem, source: WebContents) => {
    if (source !== contents) return;
    const url = new URL(item.getURL());
    if (
      !url.pathname.startsWith("/api/assets/") ||
      !item.getContentDisposition().startsWith("attachment;")
    )
      return;
    const destination = availableDownloadPath(
      directory,
      item.getFilename(),
      (path) => pending.has(path) || NodeFS.existsSync(path),
    );
    pending.add(destination);
    item.setSavePath(destination);
    item.once("done", () => pending.delete(destination));
  };
  const session = contents.session;
  session.on("will-download", onDownload);
  return () => session.removeListener("will-download", onDownload);
}
