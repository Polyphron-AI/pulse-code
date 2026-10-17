import type { FormEvent, ReactNode } from "react";
import type * as DateTime from "effect/DateTime";
import type {
  ServerSettings,
  WorkspaceProjectConfig,
  WorkspaceTask,
  WorkspaceTaskSummary,
} from "@t3tools/contracts";
import { formatWorkspaceTaskDueOn } from "@t3tools/client-runtime/state/workspaceTaskDates";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { TaskOwner } from "./WorkspaceTaskRow";

export interface WorkspaceTaskEditorFields {
  readonly title: string;
  readonly column: string;
  readonly dueOn: string;
  readonly areaLabel: string;
  readonly owner: "environment-owner" | null;
}
export interface WorkspaceTaskEditorViewProps {
  readonly task: WorkspaceTaskSummary | null;
  readonly config: WorkspaceProjectConfig;
  readonly projectTitle: string;
  readonly ownerProfile: ServerSettings["workspaceOwnerProfile"];
  readonly draft: WorkspaceTaskEditorFields;
  readonly modern: boolean;
  readonly allowed: boolean;
  readonly connected: boolean;
  readonly canOperate: boolean;
  readonly hidden: boolean;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly dirty: boolean;
  readonly backLabel?: string | undefined;
  readonly settingsReady: boolean;
  readonly utcFallback: boolean;
  readonly timeZone: string;
  readonly locale: string | undefined;
  readonly now: DateTime.DateTime;
  readonly error: string | null;
  readonly showConflict: boolean;
  readonly saveConflictError: boolean;
  readonly latest: WorkspaceTask | null;
  readonly baseRevision: number;
  readonly targetMissing: boolean;
  readonly copied: boolean;
  readonly discard: boolean;
  readonly navigationGuard?: ReactNode;
  readonly actions?: ReactNode;
  readonly onDraftChange: (draft: WorkspaceTaskEditorFields) => void;
  readonly onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  readonly onDelete: () => void | Promise<void>;
  readonly onClose: () => void;
  readonly onReload: () => void;
  readonly onKeepEditing: () => void;
  readonly onReapply: () => void;
  readonly onCopyDraft: () => void | Promise<void>;
  readonly onKeepDraft: () => void;
  readonly onDiscardDraft: () => void;
}
export function WorkspaceTaskDiscardPrompt({
  onDiscard,
  onKeep,
}: {
  onDiscard: () => void;
  onKeep: () => void;
}) {
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
export function WorkspaceTaskEditorView({
  task,
  config,
  projectTitle,
  ownerProfile,
  draft,
  modern,
  allowed,
  connected,
  canOperate,
  hidden,
  busy,
  disabled,
  dirty,
  backLabel,
  settingsReady,
  utcFallback,
  timeZone,
  locale,
  now,
  error,
  showConflict,
  saveConflictError,
  latest,
  baseRevision,
  targetMissing,
  copied,
  discard,
  navigationGuard,
  actions,
  onDraftChange,
  onSubmit,
  onDelete,
  onClose,
  onReload,
  onKeepEditing,
  onReapply,
  onCopyDraft,
  onKeepDraft,
  onDiscardDraft,
}: WorkspaceTaskEditorViewProps) {
  const date = settingsReady
    ? formatWorkspaceTaskDueOn(draft.dueOn || null, now, timeZone, locale)
    : null;
  return (
    <section
      aria-label={task ? "Selected task" : "New task"}
      className="space-y-3 rounded-lg border border-border bg-background p-3"
    >
      {navigationGuard}
      {backLabel ? (
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onClose}>
          {backLabel}
        </Button>
      ) : null}
      <h3 className="text-sm font-medium">{task?.title ?? "New task"}</h3>
      <p className="text-xs text-muted-foreground">{projectTitle}</p>
      {actions}
      {!allowed ? (
        <p className="text-xs text-muted-foreground">
          {!connected
            ? "Connection unavailable. Reconnect to save task changes."
            : canOperate
              ? "Tasks need a newer server."
              : "This connection is read-only."}
        </p>
      ) : null}
      <form className="grid min-w-0 gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
        <label className="min-w-0 space-y-1 text-sm sm:col-span-2">
          Title
          <Input
            aria-label={task ? "Task title" : "New task title"}
            value={draft.title}
            maxLength={240}
            disabled={disabled}
            onChange={(e) => onDraftChange({ ...draft, title: e.target.value })}
          />
        </label>
        <label className="space-y-1 text-sm">
          Column
          <select
            aria-label={task ? "Task column" : "New task column"}
            className="block min-h-11 w-full rounded-md border border-input bg-background p-2 text-sm"
            value={draft.column}
            disabled={disabled}
            onChange={(e) => onDraftChange({ ...draft, column: e.target.value })}
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
                  onDraftChange({
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
                onChange={(e) => onDraftChange({ ...draft, dueOn: e.target.value })}
              />
            </label>
            <label className="min-w-0 space-y-1 text-sm">
              Area
              <Input
                aria-label={task ? "Area" : "New task area"}
                value={draft.areaLabel}
                maxLength={120}
                disabled={disabled}
                onChange={(e) => onDraftChange({ ...draft, areaLabel: e.target.value })}
              />
            </label>
            {draft.dueOn && !settingsReady ? (
              <p className="text-xs text-muted-foreground">Loading workspace timezone...</p>
            ) : null}
            {date && (utcFallback || date.usingUtcFallback) ? (
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
            <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={onDelete}>
              Delete task
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onClose}>
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
          {!error || !saveConflictError ? (
            <p role="status">This task changed on another client.</p>
          ) : null}
          {latest ? (
            <div aria-label="Current server values">
              <p>{latest.title}</p>
              <p>
                {latest.column} ·{" "}
                {formatWorkspaceTaskDueOn(latest.dueOn, now, timeZone, locale)?.fullDate ??
                  "No due date"}{" "}
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
            onClick={onReload}
          >
            Reload latest
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onKeepEditing}>
            Keep editing
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !latest || (latest.revision ?? 0) === baseRevision}
            onClick={onReapply}
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
            onClick={onCopyDraft}
          >
            Copy draft
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onClose}>
            Discard draft
          </Button>
          {copied ? <p role="status">Draft copied.</p> : null}
        </div>
      ) : null}
      {discard && !hidden ? (
        <WorkspaceTaskDiscardPrompt onKeep={onKeepDraft} onDiscard={onDiscardDraft} />
      ) : null}
      {task ? (
        <p className="text-xs text-muted-foreground">
          Deleting a task keeps its links; the task will be unavailable when opened from them.
        </p>
      ) : null}
    </section>
  );
}
