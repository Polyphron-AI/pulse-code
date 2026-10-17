import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useSearch, useRouter } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { RegistryContext } from "@effect/atom-react";
import {
  EnvironmentId,
  ProjectId,
  WorkspaceToolsError,
  type WorkspaceItemRef,
  type WorkspaceTaskPage,
  type WorkspaceTaskQuery,
  type WorkspaceTaskSummary,
} from "@t3tools/contracts";
import { useEnvironmentQuery, type EnvironmentQueryView } from "../../state/query";
import { workspaceTools } from "../../state/workspaceTools";
import { useAtomCommand } from "../../state/use-atom-command";
import { useProjects } from "../../state/entities";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { timestampLocale } from "../../timestampFormat";
import { TasksSpaceView, type TaskFilters, type TasksSpaceViewProps } from "./TasksSpaceView";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { WorkspaceProjectResources } from "./WorkspaceResourcesPanel";
import { WorkspaceLinkedContext } from "./WorkspaceLinkedContext";
import { WorkspaceItemMenu } from "./WorkspaceItemActions";
import { useWorkspaceHeaderModel } from "./useWorkspaceHeaderModel";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
import { parseTaskLocation, useWorkspaceItemOpener } from "./useWorkspaceItemOpener";
import { parseWorkspaceSearch, type WorkspaceSearch } from "./workspaceNavigation";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";
import { WorkspaceTaskEditor, workspaceTaskSummary, useTaskDateClock } from "./WorkspaceTaskEditor";
import { Button } from "../ui/button";
import { formatWorkspaceTaskDueOn } from "@t3tools/client-runtime/state/workspaceTaskDates";
const isToolsError = Schema.is(WorkspaceToolsError);
type ListProps = Omit<
  TasksSpaceViewProps,
  "page" | "status" | "error" | "onLoadMore" | "onRetry"
> & { readonly connected: boolean };
function TaskCursor({
  environmentId,
  input,
  onResult,
}: {
  environmentId: EnvironmentId;
  input: typeof WorkspaceTaskQuery.Encoded;
  onResult: (query: EnvironmentQueryView<WorkspaceTaskPage>) => void;
}) {
  const query = useEnvironmentQuery(workspaceTools.queryTasks({ environmentId, input }));
  useEffect(() => {
    if (!query.isPending && (query.data || query.error)) onResult(query);
  }, [query, onResult]);
  return null;
}
function combinePages(base: WorkspaceTaskPage | null, pages: readonly WorkspaceTaskPage[]) {
  if (!base) return base;
  const configs = new Map<ProjectId, WorkspaceTaskPage["projects"][number]>();
  const laneTotals = new Map<string, WorkspaceTaskPage["laneTotals"][number]>();
  const allPages = [base, ...pages];
  for (const page of allPages) {
    for (const config of page.projects) configs.set(config.projectId, config);
    // GROUP BY omits empty lanes. Only an uncapped page confirms their zero totals.
    if (page.laneTotals.length < 1200)
      for (const config of page.projects)
        for (const column of config.taskColumns) {
          const key = JSON.stringify([config.projectId, column]);
          if (!laneTotals.has(key))
            laneTotals.set(key, { projectId: config.projectId, column, total: 0 });
        }
    for (const lane of page.laneTotals)
      laneTotals.set(JSON.stringify([lane.projectId, lane.column]), lane);
  }
  return {
    ...base,
    tasks: [...base.tasks, ...pages.flatMap((page) => page.tasks)],
    projects: [...configs.values()],
    laneTotals: [...laneTotals.values()],
    nextCursor: (pages.at(-1) ?? base).nextCursor,
    totalsTruncated: allPages.some((page) => page.laneTotals.length >= 1200),
  };
}
/** Keeps the displayed depth until its replacement cursor chain is confirmed. */
export function TasksList(props: ListProps) {
  const { environmentId, filters } = props;
  const input = useMemo(
    () => ({
      state: props.view,
      limit: filters.limit,
      owner: filters.owner,
      ...(filters.project ? { projectId: ProjectId.make(filters.project) } : {}),
      ...(filters.text ? { text: filters.text } : {}),
      ...(filters.dueFrom ? { dueFrom: filters.dueFrom } : {}),
      ...(filters.dueTo ? { dueTo: filters.dueTo } : {}),
    }),
    [props.view, filters],
  );
  const query = useWorkspaceTaskPages({
    environmentId,
    input,
    available: props.workspaceTasksV2,
    connected: props.connected,
    selectedTaskId: props.selectedTaskId,
  });
  return (
    <>
      <TasksSpaceView {...props} {...query.view} />
      {query.cursor}
    </>
  );
}

