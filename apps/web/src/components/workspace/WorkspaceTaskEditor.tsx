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
import { millisecondsUntilWorkspaceMidnight } from "@t3tools/client-runtime/state/workspaceTaskDates";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { workspaceTools } from "../../state/workspaceTools";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { randomUUID } from "../../lib/utils";
import { timestampLocale } from "../../timestampFormat";
import { WorkspaceItemActions } from "./WorkspaceItemActions";
import { WorkspaceItemMutationContext } from "./WorkspaceEngagement";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
import { parseWorkspaceSearch } from "./workspaceNavigation";
import { WorkspaceTaskEditorView, WorkspaceTaskDiscardPrompt } from "./WorkspaceTaskEditorView";

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
    <WorkspaceTaskDiscardPrompt onDiscard={blocker.proceed} onKeep={blocker.reset} />
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
  const [saveConflictError, setSaveConflictError] = useState(false);
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
    setSaveConflictError(isToolsError(cause) && cause.kind === "conflict");
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
    <WorkspaceTaskEditorView
      task={task}
      config={config}
      projectTitle={projectTitle}
      ownerProfile={ownerProfile}
      draft={draft}
      modern={modern}
      allowed={allowed}
      connected={connected}
      canOperate={canOperate}
      hidden={hidden}
      busy={busy}
      disabled={disabled}
      dirty={dirty}
      backLabel={backLabel}
      settingsReady={capability.ready}
      utcFallback={!zone}
      timeZone={zone ?? "UTC"}
      locale={timestampLocale}
      now={now}
      error={error}
      showConflict={showConflict}
      saveConflictError={saveConflictError}
      latest={latest}
      baseRevision={base.revision}
      targetMissing={targetMissing}
      copied={copied}
      discard={discard !== null}
      navigationGuard={
        router ? (
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
        ) : null
      }
      actions={
        task && !hidden ? (
          <WorkspaceItemActions
            shortcuts
            environmentId={environmentId}
            item={{ ref: { type: "task", taskId: task.id }, title: task.title }}
            confirmed={[{ ref: { type: "project", projectId: task.projectId } }]}
          />
        ) : null
      }
      onDraftChange={setDraft}
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
          setSaveConflictError(false);
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
      onDelete={async () => {
        if (!task || flight.current || disabled) return;
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
      onClose={close}
      onReload={() => {
        if (dirty) setDiscard("reload");
        else if (latest) reset(latest);
      }}
      onKeepEditing={() => {
        setDismissedRevision(latest?.revision ?? null);
        setError(null);
      }}
      onReapply={() => {
        if (!latest) return;
        const fields = editable(latest, config);
        setBase({ fields, revision: latest.revision ?? 0 });
        setDraft({
          ...fields,
          ...delta,
          dueOn: delta.dueOn === undefined ? fields.dueOn : (delta.dueOn ?? ""),
          areaLabel: delta.areaLabel === undefined ? fields.areaLabel : (delta.areaLabel ?? ""),
        });
        setConflict(false);
        setError(null);
      }}
      onCopyDraft={async () => {
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
          if (active.current) {
            setSaveConflictError(false);
            setError(cause instanceof Error ? cause.message : "The draft could not be copied.");
          }
        }
      }}
      onKeepDraft={() => setDiscard(null)}
      onDiscardDraft={() => {
        const action = discard;
        setDiscard(null);
        if (action === "reload" && latest) reset(latest);
        else {
          allowNext.current = true;
          onClose();
        }
      }}
    />
  );
}
