import * as Cause from "effect/Cause";
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, WorkspaceToolsError } from "@t3tools/contracts";
import { ProjectTasks, ProjectWorkspaceSettings } from "./ProjectTasks";
import { WorkspaceEngagement, WorkspaceItemMutationContext } from "./WorkspaceEngagement";
import { useWorkspaceResourceState, WorkspaceResourcesProvider } from "./workspaceResourceState";
const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  operate: true,
  tasksV2: false,
  newCommand: vi.fn(),
  zone: "Africa/Johannesburg",
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ workspaceTools: true, workspaceTasksV2: mocks.tasksV2 }),
}));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    isPending: false,
    data: { authenticated: true, scopes: mocks.operate ? ["orchestration:operate"] : [] },
  }),
}));
vi.mock("../../hooks/useSettings", () => ({ useEnvironmentSettings: () => mocks.zone }));
vi.mock("../../state/entities", () => ({ useThreadShells: () => [] }));
vi.mock("../../state/workspaceTools", () => ({
  workspaceTools: {
    config: () => "config",
    tasks: () => "tasks",
    saveConfig: {},
    upsertTask: {},
    deleteTask: {},
    transitionTask: "transition",
    patchTask: "patch",
  },
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (query: string) => ({
    data:
      query === "config"
        ? {
            projectId: "project",
            taskColumns: ["To do", "Done"],
            browserThreadId: "missing-thread",
            completedColumn: "Done",
            revision: 0,
          }
        : { tasks: [], incomplete: false },
    error: null,
  }),
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: unknown) =>
    command === "transition" || command === "patch" ? mocks.newCommand : mocks.command,
}));
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemActions: () => null,
  WorkspaceItemMenu: ({ children }: { children: unknown }) => children,
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/textarea", () => ({ Textarea: "textarea" }));
let renderer: ReactTestRenderer | undefined;
const environmentId = EnvironmentId.make("remote");
const projectId = ProjectId.make("project");
afterEach(async () => {
  if (renderer) await act(() => renderer?.unmount());
  renderer = undefined;
  mocks.operate = true;
  mocks.tasksV2 = false;
  mocks.zone = "Africa/Johannesburg";
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("captures the remote task owner and reuses its create ID after a failed save", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.command.mockResolvedValue({
    _tag: "Failure",
    cause: Cause.fail(new Error("Synthetic failure")),
  });
  await act(() => {
    renderer = create(
      <ProjectTasks
        environmentId={environmentId}
        projectId={projectId}
        selected={null}
        onSelect={() => {}}
      />,
    );
  });
  await act(() =>
    renderer!.root
      .findByProps({ "aria-label": "New task title" })
      .props.onChange({ target: { value: "Review" } }),
  );
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(mocks.command.mock.calls[0]?.[0]).toEqual(mocks.command.mock.calls[1]?.[0]);
  expect(mocks.command.mock.calls[0]?.[0]).toMatchObject({
    environmentId: "remote",
    input: { projectId: "project", title: "Review", column: "To do" },
  });
});
it("does not silently clear an unavailable browser thread while editing columns", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.command.mockResolvedValue({ _tag: "Success", value: {} });
  await act(() => {
    renderer = create(
      <ProjectWorkspaceSettings environmentId={environmentId} projectId={projectId} />,
    );
  });
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(mocks.command).toHaveBeenCalledWith({
    environmentId: "remote",
    input: {
      projectId: "project",
      taskColumns: ["To do", "Done"],
      browserThreadId: "missing-thread",
    },
  });
});
it.each(["delete", "move"])(
  "invalidates a held task only for deletion, preserving links after %s",
  async (action) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    (
      window as unknown as {
        happyDOM: { setWindowSize(size: { width: number; height: number }): void };
      }
    ).happyDOM.setWindowSize({ width: 1280, height: 800 });
    const task = {
      id: "wskt_00000000-0000-0000-0000-000000000001",
      projectId,
      title: "Captured task",
      column: "To do",
    };
    mocks.command.mockResolvedValue({ _tag: "Success", value: task });
    function App() {
      const state = useWorkspaceResourceState(environmentId, {
        storage: { getItem: () => null, setItem() {} },
      });
      return (
        <WorkspaceResourcesProvider value={state}>
          <WorkspaceEngagement
            environmentId={environmentId}
            space="projects"
            layout="full"
            header={{ title: "Projects", environmentLabel: "Remote", spaceLabel: "Projects" }}
            resources={<p>Resources</p>}
            linkedContext={{
              item: { ref: { type: "task", taskId: task.id }, title: task.title },
              render: () => <p>Task links</p>,
            }}
          >
            <ProjectTasks
              environmentId={environmentId}
              projectId={projectId}
              selected={task}
              onSelect={() => {}}
            />
          </WorkspaceEngagement>
        </WorkspaceResourcesProvider>
      );
    }
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(() => root.render(<App />));
      await act(() => getByRole(node, "button", { name: "Linked context" }).click());
      expect(getByRole(node, "complementary", { name: "Linked context" }).textContent).toContain(
        "Task links",
      );
      if (action === "move")
        await act(() => {
          const select = getByRole(node, "combobox", { name: "Task column" }) as HTMLSelectElement;
          select.value = "Done";
          select.dispatchEvent(new Event("change", { bubbles: true }));
        });
      await act(() =>
        getByRole(node, "button", {
          name: action === "delete" ? "Delete task" : "Save task",
        }).click(),
      );
      expect(mocks.command).toHaveBeenCalledWith(
        expect.objectContaining({ environmentId, input: expect.objectContaining({ id: task.id }) }),
      );
      if (action === "delete") {
        expect(queryByRole(node, "complementary", { name: "Linked context" })).toBeNull();
        expect(getByRole(node, "complementary", { name: "Resources" })).toBeDefined();
      } else {
        expect(getByRole(node, "complementary", { name: "Linked context" }).textContent).toContain(
          "Task links",
        );
      }
    } finally {
      await act(() => root.unmount());
      node.remove();
    }
  },
);
it("revalidates settings permission at submit", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(() => {
    renderer = create(
      <ProjectWorkspaceSettings environmentId={environmentId} projectId={projectId} />,
    );
  });
  mocks.operate = false;
  await act(() =>
    renderer!.update(
      <ProjectWorkspaceSettings environmentId={environmentId} projectId={projectId} />,
    ),
  );
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(mocks.command).not.toHaveBeenCalled();
});
it("keeps the held task and editor after a failed delete", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const task = {
    id: "wskt_00000000-0000-0000-0000-000000000001",
    projectId,
    title: "Retained task",
    column: "To do",
  };
  const invalidate = vi.fn();
  const onSelect = vi.fn();
  mocks.command.mockResolvedValue({
    _tag: "Failure",
    cause: Cause.fail(new Error("Delete unavailable")),
  });
  await act(() => {
    renderer = create(
      <WorkspaceItemMutationContext value={invalidate}>
        <ProjectTasks
          environmentId={environmentId}
          projectId={projectId}
          selected={task}
          onSelect={onSelect}
        />
      </WorkspaceItemMutationContext>,
    );
  });
  await act(async () =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children === "Delete task")!
      .props.onClick(),
  );
  expect(renderer!.root.findByProps({ role: "alert" }).children.join("")).toContain(
    "Delete unavailable",
  );
  expect(invalidate).not.toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
});

