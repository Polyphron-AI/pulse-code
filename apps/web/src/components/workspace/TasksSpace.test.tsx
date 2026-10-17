// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import * as DateTime from "effect/DateTime";
import { TasksSpaceView, type TasksSpaceViewProps } from "./TasksSpaceView";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import {
  EnvironmentId,
  ProjectId,
  WorkspaceToolsError,
  type WorkspaceTaskPage,
  type WorkspaceTaskQuery,
  type WorkspaceTaskSummary,
} from "@t3tools/contracts";
import { Atom, AsyncResult, AtomRegistry } from "effect/unstable/reactivity";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { RegistryContext } from "@effect/atom-react";
import { TasksList, TasksSpace } from "./TasksSpace";
import { parseWorkspaceSearch } from "./workspaceNavigation";
const boundary = vi.hoisted(() => ({
  query: vi.fn(),
  task: vi.fn(),
  config: vi.fn(),
  patch: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
  transition: vi.fn(),
  operate: true,
  compact: false,
  v2: true,
}));
vi.mock("../../state/workspaceTools", () => ({
  workspaceTools: {
    queryTasks: (request: unknown) => boundary.query(request),
    task: (request: unknown) => boundary.task(request),
    config: (request: unknown) => boundary.config(request),
    patchTask: "patch",
    upsertTask: "upsert",
    deleteTask: "remove",
    transitionTask: "transition",
  },
}));
const projects = [
  { id: ProjectId.make("p"), environmentId: EnvironmentId.make("remote"), title: "SynKEK" },
];
vi.mock("../../state/entities", () => ({ useProjects: () => projects }));
vi.mock("../../state/environments", () => ({
  useConnectedEnvironmentIds: () => ["remote", "other"],
}));
vi.mock("../../hooks/useMediaQuery", () => ({ useMediaQuery: () => boundary.compact }));
vi.mock("../../hooks/useSettings", () => ({ useEnvironmentSettings: () => null }));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: "patch" | "upsert" | "remove" | "transition") =>
    boundary[command] ?? vi.fn(),
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: (target?: string) => ({
    environmentId: target ?? "remote",
    ready: true,
    workspaceTasksV2: boundary.v2,
  }),
}));
vi.mock("./ProjectTasks", () => ({
  useTaskDateClock: () => DateTime.makeUnsafe("2026-10-13T08:30:00Z"),
}));
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemActions: () => null,
  WorkspaceItemMenu: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./WorkspaceResourcesPanel", () => ({ WorkspaceProjectResources: () => null }));
