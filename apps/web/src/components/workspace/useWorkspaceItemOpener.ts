import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";
import { WorkspaceItemRef, type EnvironmentId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { readLocalApi } from "../../localApi";
import { buildThreadRouteParams } from "../../threadRoutes";

const isWorkspaceItem = Schema.is(WorkspaceItemRef);

export function parseMailLocation(raw: string | undefined) {
  if (raw === undefined) return null;
  try {
    const ref: unknown = JSON.parse(raw);
    return isWorkspaceItem(ref) && ref.type === "mail" ? ref : null;
  } catch {
    return null;
  }
}

/** Open an item in its own environment, preserving the exact source-message reference. */
export function useWorkspaceItemOpener(environmentId: EnvironmentId) {
  const navigate = useNavigate();
  return (ref: WorkspaceItemRef) => {
    if (ref.type === "thread")
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(environmentId, ref.threadId)),
      });
    if (ref.type === "project")
      void navigate({
        to: "/workspace",
        search: { space: "projects", environment: environmentId, project: ref.projectId },
      });
    if (ref.type === "mail")
      void navigate({
        to: "/workspace",
        search: {
          space: "mail",
          environment: environmentId,
          account: ref.accountId,
          item: JSON.stringify(ref),
        },
      });
    if (ref.type === "url" || ref.type === "file")
      void readLocalApi()?.shell.openExternal(
        ref.type === "url"
          ? ref.url
          : `https://drive.google.com/file/d/${encodeURIComponent(ref.fileId)}/view`,
      );
  };
}