it("keeps legacy task and settings paths when the live capability projection is false", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.tasksV2 = false;
  mocks.command.mockResolvedValue({ _tag: "Success", value: {} });
  await act(() => {
    renderer = create(
      <>
        <ProjectWorkspaceSettings environmentId={environmentId} projectId={projectId} />
        <ProjectTasks
          environmentId={environmentId}
          projectId={projectId}
          selected={null}
          onSelect={() => {}}
        />
      </>,
    );
  });
  expect(renderer!.root.findAllByProps({ "aria-label": "Completed column" })).toHaveLength(0);
  await act(() =>
    renderer!.root
      .findByProps({ "aria-label": "New task title" })
      .props.onChange({ target: { value: "Legacy" } }),
  );
  for (const form of renderer!.root.findAllByType("form"))
    await act(() => form.props.onSubmit({ preventDefault() {} }));
  expect(mocks.command).toHaveBeenCalledTimes(2);
  expect(mocks.command.mock.calls[0]?.[0].input).not.toHaveProperty("expectedRevision");
  expect(mocks.newCommand).not.toHaveBeenCalled();
});
it("confirms the affected count, permits cancellation and preserves Browser settings", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.tasksV2 = true;
  const conflict = {
    _tag: "Failure",
    cause: Cause.fail(
      new WorkspaceToolsError({
        kind: "conflict",
        reason: "completion-confirmation-required",
        message: "Review the completion change affecting 2 tasks.",
      }),
    ),
  };
  mocks.command.mockResolvedValue(conflict);
  await act(() => {
    renderer = create(
      <ProjectWorkspaceSettings environmentId={environmentId} projectId={projectId} />,
    );
  });
  await act(() =>
    renderer!.root
      .findByProps({ "aria-label": "Completed column" })
      .props.onChange({ target: { value: "To do" } }),
  );
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(mocks.command.mock.calls[0]?.[0]).toMatchObject({
    environmentId,
    input: { expectedRevision: 0, completedColumn: "To do", browserThreadId: "missing-thread" },
  });
  expect(renderer!.root.findByProps({ role: "alert" }).children.join("")).toContain("2 tasks");
  expect(renderer!.root.findAllByType("button").map((button) => button.props.children)).toEqual(
    expect.arrayContaining(["Confirm completion changes", "Cancel"]),
  );
  await act(() =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children === "Cancel")!
      .props.onClick(),
  );
  expect(mocks.command).toHaveBeenCalledTimes(1);
  expect(renderer!.root.findByProps({ "aria-label": "Completed column" }).props.value).toBe("Done");
  await act(() =>
    renderer!.root
      .findByProps({ "aria-label": "Completed column" })
      .props.onChange({ target: { value: "" } }),
  );
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  mocks.command.mockResolvedValue({ _tag: "Success", value: {} });
  await act(() =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children === "Confirm completion changes")!
      .props.onClick(),
  );
  expect(mocks.command.mock.calls.at(-1)?.[0].input).toMatchObject({
    completedColumn: null,
    expectedRevision: 0,
    confirmCompletionChanges: true,
  });
});

