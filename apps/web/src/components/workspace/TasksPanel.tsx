import { useRef, useState } from "react";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  type EnvironmentId,
  type ProjectId,
  type PulseTask,
  type PulseTaskFields,
  type PulseTaskMutation,
  type PulseTaskSource,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useProjects } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { useEnvironmentSessionState } from "../../state/session";
import { mutateTask, tasksSubscription } from "../../state/tasks";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { TaskPeoplePicker } from "./TaskPeoplePicker";

export interface TasksPanelProps {
  environmentId: EnvironmentId;
  projectId?: ProjectId | undefined;
  compact?: boolean | undefined;
  statusFilter?: string | undefined;
  onStatusFilterChange?: ((value: string) => void) | undefined;
  draft?: { key: string; source: PulseTaskSource; title?: string } | undefined;
  onDraftHandled?: (() => void) | undefined;
}
const statusLabels = { todo: "To do", in_progress: "In progress", review: "Review", done: "Done" };
const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground";

export function TasksPanel(props: TasksPanelProps) {
  return (
    <EnvironmentTasks
      key={`${props.environmentId}:${props.projectId ?? "all"}:${props.draft?.key ?? ""}`}
      {...props}
    />
  );
}

function EnvironmentTasks({
  environmentId,
  projectId,
  compact = false,
  statusFilter,
  onStatusFilterChange,
  draft,
  onDraftHandled,
}: TasksPanelProps) {
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const session = useEnvironmentSessionState(environmentId);
  const canRead =
    !session.hasError &&
    session.data?.authenticated === true &&
    session.data.scopes?.includes(AuthOrchestrationReadScope) === true;
  const tasks = useEnvironmentQuery(
    canRead ? tasksSubscription({ environmentId, input: {} }) : null,
  );
  const canWrite =
    canRead && session.data?.scopes?.includes(AuthOrchestrationOperateScope) === true;
  const mutate = useAtomCommand(mutateTask, { reportFailure: false });
  const [query, setQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>(projectId ?? "all");
  const [localStatus, setLocalStatus] = useState("open");
  const status = statusFilter ?? localStatus;
  const setStatus = onStatusFilterChange ?? setLocalStatus;
  const [layout, setLayout] = useState<"list" | "board">("list");
  const [editor, setEditor] = useState<PulseTask | "new" | null>(draft ? "new" : null);
  const [editorDraft, setEditorDraft] = useState(draft);
  function finishEditor() {
    setEditor(null);
    setEditorDraft(undefined);
    if (editorDraft) onDraftHandled?.();
  }
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState<string>();
  const records = canRead ? (tasks.data ?? []) : [];
  const visible = records
    .filter((task) => {
      if (status === "archived" ? !task.archived : task.archived) return false;
      if (status === "open" && task.status === "done") return false;
      if (status in statusLabels && task.status !== status) return false;
      if (
        projectFilter === "none"
          ? task.projectId !== null
          : projectFilter !== "all" && task.projectId !== projectFilter
      )
        return false;
      return `${task.title} ${task.description} ${task.tags.join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase());
    })
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const projectColumns =
    projects.find((project) => project.id === projectFilter)?.office?.taskColumns ?? [];
  const taskGroup = (task: PulseTask) =>
    projectColumns.some((column) => column.id === task.columnId && column.status === task.status)
      ? `column:${task.columnId}`
      : `status:${task.status}`;
  const boardGroups = [
    ...projectColumns.map((column) => [`column:${column.id}`, column.name]),
    ...Object.entries(statusLabels)
      .filter(
        ([status]) =>
          !projectColumns.some((column) => column.status === status) ||
          visible.some((task) => taskGroup(task) === `status:${status}`),
      )
      .map(([status, name]) => [`status:${status}`, name]),
  ];

  async function save(input: PulseTaskMutation) {
    if (pending.current || !canWrite) return false;
    pending.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const result = await mutate({ environmentId, input });
      if (result._tag === "Failure") throw squashAtomCommandFailure(result);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The task could not be saved.");
      return false;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="flex h-full min-h-0 flex-col" aria-label="Tasks">
      <header className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div>
          <h2 className="text-base font-semibold">Tasks</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {projectId
              ? "Project work, shared with this environment."
              : "Shared work across your projects."}
          </p>
        </div>
        <Button
          size="sm"
          disabled={!canWrite || busy}
          onClick={() => {
            setError(undefined);
            setEditor("new");
          }}
        >
          Add task
        </Button>
      </header>
      <div className="space-y-2 border-b border-border p-3">
        <Input
          aria-label="Search tasks"
          placeholder="Search tasks or tags…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <select
            className={selectClass}
            aria-label="Filter task status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="open">Open tasks</option>
            <option value="all">All tasks</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
            <option value="archived">Archived</option>
          </select>
          <select
            className={`${selectClass} max-w-full`}
            aria-label="Filter task project"
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
          >
            <option value="all">All projects</option>
            <option value="none">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
          <span className="self-center text-xs text-muted-foreground">{visible.length} tasks</span>
          {!compact && (
            <div className="ml-auto flex gap-1" aria-label="Task layout">
              <Button
                size="sm"
                variant={layout === "list" ? "secondary" : "ghost"}
                aria-pressed={layout === "list"}
                onClick={() => setLayout("list")}
              >
                List
              </Button>
              <Button
                size="sm"
                variant={layout === "board" ? "secondary" : "ghost"}
                aria-pressed={layout === "board"}
                onClick={() => setLayout("board")}
              >
                Board
              </Button>
            </div>
          )}
        </div>
      </div>
      {(error || tasks.error) && (
        <p
          role="alert"
          className="m-3 rounded-md border border-destructive/30 p-3 text-xs text-destructive"
        >
          {error ?? tasks.error}
          <button className="ml-2 underline" onClick={tasks.refresh}>
            Reconnect
          </button>
        </p>
      )}
      {!canWrite && (
        <p className="px-4 pt-3 text-xs text-muted-foreground">
          Your connection has read-only task access.
        </p>
      )}
      <div
        className={`min-h-0 flex-1 overflow-y-auto ${!compact && editor ? "lg:grid lg:grid-cols-[minmax(0,1fr)_360px]" : ""}`}
      >
        {(!compact || !editor) && (
          <div className="min-w-0 divide-y divide-border">
            {tasks.isPending && !tasks.data && (
              <p className="p-6 text-sm text-muted-foreground">Loading tasks…</p>
            )}
            {!tasks.isPending && !tasks.error && visible.length === 0 && (
              <div className="px-6 py-12 text-center">
                <h3 className="text-sm font-medium">
                  {records.length ? "No matching tasks" : "A clear place for the next step"}
                </h3>
                <p className="mt-2 text-xs text-muted-foreground">
                  {records.length
                    ? "Try another project, status or search."
                    : "Add a task, give it a tag and connect a project when it belongs to one."}
                </p>
              </div>
            )}
            <div
              className={
                !compact && layout === "board" ? "flex items-start gap-3 overflow-x-auto p-3" : ""
              }
            >
              {(layout === "board" && !compact ? boardGroups : [["all", ""]]).map(
                ([group, label]) => (
                  <section
                    key={group}
                    className={
                      layout === "board" && !compact
                        ? "w-64 shrink-0 rounded-lg bg-muted/35"
                        : "divide-y divide-border"
                    }
                    aria-label={label || "Task list"}
                  >
                    {label && (
                      <h3 className="flex justify-between border-b border-border p-3 text-xs font-semibold">
                        {label}
                        <span className="text-muted-foreground">
                          {visible.filter((task) => taskGroup(task) === group).length}
                        </span>
                      </h3>
                    )}
                    {visible
                      .filter((task) => group === "all" || taskGroup(task) === group)
                      .map((task) => (
                        <article
                          key={task.id}
                          className={`group flex items-start gap-3 p-4 ${editor !== "new" && editor?.id === task.id ? "bg-accent/50" : "hover:bg-accent/30"}`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1 size-4 accent-primary"
                            aria-label={`${task.status === "done" ? "Reopen" : "Complete"} ${task.title}`}
                            checked={task.status === "done"}
                            disabled={!canWrite || busy || task.archived}
                            onChange={() =>
                              void save({
                                operation: "update",
                                ...task,
                                status: task.status === "done" ? "todo" : "done",
                                columnId: null,
                              })
                            }
                          />
                          <button
                            className="min-w-0 flex-1 text-left"
                            onClick={() => {
                              setError(undefined);
                              setEditor(task);
                            }}
                          >
                            <span
                              className={`block break-words text-sm font-medium ${task.status === "done" ? "text-muted-foreground line-through" : ""}`}
                            >
                              {task.title}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {statusLabels[task.status]}
                              {task.projectId
                                ? ` · ${projects.find((project) => project.id === task.projectId)?.title ?? "Unavailable project"}`
                                : ""}
                            </span>
                            {task.dueDate && (
                              <span className="mt-1 block text-xs text-muted-foreground">
                                Due {task.dueDate}
                              </span>
                            )}
                            {task.assignee && (
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {task.assignee.displayName}
                              </span>
                            )}
                            {task.recurrence && (
                              <span className="mt-1 block text-xs text-muted-foreground">
                                Every {task.recurrence.interval}{" "}
                                {task.recurrence.frequency === "daily"
                                  ? "day"
                                  : task.recurrence.frequency === "weekly"
                                    ? "week"
                                    : "month"}
                                {task.recurrence.interval === 1 ? "" : "s"}
                                {task.recurrence.mode === "after_completion"
                                  ? " after completion"
                                  : " on schedule"}
                              </span>
                            )}
                            {task.parentTaskId && (
                              <span className="mt-1 block truncate text-xs text-muted-foreground">
                                Subtask of{" "}
                                {records.find((record) => record.id === task.parentTaskId)?.title ??
                                  "Unavailable task"}
                              </span>
                            )}
                            {task.dependencyIds.some(
                              (id) => records.find((record) => record.id === id)?.status !== "done",
                            ) && (
                              <span className="mt-1 block text-xs text-muted-foreground">
                                Waiting on dependencies
                              </span>
                            )}
                            {task.tags.length > 0 && (
                              <span className="mt-2 flex flex-wrap gap-1">
                                {task.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground"
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </span>
                            )}
                          </button>
                        </article>
                      ))}
                  </section>
                ),
              )}
            </div>
          </div>
        )}
        {editor && canRead && (
          <TaskEditor
            key={editor === "new" ? "new" : editor.id}
            task={editor === "new" ? null : editor}
            draft={editorDraft}
            records={records}
            onOpenTask={setEditor}
            defaultProjectId={
              projectFilter !== "all" && projectFilter !== "none"
                ? (projects.find((project) => project.id === projectFilter)?.id ?? null)
                : null
            }
            projects={projects}
            busy={busy}
            canWrite={canWrite}
            onClose={finishEditor}
            onSave={async (input) => {
              if (await save(input)) finishEditor();
            }}
          />
        )}
      </div>
    </section>
  );
}

function TaskEditor({
  task,
  draft,
  records,
  onOpenTask,
  defaultProjectId,
  projects,
  busy,
  canWrite,
  onClose,
  onSave,
}: {
  task: PulseTask | null;
  draft?: TasksPanelProps["draft"];
  records: readonly PulseTask[];
  onOpenTask: (task: PulseTask) => void;
  defaultProjectId: ProjectId | null;
  projects: ReturnType<typeof useProjects>;
  busy: boolean;
  canWrite: boolean;
  onClose: () => void;
  onSave: (input: PulseTaskMutation) => Promise<void>;
}) {
  const [fields, setFields] = useState<PulseTaskFields>(
    () =>
      task ?? {
        title: (draft?.title ?? draft?.source.excerpt.split("\n")[0] ?? "").slice(0, 240),
        description: "",
        status: "todo",
        projectId: defaultProjectId,
        tags: [],
        dueDate: null,
        recurrence: null,
        columnId: null,
        assignee: null,
        followers: [],
        source: draft?.source ?? null,
        parentTaskId: null,
        dependencyIds: [],
      },
  );
  const [tags, setTags] = useState(task?.tags.join(", ") ?? "");
  const tagValues = [
    ...new Set(
      tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
  const invalidTags = tagValues.length > 20 || tagValues.some((tag) => tag.length > 40);
  const readOnly = !canWrite || busy;
  const project = projects.find((project) => project.id === fields.projectId);
  const columns = project?.office?.taskColumns ?? [];
  return (
    <form
      className="space-y-4 border-l border-border p-4"
      aria-label={task ? "Edit task" : "New task"}
      onSubmit={(event) => {
        event.preventDefault();
        if (!readOnly && fields.title.trim() && !invalidTags)
          void onSave(
            task
              ? {
                  ...fields,
                  tags: tagValues,
                  operation: "update",
                  id: task.id,
                  revision: task.revision,
                }
              : { ...fields, tags: tagValues, operation: "create" },
          );
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{task ? "Task details" : "New task"}</h3>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClose}>
          Close
        </Button>
      </div>
      <label className="block space-y-1 text-xs">
        Title
        <Input
          required
          maxLength={240}
          value={fields.title}
          disabled={readOnly}
          onChange={(event) => setFields({ ...fields, title: event.target.value })}
        />
      </label>
      <label className="block space-y-1 text-xs">
        Description
        <textarea
          className="min-h-28 w-full resize-y rounded-md border border-input bg-background p-2 text-sm"
          maxLength={10000}
          value={fields.description}
          disabled={readOnly}
          onChange={(event) => setFields({ ...fields, description: event.target.value })}
        />
      </label>
      <label className="block space-y-1 text-xs">
        Status
        <select
          className={`${selectClass} block w-full`}
          value={fields.status}
          disabled={readOnly}
          onChange={(event) =>
            setFields({
              ...fields,
              status: event.target.value as PulseTaskFields["status"],
              columnId: null,
            })
          }
        >
          {Object.entries(statusLabels).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-xs">
        Project
        <select
          className={`${selectClass} block w-full`}
          value={fields.projectId ?? ""}
          disabled={readOnly}
          onChange={(event) =>
            setFields({
              ...fields,
              projectId: projects.find((project) => project.id === event.target.value)?.id ?? null,
              columnId: null,
              assignee: null,
              followers: [],
            })
          }
        >
          <option value="">No project</option>
          {fields.projectId && !projects.some((project) => project.id === fields.projectId) && (
            <option value={fields.projectId}>Unavailable project</option>
          )}
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.title}
            </option>
          ))}
        </select>
      </label>
      {(columns.length > 0 || fields.columnId) && (
        <label className="block space-y-1 text-xs">
          Project column
          <select
            aria-label="Task project column"
            className={`${selectClass} block w-full`}
            value={fields.columnId ?? ""}
            disabled={readOnly}
            onChange={(event) => {
              const column = columns.find((column) => column.id === event.target.value);
              setFields({
                ...fields,
                columnId: column?.id ?? null,
                status: column?.status ?? fields.status,
              });
            }}
          >
            <option value="">Use shared status</option>
            {fields.columnId && !columns.some((column) => column.id === fields.columnId) && (
              <option value={fields.columnId}>Removed column (using shared status)</option>
            )}
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.name} · {statusLabels[column.status]}
              </option>
            ))}
          </select>
        </label>
      )}
      <TaskPeoplePicker
        key={fields.projectId ?? "no-project"}
        project={project}
        assignee={fields.assignee}
        followers={fields.followers}
        disabled={readOnly}
        onChange={(assignee, followers) => setFields({ ...fields, assignee, followers })}
      />
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-medium">Source context</legend>
        {task?.source?.url && (
          <a
            className="block text-xs underline"
            href={task.source.url}
            target={task.source.url.startsWith("/workspace") ? undefined : "_blank"}
            rel="noreferrer"
          >
            Open saved source
          </a>
        )}
        <label className="block space-y-1 text-xs">
          Link
          <Input
            type="text"
            inputMode="url"
            placeholder="https://… or /workspace?…"
            maxLength={8192}
            value={fields.source?.url ?? ""}
            disabled={readOnly}
            onChange={(event) =>
              setFields({
                ...fields,
                source: { url: event.target.value, excerpt: fields.source?.excerpt ?? "" },
              })
            }
          />
        </label>
        <label className="block space-y-1 text-xs">
          Excerpt
          <textarea
            className="min-h-20 w-full resize-y rounded-md border border-input bg-background p-2 text-sm"
            maxLength={10000}
            placeholder="Keep the relevant message or email context."
            value={fields.source?.excerpt ?? ""}
            disabled={readOnly}
            onChange={(event) =>
              setFields({
                ...fields,
                source: { url: fields.source?.url ?? "", excerpt: event.target.value },
              })
            }
          />
        </label>
        {fields.source && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={readOnly}
            onClick={() => setFields({ ...fields, source: null })}
          >
            Remove source
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Review this excerpt before saving. Task readers in this environment can see it.
        </p>
      </fieldset>
      <label className="block space-y-1 text-xs">
        Tags
        <Input
          value={tags}
          disabled={readOnly}
          onChange={(event) => setTags(event.target.value)}
          placeholder="marketing, launch"
        />
        <span className="text-muted-foreground">
          Separate tags with commas. Up to 20 tags, 40 characters each.
        </span>
      </label>
      <label className="block space-y-1 text-xs">
        Due date
        <Input
          type="date"
          required={fields.recurrence?.mode === "fixed"}
          value={fields.dueDate ?? ""}
          disabled={readOnly}
          onChange={(event) => setFields({ ...fields, dueDate: event.target.value || null })}
        />
      </label>
      <label className="block space-y-1 text-xs">
        Repeat
        <select
          className={`${selectClass} block w-full`}
          value={fields.recurrence?.mode ?? "none"}
          disabled={readOnly || !!task?.nextOccurrenceId}
          onChange={(event) =>
            setFields({
              ...fields,
              recurrence:
                event.target.value === "none"
                  ? null
                  : {
                      mode: event.target.value as "fixed" | "after_completion",
                      frequency: fields.recurrence?.frequency ?? "weekly",
                      interval: fields.recurrence?.interval ?? 1,
                    },
            })
          }
        >
          <option value="none">Does not repeat</option>
          <option value="fixed">On a fixed schedule</option>
          <option value="after_completion">After completion</option>
        </select>
      </label>
      {fields.recurrence && (
        <fieldset className="space-y-2">
          <legend className="text-xs">Repeat every</legend>
          <div className="flex gap-2">
            <Input
              type="number"
              aria-label="Recurrence interval"
              min={1}
              max={365}
              step={1}
              className="w-20"
              value={fields.recurrence.interval}
              disabled={readOnly || !!task?.nextOccurrenceId}
              onChange={(event) =>
                setFields({
                  ...fields,
                  recurrence: { ...fields.recurrence!, interval: Number(event.target.value) },
                })
              }
            />
            <select
              aria-label="Recurrence frequency"
              className={`${selectClass} flex-1`}
              value={fields.recurrence.frequency}
              disabled={readOnly || !!task?.nextOccurrenceId}
              onChange={(event) =>
                setFields({
                  ...fields,
                  recurrence: {
                    ...fields.recurrence!,
                    frequency: event.target.value as "daily" | "weekly" | "monthly",
                  },
                })
              }
            >
              <option value="daily">days</option>
              <option value="weekly">weeks</option>
              <option value="monthly">months</option>
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            {fields.recurrence.mode === "fixed"
              ? "Completing this task creates the next scheduled task. Missed dates are skipped; monthly repeats keep the original day, or the last day of a shorter month. A due date is required."
              : "Completing this task creates another task due this many days, weeks or months after the completion date."}{" "}
            Dates follow the host environment's local calendar.
          </p>
          <p className="text-xs text-muted-foreground">
            The next task keeps the title, description, project and tags. Subtasks and dependencies
            stay with this occurrence.
          </p>
        </fieldset>
      )}
      {task?.nextOccurrenceId && (
        <p className="text-xs text-muted-foreground">
          The next occurrence already exists. Reopening this task will not create another.
          <button
            type="button"
            className="ml-1 underline"
            disabled={busy}
            onClick={() => {
              const next = records.find((record) => record.id === task.nextOccurrenceId);
              if (next) onOpenTask(next);
            }}
          >
            Open next occurrence
          </button>
        </p>
      )}
      <label className="block space-y-1 text-xs">
        Parent task
        <select
          className={`${selectClass} block w-full`}
          value={fields.parentTaskId ?? ""}
          disabled={readOnly}
          onChange={(event) => setFields({ ...fields, parentTaskId: event.target.value || null })}
        >
          <option value="">No parent</option>
          {records
            .filter((record) => record.id !== task?.id)
            .map((record) => (
              <option key={record.id} value={record.id}>
                {record.title}
              </option>
            ))}
        </select>
      </label>
      <fieldset className="space-y-2">
        <legend className="text-xs">Depends on</legend>
        <div className="max-h-32 space-y-2 overflow-y-auto">
          {records
            .filter(
              (record) =>
                record.id !== task?.id &&
                (!record.archived || fields.dependencyIds.includes(record.id)),
            )
            .map((record) => (
              <label key={record.id} className="flex items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  disabled={readOnly}
                  checked={fields.dependencyIds.includes(record.id)}
                  onChange={(event) =>
                    setFields({
                      ...fields,
                      dependencyIds: event.target.checked
                        ? [...fields.dependencyIds, record.id]
                        : fields.dependencyIds.filter((id) => id !== record.id),
                    })
                  }
                />
                {record.title}
              </label>
            ))}
          {records.length <= (task ? 1 : 0) && (
            <p className="text-xs text-muted-foreground">Add another task to set a dependency.</p>
          )}
        </div>
      </fieldset>
      {task && records.some((record) => record.parentTaskId === task.id) && (
        <section>
          <h4 className="mb-2 text-xs font-medium">Subtasks</h4>
          {records
            .filter((record) => record.parentTaskId === task.id)
            .map((record) => (
              <button
                key={record.id}
                type="button"
                className="block w-full truncate py-1 text-left text-xs underline"
                disabled={busy}
                onClick={() => onOpenTask(record)}
              >
                {record.title} · {statusLabels[record.status]}
              </button>
            ))}
        </section>
      )}
      {invalidTags && (
        <p role="alert" className="text-xs text-destructive">
          Shorten your tags or use fewer than 21.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={readOnly || !fields.title.trim() || invalidTags}>
          {busy ? "Saving…" : task ? "Save changes" : "Create task"}
        </Button>
        {task && (
          <Button
            type="button"
            variant="outline"
            disabled={readOnly}
            onClick={() =>
              void onSave({
                operation: "archive",
                id: task.id,
                revision: task.revision,
                archived: !task.archived,
              })
            }
          >
            {task.archived ? "Restore task" : "Archive task"}
          </Button>
        )}
      </div>
    </form>
  );
}
