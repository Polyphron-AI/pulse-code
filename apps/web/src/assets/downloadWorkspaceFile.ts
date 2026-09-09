import type { ScopedThreadRef } from "@t3tools/contracts";
import { useCallback } from "react";

import { resolveAssetUrl } from "./assetUrls";
import { assetEnvironment } from "~/state/assets";
import { usePreparedConnection } from "~/state/session";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
import { toastManager } from "~/components/ui/toast";

/** Stream downloads through the browser, without buffering files in the renderer. */
export async function startFileDownload(url: string): Promise<void> {
  if (window.desktopBridge) {
    const started = window.desktopBridge.downloadFile
      ? await window.desktopBridge.downloadFile(url)
      : await window.desktopBridge.openExternal(url);
    if (!started) throw new Error("Could not start the download.");
    return;
  }
  let frame = document.querySelector<HTMLIFrameElement>("iframe[data-workspace-download]");
  if (!frame) {
    frame = document.createElement("iframe");
    frame.hidden = true;
    frame.dataset.workspaceDownload = "";
    frame.title = "File download";
    document.body.append(frame);
  }
  frame.src = url;
}

export function useWorkspaceFileDownload(threadRef: ScopedThreadRef | undefined) {
  const connection = usePreparedConnection(threadRef?.environmentId ?? null);
  const createUrl = useAtomQueryRunner(assetEnvironment.createUrl, { reportFailure: false });
  return useCallback(
    async (path: string) => {
      try {
        if (!threadRef || connection._tag === "None") {
          throw new Error("Reconnect to the file's environment and try again.");
        }
        const result = await createUrl({
          environmentId: threadRef.environmentId,
          input: {
            resource: {
              _tag: "workspace-file",
              threadId: threadRef.threadId,
              path,
              download: true,
            },
          },
        });
        if (result._tag !== "Success")
          throw new Error("The environment could not provide this file.");
        const url = resolveAssetUrl(connection.value.httpBaseUrl, result.value.relativeUrl);
        if (!url) throw new Error("The environment returned an invalid download URL.");
        await startFileDownload(url);
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not download file",
          description: error instanceof Error ? error.message : "Try again.",
        });
      }
    },
    [connection, createUrl, threadRef],
  );
}
