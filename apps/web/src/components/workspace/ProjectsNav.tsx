import { EnvironmentId } from "@t3tools/contracts";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useProjects } from "../../state/entities";
import { ProjectFavicon } from "../ProjectFavicon";
import { useSidebar } from "../ui/sidebar";
import { ProjectPickerView } from "./ProjectPickerView";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { WorkspaceItemMenu } from "./WorkspaceItemActions";

/** Legacy route picker. Resource selection uses the same pure view without navigation. */
export function ProjectsNav() {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const { environmentId } = useMailCapabilities(
    search.environment ? EnvironmentId.make(search.environment) : undefined,
  );
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const { setOpenMobile } = useSidebar();
  return (
    <div className="min-w-0 max-w-64">
      <ProjectPickerView
        projects={projects.map((project) => ({
          id: project.id,
          title: project.title,
          icon: <ProjectFavicon project={project} className="size-4 shrink-0" />,
        }))}
        selectedProjectId={projects.find((project) => project.id === search.project)?.id ?? null}
        allowAll
        onChooseProject={(id) => {
          void navigate({
            to: "/workspace",
            search: {
              space: "projects",
              ...(environmentId === null ? {} : { environment: environmentId }),
              ...(id === null ? {} : { project: id }),
            },
          });
          setOpenMobile(false);
        }}
        renderProjectActions={(id, row) =>
          environmentId === null ? (
            row
          ) : (
            <WorkspaceItemMenu
              environmentId={environmentId}
              item={{
                ref: { type: "project", projectId: id },
                title: projects.find((project) => project.id === id)?.title ?? "Project",
              }}
            >
              {row}
            </WorkspaceItemMenu>
          )
        }
      />
    </div>
  );
}
