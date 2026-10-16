import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { CommunicationsWorkspace } from "../components/workspace/CommunicationsWorkspace";
import { MailSpace } from "../components/workspace/mail/MailSpace";
import { ProjectsSpace } from "../components/workspace/ProjectsSpace";
import { OfficeWorkspace } from "../components/workspace/OfficeWorkspace";
import {
  parseWorkspaceSearch,
  workspaceDestinations,
} from "../components/workspace/workspaceNavigation";
import { EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";
import { WorkspaceEngagement } from "../components/workspace/WorkspaceEngagement";
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
  if (search.space === "projects") return <ProjectsSpace />;
  if (search.space === "mail") return <MailSpace />;
  if (search.space === "communications") return <CommunicationsWorkspace />;
  if (search.space === "office") return <OfficeWorkspace />;
  return <UnavailableWorkspace />;
}

function UnavailableWorkspace() {
  const search = Route.useSearch();
  const { environmentId } = useMailCapabilities(
    search.environment ? EnvironmentId.make(search.environment) : undefined,
  );
  const heading = workspaceDestinations.find(({ id }) => id === search.space)?.label;
  const header = useWorkspaceHeaderModel(
    environmentId,
    heading ?? "Workspace",
    heading ?? "Workspace",
  );
  const [resourcesOpen, setResourcesOpen] = useState(false);
  return (
    <WorkspaceEngagement
      environmentId={environmentId ?? EnvironmentId.make("unavailable")}
      space={
        search.space === "tasks" || search.space === "meetings" || search.space === "calendar"
          ? search.space
          : "projects"
      }
      layout="full"
      header={header}
      resourcesOpen={resourcesOpen}
      onResourcesChange={setResourcesOpen}
      resources={null}
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
