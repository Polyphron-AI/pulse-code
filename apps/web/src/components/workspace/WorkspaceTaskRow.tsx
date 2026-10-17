import { memo, useId, useRef, useState, type ReactNode } from "react";
import { UserRound } from "lucide-react";
import * as Cause from "effect/Cause";
import type * as DateTime from "effect/DateTime";
import type {
  EnvironmentId,
  ServerSettings,
  WorkspaceItemRef,
  WorkspaceTask,
  WorkspaceTaskSummary,
  WorkspaceTaskTransition,
} from "@t3tools/contracts";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import { formatWorkspaceTaskDueOn } from "@t3tools/client-runtime/state/workspaceTaskDates";
export type TaskTransitionHandler = (request: {
  environmentId: EnvironmentId;
  input: WorkspaceTaskTransition;
}) => Promise<AtomCommandResult<WorkspaceTask, unknown>>;
export function TaskOwner({
  owner,
  profile,
  presentation,
}: {
  owner: WorkspaceTask["owner"];
  profile: ServerSettings["workspaceOwnerProfile"];
  presentation?: ServerSettings["workspaceOwnerProfile"] | undefined;
}) {
  const assigned = presentation != null || owner === "environment-owner";
  const display = presentation ?? profile;
  return (
    <span
      role="img"
      aria-label={assigned ? (display?.displayName ?? "Me") : "Unassigned"}
      className={
        assigned
          ? "inline-flex size-[19px] shrink-0 items-center justify-center rounded-full bg-primary/15 text-4xs font-semibold text-primary ring-1 ring-background"
          : "inline-flex size-[19px] shrink-0 items-center justify-center text-muted-foreground"
      }
    >
      {assigned ? (display?.initials ?? "Me") : <UserRound className="size-3" aria-hidden="true" />}
    </span>
  );
}
export interface WorkspaceTaskRowProps {
  readonly environmentId: EnvironmentId;
  readonly task: WorkspaceTaskSummary;
  readonly density: "list" | "resource";
  readonly onOpen: (ref: WorkspaceItemRef) => void;
  readonly ownerProfile: ServerSettings["workspaceOwnerProfile"];
  readonly ownerPresentation?: ServerSettings["workspaceOwnerProfile"] | undefined;
  readonly now: DateTime.DateTime;
  readonly timeZone: string;
  readonly locale?: string | undefined;
  readonly canOperate: boolean;
  readonly completedColumn: string | null;
  readonly workspaceTasksV2: boolean;
  readonly pending: boolean;
  readonly selected?: boolean;
  readonly settingsReady?: boolean | undefined;
  readonly onTransition: TaskTransitionHandler;
  readonly renderItemMenu?:
    | ((task: WorkspaceTaskSummary, children: ReactNode) => ReactNode)
    | undefined;
}
export const WorkspaceTaskRow = memo(function WorkspaceTaskRow({
  environmentId,
  task,
  density,
  onOpen,
  ownerProfile,
  ownerPresentation,
  now,
  timeZone,
  locale,
  canOperate,
  completedColumn,
  workspaceTasksV2,
  pending,
  selected,
  settingsReady,
  onTransition,
  renderItemMenu,
}: WorkspaceTaskRowProps) {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const explanation = useId();
  const due =
    settingsReady === false ? null : formatWorkspaceTaskDueOn(task.dueOn, now, timeZone, locale);
  const disabled = !workspaceTasksV2 || !canOperate || pending || busy || completedColumn === null;
  const title = (
    <button
      type="button"
      aria-label={`Open ${task.title}`}
      aria-current={selected ? "true" : undefined}
      className="w-full min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-ring"
      onClick={() => onOpen({ type: "task", taskId: task.id })}
    >
      <span
        className={`block truncate leading-4.5 ${density === "list" ? "text-xs" : "text-2xs"} ${task.done ? "text-muted-foreground line-through" : "text-foreground"}`}
      >
        {task.title}
      </span>
      <span className="block truncate text-3xs leading-4.5 text-muted-foreground">
        {task.projectTitle}
        {task.areaLabel ? ` · ${task.areaLabel}` : ""}
      </span>
    </button>
  );
  return (
    <li data-workspace-task-row="" className="border-b border-border">
      <div className="flex h-[58px] min-w-0 items-center">
        <label className="relative mr-[6px] flex h-11 w-5 shrink-0 items-center justify-start pl-1 max-md:mr-0 max-md:w-11">
          <input
            type="checkbox"
            className="size-3 cursor-pointer accent-primary disabled:cursor-default"
            aria-label={`${task.done ? "Reopen" : "Complete"} ${task.title}`}
            aria-describedby={completedColumn === null ? explanation : undefined}
            checked={task.done}
            disabled={disabled}
            onChange={async (event) => {
              if (disabled || inFlight.current) return;
              const request = {
                environmentId,
                input: {
                  id: task.id,
                  expectedRevision: task.revision,
                  change: { type: "completion" as const, completed: event.target.checked },
                },
              };
              inFlight.current = true;
              setBusy(true);
              setError(null);
              try {
                const result = await onTransition(request);
                if (result._tag === "Failure") {
                  const cause = Cause.squash(result.cause);
                  setError(
                    cause instanceof Error ? cause.message : "The task could not be updated.",
                  );
                }
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "The task could not be updated.");
              } finally {
                inFlight.current = false;
                setBusy(false);
              }
            }}
          />
        </label>
        <div className="min-w-0 flex-1">{renderItemMenu ? renderItemMenu(task, title) : title}</div>
        <span className="w-[58px] shrink-0 text-right text-3xs text-muted-foreground">
          {due ? (
            <time
              dateTime={task.dueOn!}
              aria-label={`${due.fullDate}${due.overdue && !task.done ? ", overdue" : ""}`}
            >
              {due.label}
            </time>
          ) : null}
        </span>
        <span className="flex w-8 shrink-0 items-center justify-end pr-0.75">
          <TaskOwner owner={task.owner} profile={ownerProfile} presentation={ownerPresentation} />
        </span>
      </div>
      {completedColumn === null ? (
        <span id={explanation} className="sr-only">
          Choose a completed column in{" "}
          <a
            href={`/workspace?space=projects&environment=${encodeURIComponent(environmentId)}&project=${encodeURIComponent(task.projectId)}`}
          >
            project workspace settings
          </a>{" "}
          to complete or reopen tasks.
        </span>
      ) : null}
      {error ? (
        <p role="alert" className="pb-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  );
});
