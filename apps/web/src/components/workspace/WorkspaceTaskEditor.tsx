import { useContext, useEffect, useRef, useState } from "react";
import { useBlocker, useRouter } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import * as DateTime from "effect/DateTime";
import {
  WorkspaceTaskPatch,
  WorkspaceTaskUpsert,
  WorkspaceToolsError,
  type EnvironmentId,
  type WorkspaceProjectConfig,
  type WorkspaceTask,
  type WorkspaceTaskSummary,
  type ServerSettings,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  formatWorkspaceTaskDueOn,
  millisecondsUntilWorkspaceMidnight,
} from "@t3tools/client-runtime/state/workspaceTaskDates";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { workspaceTools } from "../../state/workspaceTools";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { randomUUID } from "../../lib/utils";
import { timestampLocale } from "../../timestampFormat";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { WorkspaceItemActions } from "./WorkspaceItemActions";
import { WorkspaceItemMutationContext } from "./WorkspaceEngagement";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
import { parseWorkspaceSearch } from "./workspaceNavigation";
import { TaskOwner } from "./WorkspaceTaskRow";

const isToolsError = Schema.is(WorkspaceToolsError);
const isPatch = Schema.is(WorkspaceTaskPatch);
const isUpsert = Schema.is(WorkspaceTaskUpsert);
export const workspaceToolsError = (result: Parameters<typeof squashAtomCommandFailure>[0]) => {
  const cause = squashAtomCommandFailure(result);
  return cause instanceof Error ? cause.message : "The workspace change could not be saved.";
};

export function useTaskDateClock(timeZone: string, enabled: boolean) {
  const [now, setNow] = useState(DateTime.nowUnsafe);
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const next = DateTime.nowUnsafe();
      setNow(next);
      clearTimeout(timer);
      timer = setTimeout(refresh, millisecondsUntilWorkspaceMidnight(next, timeZone));
    };
    const resume = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [timeZone, enabled]);
  return now;
}

/** Adapts the legacy project read without fetching each row again. */
export function workspaceTaskSummary(
  task: WorkspaceTask,
  projectTitle: string,
): WorkspaceTaskSummary {
  return {
    ...task,
    projectTitle,
    revision: task.revision ?? 0,
    done: task.done ?? false,
    dueOn: task.dueOn ?? null,
    areaLabel: task.areaLabel ?? null,
    owner: task.owner ?? null,
  };
}
function editable(task: WorkspaceTask | null, config: WorkspaceProjectConfig) {
  return {
    title: task?.title ?? "",
    column: task?.column ?? config.taskColumns[0] ?? "",
    dueOn: task?.dueOn ?? "",
    areaLabel: task?.areaLabel ?? "",
    owner: task ? (task.owner ?? null) : ("environment-owner" as "environment-owner" | null),
  };
}
type Fields = ReturnType<typeof editable>;
function changes(draft: Fields, base: Fields) {
  return {
    ...(draft.title.trim() !== base.title ? { title: draft.title.trim() } : {}),
    ...(draft.column !== base.column ? { column: draft.column } : {}),
    ...((draft.dueOn || null) !== (base.dueOn || null) ? { dueOn: draft.dueOn || null } : {}),
    ...((draft.areaLabel.trim() || null) !== (base.areaLabel || null)
      ? { areaLabel: draft.areaLabel.trim() || null }
      : {}),
    ...(draft.owner !== base.owner ? { owner: draft.owner } : {}),
  };
}
interface EditorProps {
  readonly environmentId: EnvironmentId;
  readonly task: WorkspaceTaskSummary | null;
  readonly config: WorkspaceProjectConfig;
  readonly projectTitle: string;
  readonly ownerProfile?: ServerSettings["workspaceOwnerProfile"];
  readonly legacy?: boolean;
  readonly unavailable?: boolean;
  readonly onClose: () => void;
  readonly onSaved?: (task: WorkspaceTask) => void;
  readonly onBusyChange?: (busy: boolean) => void;
  readonly onDirtyChange?: (dirty: boolean) => void;
  readonly backLabel?: string;
}
/** Identity owns the draft and create ID, including late command continuations. */
export function WorkspaceTaskEditor(props: EditorProps) {
  return (
    <TaskEditorForm
      key={`${props.environmentId}:${props.config.projectId}:${props.task?.id ?? "new"}`}
      {...props}
    />
  );
}

