import { AsyncResult } from "effect/unstable/reactivity";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import * as DateTime from "effect/DateTime";
import {
  ProjectId,
  WorkspaceTaskId,
  WorkspaceToolsError,
  type WorkspaceProjectConfig,
  type WorkspaceTaskPage,
  type WorkspaceTaskSummary,
} from "@t3tools/contracts";
import { TasksSpaceView, type TaskFilters } from "../TasksSpaceView";
import { ProjectTasksResourceView } from "../ProjectTasksResourceView";
import {
  WorkspaceTaskEditorView,
  type WorkspaceTaskEditorFields,
} from "../WorkspaceTaskEditorView";
import type { TaskTransitionHandler } from "../WorkspaceTaskRow";
import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";

function FixtureEditor({
  task,
  config,
  state,
  canOperate,
  resource,
  session,
  onClose,
  onSave,
  onDelete,
}: {
  readonly task: WorkspaceTaskSummary | null;
  readonly config: WorkspaceProjectConfig;
  readonly state: import("./workspaceMockupFixtures").WorkspaceTasksMockupState | null;
  readonly canOperate: boolean;
  readonly resource: boolean;
  readonly session: Parameters<CreateWorkspaceMockupModule>[0];
  readonly onClose: () => void;
  readonly onSave: (fields: WorkspaceTaskEditorFields) => void;
  readonly onDelete: () => void;
}) {
  const initial: WorkspaceTaskEditorFields = {
    title: task?.title ?? "",
    column: task?.column ?? config.taskColumns[0]!,
    dueOn: task?.dueOn ?? "",
    areaLabel: task?.areaLabel ?? "",
    owner: task ? task.owner : "environment-owner",
  };
  const [base, setBase] = useState(initial);
  const [draft, setDraft] = useState(() =>
    state && ["create-dirty", "discard", "conflict", "deleted"].includes(state)
      ? { ...initial, title: "Unsaved launch copy" }
      : initial,
  );
  const [conflict, setConflict] = useState(state === "conflict");
  const [discard, setDiscard] = useState<"close" | "reload" | null>(
    state === "discard" ? "close" : null,
  );
  const [copied, setCopied] = useState(false);
  const latest =
    task && state === "conflict"
      ? { ...task, title: "Approved homepage copy", owner: null, revision: 1 }
      : task;
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);
  const [baseRevision, setBaseRevision] = useState(task?.revision ?? 0);
  const reset = () => {
    const fields = latest
      ? {
          title: latest.title,
          column: latest.column,
          dueOn: latest.dueOn ?? "",
          areaLabel: latest.areaLabel ?? "",
          owner: latest.owner,
        }
      : initial;
    setBase(fields);
    setDraft(fields);
    setConflict(false);
    setBaseRevision(latest?.revision ?? 0);
  };
  return (
    <WorkspaceTaskEditorView
      task={task}
      config={config}
      projectTitle={task?.projectTitle ?? "SynKEK"}
      ownerProfile={null}
      draft={draft}
      modern
      allowed={canOperate}
      connected={state !== "disconnected"}
      canOperate={canOperate}
      hidden={false}
      busy={false}
      disabled={!canOperate || state === "deleted"}
      dirty={dirty}
      backLabel={resource ? "Back to project tasks" : "Back to tasks"}
      settingsReady
      utcFallback={false}
      timeZone={session.timeZone}
      locale={session.locale}
      now={DateTime.makeUnsafe(session.clock.now())}
      error={null}
      showConflict={conflict}
      saveConflictError={false}
      latest={latest}
      baseRevision={baseRevision}
      targetMissing={state === "deleted"}
      copied={copied}
      discard={discard !== null}
      onDraftChange={setDraft}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canOperate || state === "deleted") return;
        await session.record(
          "save",
          task ? { type: "task", taskId: task.id } : undefined,
          JSON.stringify(draft),
        );
        onSave(draft);
      }}
      onDelete={onDelete}
      onClose={() => (dirty ? setDiscard("close") : onClose())}
      onReload={() => (dirty ? setDiscard("reload") : reset())}
      onKeepEditing={() => setConflict(false)}
      onReapply={() => {
        const edited = Object.fromEntries(
          Object.entries(draft).filter(
            ([key, value]) => value !== base[key as keyof WorkspaceTaskEditorFields],
          ),
        );
        reset();
        setDraft((current) => ({ ...current, ...edited }));
      }}
      onCopyDraft={() => setCopied(true)}
      onKeepDraft={() => setDiscard(null)}
      onDiscardDraft={() => {
        if (discard === "reload") reset();
        else onClose();
        setDiscard(null);
      }}
    />
  );
}

