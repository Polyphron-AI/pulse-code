import { ProjectTasks, ProjectWorkspaceSettings } from "./ProjectTasks";
import { useWorkspaceHeaderModel } from "./useWorkspaceHeaderModel";
import { WorkspaceProjectResources } from "./WorkspaceResourcesPanel";
import { workspaceTools } from "../../state/workspaceTools";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  EnvironmentId,
  EnvironmentAuthorizationError,
  WorkspaceToolsError,
  normalizeWorkspaceProjectOverviewFilter,
  type ProjectId,
  type ScopedProjectRef,
  type WorkspaceProjectOverviewPage,
  type WorkspaceTask,
} from "@t3tools/contracts";
import { useMemo, useRef, useState } from "react";
import * as Schema from "effect/Schema";
import { useProjects, useThreadShells } from "../../state/entities";
import {
  ProjectCreateDialogView,
  type ProjectCreateDialogViewProps,
} from "./ProjectCreateDialogView";
import { useProjectCreation } from "./useProjectCreation";
import { useEnvironmentQuery } from "../../state/query";
import { WorkspaceItemActions, WorkspaceItemMenu } from "./WorkspaceItemActions";
import { useWorkspaceItemOpener, parseTaskLocation } from "./useWorkspaceItemOpener";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { WorkspaceLinkedContext } from "./WorkspaceLinkedContext";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { ProjectsOverviewView, type ProjectsOverviewViewProps } from "./ProjectsOverviewView";

const isToolsError = Schema.is(WorkspaceToolsError);
const isAuthorizationError = Schema.is(EnvironmentAuthorizationError);

