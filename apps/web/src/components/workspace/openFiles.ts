import { DriveFileId, type EnvironmentId, type ProjectId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useCallback } from "react";
import { useWorkspaceResources } from "./workspaceResourceState";

export type OpenFilesInput = {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
} & (
  | { readonly folderId: string; readonly fileId?: never }
  | { readonly fileId: string; readonly folderId?: never }
  | { readonly folderId?: never; readonly fileId?: never }
);
export type OpenFiles = (input: OpenFilesInput) => void;
const isFileId = Schema.is(DriveFileId);
/** Unloaded folders offer provider open. Callers must not promise in-place ancestry resolution. */
export function useOpenFiles(): OpenFiles {
  const { environmentId, openResource } = useWorkspaceResources();
  return useCallback(
    (input) => {
      if (input.environmentId !== environmentId)
        throw new Error("Choose a project in this environment.");
      if (input.fileId !== undefined && input.folderId !== undefined)
        throw new Error("Choose one file or folder.");
      const id = input.folderId ?? input.fileId;
      if (id !== undefined && !isFileId(id)) throw new Error("Invalid Drive file.");
      openResource({
        tab: "files",
        projectId: input.projectId,
        request:
          id === undefined
            ? null
            : {
                type: "file",
                provider: "google-drive",
                fileId: id,
                ...(input.folderId === undefined ? {} : { driveKind: "folder" }),
              },
      });
    },
    [environmentId, openResource],
  );
}
