import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { createFileRoute } from "@tanstack/react-router";

import { OrcaWorkspace } from "../components/workspace/OrcaWorkspace";

export interface WorkspaceSearch {
  readonly prepare?: boolean;
  readonly sourceEnvironmentId?: EnvironmentId;
  readonly sourceThreadId?: ThreadId;
}

export function parseWorkspaceSearch(raw: Record<string, unknown>): WorkspaceSearch {
  const prepare = raw.prepare === true || raw.prepare === "true";
  const sourceEnvironmentId =
    prepare && typeof raw.sourceEnvironmentId === "string" && raw.sourceEnvironmentId
      ? EnvironmentId.make(raw.sourceEnvironmentId)
      : undefined;
  const sourceThreadId =
    prepare && typeof raw.sourceThreadId === "string" && raw.sourceThreadId
      ? ThreadId.make(raw.sourceThreadId)
      : undefined;
  return {
    ...(prepare ? { prepare: true } : {}),
    ...(sourceEnvironmentId && sourceThreadId ? { sourceEnvironmentId, sourceThreadId } : {}),
  };
}

export const Route = createFileRoute("/_chat/workspace")({
  validateSearch: parseWorkspaceSearch,
  component: OrcaWorkspaceRouteView,
});

function OrcaWorkspaceRouteView() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <OrcaWorkspace
      prepareRequested={search.prepare === true}
      requestedSourceRef={
        search.sourceEnvironmentId && search.sourceThreadId
          ? {
              environmentId: search.sourceEnvironmentId,
              threadId: search.sourceThreadId,
            }
          : null
      }
      onPrepareRequestedChange={(requested) => {
        void navigate({
          search: requested ? { prepare: true } : {},
          replace: true,
        });
      }}
    />
  );
}