/** Scope transient search, paging and creation recovery to their owning environment. */
export function ProjectsSpace() {
  const search = useSearch({ strict: false });
  const capabilities = useMailCapabilities(
    search.environment ? EnvironmentId.make(search.environment) : undefined,
  );
  return (
    <ProjectsEnvironment
      key={capabilities.environmentId ?? "disconnected"}
      capabilities={capabilities}
    />
  );
}
function ProjectsEnvironment({
  capabilities,
}: {
  capabilities: ReturnType<typeof useMailCapabilities>;
}) {
  const search = useSearch({ strict: false });
  const navigate = useNavigate();
  const { environmentId, workspaceTools: toolsAvailable } = capabilities;
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const taskRef = parseTaskLocation(search.item);
  const linked = search.view === "linked" || taskRef !== null;
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
          view: "linked",
          environment: environmentId,
          project: selected.id,
          ...(task ? { item: JSON.stringify({ type: "task", taskId: task.id }) } : {}),
        },
      });
  };
  const [query, setQuery] = useState("");
  const [driveFilter, setDriveFilter] = useState<ProjectsOverviewViewProps["driveFilter"]>("all");
  const [pages, setPages] = useState(1);
  const [filter, setFilter] = useState("");
  const overviewKey = `${environmentId}:${capabilities.workspaceProjectOverview}:${filter}:${driveFilter}`;
  const overviewAtom = useMemo(
    () =>
      environmentId === null || !capabilities.ready || linked
        ? null
        : workspaceTools.overview({
            environmentId,
            input: { filter, drive: driveFilter },
            pages,
            metadataAvailable: capabilities.workspaceProjectOverview,
          }),
    [
      environmentId,
      capabilities.ready,
      capabilities.workspaceProjectOverview,
      linked,
      filter,
      driveFilter,
      pages,
    ],
  );
  const overview = useEnvironmentQuery(overviewAtom);
  const [loaded, setLoaded] = useState<{ key: string; data: WorkspaceProjectOverviewPage } | null>(
    null,
  );
  const page = overview.data ?? (loaded?.key === overviewKey ? loaded.data : null);
  const projectsById = useMemo(
    () => new Map(page?.projects.map((project) => [project.projectId, project])),
    [page?.projects],
  );
  const reset = () => {
    setLoaded(null);
    setQuery("");
    setFilter("");
    setDriveFilter("all");
    setPages(1);
  };
  const [createOpen, setCreateOpen] = useState(false);
  const createButton = useRef<HTMLButtonElement | null>(null);
  const retryable = isToolsError(overview.failure)
    ? overview.failure.kind === "unavailable"
    : !isAuthorizationError(overview.failure);
  const open = useWorkspaceItemOpener(environmentId);
  const header = useWorkspaceHeaderModel(environmentId, "Projects", "Projects", selected?.title);
  const contextItem = taskRef
    ? { ref: taskRef, title: selectedTask?.title ?? "Unavailable task" }
    : selected
      ? { ref: { type: "project" as const, projectId: selected.id }, title: selected.title }
      : null;
  const choose = (projectId: ProjectId) => {
    if (environmentId)
      void navigate({
        to: "/workspace",
        search: { space: "projects", environment: environmentId, project: projectId },
      });
  };
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
      {!linked ? (
        <>
          {environmentId === null ? (
            <p className="p-4">Connect an environment to see projects.</p>
          ) : (
            <ProjectsOverviewView
              projects={page?.projects ?? []}
              selectedProjectId={selected?.id ?? null}
              query={query}
              appliedQuery={filter}
              // Only the older-server capability fallback marks overview pages incomplete today.
              titleSearchOnly={page?.incomplete ?? false}
              createButtonRef={createButton}
              driveFilter={driveFilter}
              pending={overview.isPending || !capabilities.ready}
              error={overview.error}
              hasMore={Boolean(page?.nextCursor)}
              roster={[]}
              driveAvailable={capabilities.workspaceProjectOverview}
              retryable={retryable}
              onQueryChange={(value) => {
                setQuery(value);
                if (!value.trim()) {
                  setLoaded(null);
                  setFilter("");
                  setPages(1);
                }
              }}
              onSearch={() => {
                setLoaded(null);
                setFilter(normalizeWorkspaceProjectOverviewFilter(query));
                setPages(1);
              }}
              onDriveFilterChange={(value) => {
                setLoaded(null);
                setDriveFilter(value);
                setPages(1);
              }}
              onReset={reset}
              onSelect={choose}
              onCreate={() => setCreateOpen(true)}
              onMore={() => {
                if (page) setLoaded({ key: overviewKey, data: page });
                setPages((value) => value + 1);
              }}
              onRetry={overview.refresh}
              renderProjectActions={(id, row) => (
                <WorkspaceItemMenu
                  environmentId={environmentId}
                  triggerClassName="relative"
                  item={{
                    ref: { type: "project", projectId: id },
                    title: projectsById.get(id)?.title ?? "Project",
                  }}
                >
                  {row}
                </WorkspaceItemMenu>
              )}
            />
          )}
          <ProjectCreationDialog
            finalFocus={createButton}
            environmentId={environmentId}
            open={createOpen}
            onOpenChange={setCreateOpen}
          />
        </>
      ) : (
        <>
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
                    item={{
                      ref: { type: "project", projectId: selected.id },
                      title: selected.title,
                    }}
                  />
                </>
              ) : !selectedTask ? (
                <p className="text-sm text-muted-foreground">
                  {taskQuery.error ?? "Loading task..."}
                </p>
              ) : null}
              <ProjectThreads environmentId={environmentId} projectId={selected.id} />
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
        </>
      )}
    </WorkspaceEngagement>
  );
}

function ProjectCreationDialog({
  finalFocus,
  environmentId,
  open,
  onOpenChange,
}: {
  readonly finalFocus: ProjectCreateDialogViewProps["finalFocus"];
  readonly environmentId: EnvironmentId | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const creation = useProjectCreation(
    environmentId,
    async (ref: ScopedProjectRef) => {
      await navigate({
        to: "/workspace",
        search: { space: "projects", environment: ref.environmentId, project: ref.projectId },
      });
    },
    onOpenChange,
  );
  return <ProjectCreateDialogView open={open} finalFocus={finalFocus} {...creation} />;
}

function ProjectThreads({
  environmentId,
  projectId,
}: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}) {
  const threads = useThreadShells().filter(
    (thread) => thread.environmentId === environmentId && thread.projectId === projectId,
  );
  const open = useWorkspaceItemOpener(environmentId);
  return (
    <>
      {threads.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No threads yet. Start a thread to work on this project.
        </p>
      ) : null}
      <ul className="mt-4 flex flex-col gap-1">
        {threads.map((thread) => (
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
    </>
  );
}
