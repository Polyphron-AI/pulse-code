import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
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
import { WorkspaceItemActions, WorkspaceItemMenu } from "./WorkspaceItemActions";
import { useWorkspaceHeaderModel } from "./useWorkspaceHeaderModel";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
import { parseTaskLocation, useWorkspaceItemOpener } from "./useWorkspaceItemOpener";
import { parseWorkspaceSearch, type WorkspaceSearch } from "./workspaceNavigation";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";
import { useTaskDateClock } from "./ProjectTasks";
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
/** Accumulates only confirmed pages from the current first-page value. */
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
  const firstAtom = props.workspaceTasksV2
    ? workspaceTools.queryTasks({ environmentId, input })
    : null;
  const first = useEnvironmentQuery(firstAtom);
  const [paging, setPaging] = useState<{
    query: typeof firstAtom;
    base: WorkspaceTaskPage | null;
    pages: readonly WorkspaceTaskPage[];
    cursor: string | null;
    error: string | null;
  }>({ query: firstAtom, base: first.data, pages: [], cursor: null, error: null });
  if (
    paging.query !== firstAtom ||
    paging.base !== first.data ||
    ((first.isPending || first.error || !props.workspaceTasksV2) &&
      (paging.pages.length > 0 || paging.cursor !== null || paging.error !== null))
  )
    setPaging({ query: firstAtom, base: first.data, pages: [], cursor: null, error: null });
  const current =
    paging.query === firstAtom && paging.base === first.data && !first.isPending && !first.error;
  const pages = current ? paging.pages : [];
  const page = useMemo(() => {
    if (!first.data) return null;
    if (!pages.length) return first.data;
    const configs = new Map(first.data.projects.map((config) => [config.projectId, config]));
    for (const page of pages)
      for (const config of page.projects) configs.set(config.projectId, config);
    return {
      ...first.data,
      tasks: [...first.data.tasks, ...pages.flatMap((page) => page.tasks)],
      projects: [...configs.values()],
      nextCursor: pages.at(-1)!.nextCursor,
    };
  }, [first.data, pages]);
  const receive = useCallback(
    (query: EnvironmentQueryView<WorkspaceTaskPage>) => {
      setPaging((current) => {
        if (current.query !== firstAtom || current.base !== first.data || current.cursor === null)
          return current;
        if (isToolsError(query.failure) && query.failure.kind === "invalid-input")
          return { ...current, pages: [], cursor: null, error: null };
        if (query.error) return { ...current, cursor: null, error: query.error };
        return query.data
          ? { ...current, pages: [...current.pages, query.data], cursor: null, error: null }
          : current;
      });
    },
    [first.data, firstAtom],
  );
  const status = !props.workspaceTasksV2
    ? "unavailable"
    : !props.connected
      ? "disconnected"
      : first.error
        ? "error"
        : first.isPending
          ? first.data
            ? "refreshing"
            : "loading"
          : first.data
            ? "ready"
            : "loading";
  return (
    <>
      <TasksSpaceView
        {...props}
        page={page}
        status={status}
        error={first.error ?? paging.error}
        loadingMore={current && paging.cursor !== null}
        onRetry={() => {
          setPaging({ query: firstAtom, base: first.data, pages: [], cursor: null, error: null });
          first.refresh();
        }}
        onLoadMore={() => {
          if (status === "ready" && !paging.error && page?.nextCursor && !paging.cursor)
            setPaging({ ...paging, cursor: page.nextCursor });
        }}
      />
      {current && paging.cursor && props.connected && props.workspaceTasksV2 ? (
        <TaskCursor
          key={paging.cursor}
          environmentId={environmentId}
          input={{ ...input, cursor: paging.cursor }}
          onResult={receive}
        />
      ) : null}
    </>
  );
}
export function TasksSpace() {
  const search = useSearch({ strict: false });
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
      search={parseWorkspaceSearch(search)}
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
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
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
  const hidden = bodyHidden || (compact && taskRef !== null);
  const now = useTaskDateClock(timeZone, settingsReady && available && !hidden);
  const transition = useAtomCommand(workspaceTools.transitionTask, { reportFailure: false });
  const filters = useMemo<TaskFilters>(
    () => ({
      text: search.taskText ?? "",
      project: search.project ?? "",
      owner: search.taskOwner ?? "all",
      dueFrom: search.taskDueFrom ?? "",
      dueTo: search.taskDueTo ?? "",
      limit: 50,
    }),
    [search.taskText, search.project, search.taskOwner, search.taskDueFrom, search.taskDueTo],
  );
  const [pageSize, setPageSize] = useState(50);
  const queryFilters = useMemo(() => ({ ...filters, limit: pageSize }), [filters, pageSize]);
  const selected = useEnvironmentQuery(
    taskRef && available
      ? workspaceTools.task({ environmentId, input: { id: taskRef.taskId } })
      : null,
  );
  const openOther = useWorkspaceItemOpener(environmentId);
  const origin = useRef<HTMLElement | null>(null);
  const scrollReturn = useRef<Array<{ element: HTMLElement; top: number }>>([]);
  const open = useCallback(
    (ref: WorkspaceItemRef) => {
      if (ref.type !== "task") {
        openOther(ref);
        return;
      }
      origin.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      scrollReturn.current = [];
      for (let element = origin.current?.parentElement; element; element = element.parentElement) {
        if (element.scrollTop) scrollReturn.current.push({ element, top: element.scrollTop });
      }
      void navigate({ to: "/workspace", search: { ...search, item: JSON.stringify(ref) } });
    },
    [navigate, search, openOther],
  );
  const close = () => {
    void navigate({
      to: "/workspace",
      search: parseWorkspaceSearch({ ...search, item: undefined }),
    }).then(() => {
      origin.current?.focus({ preventScroll: true });
      for (const { element, top } of scrollReturn.current) element.scrollTop = top;
    });
  };
  const onFilter = useCallback(
    (next: TaskFilters) => {
      setPageSize(next.limit);
      void navigate({
        to: "/workspace",
        search: parseWorkspaceSearch({
          ...search,
          project: next.project || undefined,
          taskText: next.text.trim() || undefined,
          taskOwner: next.owner === "all" ? undefined : next.owner,
          taskDueFrom: next.dueFrom || undefined,
          taskDueTo: next.dueTo || undefined,
          item: undefined,
        }),
      });
    },
    [navigate, search, setPageSize],
  );
  const menu = useCallback(
    (task: WorkspaceTaskSummary, children: ReactNode) => (
      <WorkspaceItemMenu
        environmentId={environmentId}
        item={{ ref: { type: "task", taskId: task.id }, title: task.title }}
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
      <div className={taskRef ? "max-md:hidden" : undefined}>
        <TasksList
          environmentId={environmentId}
          projectId={search.project ? ProjectId.make(search.project) : null}
          projects={projects}
          view={search.view === "open" || search.view === "done" ? search.view : "all"}
          taskLayout={search.taskLayout ?? "list"}
          filters={queryFilters}
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
          onOpen={open}
          onTransition={transition}
          onFilter={onFilter}
          onLayout={(layout) => {
            void navigate({ to: "/workspace", search: { ...search, taskLayout: layout } });
          }}
          renderItemMenu={menu}
        />
      </div>
      {taskRef ? (
        <section
          aria-label="Selected task"
          className="m-4 space-y-3 rounded-lg border border-border p-3"
        >
          <button type="button" onClick={close} className="text-xs underline">
            Back to tasks
          </button>
          {selected.data ? (
            <>
              <h3 className="text-sm font-semibold">{selected.data.title}</h3>
              <p className="text-xs text-muted-foreground">
                {selected.data.column}
                {selected.data.areaLabel ? ` · ${selected.data.areaLabel}` : ""}
              </p>
              {selectedDate ? (
                <time
                  dateTime={selected.data.dueOn!}
                  aria-label={selectedDate.fullDate}
                  className="text-xs text-muted-foreground"
                >
                  {selectedDate.label}
                </time>
              ) : null}
              <WorkspaceItemActions
                shortcuts
                environmentId={environmentId}
                item={{ ref: taskRef, title: selected.data.title }}
                confirmed={[{ ref: { type: "project", projectId: selected.data.projectId } }]}
              />
            </>
          ) : (
            <p role={selected.error ? "alert" : "status"} className="text-xs text-muted-foreground">
              {!available
                ? "Tasks need a newer server."
                : (selected.error ??
                  (selected.isPending ? "Loading task..." : "This task is unavailable."))}
            </p>
          )}
        </section>
      ) : null}
    </WorkspaceEngagement>
  );
}