/** Re-walks the loaded cursor chain for both Tasks presentations after invalidation. */
export function useWorkspaceTaskPages(props: {
  environmentId: EnvironmentId;
  input: typeof WorkspaceTaskQuery.Encoded;
  available: boolean;
  connected: boolean;
  selectedTaskId?: string | undefined;
}) {
  const { environmentId, input } = props;
  const registry = useContext(RegistryContext);
  const firstAtom = props.available ? workspaceTools.queryTasks({ environmentId, input }) : null;
  const first = useEnvironmentQuery(firstAtom);
  const [paging, setPaging] = useState<{
    query: typeof firstAtom;
    base: WorkspaceTaskPage | null;
    pages: readonly WorkspaceTaskPage[];
    cursor: string | null;
    error: string | null;
    depth: number;
    held: ReturnType<typeof combinePages>;
  }>({
    query: firstAtom,
    base: first.data,
    pages: [],
    cursor: null,
    error: null,
    depth: 0,
    held: null,
  });
  const [returnPages, setReturnPages] = useState({
    environmentId,
    pages: new Map<typeof firstAtom, typeof paging>(),
  });
  const [returnScope, setReturnScope] = useState(props.selectedTaskId ? firstAtom : null);
  if (props.selectedTaskId && firstAtom && returnScope === null) setReturnScope(firstAtom);
  else if ((!props.selectedTaskId || !firstAtom) && returnScope !== null) setReturnScope(null);
  if (paging.query !== firstAtom) {
    const pages =
      returnPages.environmentId === environmentId
        ? new Map(returnPages.pages)
        : new Map<typeof firstAtom, typeof paging>();
    const retained = pages.get(firstAtom);
    if (returnPages.environmentId === environmentId && paging.query)
      pages.set(paging.query, paging);
    if (pages.size > 8) {
      const oldest = [...pages.keys()].find((scope) => scope !== returnScope);
      if (oldest) pages.delete(oldest);
    }
    setReturnPages({ environmentId, pages });
    setPaging(
      retained ?? {
        query: firstAtom,
        base: first.data,
        pages: [],
        cursor: null,
        error: null,
        depth: 0,
        held: null,
      },
    );
  } else if (first.data && paging.base !== first.data) {
    const depth = Math.max(paging.depth, paging.pages.length);
    setPaging({
      query: firstAtom,
      base: first.data,
      pages: [],
      cursor: depth ? first.data.nextCursor : null,
      error: null,
      depth,
      held: depth ? (paging.held ?? combinePages(paging.base, paging.pages)) : null,
    });
  }
  const current = paging.query === firstAtom && paging.base === first.data;
  const rebuilding =
    current &&
    paging.pages.length < paging.depth &&
    (paging.pages.at(-1) ?? paging.base)?.nextCursor != null;
  const page = useMemo(
    () =>
      current
        ? rebuilding && paging.held
          ? paging.held
          : combinePages(paging.base, paging.pages)
        : combinePages(first.data, []),
    [current, rebuilding, paging.held, paging.base, paging.pages, first.data],
  );
  const receive = useCallback(
    (query: EnvironmentQueryView<WorkspaceTaskPage>) => {
      setPaging((state) => {
        if (state.query !== firstAtom || state.base !== first.data || !state.cursor) return state;
        if (isToolsError(query.failure) && query.failure.kind === "invalid-input")
          return { ...state, pages: [], cursor: null, depth: 0, held: null, error: null };
        if (query.error) return { ...state, cursor: null, error: query.error };
        if (!query.data) return state;
        const pages = [...state.pages, query.data];
        return {
          ...state,
          pages,
          cursor: pages.length < state.depth ? query.data.nextCursor : null,
          error: null,
        };
      });
    },
    [first.data, firstAtom],
  );
  const status: TasksSpaceViewProps["status"] = !props.available
    ? "unavailable"
    : !props.connected
      ? "disconnected"
      : first.error
        ? "error"
        : first.isPending || rebuilding
          ? page
            ? "refreshing"
            : "loading"
          : page
            ? "ready"
            : "loading";
  const refresh = first.refresh;
  const retry = useCallback(() => {
    for (const page of [paging.base, ...paging.pages]) {
      if (page?.nextCursor)
        registry.refresh(
          workspaceTools.queryTasks({
            environmentId,
            input: { ...input, cursor: page.nextCursor },
          }),
        );
    }
    setPaging((state) => ({
      ...state,
      error: null,
      cursor:
        state.pages.length < state.depth
          ? ((state.pages.at(-1) ?? state.base)?.nextCursor ?? null)
          : null,
    }));
    refresh();
  }, [refresh, registry, environmentId, input, paging.base, paging.pages]);
  return {
    failure: first.failure,
    view: {
      page,
      totalsTruncated: page?.totalsTruncated ?? false,
      status,
      error: first.error ?? paging.error,
      loadingMore: current && (paging.cursor !== null || rebuilding),
      onRetry: retry,
      onLoadMore: () => {
        if (status === "ready" && !paging.error && page?.nextCursor && !paging.cursor)
          setPaging({
            ...paging,
            depth: paging.pages.length + 1,
            held: null,
            cursor: page.nextCursor,
          });
      },
    },
    cursor:
      current &&
      paging.cursor &&
      props.connected &&
      props.available &&
      !first.isPending &&
      !first.error ? (
        <TaskCursor
          key={paging.cursor}
          environmentId={environmentId}
          input={{ ...input, cursor: paging.cursor }}
          onResult={receive}
        />
      ) : null,
  };
}
export function TasksSpace() {
  const rawSearch = useSearch({ strict: false });
  const search = useMemo(() => parseWorkspaceSearch(rawSearch), [rawSearch]);
  const capability = useMailCapabilities(
    search.environment ? EnvironmentId.make(search.environment) : undefined,
  );
  const header = useWorkspaceHeaderModel(
    capability.environmentId,
    "Tasks",
    "Tasks",
    "A clear plan for everything that comes next.",
  );
  if (capability.environmentId === null)
    return (
      <WorkspaceEngagement
        environmentId={null}
        space="tasks"
        header={header}
        layout="full"
        resources={<WorkspaceProjectResources />}
      >
        <p className="p-4 text-sm text-muted-foreground">Connect an environment to see tasks.</p>
      </WorkspaceEngagement>
    );
  return (
    <ConnectedTasksSpace
      key={capability.environmentId}
      environmentId={capability.environmentId}
      search={search}
      available={capability.workspaceTasksV2}
      settingsReady={capability.ready}
    />
  );
}
function ConnectedTasksSpace({
  environmentId,
  search,
  available,
  settingsReady,
}: {
  environmentId: EnvironmentId;
  search: WorkspaceSearch;
  available: boolean;
  settingsReady: boolean;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const allProjects = useProjects();
  const projects = useMemo(
    () => allProjects.filter((project) => project.environmentId === environmentId),
    [allProjects, environmentId],
  );
  const connected = useConnectedEnvironmentIds().includes(environmentId);
  const canOperate = useWorkspaceCanOperate(environmentId) && connected;
  const compact = useMediaQuery("max-md");
  const bodyHidden = useContext(WorkspaceResourcesBodyContext)?.hidden ?? false;
  const ownerProfile = useEnvironmentSettings(
    environmentId,
    (settings) => settings.workspaceOwnerProfile,
  );
  const configuredTimeZone = useEnvironmentSettings(
    environmentId,
    (settings) => settings.workspaceDisplayTimeZone,
  );
  const timeZone = configuredTimeZone ?? "UTC";
  const taskRef = parseTaskLocation(search.item);
  const selectedTaskId = taskRef?.taskId;
  const [creating, setCreating] = useState(false);
  const [createProject, setCreateProject] = useState(search.project ?? "");
  const [createDirty, setCreateDirty] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [pendingTaskIds, setPendingTaskIds] = useState<ReadonlySet<string>>(new Set());
  const hidden = bodyHidden || (compact && (taskRef !== null || creating));
  const now = useTaskDateClock(timeZone, settingsReady && available && !hidden);
  const transition = useAtomCommand(workspaceTools.transitionTask, { reportFailure: false });
  const filters = useMemo<TaskFilters>(
    () => ({
      text: search.taskText ?? "",
      project: search.project ?? "",
      owner: search.taskOwner ?? "all",
      dueFrom: search.taskDueFrom ?? "",
      dueTo: search.taskDueTo ?? "",
      limit: search.taskLimit ?? 50,
    }),
    [
      search.taskText,
      search.project,
      search.taskOwner,
      search.taskDueFrom,
      search.taskDueTo,
      search.taskLimit,
    ],
  );

  const selected = useEnvironmentQuery(
    taskRef && available
      ? workspaceTools.task({ environmentId, input: { id: taskRef.taskId } })
      : null,
  );
  const [lastSelected, setLastSelected] = useState(selected.data);
  if (selected.data && selected.data !== lastSelected) setLastSelected(selected.data);
  const selectedTask = selected.data ?? (lastSelected?.id === selectedTaskId ? lastSelected : null);
  const configProjectId = taskRef
    ? selectedTask?.projectId
    : creating && createProject
      ? ProjectId.make(createProject)
      : null;
  const config = useEnvironmentQuery(
    available && configProjectId
      ? workspaceTools.config({ environmentId, input: { projectId: configProjectId } })
      : null,
  );
  const openOther = useWorkspaceItemOpener(environmentId);
  const returnSearch = useRef<WorkspaceSearch | null>(null);
  const origin = useRef<HTMLElement | null>(null);
  const originTaskId = useRef<string | null>(null);
  const originLane = useRef<{ projectId: string; column: string } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const scrollReturn = useRef<Array<{ element: HTMLElement; top: number }>>([]);
  const captureReturn = useCallback(
    (taskId: string | null, trigger?: HTMLElement | null) => {
      returnSearch.current = search;
      originTaskId.current = taskId;
      origin.current =
        trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      const lane = origin.current?.closest<HTMLElement>("[data-workspace-board-column]");
      originLane.current = lane
        ? {
            projectId: lane.dataset.workspaceBoardProjectId!,
            column: lane.dataset.workspaceBoardColumn!,
          }
        : null;
      scrollReturn.current = [];
      for (let element = origin.current?.parentElement; element; element = element.parentElement) {
        scrollReturn.current.push({ element, top: element.scrollTop });
      }
    },
    [search],
  );
  const open = useCallback(
    (ref: WorkspaceItemRef) => {
      if (ref.type !== "task") {
        openOther(ref);
        return;
      }
      const trigger = [
        ...(list.current?.querySelectorAll<HTMLElement>("[data-workspace-task-id]") ?? []),
      ]
        .find((row) => row.dataset.workspaceTaskId === ref.taskId)
        ?.querySelector<HTMLElement>('button[aria-label^="Open "]');
      void navigate({ to: "/workspace", search: { ...search, item: JSON.stringify(ref) } }).then(
        () => {
          if (parseTaskLocation(router.state.location.search.item)?.taskId === ref.taskId) {
            captureReturn(ref.taskId, trigger);
            setCreating(false);
          }
        },
      );
    },
    [navigate, search, openOther, captureReturn, router, setCreating],
  );
  const close = () => {
    void navigate({
      to: "/workspace",
      replace: true,
      search: parseWorkspaceSearch({ ...(returnSearch.current ?? search), item: undefined }),
    }).then(() => setCreating(false));
  };
  useEffect(() => {
    if (selectedTaskId || creating) return;
    const restoredRow = [
      ...(list.current?.querySelectorAll<HTMLElement>("[data-workspace-task-id]") ?? []),
    ]
      .find((row) => row.dataset.workspaceTaskId === originTaskId.current)
      ?.querySelector<HTMLElement>('button[aria-label^="Open "]');
    const restoredLane = [
      ...(list.current?.querySelectorAll<HTMLElement>("[data-workspace-board-column]") ?? []),
    ].find(
      (lane) =>
        lane.dataset.workspaceBoardProjectId === originLane.current?.projectId &&
        lane.dataset.workspaceBoardColumn === originLane.current?.column,
    );
    const target = origin.current?.isConnected
      ? origin.current
      : (restoredRow ??
        restoredLane ??
        list.current?.querySelector<HTMLElement>("[data-workspace-tasks-heading]"));
    target?.focus({ preventScroll: true });
    for (const { element, top } of scrollReturn.current) element.scrollTo(0, top);
    returnSearch.current = null;
    origin.current = null;
    originTaskId.current = null;
    originLane.current = null;
    scrollReturn.current = [];
  }, [selectedTaskId, creating]);
  const onFilter = useCallback<TasksSpaceViewProps["onFilter"]>(
    (next, navigation) => {
      void navigate({
        to: "/workspace",
        replace: navigation?.replace ?? false,
        search: parseWorkspaceSearch({
          ...search,
          view: navigation?.resetView ? "all" : search.view,
          project: next.project || undefined,
          taskText: next.text.trim() || undefined,
          taskOwner: next.owner === "all" ? undefined : next.owner,
          taskDueFrom: next.dueFrom || undefined,
          taskDueTo: next.dueTo || undefined,
          taskLimit: next.limit === 50 ? undefined : next.limit,
        }),
      });
    },
    [navigate, search],
  );
  const menu = useCallback(
    (task: WorkspaceTaskSummary, children: ReactNode) => (
      <WorkspaceItemMenu
        environmentId={environmentId}
        item={{ ref: { type: "task", taskId: task.id }, title: task.title }}
        confirmed={[{ ref: { type: "project", projectId: task.projectId } }]}
      >
        {children}
      </WorkspaceItemMenu>
    ),
    [environmentId],
  );
  const header = useWorkspaceHeaderModel(
    environmentId,
    "Tasks",
    "Tasks",
    "A clear plan for everything that comes next.",
  );
  const contextItem = taskRef
    ? { ref: taskRef, title: selected.data?.title ?? "Unavailable task" }
    : null;
  const selectedDate = selected.data
    ? formatWorkspaceTaskDueOn(selected.data.dueOn, now, timeZone, timestampLocale)
    : null;

  return (
    <WorkspaceEngagement
      environmentId={environmentId}
      space="tasks"
      header={header}
      layout="full"
      resources={<WorkspaceProjectResources selectedItem={contextItem} />}
      linkedContext={{
        item: contextItem,
        render: (item) => (
          <WorkspaceLinkedContext
            environmentId={environmentId}
            item={item}
            onOpen={open}
            {...(taskRef && !selected.data
              ? {
                  unavailableReason:
                    selected.error ??
                    (selected.isPending ? "Loading task..." : "This task is unavailable."),
                }
              : {})}
          />
        ),
      }}
    >
      <div className="flex min-w-0 items-start max-md:block">
        <div ref={list} className={`min-w-0 flex-1 ${taskRef || creating ? "max-md:hidden" : ""}`}>
          <TasksList
            environmentId={environmentId}
            projectId={search.project ? ProjectId.make(search.project) : null}
            projects={projects}
            view={search.view === "open" || search.view === "done" ? search.view : "all"}
            taskLayout={search.taskLayout ?? "list"}
            filters={filters}
            ownerProfile={ownerProfile}
            timeZone={timeZone}
            now={now}
            locale={timestampLocale}
            settingsReady={settingsReady}
            utcFallback={
              settingsReady && (!configuredTimeZone || selectedDate?.usingUtcFallback === true)
            }
            canOperate={canOperate}
            workspaceTasksV2={available}
            hidden={hidden}
            connected={connected}
            selectedTaskId={taskRef?.taskId}
            pendingTaskIds={pendingTaskIds}
            onCreate={
              canOperate && available
                ? (trigger) => {
                    if (creating) return;
                    setCreateProject(search.project ?? "");
                    if (!taskRef) {
                      captureReturn(null, trigger);
                      setCreating(true);
                    } else
                      void navigate({
                        to: "/workspace",
                        search: parseWorkspaceSearch({ ...search, item: undefined }),
                      }).then(() => {
                        if (!router.state.location.search.item) {
                          captureReturn(null, trigger);
                          setCreating(true);
                        }
                      });
                  }
                : undefined
            }
            onOpen={open}
            onTransition={transition}
            onFilter={onFilter}
            onLayout={(layout) => {
              void navigate({ to: "/workspace", search: { ...search, taskLayout: layout } });
            }}
            renderItemMenu={menu}
          />
        </div>
        {taskRef || creating ? (
          <aside className="m-4 min-w-0 flex-1 space-y-3 md:max-w-sm" aria-label="Task detail">
            {creating && !taskRef ? (
              <label className="block text-sm">
                Project
                <select
                  aria-label="New task project"
                  className="block min-h-11 w-full rounded-md border border-input bg-background p-2"
                  value={createProject}
                  disabled={createDirty || editorBusy}
                  onChange={(event) => setCreateProject(event.target.value)}
                >
                  <option value="">Choose a project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </select>
                {createDirty ? (
                  <span className="text-xs text-muted-foreground">
                    Cancel this draft to choose another project.
                  </span>
                ) : null}
              </label>
            ) : null}
            {available && config.data && ((creating && !taskRef) || selectedTask) ? (
              <WorkspaceTaskEditor
                environmentId={environmentId}
                task={
                  taskRef && selectedTask
                    ? workspaceTaskSummary(
                        selectedTask,
                        projects.find((project) => project.id === selectedTask.projectId)?.title ??
                          "Unavailable project",
                      )
                    : null
                }
                config={config.data}
                projectTitle={
                  projects.find((project) => project.id === config.data?.projectId)?.title ??
                  "Unavailable project"
                }
                ownerProfile={ownerProfile}
                unavailable={
                  isToolsError(selected.failure) && selected.failure.kind === "not-found"
                }
                onClose={close}
                backLabel="Back to tasks"
                onBusyChange={(busy) => {
                  setEditorBusy(busy);
                  setPendingTaskIds(busy && taskRef ? new Set([taskRef.taskId]) : new Set());
                }}
                onDirtyChange={setCreateDirty}
                onSaved={(task) => {
                  if (creating) {
                    void navigate({
                      to: "/workspace",
                      search: {
                        ...search,
                        item: JSON.stringify({ type: "task", taskId: task.id }),
                      },
                    }).then(() => setCreating(false));
                  }
                }}
              />
            ) : (
              <>
                <Button type="button" size="sm" variant="ghost" onClick={close}>
                  Back to tasks
                </Button>
                <p
                  role={selected.error || config.error ? "alert" : "status"}
                  className="text-xs text-muted-foreground"
                >
                  {!available
                    ? "Tasks need a newer server."
                    : creating && !createProject
                      ? "Choose a project to add a task."
                      : selected.isPending || config.isPending
                        ? "Loading task..."
                        : taskRef &&
                            (!selected.data ||
                              (isToolsError(selected.failure) &&
                                selected.failure.kind === "not-found"))
                          ? "This task is unavailable. Its links have been kept."
                          : (config.error ??
                            selected.error ??
                            "This task is unavailable. Its links have been kept.")}
                </p>
                {creating ? (
                  <Button type="button" size="sm" variant="ghost" onClick={close}>
                    Cancel
                  </Button>
                ) : null}
              </>
            )}
          </aside>
        ) : null}
      </div>
    </WorkspaceEngagement>
  );
}
