import { memo, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TasksSpaceViewProps } from "./TasksSpaceView";
import {
  WorkspaceTaskRow,
  type TaskTransitionHandler,
  type WorkspaceTaskRowProps,
} from "./WorkspaceTaskRow";
import { AsyncResult } from "effect/unstable/reactivity";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  WorkspaceToolsError,
  type WorkspaceTaskPage,
  type WorkspaceTaskSummary,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const isToolsError = Schema.is(WorkspaceToolsError);
const noColumns: readonly string[] = [];
export type TaskBoardProps = Pick<
  TasksSpaceViewProps,
  | "environmentId"
  | "projects"
  | "ownerProfile"
  | "now"
  | "timeZone"
  | "locale"
  | "settingsReady"
  | "canOperate"
  | "workspaceTasksV2"
  | "hidden"
  | "pendingTaskIds"
  | "selectedTaskId"
  | "onOpen"
  | "onTransition"
  | "renderItemMenu"
  | "ownerPresentation"
> & {
  readonly page: WorkspaceTaskPage;
  readonly disconnected?: boolean;
  readonly refreshFailed?: boolean;
  readonly totalsTruncated?: boolean;
  readonly onRecover?: () => void;
};

const TaskBoardCard = memo(
  function TaskBoardCard({
    columns,
    onRecover,
    ...row
  }: WorkspaceTaskRowProps & {
    readonly columns: readonly string[];
    readonly onRecover?: (() => void) | undefined;
  }) {
    const { task, environmentId, onTransition, onOpen } = row;
    const [busy, setBusy] = useState(false);
    const inFlight = useRef(false);
    const [acknowledged, setAcknowledged] = useState<number | null>(null);
    const [wasRefreshFailed, setWasRefreshFailed] = useState(row.refreshFailed);
    if (wasRefreshFailed !== row.refreshFailed) {
      setWasRefreshFailed(row.refreshFailed);
      if (row.refreshFailed) setAcknowledged(null);
    }
    const [error, setError] = useState<string | null>(null);
    const [conflict, setConflict] = useState(false);
    const [recovering, setRecovering] = useState(false);
    const [revision, setRevision] = useState(task.revision);
    if (revision !== task.revision) {
      setRevision(task.revision);
      setError(null);
      setConflict(false);
      setRecovering(false);
    }
    const feedbackId = useId();
    const disabled =
      !row.canOperate ||
      !row.workspaceTasksV2 ||
      row.pending ||
      busy ||
      (acknowledged !== null && acknowledged > task.revision) ||
      columns.length === 0;
    const update: TaskTransitionHandler = async (request) => {
      if (inFlight.current)
        return AsyncResult.fail(new Error("A task update is already in progress."));
      inFlight.current = true;
      setBusy(true);
      try {
        const result = await onTransition(request);
        if (result._tag === "Success" && result.value.revision !== undefined)
          setAcknowledged(result.value.revision);
        return result;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    };
    return (
      <li
        data-workspace-board-task-id={task.id}
        className="min-w-0 rounded-md border border-border bg-background p-2"
      >
        <ul>
          <WorkspaceTaskRow
            {...row}
            onTransition={update}
            pending={row.pending || busy || (acknowledged !== null && acknowledged > task.revision)}
          />
        </ul>
        <select
          aria-label={`Move ${task.title} to column`}
          aria-describedby={error ? feedbackId : undefined}
          className="mt-2 min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-2 text-xs md:min-h-8 [@media(pointer:coarse)]:min-h-11"
          value={task.column}
          disabled={disabled}
          onChange={async (event) => {
            const column = event.target.value;
            if (disabled || inFlight.current || column === task.column || !columns.includes(column))
              return;
            setError(null);
            setConflict(false);
            setRecovering(false);
            try {
              const result = await update({
                environmentId,
                input: {
                  id: task.id,
                  expectedRevision: task.revision,
                  change: { type: "column", column },
                },
              });
              if (result._tag === "Failure") {
                const cause = squashAtomCommandFailure(result);
                setError(
                  cause instanceof Error
                    ? cause.message
                    : "The workspace change could not be saved.",
                );
                setConflict(isToolsError(cause) && cause.kind === "conflict");
                if (
                  isToolsError(cause) &&
                  (cause.kind === "conflict" || cause.kind === "not-found")
                ) {
                  setRecovering(onRecover !== undefined);
                  onRecover?.();
                }
              }
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "The task could not be moved.");
            }
          }}
        >
          {!columns.includes(task.column) ? (
            <option value={task.column}>{task.column} (unconfigured)</option>
          ) : null}
          {columns.map((column) => (
            <option key={column} value={column}>
              {column}
            </option>
          ))}
        </select>
        {busy ? (
          <p role="status" className="mt-2 text-xs text-muted-foreground">
            Saving move...
          </p>
        ) : null}
        {error ? (
          <p id={feedbackId} role="alert" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {recovering ? (
          <p role="status" className="mt-2 text-xs text-muted-foreground">
            Refreshing tasks to load the latest changes.
          </p>
        ) : null}
        {conflict ? (
          <button
            type="button"
            aria-label={`Review changes to ${task.title}`}
            className="mt-2 min-h-11 text-xs underline"
            onClick={() => onOpen({ type: "task", taskId: task.id })}
          >
            Review task changes
          </button>
        ) : null}
      </li>
    );
  },
  (previous, next) => {
    if (
      Object.keys(previous).length !== Object.keys(next).length ||
      previous.task.id !== next.task.id ||
      previous.task.revision !== next.task.revision ||
      previous.task.projectTitle !== next.task.projectTitle ||
      previous.columns.length !== next.columns.length ||
      previous.columns.some((column, index) => column !== next.columns[index])
    )
      return false;
    return (Object.keys(next) as Array<keyof typeof next>).every(
      (key) => key === "task" || key === "columns" || Object.is(previous[key], next[key]),
    );
  },
);

/** Groups only loaded projects and cards. Totals cover the full filtered query. */
export function TaskBoard(props: TaskBoardProps) {
  const { page } = props;
  const totalsTruncated = props.totalsTruncated ?? page.laneTotals.length >= 1200;
  const board = useRef<HTMLDivElement>(null);
  const focused = useRef<{
    element: HTMLElement;
    taskId: string;
    control: "select" | "input";
  } | null>(null);
  useLayoutEffect(() => {
    const previous = focused.current;
    if (props.hidden || !previous || previous.element.isConnected) return;
    focused.current = null;
    if (document.activeElement !== document.body) return;
    const card = page.tasks.some((task) => task.id === previous.taskId)
      ? [
          ...(board.current?.querySelectorAll<HTMLElement>("[data-workspace-board-task-id]") ?? []),
        ].find((element) => element.dataset.workspaceBoardTaskId === previous.taskId)
      : undefined;
    const target = card?.querySelector<HTMLElement>(previous.control) ?? board.current;
    target?.focus({ preventScroll: true });
  }, [page.tasks, props.hidden]);
  const groups = useMemo(() => {
    const titles = new Map(props.projects.map((project) => [project.id, project.title]));
    const configs = new Map(page.projects.map((config) => [config.projectId, config]));
    const grouped = new Map<
      WorkspaceTaskSummary["projectId"],
      {
        id: WorkspaceTaskSummary["projectId"];
        title: string | undefined;
        config: WorkspaceTaskPage["projects"][number] | undefined;
        lanes: Map<string, { tasks: WorkspaceTaskSummary[]; total: number | undefined }>;
      }
    >(
      [...configs].map(([id, config]) => [
        id,
        {
          id,
          title: titles.get(id),
          config,
          lanes: new Map(
            config.taskColumns.map((column) => [
              column,
              { tasks: [] as WorkspaceTaskSummary[], total: totalsTruncated ? undefined : 0 },
            ]),
          ),
        },
      ]),
    );
    for (const task of page.tasks) {
      let group = grouped.get(task.projectId);
      if (!group) {
        group = {
          id: task.projectId,
          title: titles.get(task.projectId),
          config: undefined,
          lanes: new Map(),
        };
        grouped.set(task.projectId, group);
      }
      group.title ??= task.projectTitle;
      let lane = group.lanes.get(task.column);
      if (!lane) {
        lane = { tasks: [], total: undefined };
        group.lanes.set(task.column, lane);
      }
      lane.tasks.push(task);
    }
    for (const total of page.laneTotals) {
      const group = grouped.get(total.projectId);
      if (!group) continue;
      const lane = group.lanes.get(total.column);
      if (lane) lane.total = total.total;
      else group.lanes.set(total.column, { tasks: [], total: total.total });
    }
    return [...grouped.values()];
  }, [page, props.projects, totalsTruncated]);
  const canOperate = props.canOperate && !props.disconnected && !props.hidden;
  return (
    <div
      ref={board}
      tabIndex={-1}
      role="region"
      className="mt-3 min-w-0 space-y-4"
      aria-label="Task boards"
      onFocusCapture={(event) => {
        const element = event.target;
        const taskId = element.closest<HTMLElement>("[data-workspace-board-task-id]")?.dataset
          .workspaceBoardTaskId;
        focused.current =
          taskId && (element instanceof HTMLSelectElement || element instanceof HTMLInputElement)
            ? {
                element,
                taskId,
                control: element instanceof HTMLSelectElement ? "select" : "input",
              }
            : null;
      }}
    >
      {props.disconnected ? (
        <p className="text-xs text-muted-foreground">Reconnect to move cards.</p>
      ) : !props.canOperate ? (
        <p className="text-xs text-muted-foreground">
          Read-only session. You can browse tasks but cannot move cards.
        </p>
      ) : null}
      {totalsTruncated ? (
        <p role="status" className="text-xs text-muted-foreground">
          Some lane totals are unavailable. Loaded cards may be a partial set.
        </p>
      ) : null}
      {groups.map((group) => (
        <section
          key={group.id}
          aria-label={`${group.title ?? "Unavailable project"} board`}
          className="min-w-0"
        >
          <h2 className="mb-2 text-xs font-semibold">{group.title ?? "Unavailable project"}</h2>
          {!group.config ? (
            <p className="mb-2 text-xs text-muted-foreground">
              Project columns unavailable. Open a task to review its settings.
            </p>
          ) : null}
          <div
            className="flex min-w-0 gap-3 overflow-x-auto pb-2"
            tabIndex={0}
            role="group"
            aria-label={`${group.title ?? "Unavailable project"} columns`}
          >
            {[...group.lanes].map(([column, lane]) => (
              <section
                key={column}
                aria-label={`${group.title ?? "Unavailable project"}: ${column}`}
                tabIndex={-1}
                data-workspace-board-project-id={group.id}
                data-workspace-board-column={column}
                className="w-60 shrink-0 rounded-lg border border-border p-3"
              >
                <h3 className="break-words text-xs font-semibold">{column}</h3>
                <p className="mt-1 text-3xs text-muted-foreground">
                  {lane.total === undefined
                    ? `${lane.tasks.length} loaded; total unavailable`
                    : `${lane.tasks.length} loaded of ${lane.total}`}
                </p>
                <ul className="mt-3 space-y-2">
                  {lane.tasks.map((task) => (
                    <TaskBoardCard
                      key={`${props.environmentId}:${task.id}`}
                      environmentId={props.environmentId}
                      task={task}
                      columns={group.config?.taskColumns ?? noColumns}
                      density="resource"
                      onOpen={props.onOpen}
                      ownerProfile={props.ownerProfile}
                      ownerPresentation={props.ownerPresentation?.(task)}
                      now={props.now}
                      timeZone={props.timeZone}
                      locale={props.locale}
                      canOperate={canOperate}
                      completedColumn={group.config?.completedColumn ?? null}
                      workspaceTasksV2={props.workspaceTasksV2}
                      pending={props.pendingTaskIds?.has(task.id) ?? false}
                      refreshFailed={props.refreshFailed ?? false}
                      selected={props.selectedTaskId === task.id}
                      settingsReady={props.settingsReady}
                      onTransition={props.onTransition}
                      onRecover={props.onRecover}
                      renderItemMenu={props.renderItemMenu}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
