// @vitest-environment happy-dom
import { act, useState } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import * as DateTime from "effect/DateTime";
import { TasksSpaceView, type TasksSpaceViewProps } from "./TasksSpaceView";
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
import { TasksList } from "./TasksSpace";
const boundary = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../state/workspaceTools", () => ({
  workspaceTools: { queryTasks: (request: unknown) => boundary.query(request) },
}));
vi.mock("../../state/entities", () => ({ useProjects: () => [] }));
vi.mock("../../state/environments", () => ({ useConnectedEnvironmentIds: () => ["remote"] }));
vi.mock("../../hooks/useSettings", () => ({ useEnvironmentSettings: () => null }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ environmentId: "remote", ready: true, workspaceTasksV2: true }),
}));
vi.mock("./ProjectTasks", () => ({
  useTaskDateClock: () => DateTime.makeUnsafe("2026-10-13T08:30:00Z"),
}));
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemActions: () => null,
  WorkspaceItemMenu: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./WorkspaceResourcesPanel", () => ({ WorkspaceProjectResources: () => null }));
vi.mock("./WorkspaceLinkedContext", () => ({ WorkspaceLinkedContext: () => null }));
vi.mock("./useWorkspaceHeaderModel", () => ({
  useWorkspaceHeaderModel: () => ({ title: "Tasks" }),
}));
vi.mock("./useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => true }));
vi.mock("./useWorkspaceItemOpener", () => ({
  parseTaskLocation: () => null,
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
  expect(filter).toHaveBeenLastCalledWith({ ...defaults.filters, text: "launch" });
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
    return AsyncResult.success({
      tasks: filtered
        .slice(offset, offset + limit)
        .map((task) =>
          environmentId === "other" ? { ...task, title: `Other environment ${task.title}` } : task,
        ),
      total: filtered.length,
      openTotal: filtered.filter((task) => !task.done).length,
      projects: [config, { ...config, projectId: ProjectId.make("q") }],
      laneTotals: [],
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
  return {
    registry,
    calls,
    atoms,
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
  const view = (available = true, canOperate = false) => (
    <RegistryContext.Provider value={fixture.registry}>
      <TasksList {...defaults} connected workspaceTasksV2={available} canOperate={canOperate} />
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
