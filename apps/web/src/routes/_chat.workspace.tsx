import { createFileRoute, Link, redirect } from "@tanstack/react-router";

import { CommunicationsWorkspace } from "../components/workspace/CommunicationsWorkspace";
import { MailSpace } from "../components/workspace/mail/MailSpace";
import { ProjectsSpace } from "../components/workspace/ProjectsSpace";
import { OfficeWorkspace } from "../components/workspace/OfficeWorkspace";
import {
  parseWorkspaceSearch,
  workspaceDestinations,
} from "../components/workspace/workspaceNavigation";
import { SidebarInset } from "../components/ui/sidebar";

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
  const heading = workspaceDestinations.find(({ id }) => id === search.space)?.label;
  return (
    <SidebarInset className="min-w-0">
      <header className="flex h-[var(--workspace-topbar-height)] items-center border-b border-border px-4 text-sm text-muted-foreground">
        Workspace / {heading}
      </header>
      <main className="p-5 sm:p-8">
        <h1 className="text-2xl font-semibold">{heading}</h1>
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
    </SidebarInset>
  );
}
