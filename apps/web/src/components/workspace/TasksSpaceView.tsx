import { useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { formatWorkspaceTaskDueOn } from "@t3tools/client-runtime/state/workspaceTaskDates";
import { LayoutGrid, List, MoreHorizontal, Search, SlidersHorizontal } from "lucide-react";
import { Link } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import type * as DateTime from "effect/DateTime";
import {
  WorkspaceTaskDueOn,
  type EnvironmentId,
  type ProjectId,
  type ServerSettings,
  type WorkspaceItemRef,
  type WorkspaceTaskPage,
  type WorkspaceTaskSummary,
} from "@t3tools/contracts";
import { WorkspaceTaskRow, type TaskTransitionHandler } from "./WorkspaceTaskRow";
import { TaskBoard } from "./TaskBoard";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";
import { parseWorkspaceSearch } from "./workspaceNavigation";
export interface TaskFilters {
  readonly text: string;
  readonly project: string;
  readonly owner: "all" | "environment-owner" | "unassigned";
  readonly dueFrom: string;
  readonly dueTo: string;
  readonly limit: number;
}
const isDate = Schema.is(WorkspaceTaskDueOn);
function filterError(filters: TaskFilters) {
  if (filters.text.length > 240) return "Search must be 240 characters or fewer.";
  if (!Number.isInteger(filters.limit) || filters.limit < 1 || filters.limit > 100)
    return "Choose a page size from 1 to 100.";
  if ((filters.dueFrom && !isDate(filters.dueFrom)) || (filters.dueTo && !isDate(filters.dueTo)))
    return "Choose valid due dates.";
  if (filters.dueFrom && filters.dueTo && filters.dueFrom > filters.dueTo)
    return "Due from must be on or before Due to.";
  return null;
}
export interface TasksSpaceViewProps {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId | null;
  readonly projects: readonly { readonly id: ProjectId; readonly title: string }[];
  readonly view: "all" | "open" | "done";
  readonly taskLayout: "list" | "board";
  readonly filters: TaskFilters;
  readonly page: WorkspaceTaskPage | null;
  readonly totalsTruncated?: boolean;
  readonly status: "loading" | "ready" | "refreshing" | "error" | "unavailable" | "disconnected";
  readonly error: string | null;
  readonly ownerProfile: ServerSettings["workspaceOwnerProfile"];
  readonly timeZone: string;
  readonly now: DateTime.DateTime;
  readonly locale?: string | undefined;
  readonly settingsReady?: boolean;
  readonly utcFallback?: boolean;
  readonly canOperate: boolean;
  readonly workspaceTasksV2: boolean;
  readonly hidden?: boolean;
  readonly selectedTaskId?: string | undefined;
  readonly pendingTaskIds?: ReadonlySet<string>;
  readonly loadingMore?: boolean;
  readonly onCreate?: ((trigger: HTMLElement | null) => void) | undefined;
  readonly onOpen: (ref: WorkspaceItemRef) => void;
  readonly onTransition: TaskTransitionHandler;
  readonly onFilter: (
    filters: TaskFilters,
    navigation?: { readonly replace?: boolean; readonly resetView?: boolean },
  ) => void;
  readonly onLoadMore: () => void;
  readonly onRetry: () => void;
  readonly onLayout: (layout: "list" | "board") => void;
  readonly ownerPresentation?: (
    task: WorkspaceTaskSummary,
  ) => ServerSettings["workspaceOwnerProfile"];
  readonly renderItemMenu?: (task: WorkspaceTaskSummary, children: ReactNode) => ReactNode;
  readonly footer?: string;
}
export function TasksSpaceView(props: TasksSpaceViewProps) {
  const { filters, page, projectId, onFilter } = props;
  const hidden =
    (useContext(WorkspaceResourcesBodyContext)?.hidden ?? false) || props.hidden === true;
  const [search, setSearch] = useState(filters.text);
  const [observedSearch, setObservedSearch] = useState(filters.text);
  if (observedSearch !== filters.text) {
    setObservedSearch(filters.text);
    if (search.trim() !== filters.text) setSearch(filters.text);
  }
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const canCreate = !!props.onCreate && props.canOperate && props.workspaceTasksV2;
  if ((hidden || !canCreate) && menuOpen) setMenuOpen(false);
  useEffect(() => {
    if (hidden || !menuOpen || !canCreate) return;
    const menu = menuRef.current;
    menu?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu?.contains(event.target)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuOpen(false);
      menu?.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [hidden, menuOpen, canCreate]);
  const [draft, setDraft] = useState(filters);
  const [validation, setValidation] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterRef = useRef(onFilter);
  useEffect(() => {
    filterRef.current = onFilter;
  }, [onFilter]);
  const id = useId();
  const searchError = filterError({ ...filters, text: search });
  useEffect(() => {
    if (hidden || search.trim() === filters.text || searchError) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      filterRef.current({ ...filters, text: search.trim() }, { replace: true });
    }, 300);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [search, filters, searchError, hidden]);
  if (hidden && editing) setEditing(false);
  const clear = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setSearch("");
    setValidation(null);
    setEditing(false);
    onFilter(
      { text: "", project: filters.project, owner: "all", dueFrom: "", dueTo: "", limit: 50 },
      { resetView: true },
    );
  };
  const hasFilters = !!(
    filters.text ||
    filters.dueFrom ||
    filters.dueTo ||
    filters.owner !== "all" ||
    filters.limit !== 50 ||
    props.view !== "all"
  );
  const project = props.projects.find((project) => project.id === projectId);
  const projectTitle =
    project?.title ?? page?.tasks.find((task) => task.projectId === projectId)?.projectTitle;
  const ready = props.status === "ready";
  const completedColumns = useMemo(
    () =>
      new Map(page?.projects.map((config) => [config.projectId, config.completedColumn ?? null])),
    [page?.projects],
  );
  const projectsWithoutCompletion =
    page?.projects.filter((config) => config.completedColumn === null) ?? [];
  const datedTask = page?.tasks.find((task) => task.dueOn);
  const dateFallback =
    props.settingsReady === false || !datedTask
      ? false
      : formatWorkspaceTaskDueOn(datedTask.dueOn, props.now, props.timeZone, props.locale)
          ?.usingUtcFallback;

  return (
    <main
      aria-label={props.taskLayout === "board" ? "Tasks board" : "Tasks list"}
      className="min-w-0 px-4 pt-4 pb-6"
    >
      <div className="flex h-10 items-start justify-between gap-3 max-md:h-11 [@media(pointer:coarse)]:h-11">
        <div className="min-w-0">
          <h2
            data-workspace-tasks-heading=""
            tabIndex={-1}
            className="truncate text-sm leading-5 font-semibold"
          >
            {projectId ? "Project tasks" : "All tasks"}
          </h2>
          <p className="mt-1 truncate text-3xs leading-3.5 text-muted-foreground">
            {page
              ? `${page.openTotal} open${projectId && projectTitle ? ` · ${projectTitle}` : ""}`
              : props.status === "loading"
                ? "Loading tasks..."
                : "Task count unavailable"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreate ? (
            <details
              ref={menuRef}
              open={menuOpen && !hidden}
              className="relative"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
              }}
            >
              <summary
                role="button"
                aria-label="Task actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen && !hidden}
                className="my-[7px] flex size-6 cursor-pointer list-none items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-ring max-md:my-0 max-md:size-11 [@media(pointer:coarse)]:my-0 [@media(pointer:coarse)]:size-11"
                onClick={(event) => {
                  event.preventDefault();
                  setMenuOpen(!menuOpen);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    setMenuOpen(true);
                  }
                }}
              >
                <MoreHorizontal className="size-3" />
              </summary>
              <div role="menu" aria-label="Task creation">
                <button
                  role="menuitem"
                  type="button"
                  className="absolute right-0 z-10 min-h-11 w-28 rounded-md border border-border bg-background p-2 text-xs"
                  onClick={() => {
                    setMenuOpen(false);
                    props.onCreate?.(menuRef.current?.querySelector("summary") ?? null);
                  }}
                >
                  New task
                </button>
              </div>
            </details>
          ) : null}
          <button
            type="button"
            className="mt-[7px] flex h-6 shrink-0 items-center gap-1 rounded-md border border-border bg-muted px-1.75 text-2xs font-semibold focus-visible:outline-2 focus-visible:outline-ring max-md:mt-0 max-md:h-11 max-md:px-3 [@media(pointer:coarse)]:mt-0 [@media(pointer:coarse)]:h-11"
            onClick={() => props.onLayout(props.taskLayout === "board" ? "list" : "board")}
          >
            {props.taskLayout === "board" ? (
              <List aria-hidden="true" className="size-3" />
            ) : (
              <LayoutGrid aria-hidden="true" className="size-3" />
            )}{" "}
            {props.taskLayout === "board" ? "List" : "Board"}
          </button>
        </div>
      </div>
      <form
        aria-label="Task search"
        className="mt-4 flex h-[29px] min-w-0 items-center gap-1.75 rounded-xl bg-muted pl-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (timer.current !== null) clearTimeout(timer.current);
          timer.current = null;
          if (!searchError) onFilter({ ...filters, text: search.trim() });
        }}
      >
        <Search aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
        <input
          type="search"
          aria-label="Search tasks"
          aria-invalid={!!searchError}
          aria-describedby={searchError ? `${id}-search-error` : undefined}
          placeholder="Search tasks"
          maxLength={240}
          value={search}
          className="h-full min-w-0 flex-1 bg-transparent text-3xs outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
          onChange={(event) => setSearch(event.target.value)}
        />
        {search || hasFilters ? (
          <button type="button" className="shrink-0 text-3xs text-muted-foreground" onClick={clear}>
            Clear
          </button>
        ) : null}
        <button
          type="button"
          aria-label="Filter tasks"
          aria-expanded={editing}
          aria-controls={`${id}-filters`}
          className="flex size-[29px] shrink-0 items-center justify-center rounded-full text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => {
            setDraft({ ...filters, text: search });
            setValidation(null);
            setEditing(!editing);
          }}
        >
          <SlidersHorizontal aria-hidden="true" className="size-3" />
        </button>
      </form>
      {searchError ? (
        <p id={`${id}-search-error`} role="alert" className="mt-2 text-xs text-destructive">
          {searchError}
        </p>
      ) : null}
      {editing && !hidden ? (
        <form
          id={`${id}-filters`}
          aria-label="Task filters"
          className="mt-3 grid gap-3 rounded-lg border border-border bg-background p-3 text-xs sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const error = filterError(draft);
            setValidation(error);
            if (error) return;
            if (timer.current !== null) clearTimeout(timer.current);
            timer.current = null;
            setSearch(draft.text);
            onFilter(draft);
            setEditing(false);
          }}
        >
          <label>
            Project
            <select
              aria-label="Task project"
              className="mt-1 block w-full rounded border border-input bg-background p-2"
              value={draft.project}
              onChange={(event) => setDraft({ ...draft, project: event.target.value })}
            >
              <option value="">All projects</option>
              {props.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.title}
                </option>
              ))}
              {draft.project && !props.projects.some((project) => project.id === draft.project) ? (
                <option value={draft.project}>Unavailable project</option>
              ) : null}
            </select>
          </label>
          <label>
            Owner
            <select
              aria-label="Task owner filter"
              className="mt-1 block w-full rounded border border-input bg-background p-2"
              value={draft.owner}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  owner:
                    event.target.value === "unassigned"
                      ? "unassigned"
                      : event.target.value === "environment-owner"
                        ? "environment-owner"
                        : "all",
                })
              }
            >
              <option value="all">All owners</option>
              <option value="environment-owner">Me</option>
              <option value="unassigned">Unassigned</option>
            </select>
          </label>
          <label>
            Due from
            <input
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              aria-label="Due from"
              className="mt-1 block w-full rounded border border-input bg-background p-2"
              value={draft.dueFrom}
              onChange={(event) => setDraft({ ...draft, dueFrom: event.target.value })}
            />
          </label>
          <label>
            Due to
            <input
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              aria-label="Due to"
              className="mt-1 block w-full rounded border border-input bg-background p-2"
              value={draft.dueTo}
              onChange={(event) => setDraft({ ...draft, dueTo: event.target.value })}
            />
          </label>
          <label>
            Page size
            <input
              type="number"
              min={1}
              max={100}
              aria-label="Task page size"
              className="mt-1 block w-full rounded border border-input bg-background p-2"
              value={draft.limit}
              onChange={(event) => setDraft({ ...draft, limit: Number(event.target.value) })}
            />
          </label>
          {validation ? (
            <p role="alert" className="text-destructive">
              {validation}
            </p>
          ) : null}
          <div className="flex gap-3 sm:col-span-2">
            <button type="submit" className="rounded border border-border px-3 py-2">
              Apply
            </button>
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="button" onClick={clear}>
              Clear filters
            </button>
          </div>
        </form>
      ) : null}
      {props.status === "unavailable" ? (
        <p className="mt-4 text-xs text-muted-foreground">Tasks need a newer server.</p>
      ) : null}
      {props.status === "disconnected" ? (
        <p role="status" className="mt-4 text-xs text-muted-foreground">
          Connection unavailable. Showing the last confirmed tasks.
        </p>
      ) : null}
      {props.status === "loading" || props.status === "refreshing" ? (
        <p role="status" className="mt-3 text-xs text-muted-foreground">
          {page ? "Refreshing tasks..." : "Loading tasks..."}
        </p>
      ) : null}
      {props.error ? (
        <div className="mt-3 flex items-center gap-3 text-xs">
          <p role="alert" className="text-destructive">
            {props.error}
          </p>
          <button type="button" onClick={props.onRetry} className="underline">
            Retry tasks
          </button>
        </div>
      ) : null}
      {props.settingsReady === false && page?.tasks.some((task) => task.dueOn) ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading workspace timezone...</p>
      ) : null}
      {props.utcFallback || dateFallback ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Workspace timezone unavailable. Dates use UTC.
        </p>
      ) : null}
      {page ? (
        <>
          {projectsWithoutCompletion.length > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Choose a completed column in project workspace settings for{" "}
              {projectsWithoutCompletion.map((config, index) => (
                <span key={config.projectId}>
                  {index > 0 ? ", " : ""}
                  <Link
                    aria-label={`${props.projects.find((project) => project.id === config.projectId)?.title ?? page.tasks.find((task) => task.projectId === config.projectId)?.projectTitle ?? "Unavailable project"} workspace settings`}
                    className="underline"
                    to="/workspace"
                    search={parseWorkspaceSearch({
                      space: "projects",
                      environment: props.environmentId,
                      project: config.projectId,
                    })}
                  >
                    {props.projects.find((project) => project.id === config.projectId)?.title ??
                      page.tasks.find((task) => task.projectId === config.projectId)
                        ?.projectTitle ??
                      "Unavailable project"}
                  </Link>
                </span>
              ))}{" "}
              to complete or reopen tasks.
            </p>
          ) : null}
          {props.taskLayout === "board" ? (
            <TaskBoard
              {...props}
              page={page}
              hidden={hidden}
              disconnected={props.status === "disconnected"}
              refreshFailed={props.status === "error" || props.status === "disconnected"}
              onRecover={props.onRetry}
            />
          ) : (
            <ul className="mt-3" aria-label="Tasks">
              {page.tasks.map((task) => (
                <WorkspaceTaskRow
                  key={task.id}
                  environmentId={props.environmentId}
                  task={task}
                  density="list"
                  onOpen={props.onOpen}
                  ownerProfile={props.ownerProfile}
                  ownerPresentation={props.ownerPresentation?.(task)}
                  now={props.now}
                  timeZone={props.timeZone}
                  locale={props.locale}
                  canOperate={props.canOperate && props.status !== "disconnected"}
                  completedColumn={completedColumns.get(task.projectId) ?? null}
                  workspaceTasksV2={props.workspaceTasksV2}
                  pending={props.pendingTaskIds?.has(task.id) ?? false}
                  refreshFailed={props.status === "error" || props.status === "disconnected"}
                  selected={props.selectedTaskId === task.id}
                  settingsReady={props.settingsReady}
                  onTransition={props.onTransition}
                  renderItemMenu={props.renderItemMenu}
                />
              ))}
            </ul>
          )}
          {page.tasks.length === 0 && ready ? (
            <p className="mt-4 text-xs text-muted-foreground">
              {hasFilters ? "No matching tasks." : "No tasks yet. Add tasks from a project."}
            </p>
          ) : null}
          {page.nextCursor ? (
            <button
              type="button"
              aria-label="Load more tasks"
              disabled={!ready || !!props.error || !!props.loadingMore}
              className="mt-3 rounded border border-border px-3 py-2 text-xs disabled:opacity-50"
              onClick={props.onLoadMore}
            >
              {props.loadingMore ? "Loading more tasks..." : "Load more"}
            </button>
          ) : null}
          <p className="mt-[13px] text-3xs leading-6 text-muted-foreground">
            {props.footer ?? "Shared statuses · One accountable owner"}
          </p>
          <p className="sr-only">{page.total} matching tasks</p>
        </>
      ) : null}
    </main>
  );
}
