import { AsyncResult } from "effect/unstable/reactivity";
import { useState, useSyncExternalStore } from "react";
import * as DateTime from "effect/DateTime";
import {
  ProjectId,
  WorkspaceTaskId,
  WorkspaceToolsError,
  type WorkspaceTaskPage,
  type WorkspaceTaskSummary,
} from "@t3tools/contracts";
import { TasksSpaceView, type TaskFilters } from "../TasksSpaceView";
import { ProjectTasksResourceView } from "../ProjectTasksResourceView";
import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";

// URL state recipes are proposed captures. They never call live commands or load credentials.
export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (session) => {
  let disposed = false;
  const pending = new Set<Promise<unknown>>();
  const listeners = new Set<() => void>();
  const state = session.taskState;
  const board = state?.startsWith("board") ?? false;
  const configs = [
    {
      projectId: session.resourceProjectId,
      taskColumns: board ? ["Backlog", "Review", "Released"] : ["To do", "In progress", "Done"],
      completedColumn: board ? "Released" : "Done",
      revision: 0,
      browserThreadId: null,
    },
    {
      projectId: ProjectId.make("fixture-second"),
      taskColumns: ["Queued", "Doing", "Done"],
      completedColumn: "Done",
      revision: 0,
      browserThreadId: null,
    },
  ];
  let confirmed: WorkspaceTaskSummary[] = session.seed.tasks.map((task, index) => ({
    projectId: task.projectId,
    title: task.title,
    areaLabel: task.areaLabel,
    dueOn: task.dueOn,
    owner: task.owner,
    id: WorkspaceTaskId.make(`wskt_00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
    projectTitle: session.seed.projects.find((project) => project.id === task.projectId)!.title,
    column: task.completed ? configs[0]!.completedColumn : configs[0]!.taskColumns[0]!,
    revision: 0,
    done: task.completed,
  }));
  const presentation = new Map(
    confirmed.map((task, index) => [
      task.id,
      session.seed.people.find(
        (person) => person.id === session.seed.tasks[index]!.assigneeDisplayId,
      )!,
    ]),
  );
  if (board)
    confirmed = [
      ...confirmed,
      {
        ...confirmed[0]!,
        id: "wskt_00000000-0000-4000-8000-000000000006",
        title:
          "A long title for a second project card that must truncate without moving the lane controls",
        projectId: configs[1]!.projectId,
        projectTitle: "Second project",
        column: "Queued",
      },
      {
        ...confirmed[0]!,
        id: "wskt_00000000-0000-4000-8000-000000000007",
        title: "Legacy unconfigured task",
        column: "Archived lane",
      },
      {
        ...confirmed[0]!,
        id: "wskt_00000000-0000-4000-8000-000000000008",
        title: "Task without configuration",
        projectId: ProjectId.make("fixture-no-config"),
        projectTitle: "No configuration",
      },
      ...Array.from({ length: 3 }, (_, index) => ({
        ...confirmed[0]!,
        id: `wskt_00000000-0000-4000-8000-${String(index + 9).padStart(12, "0")}`,
        title: `Later page task ${index + 1}`,
      })),
    ];
  if (state === "board-move")
    confirmed = confirmed.map((task, index) =>
      index ? task : { ...task, column: "Review", revision: 1 },
    );
  if (state === "empty") confirmed = [];
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const notify = () => {
    if (!disposed) for (const listener of listeners) listener();
  };
  const ownerPresentation = (task: WorkspaceTaskSummary) => {
    const person = presentation.get(task.id);
    return person ? { displayName: person.name, initials: person.initials } : null;
  };
  function Fixture({ resource = false }: { resource?: boolean }) {
    const tasks = useSyncExternalStore(subscribe, () => confirmed);
    const [filters, setFilters] = useState<TaskFilters>({
      text: "",
      project: board ? "" : session.resourceProjectId,
      owner: "all",
      dueFrom: "",
      dueTo: "",
      limit: 50,
    });
    const [layout, setLayout] = useState<"list" | "board">(board ? "board" : "list");
    const [selection, setSelection] = useState<string | null>(
      state && ["detail", "conflict", "deleted", "disconnected", "phone-return"].includes(state)
        ? tasks[0]!.id
        : null,
    );
    const [creating, setCreating] = useState(
      state === "create" || state === "create-dirty" || state === "discard",
    );
    const [draft, setDraft] = useState(
      state === "create-dirty" || state === "discard" || state === "conflict" || state === "deleted"
        ? "Unsaved launch copy"
        : "",
    );
    const [discard, setDiscard] = useState(state === "discard");
    const [copied, setCopied] = useState(false);
    const [showMenu, setShowMenu] = useState(state === "menu");
    const [showLater, setShowLater] = useState(state === "board-page2-conflict");
    const canOperate =
      state !== "read-only" &&
      state !== "disconnected" &&
      state !== "board-read-only" &&
      state !== "board-disconnected";
    const matches = tasks.filter(
      (task) =>
        (!resource || task.projectId === session.resourceProjectId) &&
        (!filters.project || task.projectId === filters.project) &&
        (!filters.text ||
          `${task.title} ${task.areaLabel} ${task.projectTitle}`
            .toLowerCase()
            .includes(filters.text.toLowerCase())) &&
        (filters.owner === "all" ||
          (filters.owner === "unassigned"
            ? task.owner === null
            : task.owner === "environment-owner")) &&
        (!filters.dueFrom || (!!task.dueOn && task.dueOn >= filters.dueFrom)) &&
        (!filters.dueTo || (!!task.dueOn && task.dueOn <= filters.dueTo)),
    );
    // Like SQL GROUP BY, omit configured columns with no matching tasks.
    const laneTotals = [
      ...new Map(
        matches.map((task) => [
          JSON.stringify([task.projectId, task.column]),
          {
            projectId: task.projectId,
            column: task.column,
            total: matches.filter(
              (other) => other.projectId === task.projectId && other.column === task.column,
            ).length,
          },
        ]),
      ).values(),
    ];
    const page: WorkspaceTaskPage = {
      tasks: matches.slice(0, board && !showLater ? Math.min(filters.limit, 8) : filters.limit),
      total: matches.length,
      openTotal: matches.filter((task) => !task.done).length,
      projects: board ? configs : [configs[0]!],
      laneTotals:
        state === "board-partial"
          ? Array.from({ length: 1200 }, (_, index) => ({
              projectId: session.resourceProjectId,
              column: `Legacy ${index}`,
              total: 1,
            }))
          : laneTotals,
      nextCursor: board && !showLater ? "later" : null,
    };
    const transition: React.ComponentProps<
      typeof ProjectTasksResourceView
    >["onTransition"] = async (request) => {
      if (disposed) throw new Error("Fixture session is disposed.");
      if (state === "board-conflict" || state === "board-page2-conflict")
        return AsyncResult.fail(
          new WorkspaceToolsError({
            kind: "conflict",
            message: "This task changed on another client.",
          }),
        );
      const operation = (async () => {
        await session.record(
          "save",
          { type: "task", taskId: request.input.id },
          JSON.stringify(request.input.change),
        );
        const previous = confirmed.find((task) => task.id === request.input.id)!;
        const config = configs.find((config) => config.projectId === previous.projectId)!;
        const column =
          request.input.change.type === "column"
            ? request.input.change.column
            : request.input.change.completed
              ? config.completedColumn
              : config.taskColumns.find((column) => column !== config.completedColumn)!;
        const next = {
          ...previous,
          column,
          done: column === config.completedColumn,
          revision: previous.revision + 1,
        };
        if (!disposed) {
          confirmed = confirmed.map((task) => (task.id === next.id ? next : task));
          notify();
        }
        return AsyncResult.success(next);
      })();
      pending.add(operation);
      try {
        return await operation;
      } finally {
        pending.delete(operation);
      }
    };
    const task = tasks.find((task) => task.id === selection);
    const open = (ref: Parameters<React.ComponentProps<typeof TasksSpaceView>["onOpen"]>[0]) => {
      if (ref.type === "task") {
        if (creating && draft) {
          setDiscard(true);
          return;
        }
        setSelection(ref.taskId);
        setCreating(false);
        setDraft("");
      }
      void session.record("navigate", ref);
    };
    const detail =
      creating || task ? (
        <aside aria-label="Task detail" className="m-4 min-w-0 flex-1 space-y-3 md:max-w-sm">
          {creating ? (
            <label className="block text-sm">
              Project
              <select
                aria-label="New task project"
                className="block min-h-11 w-full rounded-md border border-input bg-background p-2"
              >
                <option>{session.seed.projects[0]!.title}</option>
              </select>
            </label>
          ) : null}
          <section
            aria-label={creating ? "New task" : "Selected task"}
            className="space-y-3 rounded-lg border border-border bg-background p-3"
          >
            <button
              type="button"
              className="min-h-9 text-xs"
              onClick={() => {
                setSelection(null);
                setCreating(false);
                setDraft("");
              }}
            >
              Back to tasks
            </button>
            <h3 className="text-sm font-medium">{creating ? "New task" : task?.title}</h3>
            <p className="text-xs text-muted-foreground">SynKEK</p>
            {state === "conflict" ? (
              <div role="alert" className="space-y-2 rounded-md border border-border p-3">
                <p>This task changed on another client. Your draft has been kept.</p>
                <p>Current title: Approved homepage copy</p>
                <p>Owner: Me</p>
                <button type="button">Reapply my changes</button>
                <button type="button">Reload latest</button>
              </div>
            ) : null}
            {state === "deleted" ? (
              <div role="alert">
                <p>This task was deleted. Your draft has been kept.</p>
                <button type="button" onClick={() => setCopied(true)}>
                  Copy draft
                </button>
                <button type="button" onClick={() => setDiscard(true)}>
                  Discard draft
                </button>
                {copied ? <p role="status">Draft copied</p> : null}
              </div>
            ) : null}
            {state === "disconnected" ? (
              <p role="status">Connection unavailable. Reconnect to save task changes.</p>
            ) : null}
            <form
              className="grid min-w-0 grid-cols-1 gap-3"
              onSubmit={(event) => {
                event.preventDefault();
              }}
            >
              <label className="text-sm">
                Title
                <input
                  aria-label={creating ? "New task title" : "Task title"}
                  className="block w-full rounded-md border border-input bg-background p-2"
                  value={draft || task?.title || ""}
                  disabled={!canOperate || state === "deleted"}
                  onChange={(event) => setDraft(event.target.value)}
                />
              </label>
              <label className="text-sm">
                Column
                <select
                  aria-label="Task column"
                  className="block min-h-11 w-full rounded-md border border-input bg-background p-2"
                  disabled={!canOperate || state === "deleted"}
                >
                  {configs[0]!.taskColumns.map((column) => (
                    <option key={column}>{column}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Owner
                <select
                  aria-label="Owner"
                  className="block min-h-11 w-full rounded-md border border-input bg-background p-2"
                  disabled={!canOperate || state === "deleted"}
                >
                  <option>Me</option>
                  <option>Unassigned</option>
                </select>
              </label>
              <label className="text-sm">
                Due date
                <input
                  type="date"
                  aria-label="Due date"
                  className="block w-full rounded-md border border-input bg-background p-2"
                  defaultValue={task?.dueOn ?? ""}
                  disabled={!canOperate || state === "deleted"}
                />
              </label>
              <label className="text-sm">
                Area
                <input
                  aria-label="Area"
                  className="block w-full rounded-md border border-input bg-background p-2"
                  defaultValue={task?.areaLabel ?? ""}
                  disabled={!canOperate || state === "deleted"}
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={!canOperate || state === "deleted"}>
                  {creating ? "Add task" : "Save task"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    draft ? setDiscard(true) : (setSelection(null), setCreating(false))
                  }
                >
                  {creating ? "Cancel" : "Close task"}
                </button>
              </div>
            </form>
            {discard ? (
              <div
                role="alertdialog"
                aria-label="Discard task changes?"
                className="space-y-2 rounded-md border border-border p-3"
              >
                <p>Discard unsaved task changes?</p>
                <button
                  type="button"
                  onClick={() => {
                    setDiscard(false);
                    setDraft("");
                    setCreating(false);
                    setSelection(null);
                  }}
                >
                  Discard changes
                </button>
                <button type="button" onClick={() => setDiscard(false)}>
                  Keep editing
                </button>
              </div>
            ) : null}
          </section>
        </aside>
      ) : null;
    const common = {
      environmentId: session.environmentId,
      page,
      status:
        state === "disconnected" || state === "board-disconnected"
          ? ("disconnected" as const)
          : ("ready" as const),
      error: null,
      ownerProfile: null,
      timeZone: session.timeZone,
      locale: session.locale,
      now: DateTime.makeUnsafe(session.clock.now()),
      canOperate,
      workspaceTasksV2: true,
      onOpen: open,
      onTransition: transition,
      onLoadMore: () => setShowLater(true),
      onRetry: () => {},
      ownerPresentation,
    };
    if (resource)
      return (
        <ProjectTasksResourceView
          {...common}
          projectId={session.resourceProjectId}
          projectTitle="SynKEK"
        >
          {detail}
        </ProjectTasksResourceView>
      );
    return (
      <div className="flex min-w-0 items-start max-md:block">
        <div className={`min-w-0 flex-1 ${detail ? "max-md:hidden" : ""}`}>
          <TasksSpaceView
            {...common}
            projectId={filters.project ? session.resourceProjectId : null}
            projects={[
              ...session.seed.projects,
              { id: configs[1]!.projectId, title: "Second project" },
            ]}
            view="all"
            taskLayout={layout}
            filters={filters}
            onFilter={setFilters}
            onLayout={setLayout}
            onCreate={() => {
              setCreating(true);
              setSelection(null);
            }}
            footer={session.seed.sampleCopy.tasksFooter}
          />
          {state === "read-only" || state === "board-read-only" ? (
            <p role="status" className="mx-4 text-xs text-muted-foreground">
              This connection is read-only.
            </p>
          ) : null}
          {showMenu ? (
            <div
              role="menu"
              aria-label="Task actions"
              className="mx-4 rounded-md border border-border bg-background p-3"
            >
              <button
                role="menuitem"
                onClick={() => {
                  setCreating(true);
                  setShowMenu(false);
                }}
              >
                New task
              </button>
            </div>
          ) : null}
          {state === "board-saving" ? (
            <p role="status" className="mx-4">
              Saving move...
            </p>
          ) : null}
          {state === "board-conflict" || state === "board-page2-conflict" ? (
            <div role="alert" className="mx-4">
              <p>This task changed on another client.</p>
              <p role="status">Refreshing tasks to load the latest changes.</p>
              <button type="button" onClick={() => setSelection(tasks[0]!.id)}>
                Review task changes
              </button>
              {state === "board-page2-conflict" ? (
                <p>Conflict on a card loaded by Load more.</p>
              ) : null}
            </div>
          ) : null}
        </div>
        {detail}
      </div>
    );
  }
  return {
    area: "tasks",
    readyRegions: session.id === "03" ? ["center"] : session.id === "08" ? ["resource"] : [],
    center: <Fixture />,
    resource: <Fixture resource />,
    settled: async () => {
      await Promise.all(pending);
      await session.settled();
    },
    dispose: () => {
      disposed = true;
      pending.clear();
      listeners.clear();
    },
  };
};