function DiscardPrompt({ onDiscard, onKeep }: { onDiscard: () => void; onKeep: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-label="Discard task changes?"
      className="space-y-2 rounded-md border border-border p-3"
    >
      <p className="text-sm">Discard unsaved task changes?</p>
      <Button type="button" size="sm" variant="destructive" onClick={onDiscard}>
        Discard changes
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onKeep}>
        Keep editing
      </Button>
    </div>
  );
}
function TaskNavigationGuard({
  dirty,
  busy,
  hidden,
  environmentId,
  taskId,
  consumeNavigationPermission,
}: {
  dirty: boolean;
  busy: boolean;
  hidden: boolean;
  environmentId: EnvironmentId;
  taskId: string | null;
  consumeNavigationPermission: () => boolean;
}) {
  const blocker = useBlocker({
    disabled: hidden || (!dirty && !busy),
    enableBeforeUnload: !hidden && (dirty || busy),
    withResolver: true,
    shouldBlockFn: ({ current, next }) => {
      if (consumeNavigationPermission()) return false;
      const from = parseWorkspaceSearch(current.search as Record<string, unknown>);
      const to = parseWorkspaceSearch(next.search as Record<string, unknown>);
      return (
        busy ||
        current.pathname !== next.pathname ||
        (to.environment ?? environmentId) !== environmentId ||
        from.space !== to.space ||
        to.item !== from.item ||
        (taskId === null && to.project !== from.project)
      );
    },
  });
  return blocker.status === "blocked" && !hidden ? (
    <DiscardPrompt onDiscard={blocker.proceed} onKeep={blocker.reset} />
  ) : null;
}
function TaskEditorForm({
  environmentId,
  task,
  config,
  projectTitle,
  ownerProfile = null,
  legacy = false,
  unavailable = false,
  onClose,
  onSaved,
  onBusyChange,
  onDirtyChange,
  backLabel,
}: EditorProps) {
  const canOperate = useWorkspaceCanOperate(environmentId);
  const connected = useConnectedEnvironmentIds().includes(environmentId);
  const capability = useMailCapabilities(environmentId);
  const modern = !legacy && capability.workspaceTasksV2;
  const allowed = connected && canOperate && (legacy || modern);
  const hidden = useContext(WorkspaceResourcesBodyContext)?.hidden ?? false;
  const router = useRouter({ warn: false });
  const invalidate = useContext(WorkspaceItemMutationContext);
  const patch = useAtomCommand(workspaceTools.patchTask, { reportFailure: false });
  const createTask = useAtomCommand(workspaceTools.upsertTask, { reportFailure: false });
  const remove = useAtomCommand(workspaceTools.deleteTask, { reportFailure: false });
  const [createId, setCreateId] = useState(() => `wskt_${randomUUID()}`);
  const [base, setBase] = useState(() => ({
    fields: editable(task, config),
    revision: task?.revision ?? 0,
  }));
  const [draft, setDraft] = useState(base.fields);
  const [busy, setBusy] = useState(false);
  const flight = useRef(false);
  const allowNext = useRef(false);
  const active = useRef(true);
  const busyCallback = useRef(onBusyChange);
  const dirtyCallback = useRef(onDirtyChange);
  useEffect(() => {
    busyCallback.current = onBusyChange;
  }, [onBusyChange]);
  useEffect(() => {
    dirtyCallback.current = onDirtyChange;
  }, [onDirtyChange]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (flight.current) busyCallback.current?.(false);
      dirtyCallback.current?.(false);
    };
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [missing, setMissing] = useState(false);
  const latestQuery = useEnvironmentQuery(
    conflict && task && modern
      ? workspaceTools.task({ environmentId, input: { id: task.id } })
      : null,
  );
  const conflictTaskId = task?.id;
  const { refresh: refreshLatest } = latestQuery;
  useEffect(() => {
    if (conflict && conflictTaskId && modern) refreshLatest();
  }, [conflict, conflictTaskId, modern, refreshLatest]);
  const targetMissing =
    unavailable ||
    missing ||
    (conflict && isToolsError(latestQuery.failure) && latestQuery.failure.kind === "not-found");
  const latest =
    latestQuery.data?.id === task?.id && (latestQuery.data?.revision ?? 0) >= (task?.revision ?? 0)
      ? latestQuery.data
      : task;
  const delta = changes(draft, base.fields);
  const dirty = Object.keys(delta).length > 0;
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  const changed = task !== null && (latest?.revision ?? 0) > base.revision;
  const [dismissedRevision, setDismissedRevision] = useState<number | null>(null);
  const showConflict =
    (conflict || (dirty && changed)) && latest?.revision !== dismissedRevision && !targetMissing;
  const [copied, setCopied] = useState(false);
  const [observed, setObserved] = useState(task);
  if (observed !== task) {
    setObserved(task);
    if (!dirty && !busy && task && task.revision >= base.revision) {
      const fields = editable(task, config);
      setBase({ fields, revision: task.revision });
      setDraft(fields);
    }
  }
  const [discard, setDiscard] = useState<"reload" | "close" | null>(null);
  if (hidden && discard) setDiscard(null);
  const zone = useEnvironmentSettings(
    environmentId,
    (settings) => settings.workspaceDisplayTimeZone,
  );
  const now = useTaskDateClock(
    zone ?? "UTC",
    modern && capability.ready && !!draft.dueOn && !hidden,
  );
  const date = capability.ready
    ? formatWorkspaceTaskDueOn(draft.dueOn || null, now, zone ?? "UTC", timestampLocale)
    : null;
  const reset = (current: WorkspaceTask) => {
    const fields = editable(current, config);
    setBase({ fields, revision: current.revision ?? 0 });
    setDraft(fields);
    setConflict(false);
    setError(null);
  };
  const close = () => {
    if (flight.current) return;
    if (dirty) setDiscard("close");
    else onClose();
  };
  const setPending = (value: boolean) => {
    flight.current = value;
    setBusy(value);
    onBusyChange?.(value);
  };
  const handleFailure = (result: Parameters<typeof workspaceToolsError>[0]) => {
    const cause = squashAtomCommandFailure(result);
    setError(workspaceToolsError(result));
    if (isToolsError(cause)) {
      if (cause.kind === "conflict") {
        setDismissedRevision(null);
        setConflict(true);
        if (conflict) latestQuery.refresh();
      }
      if (cause.kind === "not-found") setMissing(true);
    }
  };
  const disabled = busy || !allowed || targetMissing;
  return (
    <section
      aria-label={task ? "Selected task" : "New task"}
      className="space-y-3 rounded-lg border border-border bg-background p-3"
    >
      {router ? (
        <TaskNavigationGuard
          dirty={dirty}
          busy={busy}
          hidden={hidden}
          environmentId={environmentId}
          taskId={task?.id ?? null}
          consumeNavigationPermission={() => {
            const permitted = allowNext.current;
            allowNext.current = false;
            return permitted;
          }}
        />
      ) : null}
      {backLabel ? (
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={close}>
          {backLabel}
        </Button>
      ) : null}
      <h3 className="text-sm font-medium">{task?.title ?? "New task"}</h3>
      <p className="text-xs text-muted-foreground">{projectTitle}</p>
      {task && !hidden ? (
        <WorkspaceItemActions
          shortcuts
          environmentId={environmentId}
          item={{ ref: { type: "task", taskId: task.id }, title: task.title }}
          confirmed={[{ ref: { type: "project", projectId: task.projectId } }]}
        />
      ) : null}
      {!allowed ? (
        <p className="text-xs text-muted-foreground">
          {!connected
            ? "Connection unavailable. Reconnect to save task changes."
            : canOperate
              ? "Tasks need a newer server."
              : "This connection is read-only."}
        </p>
      ) : null}
      <form
        className="grid min-w-0 gap-3 sm:grid-cols-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (flight.current || disabled) return;
          if (task && !dirty) {
            onClose();
            return;
          }
          const input = task
            ? { id: task.id, expectedRevision: base.revision, ...delta }
            : {
                id: createId,
                projectId: config.projectId,
                title: draft.title.trim(),
                column: draft.column,
                ...(modern
                  ? {
                      dueOn: draft.dueOn || null,
                      areaLabel: draft.areaLabel.trim() || null,
                      owner: draft.owner,
                    }
                  : {}),
              };
          if (
            !(task && modern
              ? isPatch(input)
              : isUpsert(
                  task
                    ? {
                        id: task.id,
                        projectId: config.projectId,
                        title: draft.title.trim(),
                        column: draft.column,
                      }
                    : input,
                )) ||
            !config.taskColumns.includes(draft.column) ||
            !draft.title.trim()
          ) {
            setError(
              "Enter a title of 1 to 240 characters, a configured column, a valid due date and an area of at most 120 characters.",
            );
            return;
          }
          setPending(true);
          setError(null);
          const result =
            task && modern
              ? await patch({
                  environmentId,
                  input: { id: task.id, expectedRevision: base.revision, ...delta },
                })
              : await createTask({
                  environmentId,
                  input: task
                    ? {
                        id: task.id,
                        projectId: task.projectId,
                        title: draft.title.trim(),
                        column: draft.column,
                      }
                    : (input as WorkspaceTaskUpsert),
                });
          if (!active.current) return;
          setPending(false);
          if (result._tag === "Failure") handleFailure(result);
          else {
            if (task) reset(result.value);
            else {
              allowNext.current = true;
              const fields = editable(null, config);
              setBase({ fields, revision: 0 });
              setDraft(fields);
              setCreateId(`wskt_${randomUUID()}`);
            }
            onSaved?.(result.value);
          }
        }}
      >
        <label className="min-w-0 space-y-1 text-sm sm:col-span-2">
          Title
          <Input
            aria-label={task ? "Task title" : "New task title"}
            value={draft.title}
            maxLength={240}
            disabled={disabled}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <label className="space-y-1 text-sm">
          Column
          <select
            aria-label={task ? "Task column" : "New task column"}
            className="block min-h-11 w-full rounded-md border border-input bg-background p-2 text-sm"
            value={draft.column}
            disabled={disabled}
            onChange={(e) => setDraft({ ...draft, column: e.target.value })}
          >
            {!config.taskColumns.includes(draft.column) ? (
              <option value={draft.column}>{draft.column} (unavailable)</option>
            ) : null}
            {config.taskColumns.map((column) => (
              <option key={column}>{column}</option>
            ))}
          </select>
        </label>
        {modern ? (
          <>
            <label className="space-y-1 text-sm">
              Owner
              <select
                aria-label={task ? "Owner" : "New task owner"}
                className="block min-h-11 w-full rounded-md border border-input bg-background p-2 text-sm"
                value={draft.owner ?? ""}
                disabled={disabled}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    owner: e.target.value === "environment-owner" ? "environment-owner" : null,
                  })
                }
              >
                <option value="environment-owner">Me</option>
                <option value="">Unassigned</option>
              </select>
            </label>
            {task ? <TaskOwner owner={draft.owner} profile={ownerProfile} /> : null}
            <label className="space-y-1 text-sm">
              Due date
              <Input
                type="date"
                aria-label={task ? "Due date" : "New task due date"}
                value={draft.dueOn}
                min="0001-01-01"
                max="9999-12-31"
                disabled={disabled}
                onChange={(e) => setDraft({ ...draft, dueOn: e.target.value })}
              />
            </label>
            <label className="min-w-0 space-y-1 text-sm">
              Area
              <Input
                aria-label={task ? "Area" : "New task area"}
                value={draft.areaLabel}
                maxLength={120}
                disabled={disabled}
                onChange={(e) => setDraft({ ...draft, areaLabel: e.target.value })}
              />
            </label>
            {draft.dueOn && !capability.ready ? (
              <p className="text-xs text-muted-foreground">Loading workspace timezone...</p>
            ) : null}
            {date && (!zone || date.usingUtcFallback) ? (
              <p className="text-xs text-muted-foreground">
                Workspace timezone unavailable. Dates use UTC.
              </p>
            ) : null}
            {date ? (
              <time
                dateTime={draft.dueOn}
                aria-label={`${date.fullDate}${date.overdue && !task?.done ? ", overdue" : ""}`}
                className="text-xs text-muted-foreground"
              >
                {date.label}
              </time>
            ) : null}
          </>
        ) : null}
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button
            type="submit"
            size="sm"
            disabled={disabled || !draft.title.trim() || (task !== null && !dirty)}
          >
            {task ? "Save task" : "Add task"}
          </Button>
          {task ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={async () => {
                if (flight.current || disabled) return;
                setPending(true);
                setError(null);
                const result = await remove({ environmentId, input: { id: task.id } });
                if (!active.current) return;
                setPending(false);
                if (result._tag === "Failure") handleFailure(result);
                else {
                  allowNext.current = true;
                  invalidate?.(environmentId, { type: "task", taskId: task.id });
                  onClose();
                }
              }}
            >
              Delete task
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={close}>
            {task ? "Close task" : "Cancel"}
          </Button>
        </div>
      </form>
      {busy ? (
        <p role="status" className="text-xs text-muted-foreground">
          Saving task...
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {showConflict ? (
        <div className="space-y-2 text-xs" aria-label="Task conflict">
          {!error ? <p role="status">This task changed on another client.</p> : null}
          {latest ? (
            <div aria-label="Current server values">
              <p>{latest.title}</p>
              <p>
                {latest.column} ·{" "}
                {formatWorkspaceTaskDueOn(latest.dueOn, now, zone ?? "UTC", timestampLocale)
                  ?.fullDate ?? "No due date"}{" "}
                · {latest.areaLabel ?? "No area"}
              </p>
              <p>
                Owner:{" "}
                {latest.owner === "environment-owner"
                  ? (ownerProfile?.displayName ?? "Me")
                  : "Unassigned"}
              </p>
            </div>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !latest}
            onClick={() => {
              if (dirty) setDiscard("reload");
              else if (latest) reset(latest);
            }}
          >
            Reload latest
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setDismissedRevision(latest?.revision ?? null);
              setError(null);
            }}
          >
            Keep editing
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !latest || (latest.revision ?? 0) === base.revision}
            onClick={() => {
              if (!latest) return;
              const fields = editable(latest, config);
              setBase({ fields, revision: latest.revision ?? 0 });
              setDraft({
                ...fields,
                ...delta,
                dueOn: delta.dueOn === undefined ? fields.dueOn : (delta.dueOn ?? ""),
                areaLabel:
                  delta.areaLabel === undefined ? fields.areaLabel : (delta.areaLabel ?? ""),
              });
              setConflict(false);
              setError(null);
            }}
          >
            Reapply my changes
          </Button>
        </div>
      ) : null}
      {targetMissing ? (
        <div className="space-y-2 text-xs">
          <p role="status">
            This task was deleted. Its links have been kept. Copy your draft or discard it.
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || hidden}
            onClick={async () => {
              try {
                const didCopy = await writeTextToClipboard(
                  [
                    draft.title,
                    `Project: ${projectTitle}`,
                    `Column: ${draft.column}`,
                    `Due date: ${draft.dueOn || "No due date"}`,
                    `Area: ${draft.areaLabel || "No area"}`,
                    `Owner: ${draft.owner === "environment-owner" ? (ownerProfile?.displayName ?? "Me") : "Unassigned"}`,
                  ].join("\n"),
                  "task draft",
                );
                if (active.current) {
                  setCopied(didCopy);
                  setError(null);
                }
              } catch (cause) {
                if (active.current)
                  setError(
                    cause instanceof Error ? cause.message : "The draft could not be copied.",
                  );
              }
            }}
          >
            Copy draft
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={close}>
            Discard draft
          </Button>
          {copied ? <p role="status">Draft copied.</p> : null}
        </div>
      ) : null}
      {discard && !hidden ? (
        <DiscardPrompt
          onKeep={() => setDiscard(null)}
          onDiscard={() => {
            const action = discard;
            setDiscard(null);
            if (action === "reload" && latest) reset(latest);
            else {
              allowNext.current = true;
              onClose();
            }
          }}
        />
      ) : null}
      {task ? (
        <p className="text-xs text-muted-foreground">
          Deleting a task keeps its links; the task will be unavailable when opened from them.
        </p>
      ) : null}
    </section>
  );
}
