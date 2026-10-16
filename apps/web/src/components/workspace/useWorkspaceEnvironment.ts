import { EnvironmentId } from "@t3tools/contracts";
import { useParams } from "@tanstack/react-router";
import { type DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { resolveThreadRouteTarget } from "../../threadRoutes";
import { getLastCodeEnvironmentId, type WorkspaceSearch } from "./workspaceNavigation";

/** Resolves explicit Workspace, thread and draft scope before session return scope. */
export function useWorkspaceEnvironment(search?: WorkspaceSearch) {
  const target = useParams({ strict: false, select: resolveThreadRouteTarget });
  const draftEnvironmentId = useComposerDraftStore((store) =>
    target?.kind === "draft"
      ? store.getDraftThread(target.draftId as DraftId)?.environmentId
      : undefined,
  );
  return search?.environment
    ? EnvironmentId.make(search.environment)
    : ((target?.kind === "server" ? target.threadRef.environmentId : draftEnvironmentId) ??
        (search ? undefined : getLastCodeEnvironmentId()));
}
