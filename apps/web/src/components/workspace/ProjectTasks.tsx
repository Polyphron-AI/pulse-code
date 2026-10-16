import {
  type EnvironmentId,
  type ProjectId,
  type WorkspaceTask,
  type WorkspaceProjectConfig,
  type WorkspaceProjectConfigSave,
  ThreadId,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useContext, useState } from "react";
import { WorkspaceItemMutationContext } from "./WorkspaceEngagement";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { useThreadShells } from "../../state/entities";
import { workspaceTools } from "../../state/workspaceTools";
import { randomUUID } from "../../lib/utils";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { WorkspaceItemActions, WorkspaceItemMenu } from "./WorkspaceItemActions";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
export const workspaceToolsError = (result: Parameters<typeof squashAtomCommandFailure>[0]) => {
  const cause = squashAtomCommandFailure(result);
  return cause instanceof Error ? cause.message : "The workspace change could not be saved.";
};
export function ProjectWorkspaceSettings({
  environmentId,
  projectId,
}: {
  environmentId: EnvironmentId;
  projectId: ProjectId;
}) {
  const config = useEnvironmentQuery(
    workspaceTools.config({ environmentId, input: { projectId } }),
  );
  return (
    <section className="mt-6 space-y-2 rounded-lg border border-border p-3">
      <h2 className="text-sm font-medium">Project workspace settings</h2>
      {config.error ? (
        <p role="alert" className="text-sm text-destructive">
          {config.error}
        </p>
      ) : config.data ? (
        <ProjectWorkspaceSettingsForm
          key={`${environmentId}:${projectId}:${JSON.stringify(config.data)}`}
          environmentId={environmentId}
          config={config.data}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Loading project settings...</p>
      )}
    </section>
  );
}
function ProjectWorkspaceSettingsForm({
  environmentId,
  config,
}: {
  environmentId: EnvironmentId;
  config: WorkspaceProjectConfig;
}) {
  const { workspaceTasksV2 } = useMailCapabilities(environmentId);
  const canOperate = useWorkspaceCanOperate(environmentId);
  const threads = useThreadShells().filter(
    (thread) => thread.environmentId === environmentId && thread.projectId === config.projectId,
  );
  const save = useAtomCommand(workspaceTools.saveConfig, { reportFailure: false });
  const [columns, setColumns] = useState(config.taskColumns.join("\n"));
  const [browserThreadId, setBrowserThreadId] = useState(config.browserThreadId ?? "");
  const [completedColumn, setCompletedColumn] = useState(config.completedColumn ?? "");
  const [confirmation, setConfirmation] = useState<WorkspaceProjectConfigSave | null>(null);
  const awaitingConfirmation = workspaceTasksV2 && confirmation !== null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (input: WorkspaceProjectConfigSave) => {
    if (busy || !canOperate || (input.expectedRevision !== undefined && !workspaceTasksV2)) return;
    setBusy(true);
    setError(null);
    const result = await save({ environmentId, input });
    setBusy(false);
    if (result._tag === "Failure") {
      const message = workspaceToolsError(result);
      setError(message);
      setConfirmation(
        workspaceTasksV2 &&
          /changes completion for \d+ tasks?\. Confirm to continue\.$/.test(message)
          ? input
          : null,
      );
    } else setConfirmation(null);
  };
  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        if (awaitingConfirmation) return;
        await submit({
          projectId: config.projectId,
          taskColumns: columns.split("\n").map((value) => value.trim()),
          browserThreadId: browserThreadId ? ThreadId.make(browserThreadId) : null,
          ...(workspaceTasksV2
            ? { expectedRevision: config.revision ?? 0, completedColumn: completedColumn || null }
            : {}),
        });
      }}
    >
      <label className="block space-y-1 text-sm">
        <span>Task columns, one per line</span>
        <Textarea
          aria-label="Task columns"
          value={columns}
          onChange={(event) => setColumns(event.target.value)}
          maxLength={500}
          disabled={busy || !canOperate || awaitingConfirmation}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Browser thread</span>
        <select
          aria-label="Project browser thread"
          className="w-full rounded-md border border-input bg-background p-2"
          value={browserThreadId}
          onChange={(event) => setBrowserThreadId(event.target.value)}
          disabled={busy || !canOperate || awaitingConfirmation}
        >
          <option value="">No browser thread</option>
          {config.browserThreadId &&
          !threads.some((thread) => thread.id === config.browserThreadId) ? (
            <option value={config.browserThreadId}>Unavailable thread</option>
          ) : null}
          {threads.map((thread) => (
            <option key={thread.id} value={thread.id}>
              {thread.title}
            </option>
          ))}
        </select>
      </label>
      {workspaceTasksV2 ? (
        <label className="block space-y-1 text-sm">
          <span>Completed column</span>
          <select
            aria-label="Completed column"
            className="w-full rounded-md border border-input bg-background p-2"
            value={completedColumn}
            onChange={(event) => setCompletedColumn(event.target.value)}
            disabled={busy || !canOperate || awaitingConfirmation}
          >
            <option value="">Not designated</option>
            {columns
              .split("\n")
              .map((value) => value.trim())
              .filter(Boolean)
              .map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
          </select>
        </label>
      ) : (
        <p className="text-xs text-muted-foreground">Tasks need a newer server.</p>
      )}
      <p className="text-xs text-muted-foreground">
        Browser uses this project's chosen thread on desktop. Move tasks before removing their
        column.
      </p>
      <Button
        size="sm"
        variant="outline"
        type="submit"
        disabled={busy || !canOperate || awaitingConfirmation}
      >
        Save workspace settings
      </Button>
      {workspaceTasksV2 && confirmation ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            type="button"
            disabled={busy || !canOperate}
            onClick={() => submit({ ...confirmation, confirmCompletionChanges: true })}
          >
            Confirm completion changes
          </Button>
          <Button
            size="sm"
            variant="ghost"
            type="button"
            disabled={busy}
            onClick={() => {
              setConfirmation(null);
              setError(null);
              setCompletedColumn(config.completedColumn ?? "");
            }}
          >
            Cancel
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
export function ProjectTasks({
  environmentId,
  projectId,
  selected,
  onSelect,
}: {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  selected: WorkspaceTask | null;
  onSelect: (task: WorkspaceTask | null) => void;
}) {
  const config = useEnvironmentQuery(
    workspaceTools.config({ environmentId, input: { projectId } }),
  );
  const list = useEnvironmentQuery(workspaceTools.tasks({ environmentId, input: { projectId } }));
  const canOperate = useWorkspaceCanOperate(environmentId);
  const upsert = useAtomCommand(workspaceTools.upsertTask, { reportFailure: false });
  const [title, setTitle] = useState("");
  const [column, setColumn] = useState("");
  const [id, setId] = useState(() => `wskt_${randomUUID()}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const columns = config.data?.taskColumns ?? [];
  const chosen = columns.includes(column) ? column : (columns[0] ?? "");
  return (
    <section className="mt-6 space-y-3" aria-label="Project tasks">
      <h2 className="text-sm font-medium">Tasks</h2>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          const result = await upsert({
            environmentId,
            input: { id, projectId, title: title.trim(), column: chosen },
          });
          setBusy(false);
          if (result._tag === "Failure") setError(workspaceToolsError(result));
          else {
            setTitle("");
            setId(`wskt_${randomUUID()}`);
            onSelect(result.value);
          }
        }}
      >
        <Input
          className="min-w-0 flex-1 basis-40"
          aria-label="New task title"
          placeholder="Task title"
          maxLength={240}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={busy || !canOperate}
        />
        <select
          aria-label="New task column"
          className="rounded-md border border-input bg-background p-2 text-sm"
          value={chosen}
          onChange={(event) => setColumn(event.target.value)}
          disabled={busy || !canOperate}
        >
          {columns.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <Button size="sm" type="submit" disabled={busy || !canOperate || !title.trim() || !chosen}>
          Add task
        </Button>
      </form>
      {error || config.error || list.error ? (
        <p role="alert" className="text-sm text-destructive">
          {error ?? config.error ?? list.error}
        </p>
      ) : null}
      {columns.map((value) => (
        <div key={value} className="space-y-1">
          <h3 className="text-xs font-medium text-muted-foreground">{value}</h3>
          <ul>
            {list.data?.tasks
              .filter((task) => task.column === value)
              .map((task) => (
                <li key={task.id}>
                  <WorkspaceItemMenu
                    environmentId={environmentId}
                    item={{ ref: { type: "task", taskId: task.id }, title: task.title }}
                    confirmed={[{ ref: { type: "project", projectId } }]}
                  >
                    <button
                      type="button"
                      className="w-full truncate rounded-md p-2 text-left text-sm hover:bg-accent"
                      aria-current={selected?.id === task.id ? "true" : undefined}
                      onClick={() => onSelect(task)}
                    >
                      {task.title}
                    </button>
                  </WorkspaceItemMenu>
                </li>
              ))}
          </ul>
        </div>
      ))}
      {list.data?.tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
      ) : null}
      {list.data?.incomplete ? (
        <p className="text-xs text-muted-foreground">Showing up to 200 tasks.</p>
      ) : null}
      {selected ? (
        <TaskEditor
          key={`${selected.id}:${selected.title}:${selected.column}`}
          environmentId={environmentId}
          task={selected}
          columns={columns}
          onClose={() => onSelect(null)}
        />
      ) : null}
    </section>
  );
}
function TaskEditor({
  environmentId,
  task,
  columns,
  onClose,
}: {
  environmentId: EnvironmentId;
  task: WorkspaceTask;
  columns: readonly string[];
  onClose: () => void;
}) {
  const canOperate = useWorkspaceCanOperate(environmentId);
  const invalidateContext = useContext(WorkspaceItemMutationContext);
  const save = useAtomCommand(workspaceTools.upsertTask, { reportFailure: false });
  const remove = useAtomCommand(workspaceTools.deleteTask, { reportFailure: false });
  const [title, setTitle] = useState(task.title);
  const [column, setColumn] = useState(task.column);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section aria-label="Selected task" className="space-y-3 rounded-lg border border-border p-3">
      <h3 className="text-sm font-medium">{task.title}</h3>
      <WorkspaceItemActions
        environmentId={environmentId}
        item={{ ref: { type: "task", taskId: task.id }, title: task.title }}
        confirmed={[{ ref: { type: "project", projectId: task.projectId } }]}
      />
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy || !canOperate) return;
          setBusy(true);
          setError(null);
          const result = await save({
            environmentId,
            input: { id: task.id, projectId: task.projectId, title: title.trim(), column },
          });
          setBusy(false);
          if (result._tag === "Failure") setError(workspaceToolsError(result));
        }}
      >
        <Input
          aria-label="Task title"
          maxLength={240}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={busy || !canOperate}
        />
        <select
          aria-label="Task column"
          className="rounded-md border border-input bg-background p-2 text-sm"
          value={column}
          onChange={(event) => setColumn(event.target.value)}
          disabled={busy || !canOperate}
        >
          {columns.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
        <Button size="sm" type="submit" disabled={busy || !canOperate || !title.trim()}>
          Save task
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || !canOperate}
          onClick={async () => {
            if (busy || !canOperate) return;
            setBusy(true);
            setError(null);
            const result = await remove({ environmentId, input: { id: task.id } });
            setBusy(false);
            if (result._tag === "Failure") setError(workspaceToolsError(result));
            else {
              invalidateContext?.(environmentId, { type: "task", taskId: task.id });
              onClose();
            }
          }}
        >
          Delete task
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close task
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Deleting a task keeps its links; the task will be unavailable when opened from them.
      </p>
    </section>
  );
}
