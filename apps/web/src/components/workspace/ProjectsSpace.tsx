import { ProjectTasks, ProjectWorkspaceSettings } from "./ProjectTasks";
import { useWorkspaceHeaderModel } from "./useWorkspaceHeaderModel";
import { WorkspaceProjectResources } from "./WorkspaceResourcesPanel";
import { workspaceTools } from "../../state/workspaceTools";
import { useNavigate } from "@tanstack/react-router";
import { parseTaskLocation } from "./useWorkspaceItemOpener";
import { Link, useSearch } from "@tanstack/react-router";
import { EnvironmentId, type WorkspaceTask } from "@t3tools/contracts";
import { useState } from "react";
import { useProjects, useThreadShells } from "../../state/entities";
import { useNewProject } from "../../hooks/useNewProject";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useEnvironmentQuery } from "../../state/query";
import { WorkspaceItemActions, WorkspaceItemMenu } from "./WorkspaceItemActions";
import { useWorkspaceItemOpener } from "./useWorkspaceItemOpener";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { WorkspaceLinkedContext } from "./WorkspaceLinkedContext";
import { useMailCapabilities } from "./mail/useMailCapabilities";

/** Project folders, their threads, and confirmed workspace links. */
export function ProjectsSpace() {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const { environmentId, workspaceTools: toolsAvailable } = useMailCapabilities(
    search.environment ? EnvironmentId.make(search.environment) : undefined,
  );
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const threads = useThreadShells();
  const taskRef = parseTaskLocation(search.item);
  const taskQuery = useEnvironmentQuery(
    environmentId !== null && toolsAvailable && taskRef
      ? workspaceTools.task({ environmentId, input: { id: taskRef.taskId } })
      : null,
  );
  const selected = projects.find(
    (project) => project.id === (taskQuery.data?.projectId ?? search.project),
  );
  const selectedTask = taskQuery.data?.projectId === selected?.id ? taskQuery.data : null;
  const selectTask = (task: WorkspaceTask | null) => {
    if (environmentId !== null && selected)
      void navigate({
        to: "/workspace",
        search: {
          space: "projects",
          environment: environmentId,
          project: selected.id,
          ...(task ? { item: JSON.stringify({ type: "task", taskId: task.id }) } : {}),
        },
      });
  };
  const projectThreads = threads.filter(
    (thread) => thread.environmentId === environmentId && thread.projectId === selected?.id,
  );
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const create = useNewProject();
  const open = useWorkspaceItemOpener(environmentId);
  const header = useWorkspaceHeaderModel(environmentId, "Projects", "Projects", selected?.title);
  const contextItem = taskRef
    ? { ref: taskRef, title: selectedTask?.title ?? "Unavailable task" }
    : selected
      ? { ref: { type: "project" as const, projectId: selected.id }, title: selected.title }
      : null;
  const projectList = (
    <div className="flex flex-col gap-3 p-3">
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (environmentId === null || busy || !name.trim()) return;
          setBusy(true);
          void create({ environmentId, name: name.trim(), github: null })
            .then((created) => {
              if (created) setName("");
            })
            .finally(() => setBusy(false));
        }}
      >
        <Input
          aria-label="Project name"
          placeholder="New project name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Button type="submit" size="sm" disabled={busy || !name.trim() || environmentId === null}>
          Create project
        </Button>
      </form>
      {selected ? (
        <div className="space-y-2 text-sm">
          <p className="truncate font-medium">{selected.title}</p>
          <Link
            to="/workspace"
            search={{
              space: "projects",
              ...(environmentId === null ? {} : { environment: environmentId }),
            }}
            className="block text-muted-foreground hover:underline"
          >
            All projects
          </Link>
        </div>
      ) : projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {environmentId === null ? "Connect an environment to see projects." : "No projects yet."}
        </p>
      ) : (
        projects.map((project) => (
          <Link
            key={project.id}
            to="/workspace"
            search={{
              space: "projects",
              project: project.id,
              ...(environmentId === null ? {} : { environment: environmentId }),
            }}
            className="truncate rounded-md p-2 text-sm hover:bg-accent"
          >
            {project.title}
          </Link>
        ))
      )}
    </div>
  );
  return (
    <WorkspaceEngagement
      environmentId={environmentId}
      space="projects"
      layout="full"
      header={header}
      resources={
        <WorkspaceProjectResources
          {...(selected ? { owningProjectId: selected.id } : {})}
          selectedItem={contextItem}
        />
      }
      linkedContext={{
        item: contextItem,
        render: (item) =>
          environmentId === null ? null : (
            <WorkspaceLinkedContext
              environmentId={environmentId}
              item={item}
              onOpen={open}
              {...(taskRef && !selectedTask
                ? {
                    unavailableReason:
                      taskQuery.error ??
                      (taskQuery.isPending ? "Loading task..." : "This task is unavailable."),
                  }
                : {})}
            />
          ),
      }}
    >
      {projectList}
      {selected === undefined || environmentId === null ? (
        <p className="p-4 text-sm text-muted-foreground">
          {taskQuery.error ??
            (taskRef && !toolsAvailable
              ? "Tasks need a newer server."
              : "Select a project to see its threads and tasks. Open Linked context for links and related items.")}
        </p>
      ) : (
        <section className="min-w-0 p-4" aria-label="Project threads">
          <Link
            to="/workspace"
            search={{
              space: "projects",
              ...(environmentId === null ? {} : { environment: environmentId }),
            }}
            className="mb-3 block text-sm underline md:hidden"
          >
            All projects
          </Link>
          <div className="mb-4 flex items-center gap-3">
            <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{selected.title}</h1>
          </div>
          {!taskRef ? (
            <>
              <WorkspaceItemActions
                shortcuts
                environmentId={environmentId}
                item={{ ref: { type: "project", projectId: selected.id }, title: selected.title }}
              />
            </>
          ) : !selectedTask ? (
            <p className="text-sm text-muted-foreground">{taskQuery.error ?? "Loading task..."}</p>
          ) : null}
          {projectThreads.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No threads yet. Start a thread to work on this project.
            </p>
          ) : null}
          <ul className="mt-4 flex flex-col gap-1">
            {projectThreads.map((thread) => (
              <li key={thread.id}>
                <WorkspaceItemMenu
                  environmentId={environmentId}
                  item={{ ref: { type: "thread", threadId: thread.id }, title: thread.title }}
                >
                  <button
                    type="button"
                    className="w-full truncate rounded-md p-2 text-left text-sm hover:bg-accent"
                    onClick={() => open({ type: "thread", threadId: thread.id })}
                  >
                    {thread.title}
                  </button>
                </WorkspaceItemMenu>
              </li>
            ))}
          </ul>
          {taskQuery.error ? (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {taskQuery.error}
            </p>
          ) : null}
          {toolsAvailable ? (
            <>
              <ProjectTasks
                key={selected.id}
                environmentId={environmentId}
                projectId={selected.id}
                projectTitle={selected.title}
                selected={selectedTask}
                onSelect={selectTask}
              />
              <ProjectWorkspaceSettings environmentId={environmentId} projectId={selected.id} />
            </>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Tasks and workspace settings need a newer server.
            </p>
          )}
        </section>
      )}
    </WorkspaceEngagement>
  );
}