it("restores legacy saving if live task capability disappears during confirmation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.tasksV2 = true;
  mocks.command.mockResolvedValue({
    _tag: "Failure",
    cause: Cause.fail(
      new WorkspaceToolsError({
        kind: "conflict",
        reason: "completion-confirmation-required",
        message: "Review the completion change affecting 1 task.",
      }),
    ),
  });
  const view = <ProjectWorkspaceSettings environmentId={environmentId} projectId={projectId} />;
  await act(() => {
    renderer = create(view);
  });
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  mocks.tasksV2 = false;
  await act(() =>
    renderer!.update(
      <ProjectWorkspaceSettings environmentId={environmentId} projectId={projectId} />,
    ),
  );
  mocks.command.mockResolvedValue({ _tag: "Success", value: {} });
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(mocks.command).toHaveBeenCalledTimes(2);
  expect(mocks.command.mock.calls.at(-1)?.[0].input).not.toHaveProperty("completedColumn");
});
it("does not offer confirmation from English error text without the typed reason", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.tasksV2 = true;
  mocks.command.mockResolvedValue({
    _tag: "Failure",
    cause: Cause.fail(
      new WorkspaceToolsError({
        kind: "conflict",
        message:
          "Changing the completed column changes completion for 2 tasks. Confirm to continue.",
      }),
    ),
  });
  await act(() => {
    renderer = create(
      <ProjectWorkspaceSettings environmentId={environmentId} projectId={projectId} />,
    );
  });
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  const buttons = renderer!.root.findAllByType("button").map((button) => button.props.children);
  expect(buttons).not.toContain("Confirm completion changes");
  expect(buttons).not.toContain("Cancel");
});
it("resets the designation draft when equal project IDs belong to a different environment", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.tasksV2 = true;
  mocks.command.mockResolvedValue({ _tag: "Success", value: {} });
  await act(() => {
    renderer = create(
      <ProjectWorkspaceSettings environmentId={environmentId} projectId={projectId} />,
    );
  });
  await act(() =>
    renderer!.root
      .findByProps({ "aria-label": "Completed column" })
      .props.onChange({ target: { value: "To do" } }),
  );
  const other = EnvironmentId.make("other-environment");
  await act(() =>
    renderer!.update(<ProjectWorkspaceSettings environmentId={other} projectId={projectId} />),
  );
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(mocks.command.mock.calls.at(-1)?.[0]).toMatchObject({
    environmentId: other,
    input: { completedColumn: "Done" },
  });
});

