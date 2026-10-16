import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { CommunicationsWorkspace } from "../components/workspace/CommunicationsWorkspace";
import { MailSpace } from "../components/workspace/mail/MailSpace";
import { ProjectsSpace } from "../components/workspace/ProjectsSpace";
import { OfficeWorkspace } from "../components/workspace/OfficeWorkspace";
import {
  parseWorkspaceSearch,
  workspaceDestinations,
  type WorkspaceDestination,
} from "../components/workspace/workspaceNavigation";
import { EnvironmentId } from "@t3tools/contracts";
import { WorkspaceEngagement } from "../components/workspace/WorkspaceEngagement";
import { WorkspaceProjectResources } from "../components/workspace/WorkspaceResourcesPanel";
import { useWorkspaceHeaderModel } from "../components/workspace/useWorkspaceHeaderModel";
import { useMailCapabilities } from "../components/workspace/mail/useMailCapabilities";

export {
  parseWorkspaceSearch,
  type WorkspaceSearch,
} from "../components/workspace/workspaceNavigation";

export const Route = createFileRoute("/_chat/workspace")({
  validateSearch: parseWorkspaceSearch,
  beforeLoad: ({ search }) => {
    if (!search.space) throw redirect({ to: "/" });
  },
  component: WorkspaceRouteView,
});

function WorkspaceRouteView() {
  const search = Route.useSearch();
  switch (search.space) {
    case "projects":
      return <ProjectsSpace />;
    case "mail":
      return <MailSpace />;
    case "communications":
      return <CommunicationsWorkspace />;
    case "office":
      return <OfficeWorkspace />;
    case "tasks":
    case "meetings":
    case "calendar":
      return <UnavailableWorkspace space={search.space} />;
    case undefined:
      return null;
    default: {
      const unknownSpace: never = search.space;
      throw new Error(`Unknown workspace destination: ${unknownSpace}`);
    }
  }
}

function UnavailableWorkspace({
  space,
}: {
  space: Extract<WorkspaceDestination, "tasks" | "meetings" | "calendar">;
}) {
  const search = Route.useSearch();
  const { environmentId } = useMailCapabilities(
    search.environment ? EnvironmentId.make(search.environment) : undefined,
  );
  const heading = workspaceDestinations.find(({ id }) => id === space)?.label;
  const header = useWorkspaceHeaderModel(
    environmentId,
    heading ?? "Workspace",
    heading ?? "Workspace",
  );
  return (
    <WorkspaceEngagement
      environmentId={environmentId}
      space={space}
      layout="full"
      header={header}
      resources={<WorkspaceProjectResources />}
    >
      <main className="p-5 sm:p-8">
        <p className="mt-2 text-sm text-muted-foreground">
          This view is not available on this server yet.
        </p>
        {(search.space === "meetings" || search.space === "calendar") && (
          <Link
            to="/workspace"
            search={{ space: "office" }}
            className="mt-4 inline-block text-sm underline"
          >
            Open local Office tools
          </Link>
        )}
      </main>
    </WorkspaceEngagement>
  );
}