vi.mock("./WorkspaceEngagement", async () => ({
  WorkspaceItemMutationContext: (await import("react")).createContext(null),
  WorkspaceEngagement: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./WorkspaceLinkedContext", () => ({ WorkspaceLinkedContext: () => null }));
vi.mock("./useWorkspaceHeaderModel", () => ({
  useWorkspaceHeaderModel: () => ({ title: "Tasks" }),
}));
vi.mock("./useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => boundary.operate }));
vi.mock("./useWorkspaceItemOpener", async (original) => ({
  ...(await original<typeof import("./useWorkspaceItemOpener")>()),
  useWorkspaceItemOpener: () => vi.fn(),
}));

let renderer: ReactTestRenderer;
const defaults: TasksSpaceViewProps = {
  environmentId: EnvironmentId.make("remote"),
  projectId: null,
  projects: [],
  view: "all",
  taskLayout: "list",
  filters: { text: "", owner: "all", dueFrom: "", dueTo: "", limit: 50, project: "" },
  page: { tasks: [], total: 0, openTotal: 0, projects: [], laneTotals: [], nextCursor: null },
  status: "ready",
  error: null,
  ownerProfile: null,
  timeZone: "UTC",
  now: DateTime.makeUnsafe("2026-10-13T08:30:00Z"),
  canOperate: true,
  workspaceTasksV2: true,
  onOpen: vi.fn(),
  onTransition: vi.fn(),
  onFilter: vi.fn(),
  onLoadMore: vi.fn(),
  onRetry: vi.fn(),
  onLayout: vi.fn(),
};
afterEach(async () => {
  if (renderer) await act(() => renderer.unmount());
  boundary.operate = true;
  boundary.compact = false;
  boundary.v2 = true;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("debounces stable search, validates controls and cancels work while hidden", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const filter = vi.fn();
  await act(() => {
    renderer = create(<TasksSpaceView {...defaults} onFilter={filter} />);
  });
  const input = renderer.root.findByProps({ "aria-label": "Search tasks" });
  await act(() => input.props.onChange({ target: { value: "launch" } }));
  expect(filter).not.toHaveBeenCalled();
  await act(() => vi.advanceTimersByTime(300));
  expect(filter).toHaveBeenLastCalledWith(
    { ...defaults.filters, text: "launch" },
    { replace: true },
  );
  await act(() => input.props.onChange({ target: { value: "x".repeat(241) } }));
  await act(() => vi.advanceTimersByTime(300));
  expect(filter).toHaveBeenCalledTimes(1);
  expect(renderer.root.findAllByProps({ role: "alert" }).length).toBeGreaterThan(0);
  await act(() => input.props.onChange({ target: { value: "later" } }));
  await act(() => renderer.update(<TasksSpaceView {...defaults} hidden onFilter={filter} />));
  expect(vi.getTimerCount()).toBe(0);
  await act(() => vi.advanceTimersByTime(1000));
  expect(filter).toHaveBeenCalledTimes(1);
});
it("retains stale rows with inline errors and disables Load more until success", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const page = { ...defaults.page!, total: 80, openTotal: 77, nextCursor: "next" };
  await act(() => {
    renderer = create(
      <TasksSpaceView {...defaults} page={page} status="error" error="Could not refresh" />,
    );
  });
  expect(renderer.root.findByProps({ role: "alert" }).children.join("")).toContain(
    "Could not refresh",
  );
  expect(renderer.root.findByProps({ "aria-label": "Load more tasks" }).props.disabled).toBe(true);
  expect(JSON.stringify(renderer.toJSON())).toContain("77 open");
  await act(() => renderer.update(<TasksSpaceView {...defaults} page={page} />));
  expect(renderer.root.findByProps({ "aria-label": "Load more tasks" }).props.disabled).toBe(false);
});

function serviceFixture() {
  const registry = AtomRegistry.make();
  const config = {
    projectId: ProjectId.make("p"),
    taskColumns: ["To do", "Done"],
    completedColumn: "Done",
    revision: 0,
    browserThreadId: null,
  };
  const tasks: WorkspaceTaskSummary[] = Array.from({ length: 4 }, (_, index) => ({
    id: `wskt_00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    projectId: ProjectId.make(index === 3 ? "q" : "p"),
    projectTitle: index === 3 ? "Other" : "SynKEK",
    title: ["First task", "Second task", "Later launch", "Other done"][index]!,
    column: index === 3 ? "Done" : "To do",
    done: index === 3,
    revision: 1,
    dueOn: index < 2 ? "2026-10-13" : "2026-10-16",
    areaLabel: "Marketing",
    owner: index % 2 === 0 ? "environment-owner" : null,
  }));
  type Result = AsyncResult.AsyncResult<WorkspaceTaskPage, unknown>;
  const atoms = new Map<string, Atom.Writable<Result, Result>>();
  const calls: Array<{ environmentId: EnvironmentId; input: typeof WorkspaceTaskQuery.Encoded }> =
    [];
  const taskAtoms = new Map<
    string,
    Atom.Writable<
      AsyncResult.AsyncResult<WorkspaceTaskSummary, unknown>,
      AsyncResult.AsyncResult<WorkspaceTaskSummary, unknown>
    >
  >();
  boundary.task.mockImplementation(({ input }: { input: { id: string } }) => {
    if (!taskAtoms.has(input.id)) {
      const task = tasks.find((task) => task.id === input.id);
      taskAtoms.set(
        input.id,
        Atom.make<AsyncResult.AsyncResult<WorkspaceTaskSummary, unknown>>(
          task
            ? AsyncResult.success(task)
            : AsyncResult.fail(
                new WorkspaceToolsError({ kind: "not-found", message: "Missing task" }),
              ),
        ),
      );
    }
    return taskAtoms.get(input.id)!;
  });
  const configAtom = Atom.make(AsyncResult.success(config));
  boundary.config.mockReturnValue(configAtom);
  boundary.patch.mockImplementation(
    async ({ input }: { input: { id: string; expectedRevision: number; title?: string } }) => {
      const index = tasks.findIndex((task) => task.id === input.id);
      const task = tasks[index]!;
      if (!task || task.revision !== input.expectedRevision)
        return AsyncResult.fail(
          new WorkspaceToolsError({
            kind: "conflict",
            message: "This task changed on another client.",
          }),
        );
      tasks[index] = { ...task, ...input, revision: task.revision + 1 };
      const atom = taskAtoms.get(task.id);
      if (atom) registry.set(atom, AsyncResult.success(tasks[index]!));
      return AsyncResult.success(tasks[index]!);
    },
  );
  let staleCursor = false;
  const read = (environmentId: EnvironmentId, input: typeof WorkspaceTaskQuery.Encoded): Result => {
    if (input.cursor && staleCursor)
      return AsyncResult.fail(
        new WorkspaceToolsError({ kind: "invalid-input", message: "Restart" }),
      );
    const filtered = tasks.filter(
      (task) =>
        (!input.projectId || task.projectId === input.projectId) &&
        (!input.text || task.title.toLowerCase().includes(input.text.toLowerCase())) &&
        (input.state !== "open" || !task.done) &&
        (input.state !== "done" || task.done) &&
        (input.owner !== "unassigned" || task.owner === null) &&
        (input.owner !== "environment-owner" || task.owner === "environment-owner") &&
        (!input.dueFrom || task.dueOn! >= input.dueFrom) &&
        (!input.dueTo || task.dueOn! <= input.dueTo),
    );
    const offset = Number(input.cursor ?? 0),
      limit = input.limit ?? 2;
    const pageTasks = filtered.slice(offset, offset + limit);
    const pageProjects = new Set(pageTasks.map((task) => task.projectId));
    if (input.projectId) pageProjects.add(ProjectId.make(input.projectId));
    return AsyncResult.success({
      tasks: pageTasks.map((task) =>
        environmentId === "other" ? { ...task, title: `Other environment ${task.title}` } : task,
      ),
      total: filtered.length,
      openTotal: filtered.filter((task) => !task.done).length,
      projects: [...pageProjects].map((projectId) => ({ ...config, projectId })),
      laneTotals: [...pageProjects].flatMap((projectId) =>
        config.taskColumns
          .map((column) => ({
            projectId,
            column,
            total: filtered.filter((task) => task.projectId === projectId && task.column === column)
              .length,
          }))
          .filter((lane) => lane.total > 0),
      ),
      nextCursor: offset + limit < filtered.length ? String(offset + limit) : null,
    });
  };
  boundary.query.mockImplementation(
    (request: { environmentId: EnvironmentId; input: typeof WorkspaceTaskQuery.Encoded }) => {
      const key = JSON.stringify(request);
      if (!atoms.has(key)) {
        calls.push(request);
        atoms.set(key, Atom.make(read(request.environmentId, request.input)));
      }
      return atoms.get(key)!;
    },
  );
  boundary.upsert.mockImplementation(
    async ({
      input,
    }: {
      input: { id: string; projectId: ProjectId; title: string; column: string };
    }) => {
      const created: WorkspaceTaskSummary = {
        ...tasks[0]!,
        ...input,
        projectTitle: "SynKEK",
        revision: 0,
        done: false,
      };
      tasks.push(created);
      for (const [key, atom] of atoms) {
        const request = JSON.parse(key) as {
          environmentId: EnvironmentId;
          input: typeof WorkspaceTaskQuery.Encoded;
        };
        registry.set(atom, read(request.environmentId, request.input));
      }
      return AsyncResult.success(created);
    },
  );
  return {
    registry,
    calls,
    atoms,
    taskAtoms,
    tasks,
    read,
    invalidate: () => {
      staleCursor = true;
    },
    dispose: () => registry.dispose(),
  };
}
it("filters before paging, resets loaded pages and keeps the search input mounted", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const fixture = serviceFixture();
  function Harness() {
    const [filters, setFilters] = useState({ ...defaults.filters, limit: 2 });
    const [view, setView] = useState<"all" | "open" | "done">("all");
    return (
      <RegistryContext.Provider value={fixture.registry}>
        <button aria-label="Only done" onClick={() => setView("done")} />
        <TasksList {...defaults} filters={filters} view={view} connected onFilter={setFilters} />
      </RegistryContext.Provider>
    );
  }
  try {
    await act(() => {
      renderer = create(<Harness />);
    });
    const titles = () =>
      renderer.root
        .findAllByType("button")
        .map((button) => button.props["aria-label"])
        .filter((label) => label?.startsWith("Open "));
    expect(titles()).toEqual(["Open First task", "Open Second task"]);
    await act(() => renderer.root.findByProps({ "aria-label": "Load more tasks" }).props.onClick());
    expect(titles()).toContain("Open Later launch");
    const input = renderer.root.findByProps({ "aria-label": "Search tasks" });
    await act(() => input.props.onChange({ target: { value: "launch" } }));
    await act(() => vi.advanceTimersByTime(300));
    expect(titles()).toEqual(["Open Later launch"]);
    expect(renderer.root.findByProps({ "aria-label": "Search tasks" })).toBe(input);
    expect(fixture.calls.at(-1)?.input).toMatchObject({ text: "launch", limit: 2 });
    expect(fixture.calls.at(-1)?.input.cursor).toBeUndefined();
    await act(() =>
      renderer.root
        .findAllByType("button")
        .find((button) => button.children.join("") === "Clear")!
        .props.onClick(),
    );
    await act(() => renderer.root.findByProps({ "aria-label": "Only done" }).props.onClick());
    expect(titles()).toEqual(["Open Other done"]);
    expect(JSON.stringify(renderer.toJSON())).toContain("0 open");
  } finally {
    await act(() => renderer.unmount());
    fixture.dispose();
  }
});
it("drops all cursor pages on invalid-input and reports stale first-page errors inline", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  const props = { ...defaults, filters: { ...defaults.filters, limit: 1 }, connected: true };
  try {
    await act(() => {
      renderer = create(
        <RegistryContext.Provider value={fixture.registry}>
          <TasksList {...props} />
        </RegistryContext.Provider>,
      );
    });
    const titles = () =>
      renderer.root
        .findAllByType("button")
        .map((button) => button.props["aria-label"])
        .filter((label) => label?.startsWith("Open "));
    await act(() => renderer.root.findByProps({ "aria-label": "Load more tasks" }).props.onClick());
    expect(titles()).toHaveLength(2);
    fixture.invalidate();
    await act(() => renderer.root.findByProps({ "aria-label": "Load more tasks" }).props.onClick());
    expect(titles()).toEqual(["Open First task"]);
    expect(renderer.root.findAllByProps({ role: "alert" })).toHaveLength(0);
    const first = fixture.atoms.values().next().value!;
    const success = fixture.registry.get(first);
    if (!AsyncResult.isSuccess(success)) throw new Error("Missing first page");
    await act(() => fixture.registry.set(first, AsyncResult.waiting(success)));
    expect(titles()).toEqual(["Open First task"]);
    expect(renderer.root.findByProps({ "aria-label": "Load more tasks" }).props.disabled).toBe(
      true,
    );
    await act(() =>
      fixture.registry.set(
        first,
        AsyncResult.failure(
          Cause.fail(new WorkspaceToolsError({ kind: "unavailable", message: "Connection lost" })),
          { previousSuccess: Option.some(success) },
        ),
      ),
    );
    expect(titles()).toEqual(["Open First task"]);
    expect(renderer.root.findByProps({ role: "alert" }).children.join("")).toBe("Connection lost");
    expect(renderer.root.findByProps({ "aria-label": "Load more tasks" }).props.disabled).toBe(
      true,
    );
    await act(() => fixture.registry.set(first, success));
    expect(renderer.root.findByProps({ "aria-label": "Load more tasks" }).props.disabled).toBe(
      false,
    );
  } finally {
    await act(() => renderer.unmount());
    fixture.dispose();
  }
});
it("validates date order and page size before applying project and owner filters", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const apply = vi.fn();
  await act(() => {
    renderer = create(
      <TasksSpaceView
        {...defaults}
        projects={[{ id: ProjectId.make("p"), title: "SynKEK" }]}
        onFilter={apply}
      />,
    );
  });
  await act(() => renderer.root.findByProps({ "aria-label": "Filter tasks" }).props.onClick());
  const change = async (label: string, value: string) =>
    act(() =>
      renderer.root.findByProps({ "aria-label": label }).props.onChange({ target: { value } }),
    );
  const submit = () =>
    renderer.root
      .findByProps({ "aria-label": "Task filters" })
      .props.onSubmit({ preventDefault() {} });
  await change("Due from", "2026-10-18");
  await change("Due to", "2026-10-16");
  await act(submit);
  expect(apply).not.toHaveBeenCalled();
  await change("Due from", "2026-10-13");
  await change("Task page size", "101");
  await act(submit);
  expect(apply).not.toHaveBeenCalled();
  await change("Task page size", "1");
  await change("Task project", "p");
  await change("Task owner filter", "unassigned");
  await act(submit);
  expect(apply).toHaveBeenCalledWith({
    ...defaults.filters,
    limit: 1,
    project: "p",
    owner: "unassigned",
    dueFrom: "2026-10-13",
    dueTo: "2026-10-16",
  });
});
it("discards held pages on environment and filter changes, with no legacy or link writes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  const view = (environmentId: EnvironmentId, filters = defaults.filters) => (
    <RegistryContext.Provider value={fixture.registry}>
      <TasksList
        {...defaults}
        environmentId={environmentId}
        filters={{ ...filters, limit: 1 }}
        connected
      />
    </RegistryContext.Provider>
  );
  try {
    await act(() => {
      renderer = create(view(EnvironmentId.make("remote")));
    });
    const input = renderer.root.findByProps({ "aria-label": "Search tasks" });
    await act(() => renderer.root.findByProps({ "aria-label": "Load more tasks" }).props.onClick());
    const old = fixture.atoms.values().next().value!;
    await act(() => renderer.update(view(EnvironmentId.make("other"))));
    expect(JSON.stringify(renderer.toJSON())).toContain("Other environment First task");
    await act(() =>
      fixture.registry.set(
        old,
        AsyncResult.success({ ...defaults.page!, tasks: fixture.tasks, total: 4, openTotal: 3 }),
      ),
    );
    expect(JSON.stringify(renderer.toJSON())).not.toContain('"Open First task"');
    await act(() =>
      renderer.update(
        view(EnvironmentId.make("other"), {
          ...defaults.filters,
          project: "p",
          owner: "unassigned",
          dueFrom: "2026-10-13",
          dueTo: "2026-10-13",
        }),
      ),
    );
    expect(JSON.stringify(renderer.toJSON())).toContain("Other environment Second task");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Later launch");
    expect(renderer.root.findByProps({ "aria-label": "Search tasks" })).toBe(input);
  } finally {
    await act(() => renderer.unmount());
    fixture.dispose();
  }
});

it("retries an initial query error and gates old-server and read-only controls", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  let result: AsyncResult.AsyncResult<WorkspaceTaskPage, unknown> = AsyncResult.fail(
    new WorkspaceToolsError({ kind: "invalid-input", message: "Choose valid task filters" }),
  );
  const query = Atom.make(() => result);
  boundary.query.mockImplementation(() => query);
  const view = (available = true, canOperate = false, settingsReady = true) => (
    <RegistryContext.Provider value={fixture.registry}>
      <TasksList
        {...defaults}
        connected
        workspaceTasksV2={available}
        canOperate={canOperate}
        settingsReady={settingsReady}
      />
    </RegistryContext.Provider>
  );
  try {
    await act(() => {
      renderer = create(view());
    });
    expect(renderer.root.findByProps({ role: "alert" }).children.join("")).toBe(
      "Choose valid task filters",
    );
    result = AsyncResult.success({
      ...defaults.page!,
      tasks: fixture.tasks,
      total: 4,
      openTotal: 3,
      projects: [
        {
          projectId: ProjectId.make("p"),
          taskColumns: ["To do", "Done"],
          completedColumn: "Done",
          browserThreadId: null,
          revision: 0,
        },
      ],
    });
    await act(() =>
      renderer.root
        .findAllByType("button")
        .find((button) => button.children.join("") === "Retry tasks")!
        .props.onClick(),
    );
    expect(
      renderer.root
        .findAllByType("input")
        .filter((input) => input.props.type === "checkbox")
        .every((input) => input.props.disabled),
    ).toBe(true);
    const calls = boundary.query.mock.calls.length;
    await act(() => renderer.update(view(false, false, false)));
    expect(JSON.stringify(renderer.toJSON())).toContain("Loading tasks...");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Tasks need a newer server.");
    expect(boundary.query.mock.calls.length).toBe(calls);
    await act(() => renderer.update(view(false)));
    expect(JSON.stringify(renderer.toJSON())).toContain("Tasks need a newer server.");
    expect(boundary.query.mock.calls.length).toBe(calls);
  } finally {
    await act(() => renderer.unmount());
    fixture.dispose();
  }
});

it("distinguishes an empty list from no matches and clears the filter", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  function Harness() {
    const [filters, setFilters] = useState({ ...defaults.filters, text: "missing" });
    return <TasksSpaceView {...defaults} filters={filters} onFilter={setFilters} />;
  }
  await act(() => {
    renderer = create(<Harness />);
  });
  expect(JSON.stringify(renderer.toJSON())).toContain("No matching tasks.");
  await act(() =>
    renderer.root
      .findAllByType("button")
      .find((button) => button.children.join("") === "Clear")!
      .props.onClick(),
  );
  expect(JSON.stringify(renderer.toJSON())).toContain("No tasks yet. Add tasks from a project.");
});

it("keeps raw trailing spaces after the debounced query is trimmed", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const filter = vi.fn();
  function Harness() {
    const [filters, setFilters] = useState(defaults.filters);
    return (
      <TasksSpaceView
        {...defaults}
        filters={filters}
        onFilter={(next) => {
          filter(next.text.trim());
          setFilters({ ...next, text: next.text.trim() });
        }}
      />
    );
  }
  await act(() => {
    renderer = create(<Harness />);
  });
  const input = renderer.root.findByProps({ "aria-label": "Search tasks" });
  await act(() => input.props.onChange({ target: { value: "launch " } }));
  await act(() => vi.advanceTimersByTime(300));
  expect(filter).toHaveBeenLastCalledWith("launch");
  expect(input.props.value).toBe("launch ");
  expect(vi.getTimerCount()).toBe(0);
  await act(() => input.props.onChange({ target: { value: `${input.props.value}assets` } }));
  await act(() => vi.advanceTimersByTime(300));
  expect(filter).toHaveBeenLastCalledWith("launch assets");
});

it.each([false, true])(
  "keeps project scope separate from user filters (filtered: %s)",
  async (filtered) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    function Harness() {
      const [filters, setFilters] = useState({
        ...defaults.filters,
        project: "p",
        ...(filtered
          ? {
              text: "missing",
              owner: "unassigned" as const,
              dueFrom: "2026-10-13",
              dueTo: "2026-10-16",
              limit: 1,
            }
          : {}),
      });
      return (
        <TasksSpaceView
          {...defaults}
          projectId={filters.project ? ProjectId.make(filters.project) : null}
          projects={[{ id: ProjectId.make("p"), title: "SynKEK" }]}
          filters={filters}
          onFilter={setFilters}
        />
      );
    }
    await act(() => {
      renderer = create(<Harness />);
    });
    const clear = () =>
      renderer.root
        .findAllByType("button")
        .filter((button) => button.children.join("") === "Clear");
    if (filtered) {
      expect(JSON.stringify(renderer.toJSON())).toContain("No matching tasks.");
      await act(() => clear()[0]!.props.onClick());
      expect(renderer.root.findByType(TasksSpaceView).props.filters).toEqual({
        ...defaults.filters,
        project: "p",
      });
    }
    expect(clear()).toHaveLength(0);
    expect(JSON.stringify(renderer.toJSON())).toContain("Project tasks");
    expect(JSON.stringify(renderer.toJSON())).toContain("No tasks yet. Add tasks from a project.");
  },
);

async function mountRouter(component: () => React.ReactNode, initialEntries: string[]) {
  const rootRoute = createRootRoute();
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: "workspace",
    validateSearch: parseWorkspaceSearch,
    component,
  });
  const history = createMemoryHistory({ initialEntries });
  const router = createRouter({ routeTree: rootRoute.addChildren([route]), history });
  await router.load();
  await act(() => {
    renderer = create(<RouterProvider router={router} />);
  });
  return { router, history };
}

async function mountTasksDom(fixture: ReturnType<typeof serviceFixture>, initialEntry: string) {
  const rootRoute = createRootRoute();
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: "workspace",
    validateSearch: parseWorkspaceSearch,
    component: () => (
      <RegistryContext.Provider value={fixture.registry}>
        <TasksSpace />
      </RegistryContext.Provider>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
  await router.load();
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  await act(() => root.render(<RouterProvider router={router} />));
  return {
    node,
    router,
    dispose: async () => {
      await act(() => root.unmount());
      node.remove();
      fixture.dispose();
    },
  };
}

function enterValue(input: HTMLElement, value: string) {
  const prototype =
    input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(
    new Event(input instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
  );
}

async function createFromMenu(node: HTMLElement) {
  const trigger = node.querySelector<HTMLElement>('[aria-label="Task actions"]')!;
  trigger.focus();
  await act(() => trigger.click());
  await act(() => getByRole(node, "menuitem", { name: "New task" }).click());
}

it.each(["create", "edit"])(
  "unlocks the New task project picker after discarding a dirty %s",
  async (mode) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const fixture = serviceFixture();
    boundary.upsert.mockClear();
    const { node, dispose } = await mountTasksDom(
      fixture,
      "/workspace?space=tasks&environment=remote",
    );
    try {
      if (mode === "create") {
        await createFromMenu(node);
        await act(() => enterValue(getByRole(node, "combobox", { name: "New task project" }), "p"));
      } else await act(() => getByRole(node, "button", { name: "Open First task" }).click());
      await act(() =>
        enterValue(
          getByRole(node, "textbox", { name: mode === "create" ? "New task title" : "Task title" }),
          "Unsaved title",
        ),
      );
      await act(() =>
        getByRole(node, "button", { name: mode === "create" ? "Cancel" : "Close task" }).click(),
      );
      await act(() => getByRole(node, "button", { name: "Discard changes" }).click());
      await createFromMenu(node);
      const project = getByRole(node, "combobox", {
        name: "New task project",
      }) as HTMLSelectElement;
      expect(project.disabled).toBe(false);
      expect(node.textContent).not.toContain("Cancel this draft to choose another project.");
      await act(() => enterValue(project, "p"));
      expect(
        (getByRole(node, "textbox", { name: "New task title" }) as HTMLInputElement).value,
      ).toBe("");
      expect(boundary.upsert).not.toHaveBeenCalled();
    } finally {
      await dispose();
    }
  },
);

it("captures fresh create return filters, scroll and trigger after a previous detail close", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  const { node, router, dispose } = await mountTasksDom(
    fixture,
    "/workspace?space=tasks&environment=remote",
  );
  try {
    const list = getByRole(node, "main", { name: "Tasks list" });
    list.scrollTop = 25;
    const first = getByRole(node, "button", { name: "Open First task" });
    first.focus();
    await act(() => first.click());
    await act(() => getByRole(node, "button", { name: "Close task" }).click());
    await act(() => enterValue(getByRole(node, "searchbox", { name: "Search tasks" }), "Later"));
    await act(() =>
      getByRole(node, "form", { name: "Task search" }).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    await act(() => getByRole(node, "button", { name: "Filter tasks" }).click());
    await act(() => {
      enterValue(getByRole(node, "combobox", { name: "Task owner filter" }), "environment-owner");
      enterValue(getByRole(node, "spinbutton", { name: "Task page size" }), "1");
    });
    await act(() =>
      getByRole(node, "form", { name: "Task filters" }).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    const current = router.state.location.search;
    expect(current).toMatchObject({
      taskText: "Later",
      taskOwner: "environment-owner",
      taskLimit: 1,
    });
    list.scrollTop = 123;
    await createFromMenu(node);
    list.scrollTop = 0;
    await act(() => getByRole(node, "button", { name: "Cancel" }).click());
    expect(router.state.location.search).toEqual(current);
    expect((getByRole(node, "searchbox", { name: "Search tasks" }) as HTMLInputElement).value).toBe(
      "Later",
    );
    expect(list.scrollTop).toBe(123);
    expect(document.activeElement).toBe(node.querySelector('[aria-label="Task actions"]'));
    await act(() =>
      router.navigate({ to: "/workspace", search: { ...current, taskText: "First" } }),
    );
    list.scrollTop = 0;
    await createFromMenu(node);
    list.scrollTop = 45;
    await act(() => getByRole(node, "button", { name: "Cancel" }).click());
    expect(router.state.location.search.taskText).toBe("First");
    expect(list.scrollTop).toBe(0);
  } finally {
    await dispose();
  }
});

it("keeps an externally deleted task draft mounted for copy or explicit discard", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  boundary.patch.mockClear();
  boundary.upsert.mockClear();
  const writeText = vi
    .fn()
    .mockRejectedValueOnce(new Error("Clipboard denied"))
    .mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const { node, dispose } = await mountTasksDom(
    fixture,
    "/workspace?space=tasks&environment=remote",
  );
  try {
    await act(() => getByRole(node, "button", { name: "Open First task" }).click());
    await act(() =>
      enterValue(getByRole(node, "textbox", { name: "Task title" }), "Keep this draft"),
    );
    await act(() =>
      fixture.registry.set(
        fixture.taskAtoms.get(fixture.tasks[0]!.id)!,
        AsyncResult.fail(
          new WorkspaceToolsError({ kind: "not-found", message: "Deleted on another client" }),
        ),
      ),
    );
    const title = getByRole(node, "textbox", { name: "Task title" }) as HTMLInputElement;
    expect(title.value).toBe("Keep this draft");
    expect(node.textContent).toContain("This task was deleted.");
    expect((getByRole(node, "button", { name: "Save task" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await act(() => getByRole(node, "button", { name: "Copy draft" }).click());
    expect(getByRole(node, "alert").textContent).toContain("Failed to copy task draft");
    expect(title.value).toBe("Keep this draft");
    await act(() => getByRole(node, "button", { name: "Copy draft" }).click());
    expect(writeText).toHaveBeenLastCalledWith(
      "Keep this draft\nProject: SynKEK\nColumn: To do\nDue date: 2026-10-13\nArea: Marketing\nOwner: Me",
    );
    expect(node.textContent).toContain("Draft copied.");
    expect(boundary.patch).not.toHaveBeenCalled();
    expect(boundary.upsert).not.toHaveBeenCalled();
    await act(() => getByRole(node, "button", { name: "Discard draft" }).click());
    await act(() => getByRole(node, "button", { name: "Keep editing" }).click());
    expect(title.value).toBe("Keep this draft");
    await act(() => getByRole(node, "button", { name: "Discard draft" }).click());
    await act(() => getByRole(node, "button", { name: "Discard changes" }).click());
    expect(queryByRole(node, "textbox", { name: "Task title" })).toBeNull();
  } finally {
    await dispose();
  }
});

it("keeps the create origin through successful save and detail close", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  const { node, router, dispose } = await mountTasksDom(
    fixture,
    "/workspace?space=tasks&environment=remote&project=p&taskText=Later&taskLimit=1",
  );
  try {
    const current = router.state.location.search;
    const list = getByRole(node, "main", { name: "Tasks list" });
    list.scrollTop = 123;
    await createFromMenu(node);
    await act(() =>
      enterValue(
        getByRole(node, "textbox", { name: "New task title" }),
        "Created elsewhere in the list",
      ),
    );
    await act(() => getByRole(node, "button", { name: "Add task" }).click());
    expect(getByRole(node, "textbox", { name: "Task title" })).toBeDefined();
    await act(() =>
      router.navigate({
        to: "/workspace",
        search: { ...router.state.location.search, taskText: "First" },
      }),
    );
    list.scrollTop = 0;
    await act(() => getByRole(node, "button", { name: "Close task" }).click());
    expect(router.state.location.search).toEqual(current);
    expect(list.scrollTop).toBe(123);
    expect(document.activeElement).toBe(getByRole(node, "button", { name: "Task actions" }));
  } finally {
    await dispose();
  }
});

it("closes Task actions on outside click, focus leave, Escape and selection without listeners while hidden", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  document.body.append(node);
  const outside = document.createElement("button");
  document.body.append(outside);
  const root = createRoot(node);
  const created = vi.fn();
  const add = vi.spyOn(document, "addEventListener");
  const remove = vi.spyOn(document, "removeEventListener");
  try {
    const view = (hidden = false) => (
      <TasksSpaceView {...defaults} onCreate={created} hidden={hidden} />
    );
    await act(() => root.render(view()));
    const trigger = getByRole(node, "button", { name: "Task actions" });
    await act(() => trigger.click());
    expect(getByRole(node, "menu", { name: "Task creation" })).toBeDefined();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(getByRole(node, "menuitem", { name: "New task" }));
    await act(() => outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await act(() => trigger.click());
    await act(() => outside.focus());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    await act(() => trigger.click());
    await act(() =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
    await act(() => trigger.click());
    await act(() => getByRole(node, "menuitem", { name: "New task" }).click());
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(created).toHaveBeenCalledWith(trigger);
    await act(() => trigger.click());
    await act(() => root.render(view(true)));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    const listeners = add.mock.calls.filter(
      ([type]) => type === "pointerdown" || type === "keydown",
    );
    for (const [type, listener] of listeners)
      expect(
        remove.mock.calls.some(
          ([removedType, removedListener]) => removedType === type && removedListener === listener,
        ),
      ).toBe(true);
    const count = listeners.length;
    await act(() => outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(
      add.mock.calls.filter(([type]) => type === "pointerdown" || type === "keydown"),
    ).toHaveLength(count);
  } finally {
    await act(() => root.unmount());
    add.mockRestore();
    remove.mockRestore();
    node.remove();
    outside.remove();
  }
});

it("fits Task actions in the desktop header and reserves larger compact targets", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  const root = createRoot(node);
  try {
    await act(() => root.render(<TasksSpaceView {...defaults} onCreate={() => {}} />));
    const trigger = getByRole(node, "button", { name: "Task actions" });
    expect(trigger.classList.contains("min-h-11")).toBe(false);
    expect(trigger.classList.contains("max-md:size-11")).toBe(true);
  } finally {
    await act(() => root.unmount());
  }
});

it("suspends the compact list clock during create and returns to the list on Cancel", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  boundary.compact = true;
  const fixture = serviceFixture();
  const add = vi.spyOn(window, "addEventListener");
  const remove = vi.spyOn(window, "removeEventListener");
  const { node, dispose } = await mountTasksDom(
    fixture,
    "/workspace?space=tasks&environment=remote&project=p",
  );
  try {
    const list = getByRole(node, "main", { name: "Tasks list" });
    const clocks = add.mock.calls.filter(([type]) => type === "focus");
    expect(clocks.length).toBeGreaterThan(0);
    await createFromMenu(node);
    expect(list.parentElement?.className).toContain("max-md:hidden");
    for (const [type, listener] of clocks)
      expect(
        remove.mock.calls.some(
          ([removedType, removedListener]) => type === removedType && listener === removedListener,
        ),
      ).toBe(true);
    await act(() => getByRole(node, "button", { name: "Cancel" }).click());
    expect(list.parentElement?.className).not.toContain("max-md:hidden");
    expect(document.activeElement).toBe(getByRole(node, "button", { name: "Task actions" }));
  } finally {
    await dispose();
    add.mockRestore();
    remove.mockRestore();
  }
});

it("keeps loaded depth through first-page refresh and replaces it with a confirmed cursor chain", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  try {
    await act(() => {
      renderer = create(
        <RegistryContext.Provider value={fixture.registry}>
          <TasksList {...defaults} filters={{ ...defaults.filters, limit: 2 }} connected />
        </RegistryContext.Provider>,
      );
    });
    await act(() => renderer.root.findByProps({ "aria-label": "Load more tasks" }).props.onClick());
    const rows = () => renderer.root.findAllByProps({ "data-workspace-task-row": "" });
    const last = rows()[3];
    expect(rows()).toHaveLength(4);
    const firstAtom = fixture.atoms.values().next().value!;
    const success = fixture.registry.get(firstAtom);
    await act(() => fixture.registry.set(firstAtom, AsyncResult.waiting(success)));
    expect(rows()).toHaveLength(4);
    expect(rows()[3]).toBe(last);
    fixture.tasks[0] = { ...fixture.tasks[0]!, title: "Changed elsewhere", revision: 2 };
    await act(() =>
      fixture.registry.set(firstAtom, fixture.read(EnvironmentId.make("remote"), { limit: 2 })),
    );
    expect(rows()).toHaveLength(4);
    expect(rows()[3]).toBe(last);
    expect(JSON.stringify(renderer.toJSON())).toContain("Changed elsewhere");
  } finally {
    await act(() => renderer.unmount());
    fixture.dispose();
  }
});

it("keeps the selected page size through connected search pauses and Enter", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  try {
    const { router } = await mountRouter(
      () => (
        <RegistryContext.Provider value={fixture.registry}>
          <TasksSpace />
        </RegistryContext.Provider>
      ),
      ["/workspace?space=tasks&environment=remote&taskLimit=1"],
    );
    vi.useFakeTimers();
    expect(renderer.root.findAllByProps({ "data-workspace-task-row": "" })).toHaveLength(1);
    const input = renderer.root.findByProps({ "aria-label": "Search tasks" });
    await act(() => input.props.onChange({ target: { value: "task" } }));
    await act(async () => vi.advanceTimersByTime(300));
    expect(router.state.location.search.taskLimit).toBe(1);
    expect(fixture.calls.at(-1)?.input.limit).toBe(1);
    await act(async () =>
      renderer.root
        .findByProps({ "aria-label": "Task search" })
        .props.onSubmit({ preventDefault() {} }),
    );
    expect(router.state.location.search.taskLimit).toBe(1);
    await act(() => renderer.root.findByProps({ "aria-label": "Filter tasks" }).props.onClick());
    expect(renderer.root.findByProps({ "aria-label": "Task page size" }).props.value).toBe(1);
  } finally {
    await act(() => renderer.unmount());
    fixture.dispose();
  }
});

it("loads a filtered-out direct task, retains its draft through search and confirms Back", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  try {
    const item = JSON.stringify({ type: "task", taskId: fixture.tasks[2]!.id });
    const { router, history } = await mountRouter(
      () => (
        <RegistryContext.Provider value={fixture.registry}>
          <TasksSpace />
        </RegistryContext.Provider>
      ),
      [
        `/workspace?space=tasks&environment=remote&taskText=missing&item=${encodeURIComponent(JSON.stringify(item))}`,
      ],
    );
    expect(renderer.root.findByProps({ "aria-label": "Task title" }).props.value).toBe(
      "Later launch",
    );
    await act(() =>
      renderer.root
        .findByProps({ "aria-label": "Task title" })
        .props.onChange({ target: { value: "Unsaved launch" } }),
    );
    const length = history.length;
    await act(async () =>
      renderer.root
        .findByProps({ "aria-label": "Task search" })
        .props.onSubmit({ preventDefault() {} }),
    );
    expect(router.state.location.search.item).toBe(item);
    expect(renderer.root.findByProps({ "aria-label": "Task title" }).props.value).toBe(
      "Unsaved launch",
    );
    const back = () =>
      renderer.root
        .findAllByType("button")
        .find((button) => button.children.join("") === "Back to tasks")!
        .props.onClick();
    await act(back);
    expect(renderer.root.findByProps({ role: "alertdialog" })).toBeDefined();
    await act(() =>
      renderer.root
        .findAllByType("button")
        .find((button) => button.children.join("") === "Keep editing")!
        .props.onClick(),
    );
    expect(router.state.location.search.item).toBe(item);
    await act(back);
    await act(async () =>
      renderer.root
        .findAllByType("button")
        .find((button) => button.children.join("") === "Discard changes")!
        .props.onClick(),
    );
    expect(router.state.location.search.item).toBeUndefined();
    expect(history.length).toBe(length);
  } finally {
    await act(() => renderer.unmount());
    fixture.dispose();
  }
});

it("keeps a missing direct URL unavailable and never creates a replacement", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  try {
    const item = JSON.stringify({
      type: "task",
      taskId: "wskt_00000000-0000-4000-8000-000000000099",
    });
    await mountRouter(
      () => (
        <RegistryContext.Provider value={fixture.registry}>
          <TasksSpace />
        </RegistryContext.Provider>
      ),
      [
        `/workspace?space=tasks&environment=remote&item=${encodeURIComponent(JSON.stringify(item))}`,
      ],
    );
    expect(JSON.stringify(renderer.toJSON())).toContain(
      "This task is unavailable. Its links have been kept.",
    );
    expect(renderer.root.findAllByProps({ "aria-label": "New task title" })).toHaveLength(0);
    expect(boundary.upsert).not.toHaveBeenCalled();
  } finally {
    await act(() => renderer.unmount());
    fixture.dispose();
  }
});

it("gates a direct Tasks URL on an older server without querying task extensions", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  boundary.v2 = false;
  const calls = boundary.query.mock.calls.length;
  try {
    const item = JSON.stringify({ type: "task", taskId: fixture.tasks[0]!.id });
    await mountRouter(
      () => (
        <RegistryContext.Provider value={fixture.registry}>
          <TasksSpace />
        </RegistryContext.Provider>
      ),
      [
        `/workspace?space=tasks&environment=remote&item=${encodeURIComponent(JSON.stringify(item))}`,
      ],
    );
    expect(JSON.stringify(renderer.toJSON())).toContain("Tasks need a newer server.");
    expect(boundary.query.mock.calls.length).toBe(calls);
    expect(renderer.root.findAllByProps({ "aria-label": "Task title" })).toHaveLength(0);
  } finally {
    await act(() => renderer.unmount());
    fixture.dispose();
  }
});

it("restores phone query, pages, scroll and focus after dirty detail Back", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  boundary.compact = true;
  const fixture = serviceFixture();
  const rootRoute = createRootRoute();
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: "workspace",
    validateSearch: parseWorkspaceSearch,
    component: () => (
      <RegistryContext.Provider value={fixture.registry}>
        <TasksSpace />
      </RegistryContext.Provider>
    ),
  });
  const history = createMemoryHistory({
    initialEntries: ["/workspace?space=tasks&environment=remote&view=open&taskLimit=1"],
  });
  const router = createRouter({ routeTree: rootRoute.addChildren([route]), history });
  await router.load();
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  try {
    await act(() => root.render(<RouterProvider router={router} />));
    await act(() => getByRole(node, "button", { name: "Load more tasks" }).click());
    await act(() => getByRole(node, "button", { name: "Load more tasks" }).click());
    const origin = getByRole(node, "button", { name: "Open Later launch" });
    const list = getByRole(node, "main", { name: "Tasks list" });
    let scrollTop = 0;
    Object.defineProperty(list, "scrollTop", {
      configurable: true,
      get: () => (list.closest(".max-md\\:hidden") ? 0 : scrollTop),
      set: (value: number) => {
        scrollTop = value;
      },
    });
    list.scrollTop = 123;
    origin.focus();
    await act(() => origin.click());
    expect(list.parentElement?.className).toContain("max-md:hidden");
    expect(list.scrollTop).toBe(0);
    const title = getByRole(node, "textbox", { name: "Task title" }) as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(() => {
      setValue.call(title, "Dirty launch");
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect((getByRole(node, "button", { name: "Save task" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    const searchInput = getByRole(node, "searchbox", { name: "Search tasks" }) as HTMLInputElement;
    await act(() => {
      setValue.call(searchInput, "First");
      searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(() =>
      getByRole(node, "form", { name: "Task search" }).dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
    expect(router.state.location.search.item).toBeDefined();
    expect(title.value).toBe("Dirty launch");
    expect(node.querySelectorAll("[data-workspace-task-row]")).toHaveLength(1);
    for (let index = 0; index < 9; index++)
      await act(() =>
        router.navigate({
          to: "/workspace",
          search: { ...router.state.location.search, taskText: `Search ${index}` },
        }),
      );
    await act(() => {
      void router.navigate({
        to: "/workspace",
        search: { space: "tasks", environment: "remote", view: "done" },
      });
    });
    expect(getByRole(node, "alertdialog", { name: "Discard task changes?" })).toBeDefined();
    expect(router.state.location.search.item).toBeDefined();
    await act(() => getByRole(node, "button", { name: "Keep editing" }).click());
    expect(title.value).toBe("Dirty launch");
    await act(() => getByRole(node, "button", { name: "Back to tasks" }).click());
    await act(() => getByRole(node, "button", { name: "Discard changes" }).click());
    expect(queryByRole(node, "textbox", { name: "Task title" })).toBeNull();
    expect(router.state.location.search).toEqual({
      space: "tasks",
      environment: "remote",
      view: "open",
      taskLimit: 1,
    });
    expect(node.querySelectorAll("[data-workspace-task-row]")).toHaveLength(3);
    expect(list.scrollTop).toBe(123);
    expect(list.parentElement?.className).not.toContain("max-md:hidden");
    expect(document.activeElement).toBe(getByRole(node, "button", { name: "Open Later launch" }));
  } finally {
    await act(() => root.unmount());
    node.remove();
    fixture.dispose();
  }
});

it("creates from the Tasks menu in the chosen project and refreshes the query", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  try {
    const { router } = await mountRouter(
      () => (
        <RegistryContext.Provider value={fixture.registry}>
          <TasksSpace />
        </RegistryContext.Provider>
      ),
      ["/workspace?space=tasks&environment=remote&project=p"],
    );
    await act(() =>
      renderer.root
        .findAllByType("button")
        .find((button) => button.children.join("") === "New task")!
        .props.onClick(),
    );
    await act(() =>
      renderer.root
        .findByProps({ "aria-label": "New task title" })
        .props.onChange({ target: { value: "New durable task" } }),
    );
    await act(async () =>
      renderer.root
        .findAllByType("form")
        .find((form) => !form.props["aria-label"])!
        .props.onSubmit({ preventDefault() {} }),
    );
    expect(fixture.tasks.some((task) => task.title === "New durable task")).toBe(true);
    expect(JSON.stringify(renderer.toJSON())).toContain("Open New durable task");
    expect(router.state.location.search.item).toContain(
      boundary.upsert.mock.calls.at(-1)?.[0].input.id,
    );
    expect(boundary.upsert.mock.calls.at(-1)?.[0].environmentId).toBe("remote");
  } finally {
    await act(() => renderer.unmount());
    fixture.dispose();
  }
});

it("resets the connected loaded pages when the environment key changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  try {
    const { router } = await mountRouter(
      () => (
        <RegistryContext.Provider value={fixture.registry}>
          <TasksSpace />
        </RegistryContext.Provider>
      ),
      ["/workspace?space=tasks&environment=remote&taskLimit=1"],
    );
    await act(() => renderer.root.findByProps({ "aria-label": "Load more tasks" }).props.onClick());
    expect(renderer.root.findAllByProps({ "data-workspace-task-row": "" })).toHaveLength(2);
    await act(() =>
      router.navigate({
        to: "/workspace",
        search: { space: "tasks", environment: "other", taskLimit: 1 },
      }),
    );
    expect(renderer.root.findAllByProps({ "data-workspace-task-row": "" })).toHaveLength(1);
    expect(JSON.stringify(renderer.toJSON())).toContain("Other environment First task");
    expect(fixture.calls.at(-1)?.environmentId).toBe("other");
  } finally {
    await act(() => renderer.unmount());
    fixture.dispose();
  }
});

it("has no create affordance in the connected read-only Tasks view", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  boundary.operate = false;
  const fixture = serviceFixture();
  try {
    await mountRouter(
      () => (
        <RegistryContext.Provider value={fixture.registry}>
          <TasksSpace />
        </RegistryContext.Provider>
      ),
      ["/workspace?space=tasks&environment=remote"],
    );
    expect(renderer.root.findAllByProps({ "aria-label": "Task actions" })).toHaveLength(0);
    expect(
      renderer.root
        .findAllByType("input")
        .filter((input) => input.props.type === "checkbox")
        .every((input) => input.props.disabled),
    ).toBe(true);
  } finally {
    await act(() => renderer.unmount());
    fixture.dispose();
  }
});

it("shows one named settings notice and navigates in the router without per-row links", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  try {
    const page: WorkspaceTaskPage = {
      ...defaults.page!,
      tasks: fixture.tasks,
      total: 4,
      openTotal: 3,
      projects: ["p", "q"].map((id) => ({
        projectId: ProjectId.make(id),
        taskColumns: ["Backlog", "Review"],
        completedColumn: null,
        revision: 0,
        browserThreadId: null,
      })),
    };
    const { router } = await mountRouter(
      () => <TasksSpaceView {...defaults} page={page} />,
      ["/workspace?space=tasks&environment=remote"],
    );
    const notices = renderer.root
      .findAllByType("p")
      .filter((node) =>
        node.children.some(
          (child) => typeof child === "string" && child.includes("Choose a completed column"),
        ),
      );
    expect(notices).toHaveLength(1);
    const links = notices[0]!.findAllByType("a");
    expect(links.map((link) => link.children.join(""))).toEqual(["SynKEK", "Other"]);
    for (const row of renderer.root.findAllByProps({ "data-workspace-task-row": "" })) {
      expect(row.findAllByType("a")).toHaveLength(0);
    }
    const preventDefault = vi.fn();
    await act(async () =>
      links[0]!.props.onClick({
        button: 0,
        defaultPrevented: false,
        preventDefault,
        currentTarget: { getAttribute: () => null },
      }),
    );
    expect(preventDefault).toHaveBeenCalled();
    expect(router.state.location.search).toEqual({
      space: "projects",
      environment: "remote",
      project: "p",
    });
  } finally {
    fixture.dispose();
  }
});

it("replaces search history, pushes applied filters and clears user filters within the project", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  try {
    const { router, history } = await mountRouter(
      () => (
        <RegistryContext.Provider value={fixture.registry}>
          <TasksSpace />
        </RegistryContext.Provider>
      ),
      [
        "/workspace?space=projects&environment=remote",
        "/workspace?space=tasks&environment=remote&project=p",
      ],
    );
    vi.useFakeTimers();
    const initialLength = history.length;
    const input = renderer.root.findByProps({ "aria-label": "Search tasks" });
    for (const text of ["launch ", "launch assets"]) {
      await act(() => input.props.onChange({ target: { value: text } }));
      await act(async () => vi.advanceTimersByTime(300));
      expect(history.length).toBe(initialLength);
      expect(router.state.location.search).toMatchObject({ project: "p", taskText: text.trim() });
      expect(input.props.value).toBe(text);
    }
    await act(() => renderer.root.findByProps({ "aria-label": "Filter tasks" }).props.onClick());
    await act(() =>
      renderer.root
        .findByProps({ "aria-label": "Task owner filter" })
        .props.onChange({ target: { value: "unassigned" } }),
    );
    await act(async () =>
      renderer.root
        .findByProps({ "aria-label": "Task filters" })
        .props.onSubmit({ preventDefault() {} }),
    );
    expect(history.length).toBe(initialLength + 1);
    expect(router.state.location.search).toMatchObject({ project: "p", taskOwner: "unassigned" });
    await act(async () =>
      router.navigate({
        to: "/workspace",
        search: { ...router.state.location.search, space: "tasks", view: "done" },
      }),
    );
    expect(history.length).toBe(initialLength + 2);
    await act(async () =>
      renderer.root
        .findAllByType("button")
        .find((button) => button.children.join("") === "Clear")!
        .props.onClick(),
    );
    expect(router.state.location.search).toEqual({
      space: "tasks",
      environment: "remote",
      project: "p",
      view: "all",
    });
    const latestQuery = boundary.query.mock.calls.at(-1)?.[0].input;
    expect(latestQuery).toMatchObject({ projectId: "p", state: "all", owner: "all", limit: 50 });
    expect(latestQuery.text).toBeUndefined();
    expect(
      renderer.root
        .findAllByType("button")
        .map((button) => button.props["aria-label"])
        .filter((label) => label?.startsWith("Open ")),
    ).toEqual(["Open First task", "Open Second task", "Open Later launch"]);
  } finally {
    await act(() => renderer.unmount());
    fixture.dispose();
  }
});
it.each(["create", "save"])(
  "clears create mode when selecting a row from an empty draft before %s",
  async (action) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const fixture = serviceFixture();
    const { node, router, dispose } = await mountTasksDom(
      fixture,
      "/workspace?space=tasks&environment=remote&project=p",
    );
    try {
      await createFromMenu(node);
      await act(() => getByRole(node, "button", { name: "Open First task" }).click());
      if (action === "save") {
        const navigate = vi.spyOn(router, "navigate");
        await act(() =>
          enterValue(getByRole(node, "textbox", { name: "Task title" }), "Edited task"),
        );
        await act(() => getByRole(node, "button", { name: "Save task" }).click());
        expect(navigate).not.toHaveBeenCalled();
        navigate.mockRestore();
      }
      await createFromMenu(node);
      expect(getByRole(node, "textbox", { name: "New task title" })).toBeDefined();
      expect(queryByRole(node, "textbox", { name: "Task title" })).toBeNull();
      expect(router.state.location.search.item).toBeUndefined();
    } finally {
      await dispose();
    }
  },
);
it.each(["list", "board"])(
  "guards a dirty create draft before opening a task from %s",
  async (layout) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const fixture = serviceFixture();
    const { node, router, dispose } = await mountTasksDom(
      fixture,
      `/workspace?space=tasks&environment=remote&project=p&taskLayout=${layout}`,
    );
    try {
      await createFromMenu(node);
      await act(() =>
        enterValue(getByRole(node, "textbox", { name: "New task title" }), "Unsaved draft"),
      );
      const before = router.state.location.href;
      await act(() => getByRole(node, "button", { name: "Open First task" }).click());
      expect(getByRole(node, "alertdialog", { name: "Discard task changes?" })).toBeDefined();
      await act(() => getByRole(node, "button", { name: "Keep editing" }).click());
      expect(router.state.location.href).toBe(before);
      expect(
        (getByRole(node, "textbox", { name: "New task title" }) as HTMLInputElement).value,
      ).toBe("Unsaved draft");
      await act(() => getByRole(node, "button", { name: "Open First task" }).click());
      await act(() => getByRole(node, "button", { name: "Discard changes" }).click());
      expect(router.state.location.search.item).toBe(
        JSON.stringify({ type: "task", taskId: fixture.tasks[0]!.id }),
      );
      expect((getByRole(node, "textbox", { name: "Task title" }) as HTMLInputElement).value).toBe(
        "First task",
      );
      expect(queryByRole(node, "textbox", { name: "New task title" })).toBeNull();
      expect(boundary.upsert).not.toHaveBeenCalled();
      await createFromMenu(node);
      expect(getByRole(node, "textbox", { name: "New task title" })).toBeDefined();
    } finally {
      await dispose();
    }
  },
);

it("keeps the create origin after abandoned navigation and Cancel then Discard", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  const { node, router, dispose } = await mountTasksDom(
    fixture,
    "/workspace?space=tasks&environment=remote&project=p&taskLimit=1",
  );
  try {
    const list = getByRole(node, "main", { name: "Tasks list" });
    list.scrollTop = 87;
    await createFromMenu(node);
    await act(() => enterValue(getByRole(node, "textbox", { name: "New task title" }), "Draft"));
    await act(() =>
      router.navigate({
        to: "/workspace",
        search: { ...router.state.location.search, taskText: "First" },
      }),
    );
    await act(() => getByRole(node, "button", { name: "Open First task" }).click());
    await act(() => getByRole(node, "button", { name: "Keep editing" }).click());
    await act(() => getByRole(node, "button", { name: "Cancel" }).click());
    await act(() => getByRole(node, "button", { name: "Discard changes" }).click());
    expect(router.state.location.search.taskText).toBeUndefined();
    expect(list.scrollTop).toBe(87);
    expect(document.activeElement).toBe(node.querySelector('[aria-label="Task actions"]'));
  } finally {
    await dispose();
  }
});

it("keeps phone scroll when creating from an open task before Cancel", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  boundary.compact = true;
  const fixture = serviceFixture();
  const { node, dispose } = await mountTasksDom(
    fixture,
    "/workspace?space=tasks&environment=remote&project=p",
  );
  try {
    const list = getByRole(node, "main", { name: "Tasks list" });
    let scrollTop = 88;
    Object.defineProperty(list, "scrollTop", {
      configurable: true,
      get: () => (list.closest(".max-md\\:hidden") ? 0 : scrollTop),
      set: (value: number) => {
        scrollTop = value;
      },
    });
    await act(() => getByRole(node, "button", { name: "Open First task" }).click());
    expect(list.scrollTop).toBe(0);
    await createFromMenu(node);
    expect(getByRole(node, "textbox", { name: "New task title" })).toBeDefined();
    await act(() => getByRole(node, "button", { name: "Cancel" }).click());
    expect(list.scrollTop).toBe(88);
    expect(document.activeElement).toBe(node.querySelector('[aria-label="Task actions"]'));
  } finally {
    await dispose();
  }
});

it("switches Board and List without losing URL filters, loaded pages or the selected shared editor", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  const { node, router, dispose } = await mountTasksDom(
    fixture,
    "/workspace?space=tasks&environment=remote&taskLimit=1&taskOwner=environment-owner&taskText=a&taskDueFrom=2026-10-13&taskDueTo=2026-10-16",
  );
  try {
    await act(() => getByRole(node, "button", { name: "Load more tasks" }).click());
    await act(() => getByRole(node, "button", { name: "Board" }).click());
    expect(router.state.location.search).toMatchObject({
      taskLayout: "board",
      taskLimit: 1,
      taskOwner: "environment-owner",
    });
    expect(getByRole(node, "region", { name: "SynKEK board" }).textContent).toContain(
      "2 loaded of 2",
    );
    const origin = getByRole(node, "button", { name: "Open Later launch" });
    origin.focus();
    await act(() => origin.click());
    const title = getByRole(node, "textbox", { name: "Task title" });
    expect((title as HTMLInputElement).value).toBe("Later launch");
    const selected = router.state.location.search.item;
    await act(() => getByRole(node, "button", { name: "List" }).click());
    expect(router.state.location.search).toMatchObject({
      taskLayout: "list",
      taskLimit: 1,
      taskOwner: "environment-owner",
      item: selected,
    });
    expect(getByRole(node, "textbox", { name: "Task title" })).toBe(title);
    expect(getByRole(node, "button", { name: "Open Later launch" })).toBeDefined();
    await act(() => getByRole(node, "button", { name: "Close task" }).click());
    expect(router.state.location.search.taskLayout).toBe("board");
    expect(document.activeElement).toBe(getByRole(node, "button", { name: "Open Later launch" }));
  } finally {
    await dispose();
  }
});
it("adds each next page's project groups and full lane totals to the board", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  const { node, dispose } = await mountTasksDom(
    fixture,
    "/workspace?space=tasks&environment=remote&taskLayout=board&taskLimit=2",
  );
  try {
    expect(getByRole(node, "region", { name: "SynKEK: To do" }).textContent).toContain(
      "2 loaded of 3",
    );
    expect(getByRole(node, "region", { name: "SynKEK: Done" }).textContent).toContain(
      "0 loaded of 0",
    );
    expect(queryByRole(node, "region", { name: "Other board" })).toBeNull();
    await act(() => getByRole(node, "button", { name: "Load more tasks" }).click());
    expect(getByRole(node, "region", { name: "SynKEK: To do" }).textContent).toContain(
      "3 loaded of 3",
    );
    expect(getByRole(node, "region", { name: "Other: Done" }).textContent).toContain(
      "1 loaded of 1",
    );
    expect(getByRole(node, "region", { name: "Other: To do" }).textContent).toContain(
      "0 loaded of 0",
    );
  } finally {
    await dispose();
  }
});

it("retains each page's known empty lanes when another page has capped totals", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  const first = fixture.read(EnvironmentId.make("remote"), { state: "all", limit: 2 });
  if (!AsyncResult.isSuccess(first)) throw new Error("Missing page");
  const base = {
    ...first.value,
    nextCursor: "next",
    laneTotals: Array.from({ length: 1200 }, (_, index) => ({
      projectId: ProjectId.make("p"),
      column: `Legacy ${index}`,
      total: 1,
    })),
  };
  const later = {
    ...first.value,
    tasks: [fixture.tasks[3]!],
    nextCursor: null,
    projects: [{ ...first.value.projects[0]!, projectId: ProjectId.make("q") }],
    laneTotals: [{ projectId: ProjectId.make("q"), column: "Done", total: 1 }],
  };
  const baseAtom = Atom.make(AsyncResult.success(base));
  const laterAtom = Atom.make(AsyncResult.success(later));
  boundary.query.mockImplementation(({ input }: { input: { cursor?: string } }) =>
    input.cursor ? laterAtom : baseAtom,
  );
  const { node, dispose } = await mountTasksDom(
    fixture,
    "/workspace?space=tasks&environment=remote&taskLayout=board",
  );
  try {
    await act(() => getByRole(node, "button", { name: "Load more tasks" }).click());
    expect(getByRole(node, "region", { name: "SynKEK: Done" }).textContent).toContain(
      "0 loaded; total unavailable",
    );
    expect(getByRole(node, "region", { name: "Other: To do" }).textContent).toContain(
      "0 loaded of 0",
    );
    expect(getByRole(node, "region", { name: "Other: Done" }).textContent).toContain(
      "1 loaded of 1",
    );
    expect(node.textContent).toContain("Some lane totals are unavailable");
  } finally {
    await dispose();
  }
});

it.each(["conflict", "not-found"] as const)(
  "reloads server truth after a board move returns %s",
  async (kind) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const fixture = serviceFixture();
    const queries = new Map<
      string,
      Atom.Atom<AsyncResult.AsyncResult<WorkspaceTaskPage, unknown>>
    >();
    boundary.query.mockImplementation(
      (request: { environmentId: EnvironmentId; input: typeof WorkspaceTaskQuery.Encoded }) => {
        const key = JSON.stringify(request);
        if (!queries.has(key))
          queries.set(
            key,
            Atom.make(() => fixture.read(request.environmentId, request.input)),
          );
        return queries.get(key)!;
      },
    );
    let reject = true;
    boundary.transition.mockImplementation(async () => {
      if (reject) {
        reject = false;
        if (kind === "not-found") fixture.tasks.splice(0, 1);
        else fixture.tasks[0] = { ...fixture.tasks[0]!, column: "Done", done: true, revision: 2 };
        return AsyncResult.fail(new WorkspaceToolsError({ kind, message: "Move rejected" }));
      }
      return AsyncResult.success({ ...fixture.tasks[0]!, revision: 3 });
    });
    const { node, dispose } = await mountTasksDom(
      fixture,
      "/workspace?space=tasks&environment=remote&taskLayout=board",
    );
    try {
      await act(() =>
        enterValue(getByRole(node, "combobox", { name: "Move First task to column" }), "Done"),
      );
      expect(queryByRole(node, "alert")).toBeNull();
      if (kind === "not-found") {
        expect(queryByRole(node, "button", { name: "Open First task" })).toBeNull();
      } else {
        const select = getByRole(node, "combobox", {
          name: "Move First task to column",
        }) as HTMLSelectElement;
        expect(select.value).toBe("Done");
        expect(getByRole(node, "region", { name: "SynKEK: Done" }).contains(select)).toBe(true);
        await act(() => enterValue(select, "To do"));
        expect(boundary.transition.mock.calls.at(-1)?.[0].input).toEqual({
          id: fixture.tasks[0]!.id,
          expectedRevision: 2,
          change: { type: "column", column: "To do" },
        });
      }
    } finally {
      await dispose();
    }
  },
);

it("refreshes a later-page board card after a conflict without a change signal", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const fixture = serviceFixture();
  const queries = new Map<string, Atom.Atom<AsyncResult.AsyncResult<WorkspaceTaskPage, unknown>>>();
  boundary.query.mockImplementation(
    (request: { environmentId: EnvironmentId; input: typeof WorkspaceTaskQuery.Encoded }) => {
      const key = JSON.stringify(request);
      if (!queries.has(key))
        queries.set(
          key,
          Atom.make(() => fixture.read(request.environmentId, request.input)).pipe(Atom.keepAlive),
        );
      return queries.get(key)!;
    },
  );
  boundary.transition.mockImplementation(async () => {
    fixture.tasks[1] = { ...fixture.tasks[1]!, column: "Done", done: true, revision: 2 };
    return AsyncResult.fail(
      new WorkspaceToolsError({ kind: "conflict", message: "Move rejected" }),
    );
  });
  const { node, dispose } = await mountTasksDom(
    fixture,
    "/workspace?space=tasks&environment=remote&taskLayout=board&taskLimit=1",
  );
  try {
    await act(() => getByRole(node, "button", { name: "Load more tasks" }).click());
    await act(() =>
      enterValue(getByRole(node, "combobox", { name: "Move Second task to column" }), "Done"),
    );
    const select = getByRole(node, "combobox", {
      name: "Move Second task to column",
    }) as HTMLSelectElement;
    expect(select.value).toBe("Done");
    expect(node.textContent).not.toContain("Refreshing tasks to load");
  } finally {
    await dispose();
  }
});

it.each(["list", "board", "missing-card"])(
  "returns detail focus to its opener or lane in %s",
  async (mode) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const fixture = serviceFixture();
    const { node, dispose } = await mountTasksDom(
      fixture,
      `/workspace?space=tasks&environment=remote&taskLayout=${mode === "list" ? "list" : "board"}`,
    );
    try {
      expect(
        getByRole(node, "main", { name: mode === "list" ? "Tasks list" : "Tasks board" }),
      ).toBeDefined();
      const opener = getByRole(node, "button", { name: "Open First task" });
      getByRole(node, "searchbox", { name: "Search tasks" }).focus();
      await act(() => opener.click());
      if (mode === "missing-card") {
        fixture.tasks.splice(0, 1);
        await act(() => {
          for (const [key, atom] of fixture.atoms) {
            const request = JSON.parse(key) as {
              environmentId: EnvironmentId;
              input: typeof WorkspaceTaskQuery.Encoded;
            };
            fixture.registry.set(atom, fixture.read(request.environmentId, request.input));
          }
        });
      }
      await act(() => getByRole(node, "button", { name: "Close task" }).click());
      expect(document.activeElement).toBe(
        mode === "missing-card" ? getByRole(node, "region", { name: "SynKEK: To do" }) : opener,
      );
    } finally {
      await dispose();
    }
  },
);