it("shows and submits no designation after renaming the designated column", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.tasksV2 = true;
  mocks.command.mockResolvedValue({ _tag: "Success", value: {} });
  await act(() => {
    renderer = create(
      <ProjectWorkspaceSettings environmentId={environmentId} projectId={projectId} />,
    );
  });
  await act(() =>
    renderer!.root
      .findByProps({ "aria-label": "Task columns" })
      .props.onChange({ target: { value: "To do\nComplete" } }),
  );
  expect(renderer!.root.findByProps({ "aria-label": "Completed column" }).props.value).toBe("");
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(mocks.command.mock.calls.at(-1)?.[0].input).toMatchObject({
    taskColumns: ["To do", "Complete"],
    completedColumn: null,
    expectedRevision: 0,
  });
});

it("keeps a removed designation cleared when cancelling another completion choice", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.tasksV2 = true;
  mocks.command.mockResolvedValue({
    _tag: "Failure",
    cause: Cause.fail(
      new WorkspaceToolsError({
        kind: "conflict",
        reason: "completion-confirmation-required",
        message: "Review the completion change affecting 2 tasks.",
      }),
    ),
  });
  await act(() => {
    renderer = create(
      <ProjectWorkspaceSettings environmentId={environmentId} projectId={projectId} />,
    );
  });
  await act(() =>
    renderer!.root
      .findByProps({ "aria-label": "Task columns" })
      .props.onChange({ target: { value: "To do\nComplete" } }),
  );
  await act(() =>
    renderer!.root
      .findByProps({ "aria-label": "Completed column" })
      .props.onChange({ target: { value: "To do" } }),
  );
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  await act(() =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children === "Cancel")!
      .props.onClick(),
  );
  expect(renderer!.root.findByProps({ "aria-label": "Completed column" }).props.value).toBe("");
  mocks.command.mockResolvedValue({ _tag: "Success", value: {} });
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(mocks.command.mock.calls.at(-1)?.[0].input.completedColumn).toBeNull();
});

