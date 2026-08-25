import type { ContextMenuItem } from "@t3tools/contracts";

import { revealInFileExplorerLabel } from "~/components/preview/fileExplorerLabel";

export type FileBrowserContextMenuAction = "reveal-path" | "copy-mention" | "add-to-chat";

export function shouldOfferFileManagerReveal(input: {
  readonly environmentId: string;
  readonly primaryEnvironmentId: string | null;
  readonly itemPath: string;
  readonly isDesktop: boolean;
}): boolean {
  return (
    input.isDesktop &&
    !input.itemPath.endsWith("/") &&
    input.environmentId === input.primaryEnvironmentId
  );
}

export function fileBrowserContextMenuItems(input: {
  readonly canRevealPath: boolean;
  readonly platform: string;
}): readonly ContextMenuItem<FileBrowserContextMenuAction>[] {
  return [
    ...(input.canRevealPath
      ? [{ id: "reveal-path" as const, label: revealInFileExplorerLabel(input.platform) }]
      : []),
    { id: "copy-mention", label: "Copy mention" },
    { id: "add-to-chat", label: "Add to chat" },
  ];
}
