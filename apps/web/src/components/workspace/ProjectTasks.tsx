import {
  type EnvironmentId,
  type ProjectId,
  type WorkspaceTask,
  type WorkspaceProjectConfig,
  type WorkspaceProjectConfigSave,
  WorkspaceToolsError,
  WorkspaceProjectDescriptionMaxLength,
  ThreadId,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import * as Schema from "effect/Schema";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useContext, useId, useState } from "react";
import { WorkspaceTaskRow } from "./WorkspaceTaskRow";
import {
  WorkspaceTaskEditor,
  workspaceTaskSummary,
  useTaskDateClock,
  workspaceToolsError,
} from "./WorkspaceTaskEditor";
export { useTaskDateClock, workspaceToolsError } from "./WorkspaceTaskEditor";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";
import { timestampLocale } from "../../timestampFormat";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { useThreadShells } from "../../state/entities";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { workspaceTools } from "../../state/workspaceTools";
import { randomUUID } from "../../lib/utils";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { WorkspaceItemActions, WorkspaceItemMenu } from "./WorkspaceItemActions";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
import { ProjectDriveRootSettings } from "./ProjectDriveRootSettings";
const isWorkspaceToolsError = Schema.is(WorkspaceToolsError);
const descriptionLimitError = `Use a project description of at most ${WorkspaceProjectDescriptionMaxLength} characters.`;
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
          key={
            // The { description } wrapper distinguishes an old server's undefined from null.
            `${environmentId}:${projectId}:${JSON.stringify([config.data.taskColumns, config.data.browserThreadId, config.data.completedColumn, config.data.revision, { description: config.data.description }])}`
          }
          environmentId={environmentId}
          config={config.data}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Loading project settings...</p>
      )}
      <ProjectDriveRootSettings
        inSettings
        key={`${environmentId}:${projectId}`}
        environmentId={environmentId}
        projectId={projectId}
      />
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
  const connected = useConnectedEnvironmentIds().includes(environmentId);
  const canOperate = useWorkspaceCanOperate(environmentId) && connected;
  const threads = useThreadShells().filter(
    (thread) => thread.environmentId === environmentId && thread.projectId === config.projectId,
  );
  const save = useAtomCommand(workspaceTools.saveConfig, { reportFailure: false });
  const [columns, setColumns] = useState(config.taskColumns.join("\n"));
  const [description, setDescription] = useState(config.description ?? "");
  const descriptionHintId = useId();
  const descriptionServerHintId = useId();
  const [browserThreadId, setBrowserThreadId] = useState(config.browserThreadId ?? "");
  const [completedColumn, setCompletedColumn] = useState(config.completedColumn ?? "");
  const [confirmation, setConfirmation] = useState<WorkspaceProjectConfigSave | null>(null);
  const designatedColumn = taskColumnChoice(columns, completedColumn);
  const awaitingConfirmation = workspaceTasksV2 && confirmation !== null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taskColumns = columns.split("\n").map((value) => value.trim());
  const submit = async (input: WorkspaceProjectConfigSave) => {
    if (busy || !canOperate || (input.expectedRevision !== undefined && !workspaceTasksV2)) return;
    if (description.length > WorkspaceProjectDescriptionMaxLength) {
      setError(descriptionLimitError);
      return;
    }
    setBusy(true);
    setError(null);
    const result = await save({ environmentId, input });
    setBusy(false);
    if (result._tag === "Failure") {
      const message = workspaceToolsError(result);
      const cause = squashAtomCommandFailure(result);
      setError(message);
      setConfirmation(
        workspaceTasksV2 &&
          isWorkspaceToolsError(cause) &&
          cause.reason === "completion-confirmation-required"
          ? {
              ...input,
              ...(cause.affectedCount !== undefined
                ? { expectedAffectedCount: cause.affectedCount }
                : {}),
            }
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
          ...(config.description !== undefined
            ? { description: description.trim() ? description : null }
            : {}),
          taskColumns,
          browserThreadId: browserThreadId ? ThreadId.make(browserThreadId) : null,
          ...(workspaceTasksV2
            ? { expectedRevision: config.revision ?? 0, completedColumn: designatedColumn || null }
            : {}),
        });
      }}
    >
      <label className="block space-y-1 text-sm">
        <span>Project description</span>
        <Textarea
          aria-label="Project description"
          aria-describedby={
            config.description === undefined
              ? `${descriptionHintId} ${descriptionServerHintId}`
              : descriptionHintId
          }
          aria-invalid={description.length > WorkspaceProjectDescriptionMaxLength || undefined}
          value={description}
          onChange={(event) => {
            const value = event.target.value;
            setDescription(value);
            if (
              value.length <= WorkspaceProjectDescriptionMaxLength &&
              error === descriptionLimitError
            )
              setError(null);
          }}
          maxLength={WorkspaceProjectDescriptionMaxLength}
          disabled={busy || !canOperate || awaitingConfirmation || config.description === undefined}
        />
      </label>
      <p id={descriptionHintId} className="text-xs text-muted-foreground">
        Up to {WorkspaceProjectDescriptionMaxLength} characters.
      </p>
      {config.description === undefined ? (
        <p id={descriptionServerHintId} className="text-xs text-muted-foreground">
          Project descriptions need a newer server.
        </p>
      ) : null}
      <label className="block space-y-1 text-sm">
        <span>Task columns, one per line</span>
        <Textarea
          aria-label="Task columns"
          value={columns}
          onChange={(event) => {
            const value = event.target.value;
            setColumns(value);
          }}
          maxLength={500}
          disabled={busy || !canOperate || awaitingConfirmation}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Browser thread</span>
        <select
          aria-label="Project browser thread"
          className="w-full rounded-md border border-input bg-background p-2 pointer-coarse:min-h-11 pointer-coarse:text-base"
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
            className="w-full rounded-md border border-input bg-background p-2 pointer-coarse:min-h-11 pointer-coarse:text-base"
            value={designatedColumn}
            onChange={(event) => setCompletedColumn(event.target.value)}
            disabled={busy || !canOperate || awaitingConfirmation}
          >
            <option value="">Not designated</option>
            {taskColumns.filter(Boolean).map((value) => (
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
              setCompletedColumn(
                config.completedColumn && taskColumns.includes(config.completedColumn)
                  ? config.completedColumn
                  : "",
              );
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
function taskColumnChoice(columns: string, value: string) {
  return columns.split("\n").some((column) => column.trim() === value) ? value : "";
}
export function ProjectTasks({
  environmentId,
  projectId,
  selected,
  projectTitle = "Project",
  onSelect,
}: {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  selected: WorkspaceTask | null;
  projectTitle?: string;
  onSelect: (task: WorkspaceTask | null) => void;
}) {
  const config = useEnvironmentQuery(
    workspaceTools.config({ environmentId, input: { projectId } }),
  );
  const list = useEnvironmentQuery(workspaceTools.tasks({ environmentId, input: { projectId } }));
  const connected = useConnectedEnvironmentIds().includes(environmentId);
  const canOperate = useWorkspaceCanOperate(environmentId) && connected;
  const upsert = useAtomCommand(workspaceTools.upsertTask, { reportFailure: false });
  const { workspaceTasksV2 } = useMailCapabilities(environmentId);
  const ownerProfile = useEnvironmentSettings(
    environmentId,
    (settings) => settings.workspaceOwnerProfile,
  );
  const [showCreate, setShowCreate] = useState(true);
  const transition = useAtomCommand(workspaceTools.transitionTask, { reportFailure: false });
  const hidden = useContext(WorkspaceResourcesBodyContext)?.hidden ?? false;
  const zone = useEnvironmentSettings(
    environmentId,
    (settings) => settings.workspaceDisplayTimeZone,
  );
  const now = useTaskDateClock(
    zone ?? "UTC",
    workspaceTasksV2 && !hidden && !!list.data?.tasks.some((task) => task.dueOn),
  );
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
      {workspaceTasksV2 ? (
        showCreate && config.data ? (
          <WorkspaceTaskEditor
            environmentId={environmentId}
            task={null}
            config={config.data}
            projectTitle={projectTitle}
            ownerProfile={ownerProfile}
            onClose={() => setShowCreate(false)}
            onSaved={(task) => {
              setShowCreate(false);
              onSelect(task);
            }}
          />
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canOperate}
            onClick={() => setShowCreate(true)}
          >
            Add task
          </Button>
        )
      ) : (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy || !canOperate) return;
            setBusy(true);
            setError(null);
            const result = await upsert({
              environmentId,
              input: {
                id,
                projectId,
                title: title.trim(),
                column: chosen,
              },
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
          <Button
            size="sm"
            type="submit"
            disabled={busy || !canOperate || !title.trim() || !chosen}
          >
            Add task
          </Button>
        </form>
      )}
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
              .map((task) =>
                workspaceTasksV2 ? (
                  <WorkspaceTaskRow
                    key={task.id}
                    environmentId={environmentId}
                    task={workspaceTaskSummary(task, projectTitle)}
                    density="list"
                    onOpen={() => onSelect(task)}
                    ownerProfile={ownerProfile}
                    now={now}
                    timeZone={zone ?? "UTC"}
                    locale={timestampLocale}
                    canOperate={canOperate}
                    completedColumn={config.data?.completedColumn ?? null}
                    workspaceTasksV2
                    pending={false}
                    refreshFailed={list.error !== null || !connected}
                    selected={selected?.id === task.id}
                    onTransition={transition}
                    renderItemMenu={(_, children) => (
                      <WorkspaceItemMenu
                        environmentId={environmentId}
                        item={{ ref: { type: "task", taskId: task.id }, title: task.title }}
                        confirmed={[{ ref: { type: "project", projectId } }]}
                      >
                        {children}
                      </WorkspaceItemMenu>
                    )}
                  />
                ) : (
                  <li key={task.id}>
                    <WorkspaceItemMenu
                      environmentId={environmentId}
                      item={{ ref: { type: "task", taskId: task.id }, title: task.title }}
                      confirmed={[{ ref: { type: "project", projectId } }]}
                    >
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-accent"
                        aria-current={selected?.id === task.id ? "true" : undefined}
                        onClick={() => onSelect(task)}
                      >
                        <span className="min-w-0 flex-1 truncate">{task.title}</span>
                      </button>
                    </WorkspaceItemMenu>
                  </li>
                ),
              )}
          </ul>
        </div>
      ))}
      {list.data?.tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks yet.</p>
      ) : null}
      {list.data?.incomplete ? (
        <p className="text-xs text-muted-foreground">Showing up to 200 tasks.</p>
      ) : null}
      {selected && !config.data ? (
        <WorkspaceItemActions
          shortcuts
          environmentId={environmentId}
          item={{ ref: { type: "task", taskId: selected.id }, title: selected.title }}
          confirmed={[{ ref: { type: "project", projectId: selected.projectId } }]}
        />
      ) : null}
      {selected && config.data ? (
        <WorkspaceTaskEditor
          environmentId={environmentId}
          task={workspaceTaskSummary(
            list.data?.tasks.find((task) => task.id === selected.id) ?? selected,
            projectTitle,
          )}
          config={config.data}
          projectTitle={projectTitle}
          ownerProfile={ownerProfile}
          legacy={!workspaceTasksV2}
          onClose={() => onSelect(null)}
          onSaved={onSelect}
        />
      ) : null}
    </section>
  );
}