it("retains dirty metadata and the base revision after a subscription refresh and conflict", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.tasksV2 = true;
  const task = {
    id: "wskt_00000000-0000-0000-0000-000000000001",
    projectId,
    title: "Original",
    column: "To do",
    dueOn: "2026-10-16",
    areaLabel: "Marketing",
    revision: 3,
  };
  const view = (selected = task) => (
    <ProjectTasks
      environmentId={environmentId}
      projectId={projectId}
      selected={selected}
      onSelect={() => {}}
    />
  );
  mocks.newCommand.mockResolvedValue({
    _tag: "Failure",
    cause: Cause.fail(
      new WorkspaceToolsError({ kind: "conflict", message: "Reload before saving." }),
    ),
  });
  await act(() => {
    renderer = create(view());
  });
  await act(() =>
    renderer!.root
      .findByProps({ "aria-label": "Task area" })
      .props.onChange({ target: { value: "Website" } }),
  );
  await act(() => renderer!.update(view({ ...task, title: "Remote title", revision: 4 })));
  expect(renderer!.root.findByProps({ "aria-label": "Task title" }).props.value).toBe("Original");
  await act(() => renderer!.root.findAllByType("form")[1]!.props.onSubmit({ preventDefault() {} }));
  expect(mocks.newCommand).toHaveBeenCalledWith({
    environmentId,
    input: { id: task.id, expectedRevision: 3, areaLabel: "Website" },
  });
  expect(renderer!.root.findByProps({ "aria-label": "Task area" }).props.value).toBe("Website");
  expect(renderer!.root.findByProps({ role: "alert" }).children.join("")).toContain(
    "Reload before saving.",
  );
});
it("clears metadata explicitly and keeps failed drafts until a successful patch", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.tasksV2 = true;
  const task = {
    id: "wskt_00000000-0000-0000-0000-000000000001",
    projectId,
    title: "Task",
    column: "To do",
    dueOn: "2026-10-16",
    areaLabel: "Marketing",
    revision: 2,
  };
  mocks.newCommand.mockResolvedValue({ _tag: "Failure", cause: Cause.fail(new Error("Offline")) });
  await act(() => {
    renderer = create(
      <ProjectTasks
        environmentId={environmentId}
        projectId={projectId}
        selected={task}
        onSelect={() => {}}
      />,
    );
  });
  for (const label of ["Task due date", "Task area"])
    await act(() =>
      renderer!.root.findByProps({ "aria-label": label }).props.onChange({ target: { value: "" } }),
    );
  await act(() => renderer!.root.findAllByType("form")[1]!.props.onSubmit({ preventDefault() {} }));
  expect(mocks.newCommand).toHaveBeenLastCalledWith({
    environmentId,
    input: { id: task.id, expectedRevision: 2, dueOn: null, areaLabel: null },
  });
  expect(renderer!.root.findByProps({ "aria-label": "Task due date" }).props.value).toBe("");
  mocks.newCommand.mockResolvedValue({
    _tag: "Success",
    value: { ...task, dueOn: null, areaLabel: null, revision: 3 },
  });
  await act(() => renderer!.root.findAllByType("form")[1]!.props.onSubmit({ preventDefault() {} }));
  expect(
    renderer!.root.findAllByType("button").find((button) => button.props.children === "Save task")!
      .props.disabled,
  ).toBe(true);
});
it("refreshes date labels at environment midnight, zone changes and resume without RPC", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T21:59:59Z"));
  mocks.tasksV2 = true;
  const task = {
    id: "wskt_00000000-0000-0000-0000-000000000001",
    projectId,
    title: "Task",
    column: "To do",
    dueOn: "2026-10-16",
    areaLabel: null,
    revision: 0,
  };
  const view = () => (
    <ProjectTasks
      environmentId={environmentId}
      projectId={projectId}
      selected={task}
      onSelect={() => {}}
    />
  );
  await act(() => {
    renderer = create(view());
  });
  expect(renderer!.root.findByType("time").children.join("")).toBe("16 Oct");
  await act(() => vi.advanceTimersByTime(1000));
  expect(renderer!.root.findByType("time").children.join("")).toBe("Today");
  mocks.zone = "America/New_York";
  await act(() => renderer!.update(view()));
  expect(renderer!.root.findByType("time").children.join("")).toBe("16 Oct");
  vi.setSystemTime(new Date("2026-10-17T12:00:00Z"));
  await act(() => window.dispatchEvent(new Event("focus")));
  expect(renderer!.root.findByType("time").props["aria-label"]).toContain("overdue");
  expect(mocks.newCommand).not.toHaveBeenCalled();
  expect(mocks.command).not.toHaveBeenCalled();
  await act(() => renderer!.unmount());
  renderer = undefined;
  expect(vi.getTimerCount()).toBe(0);
});

it("resets a dirty task editor for an equal task ID on a different environment", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.tasksV2 = true;
  const task = {
    id: "wskt_00000000-0000-0000-0000-000000000001",
    projectId,
    title: "Original",
    column: "To do",
    revision: 2,
  };
  const view = (owner: typeof environmentId) => (
    <ProjectTasks environmentId={owner} projectId={projectId} selected={task} onSelect={() => {}} />
  );
  await act(() => {
    renderer = create(view(environmentId));
  });
  await act(() =>
    renderer!.root
      .findByProps({ "aria-label": "Task title" })
      .props.onChange({ target: { value: "Dirty" } }),
  );
  const other = EnvironmentId.make("other");
  await act(() => renderer!.update(view(other)));
  expect(renderer!.root.findByProps({ "aria-label": "Task title" }).props.value).toBe("Original");
  mocks.operate = false;
  await act(() => renderer!.update(view(other)));
  await act(() => renderer!.root.findAllByType("form")[1]!.props.onSubmit({ preventDefault() {} }));
  expect(mocks.newCommand).not.toHaveBeenCalled();
});
