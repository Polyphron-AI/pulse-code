import { EnvironmentId } from "@t3tools/contracts";
import { Link, useSearch } from "@tanstack/react-router";
import { useProjects } from "../../state/entities";
import { isElectron } from "../../env";
import { SidebarChromeHeader } from "../sidebar/SidebarChrome";
import { SidebarContent, SidebarGroup, useSidebar } from "../ui/sidebar";
import { WorkspaceItemMenu } from "./WorkspaceItemActions";
import { useMailCapabilities } from "./mail/useMailCapabilities";

export function ProjectsNav() {
  const search = useSearch({ strict: false });
  const { environmentId } = useMailCapabilities(
    search.environment ? EnvironmentId.make(search.environment) : undefined,
  );
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const { setOpenMobile } = useSidebar();
  return (
    <>
      <SidebarChromeHeader isElectron={isElectron} />
      <SidebarContent>
        <SidebarGroup>
          <Link
            to="/workspace"
            search={{
              space: "projects",
              ...(environmentId === null ? {} : { environment: environmentId }),
            }}
            onClick={() => setOpenMobile(false)}
            className="rounded-md p-2 text-sm hover:bg-sidebar-row-hover"
          >
            All projects
          </Link>
          {environmentId !== null
            ? projects.map((project) => (
                <WorkspaceItemMenu
                  key={project.id}
                  environmentId={environmentId}
                  item={{ ref: { type: "project", projectId: project.id }, title: project.title }}
                >
                  <Link
                    to="/workspace"
                    search={{
                      space: "projects",
                      project: project.id,
                      ...(environmentId === null ? {} : { environment: environmentId }),
                    }}
                    onClick={() => setOpenMobile(false)}
                    aria-current={search.project === project.id ? "page" : undefined}
                    className="min-w-0 flex-1 truncate rounded-md p-2 text-sm hover:bg-sidebar-row-hover aria-[current=page]:bg-sidebar-row-active"
                  >
                    {project.title}
                  </Link>
                </WorkspaceItemMenu>
              ))
            : null}
          <Link
            to="/workspace"
            search={{ space: "office", officeView: "communications" }}
            className="mt-4 p-2 text-sm text-sidebar-muted-foreground"
          >
            Slack and Discord
          </Link>
        </SidebarGroup>
      </SidebarContent>
    </>
  );
}