// Production presentation with isolated state. No live commands or credentials enter these recipes.
export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (session) => {
  let disposed = false;
  const pending = new Set<Promise<unknown>>();
  const listeners = new Set<() => void>();
  const releaseHeldMoves = new Set<() => void>();
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
  if (state === "phone-return")
    confirmed = [
      ...confirmed,
      ...Array.from({ length: 9 }, (_, index) => ({
        ...confirmed[0]!,
        id: `wskt_00000000-0000-4000-8000-${String(index + 20).padStart(12, "0")}`,
        title: `Return origin task ${index + 1}`,
      })),
    ];
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
      state && ["detail", "conflict", "deleted", "disconnected"].includes(state)
        ? tasks[0]!.id
        : null,
    );
    const [creating, setCreating] = useState(
      state === "create" || state === "create-dirty" || state === "discard",
    );
    const root = useRef<HTMLDivElement>(null);
    const list = useRef<HTMLDivElement>(null);
    const setup = useRef(false);
    const phonePhase = useRef<"initial" | "opened" | "returned">("initial");
    const origin = useRef<{
      trigger: HTMLElement;
      scroll: readonly { element: HTMLElement; top: number; left: number }[];
    } | null>(null);
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
      const operation = (async () => {
        await session.record(
          "save",
          { type: "task", taskId: request.input.id },
          JSON.stringify(request.input.change),
        );
        if (state === "board-conflict" || state === "board-page2-conflict")
          return AsyncResult.fail(
            new WorkspaceToolsError({
              kind: "conflict",
              message: "This task changed on another client.",
            }),
          );
        if (state === "board-saving")
          return AsyncResult.success(confirmed.find((task) => task.id === request.input.id)!);
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
      if (state === "board-saving") {
        pending.add(operation);
        // The capture intentionally holds one real card command pending. Disposal releases it.
        // settled() still awaits the recorded request and all other fixture work.
        void operation.finally(() => pending.delete(operation));
        return new Promise<Awaited<ReturnType<TaskTransitionHandler>>>((resolve) => {
          releaseHeldMoves.add(() =>
            resolve(AsyncResult.fail(new Error("Fixture session is disposed."))),
          );
        });
      }
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
        const trigger = [
          ...(root.current?.querySelectorAll<HTMLElement>("[data-workspace-task-row] button") ??
            []),
        ].find(
          (element) =>
            element.closest<HTMLElement>("[data-workspace-task-row]")?.dataset.workspaceTaskId ===
            ref.taskId,
        );
        if (trigger) {
          const scroll = [];
          for (let element: HTMLElement | null = trigger; element; element = element.parentElement)
            scroll.push({ element, top: element.scrollTop, left: element.scrollLeft });
          origin.current = { trigger, scroll };
        }
        setSelection(ref.taskId);
        setCreating(false);
      }
      void session.record("navigate", ref);
    };
    const close = () => {
      setSelection(null);
      setCreating(false);
      void session.record(
        "navigate",
        undefined,
        resource ? "Back to project tasks" : "Back to tasks",
      );
    };
    useLayoutEffect(() => {
      if (selection || creating || !origin.current) return;
      const previous = origin.current;
      origin.current = null;
      for (const { element, top, left } of previous.scroll) {
        element.scrollTop = top;
        element.scrollLeft = left;
      }
      previous.trigger.focus({ preventScroll: true });
    }, [selection, creating]);
    useLayoutEffect(() => {
      if (!root.current) return;
      if (!setup.current) {
        setup.current = true;
        if (
          !resource &&
          (state === "board-saving" ||
            state === "board-conflict" ||
            state === "board-page2-conflict")
        ) {
          const title = state === "board-page2-conflict" ? "Later page task 1" : tasks[0]!.title;
          const control = root.current.querySelector<HTMLSelectElement>(
            `[aria-label="Move ${title} to column"]`,
          );
          if (control) {
            control.value = "Review";
            control.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
        if (!resource && state === "menu")
          root.current.querySelector<HTMLElement>('[aria-label="Task actions"]')?.click();
        if (state === "phone-return") {
          if (list.current) list.current.scrollTop = 144;
          const trigger = root.current.querySelector<HTMLElement>(
            '[aria-label="Open Publish campaign landing page"]',
          );
          if (trigger) {
            phonePhase.current = "opened";
            trigger.focus({ preventScroll: true });
            trigger.click();
          }
        }
      } else if (state === "phone-return" && selection && phonePhase.current === "opened") {
        const back = [
          ...root.current.querySelectorAll<HTMLButtonElement>(
            '[aria-label="Selected task"] button',
          ),
        ].find(
          (button) => button.textContent === (resource ? "Back to project tasks" : "Back to tasks"),
        );
        if (back) {
          phonePhase.current = "returned";
          back.click();
        }
      }
    }, [selection, resource, tasks]);
    const detail =
      creating || task ? (
        <aside
          aria-label="Task detail"
          className={resource ? "mt-3 min-w-0" : "m-4 min-w-0 flex-1 space-y-3 md:max-w-sm"}
        >
          {creating ? (
            <label className="block text-sm">
              Project
              <select
                aria-label="New task project"
                className="block min-h-11 w-full rounded-md border border-input bg-background p-2 text-sm"
              >
                <option>{session.seed.projects[0]!.title}</option>
              </select>
            </label>
          ) : null}
          <FixtureEditor
            key={task?.id ?? "new"}
            task={task ?? null}
            config={configs.find((config) => config.projectId === task?.projectId) ?? configs[0]!}
            state={state}
            canOperate={canOperate}
            resource={resource}
            session={session}
            onClose={close}
            onSave={(fields) => {
              if (task)
                confirmed = confirmed.map((current) =>
                  current.id === task.id
                    ? {
                        ...current,
                        ...fields,
                        dueOn: fields.dueOn || null,
                        areaLabel: fields.areaLabel || null,
                        revision: current.revision + 1,
                      }
                    : current,
                );
              else
                confirmed = [
                  ...confirmed,
                  {
                    ...fields,
                    id: WorkspaceTaskId.make(
                      `wskt_00000000-0000-4000-8000-${String(confirmed.length + 30).padStart(12, "0")}`,
                    ),
                    projectId: session.resourceProjectId,
                    projectTitle: "SynKEK",
                    dueOn: fields.dueOn || null,
                    areaLabel: fields.areaLabel || null,
                    revision: 0,
                    done: fields.column === configs[0]!.completedColumn,
                  },
                ];
              notify();
              close();
            }}
            onDelete={() => {
              confirmed = confirmed.filter((current) => current.id !== task?.id);
              notify();
              close();
            }}
          />
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
        <div ref={root}>
          <ProjectTasksResourceView
            {...common}
            projectId={session.resourceProjectId}
            projectTitle="SynKEK"
            detail={detail}
          />
        </div>
      );
    return (
      <div ref={root} className="flex min-w-0 items-start max-md:block">
        <div
          ref={list}
          data-workspace-task-list=""
          className={`min-w-0 flex-1 ${detail ? "max-md:hidden" : ""} ${state === "phone-return" ? "max-h-[460px] overflow-y-auto" : ""}`}
        >
          <TasksSpaceView
            {...common}
            hidden={!!detail && !resource}
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
      for (const release of releaseHeldMoves) release();
      releaseHeldMoves.clear();
      pending.clear();
      listeners.clear();
    },
  };
};
