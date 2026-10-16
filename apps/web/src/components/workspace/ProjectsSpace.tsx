import { ProjectTasks, ProjectWorkspaceSettings } from "./ProjectTasks";
import { COMPACT_WORKSPACE_HEADER_INSET_CLASS } from "../../workspaceTitlebar";
import { workspaceTools } from "../../state/workspaceTools";
import { useNavigate } from "@tanstack/react-router";
import { parseTaskLocation } from "./useWorkspaceItemOpener";
import { Link, useSearch } from "@tanstack/react-router";
import { EnvironmentId, type WorkspaceItemRef } from "@t3tools/contracts";
import { useState } from "react";
import { useProjects, useThreadShells } from "../../state/entities";
import { useNewProject } from "../../hooks/useNewProject";
import { SidebarInset } from "../ui/sidebar";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useEnvironmentQuery } from "../../state/query";
import { workspaceLinks } from "../../state/workspaceLinks";
import { WorkspaceItemActions, WorkspaceItemMenu } from "./WorkspaceItemActions";
import { useWorkspaceItemOpener } from "./useWorkspaceItemOpener";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { workspaceEndpointTitle } from "./mail/linkedItems";
import { LinkedSection } from "./mail/LinkedSection";
import { useMailCapabilities } from "./mail/useMailCapabilities";

/** Project folders, their threads, and confirmed workspace links. */
export function ProjectsSpace() {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const {
    environmentId,
    workspaceItemContext,
    workspaceTools: toolsAvailable,
  } = useMailCapabilities(search.environment ? EnvironmentId.make(search.environment) : undefined);
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
  const selectTask = (task: import("@t3tools/contracts").WorkspaceTask | null) => {
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
  const hub = useEnvironmentQuery(
    environmentId !== null && selected !== undefined && workspaceItemContext
      ? workspaceLinks.projectHub({
          environmentId,
          input: {
            projectId: selected.id,
            threadIds: projectThreads.slice(0, 30).map((thread) => thread.id),
          },
        })
      : null,
  );
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const create = useNewProject();
  const openKnown = useWorkspaceItemOpener(environmentId ?? EnvironmentId.make("unavailable"));
  const open = (ref: WorkspaceItemRef) => {
    if (environmentId !== null) openKnown(ref);
    return;
  };
  return (
    <SidebarInset className="min-w-0 overflow-y-auto">
      <header
        className={`flex h-[var(--workspace-topbar-height)] shrink-0 items-center border-b border-border px-4 text-sm ${COMPACT_WORKSPACE_HEADER_INSET_CLASS}`}
      >
        Projects
      </header>
      <WorkspaceEngagement
        space="projects"
        selected={selected !== undefined}
        list={
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
              <Button
                type="submit"
                size="sm"
                disabled={busy || !name.trim() || environmentId === null}
              >
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
              <p className="text-sm text-muted-foreground">No projects yet.</p>
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
        }
        linked={
          selected === undefined || environmentId === null ? null : (
            <LinkedSection
              key={selected.id}
              environmentId={environmentId}
              item={taskRef ?? { type: "project", projectId: selected.id }}
              title={selectedTask?.title ?? selected.title}
              onOpen={open}
            />
          )
        }
      >
        {selected === undefined || environmentId === null ? (
          <p className="p-4 text-sm text-muted-foreground">
            {taskQuery.error ??
              (taskRef && !toolsAvailable
                ? "Tasks need a newer server."
                : "Select a project to see its threads and linked items.")}
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
            {!taskRef || selectedTask ? (
              <>
                <WorkspaceItemActions
                  shortcuts
                  environmentId={environmentId}
                  item={
                    selectedTask
                      ? {
                          ref: { type: "task", taskId: selectedTask.id },
                          title: selectedTask.title,
                        }
                      : { ref: { type: "project", projectId: selected.id }, title: selected.title }
                  }
                  {...(selectedTask
                    ? { confirmed: [{ ref: { type: "project" as const, projectId: selected.id } }] }
                    : {})}
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {taskQuery.error ?? "Loading task..."}
              </p>
            )}
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
            <h2 className="mt-6 mb-2 text-sm font-medium">Related through linked items</h2>
            <p className="mb-2 text-xs text-muted-foreground">
              Shown for discovery. These items are not project context until you link them directly.
            </p>
            {hub.error !== null ? (
              <Button size="sm" variant="ghost" onClick={hub.refresh}>
                Retry related items
              </Button>
            ) : null}
            {hub.data !== null && hub.data.related.length === 0 ? (
              <p className="text-sm text-muted-foreground">No related items yet.</p>
            ) : null}
            {!workspaceItemContext ? (
              <p className="text-sm text-muted-foreground">
                Update this server to show related items.
              </p>
            ) : hub.data === null && hub.error === null ? (
              <p className="text-sm text-muted-foreground">Loading related items...</p>
            ) : null}
            <ul>
              {hub.data?.related.map((row) => (
                <li key={JSON.stringify(row.item.ref)} className="py-2 text-sm">
                  <WorkspaceItemMenu
                    environmentId={environmentId}
                    item={row.item}
                    provenance={
                      <p className="mb-2 text-xs text-muted-foreground">
                        Via {workspaceEndpointTitle(row.via)}
                      </p>
                    }
                  >
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => open(row.item.ref)}
                    >
                      {workspaceEndpointTitle(row.item)}
                    </button>
                    <p className="text-xs text-muted-foreground">
                      Via {workspaceEndpointTitle(row.via)}
                    </p>
                  </WorkspaceItemMenu>
                </li>
              ))}
            </ul>
            {hub.data?.truncated || projectThreads.length > 30 ? (
              <p className="text-xs text-muted-foreground">
                Showing a bounded selection of related items.
              </p>
            ) : null}
          </section>
        )}
      </WorkspaceEngagement>
    </SidebarInset>
  );
}
