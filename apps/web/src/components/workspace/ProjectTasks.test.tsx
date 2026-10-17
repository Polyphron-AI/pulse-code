import * as Cause from "effect/Cause";
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  ProjectId,
  WorkspaceToolsError,
  type WorkspaceDriveRoot,
} from "@t3tools/contracts";
import { ProjectTasks, ProjectWorkspaceSettings } from "./ProjectTasks";
import { WorkspaceEngagement, WorkspaceItemMutationContext } from "./WorkspaceEngagement";
import {
  useWorkspaceResourceState,
  WorkspaceResourcesProvider,
  WorkspaceResourcesBodyContext,
} from "./workspaceResourceState";
const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  operate: true,
  tasksV2: false,
  newCommand: vi.fn(),
  zone: "Africa/Johannesburg",
  settingsReady: true,
  liveSource: true,
  driveRoot: null as WorkspaceDriveRoot | null,
  description: undefined as string | null | undefined,
  profiles: {
    remote: { displayName: "Maya Chen", initials: "MC" },
    other: { displayName: "Alex", initials: "AL" },
  } as Record<string, { displayName: string; initials: string } | null>,
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({
    workspaceTools: true,
    workspaceTasksV2: mocks.liveSource && mocks.tasksV2,
    ready: mocks.settingsReady,
  }),
}));
vi.mock("../../timestampFormat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../timestampFormat")>()),
  timestampLocale: "en-GB",
}));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    isPending: false,
    data: { authenticated: true, scopes: mocks.operate ? ["orchestration:operate"] : [] },
  }),
}));
vi.mock("../../hooks/useSettings", () => ({
  useEnvironmentSettings: (id: string, select: (settings: unknown) => unknown) =>
    select({
      workspaceDisplayTimeZone: mocks.zone,
      workspaceOwnerProfile: mocks.profiles[id] ?? null,
    }),
}));
vi.mock("../../state/entities", () => ({ useThreadShells: () => [] }));
vi.mock("../../state/environments", () => ({
  useConnectedEnvironmentIds: () => ["remote", "other", "other-environment"],
}));
vi.mock("../../state/workspaceTools", () => ({
  workspaceTools: {
    config: () => "config",
    tasks: () => "tasks",
    saveConfig: {},
    upsertTask: {},
    deleteTask: {},
    transitionTask: "transition",
    patchTask: "patch",
    task: () => "task",
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
            driveRoot: mocks.driveRoot,
            ...(mocks.description !== undefined ? { description: mocks.description } : {}),
          }
        : { tasks: [], incomplete: false },
    error: null,
    refresh: vi.fn(),
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
it("keeps unsaved task columns when the config's Drive root changes on another client", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const view = () => (
    <ProjectWorkspaceSettings environmentId={environmentId} projectId={projectId} />
  );
  await act(() => {
    renderer = create(view());
  });
  await act(() =>
    renderer!.root
      .findByProps({ "aria-label": "Task columns" })
      .props.onChange({ target: { value: "Draft\nApproved" } }),
  );
  mocks.driveRoot = {
    linkId: "wl_00000000-0000-0000-0000-000000000001",
    connectionId: "drv_00000000-0000-0000-0000-000000000001",
    fileId: "folder",
  };
  await act(() => renderer!.update(view()));
  expect(renderer!.root.findByProps({ "aria-label": "Task columns" }).props.value).toBe(
    "Draft\nApproved",
  );
  mocks.driveRoot = null;
});
it("creates Me or Unassigned atomically and keeps legacy creates free of owner fields", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.tasksV2 = true;
  mocks.command.mockResolvedValue({ _tag: "Failure", cause: Cause.fail(new Error("Offline")) });
  const view = () => (
    <ProjectTasks
      environmentId={environmentId}
      projectId={projectId}
      selected={null}
      onSelect={() => {}}
    />
  );
  await act(() => {
    renderer = create(view());
  });
  const owner = () => renderer!.root.findByProps({ "aria-label": "New task owner" });
  expect(owner().props.value).toBe("environment-owner");
  await act(() =>
    renderer!.root
      .findByProps({ "aria-label": "New task title" })
      .props.onChange({ target: { value: "Review" } }),
  );
  const submit = () => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} });
  await act(submit);
  expect(mocks.command.mock.calls.at(-1)?.[0].input.owner).toBe("environment-owner");
  await act(() => owner().props.onChange({ target: { value: "" } }));
  await act(submit);
  expect(mocks.command.mock.calls.at(-1)?.[0].input.owner).toBeNull();
  mocks.tasksV2 = false;
  await act(() => renderer!.update(view()));
  expect(renderer!.root.findAllByProps({ "aria-label": "New task owner" })).toHaveLength(0);
  await act(submit);
  expect(mocks.command.mock.calls.at(-1)?.[0].input).not.toHaveProperty("owner");
});
it("edits owner through the captured revision and displays the selected environment profile", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.tasksV2 = true;
  const task = {
    id: "wskt_00000000-0000-0000-0000-000000000001",
    projectId,
    title: "Review",
    column: "To do",
    revision: 3,
    owner: "environment-owner" as const,
  };
  const view = (env = environmentId) => (
    <ProjectTasks environmentId={env} projectId={projectId} selected={task} onSelect={() => {}} />
  );
  mocks.newCommand.mockResolvedValue({ _tag: "Failure", cause: Cause.fail(new Error("Offline")) });
  await act(() => {
    renderer = create(view());
  });
  expect(renderer!.root.findByProps({ "aria-label": "Maya Chen", role: "img" }).children).toEqual([
    "MC",
  ]);
  const owner = () => renderer!.root.findByProps({ "aria-label": "Owner" });
  await act(() => owner().props.onChange({ target: { value: "" } }));
  await act(() => renderer!.root.findAllByType("form")[1]!.props.onSubmit({ preventDefault() {} }));
  expect(mocks.newCommand).toHaveBeenLastCalledWith({
    environmentId,
    input: { id: task.id, expectedRevision: 3, owner: null },
  });
  expect(owner().props.value).toBe("");
  expect(renderer!.root.findAllByProps({ "aria-label": "Unassigned", role: "img" })).toHaveLength(
    1,
  );
  const other = EnvironmentId.make("other");
  await act(() => renderer!.update(view(other)));
  expect(owner().props.value).toBe("environment-owner");
  expect(renderer!.root.findByProps({ "aria-label": "Alex", role: "img" }).children).toEqual([
    "AL",
  ]);
  mocks.profiles.other = null;
  await act(() => renderer!.update(view(other)));
  expect(renderer!.root.findByProps({ "aria-label": "Me", role: "img" }).children).toEqual(["Me"]);
  expect(mocks.newCommand).toHaveBeenCalledTimes(1);
});
it("starts legacy tasks unassigned, assigns Me and denies owner writes for read sessions", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.tasksV2 = true;
  const task = {
    id: "wskt_00000000-0000-0000-0000-000000000001",
    projectId,
    title: "Legacy",
    column: "To do",
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
  mocks.newCommand.mockResolvedValue({
    _tag: "Success",
    value: { ...task, owner: "environment-owner", revision: 1 },
  });
  await act(() => {
    renderer = create(view());
  });
  const owner = () => renderer!.root.findByProps({ "aria-label": "Owner" });
  expect(owner().props.value).toBe("");
  await act(() => owner().props.onChange({ target: { value: "environment-owner" } }));
  const submit = () =>
    renderer!.root.findAllByType("form")[1]!.props.onSubmit({ preventDefault() {} });
  mocks.operate = false;
  await act(() => renderer!.update(view()));
  expect(owner().props.disabled).toBe(true);
  await act(submit);
  expect(mocks.newCommand).not.toHaveBeenCalled();
  mocks.operate = true;
  await act(() => renderer!.update(view()));
  await act(submit);
  expect(mocks.newCommand).toHaveBeenCalledWith({
    environmentId,
    input: { id: task.id, expectedRevision: 0, owner: "environment-owner" },
  });
});
afterEach(async () => {
  if (renderer) await act(() => renderer?.unmount());
  renderer = undefined;
  mocks.operate = true;
  mocks.description = undefined;
  mocks.tasksV2 = false;
  mocks.zone = "Africa/Johannesburg";
  mocks.settingsReady = true;
  mocks.liveSource = true;
  mocks.profiles = {
    remote: { displayName: "Maya Chen", initials: "MC" },
    other: { displayName: "Alex", initials: "AL" },
  };
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
        affectedCount: 2,
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
    expectedAffectedCount: 2,
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

it("retains a designated column through a temporary textarea edit", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.tasksV2 = true;
  mocks.command.mockResolvedValue({ _tag: "Success", value: {} });
  await act(() => {
    renderer = create(
      <ProjectWorkspaceSettings environmentId={environmentId} projectId={projectId} />,
    );
  });
  const columns = () => renderer!.root.findByProps({ "aria-label": "Task columns" });
  await act(() => columns().props.onChange({ target: { value: "To do\nDon" } }));
  expect(renderer!.root.findByProps({ "aria-label": "Completed column" }).props.value).toBe("");
  await act(() => columns().props.onChange({ target: { value: "To do\nDone" } }));
  expect(renderer!.root.findByProps({ "aria-label": "Completed column" }).props.value).toBe("Done");
  await act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(mocks.command.mock.calls.at(-1)?.[0].input.completedColumn).toBe("Done");
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
        affectedCount: 2,
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
      .findByProps({ "aria-label": "Area" })
      .props.onChange({ target: { value: "Website" } }),
  );
  await act(() => renderer!.update(view({ ...task, title: "Remote title", revision: 4 })));
  expect(renderer!.root.findByProps({ "aria-label": "Task title" }).props.value).toBe("Original");
  await act(() => renderer!.root.findAllByType("form")[1]!.props.onSubmit({ preventDefault() {} }));
  expect(mocks.newCommand).toHaveBeenCalledWith({
    environmentId,
    input: { id: task.id, expectedRevision: 3, areaLabel: "Website" },
  });
  expect(renderer!.root.findByProps({ "aria-label": "Area" }).props.value).toBe("Website");
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
  for (const label of ["Due date", "Area"])
    await act(() =>
      renderer!.root.findByProps({ "aria-label": label }).props.onChange({ target: { value: "" } }),
    );
  await act(() => renderer!.root.findAllByType("form")[1]!.props.onSubmit({ preventDefault() {} }));
  expect(mocks.newCommand).toHaveBeenLastCalledWith({
    environmentId,
    input: { id: task.id, expectedRevision: 2, dueOn: null, areaLabel: null },
  });
  expect(renderer!.root.findByProps({ "aria-label": "Due date" }).props.value).toBe("");
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
it("stops the date clock while the resource body is hidden and resyncs when shown", async () => {
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
    revision: 0,
  };
  const view = (hidden: boolean) => (
    <WorkspaceResourcesBodyContext value={{ hidden, restoreFocus() {} }}>
      <ProjectTasks
        environmentId={environmentId}
        projectId={projectId}
        selected={task}
        onSelect={() => {}}
      />
    </WorkspaceResourcesBodyContext>
  );
  const focus = vi.spyOn(window, "addEventListener");
  const visibility = vi.spyOn(document, "addEventListener");
  const removeFocus = vi.spyOn(window, "removeEventListener");
  const removeVisibility = vi.spyOn(document, "removeEventListener");
  try {
    await act(() => {
      renderer = create(view(true));
    });
    expect(vi.getTimerCount()).toBe(0);
    expect(focus.mock.calls.some(([type]) => type === "focus")).toBe(false);
    expect(visibility.mock.calls.some(([type]) => type === "visibilitychange")).toBe(false);
    await act(() => renderer!.update(view(false)));
    expect(vi.getTimerCount()).toBe(1);
    await act(() => renderer!.update(view(true)));
    expect(vi.getTimerCount()).toBe(0);
    expect(removeFocus.mock.calls.some(([type]) => type === "focus")).toBe(true);
    expect(removeVisibility.mock.calls.some(([type]) => type === "visibilitychange")).toBe(true);
    vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
    await act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(renderer!.root.findByType("time").children.join("")).toBe("16 Oct");
    await act(() => renderer!.update(view(false)));
    expect(renderer!.root.findByType("time").children.join("")).toBe("Today");
    expect(vi.getTimerCount()).toBe(1);
  } finally {
    focus.mockRestore();
    visibility.mockRestore();
    removeFocus.mockRestore();
    removeVisibility.mockRestore();
  }
});
it("shows a neutral loading state and announces a timezone fallback", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.tasksV2 = true;
  mocks.settingsReady = false;
  const task = {
    id: "wskt_00000000-0000-0000-0000-000000000001",
    projectId,
    title: "Task",
    column: "To do",
    dueOn: "2026-10-16",
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
  expect(renderer!.root.findAllByType("time")).toHaveLength(0);
  expect(JSON.stringify(renderer!.toJSON())).toContain("Loading workspace timezone...");
  mocks.settingsReady = true;
  mocks.zone = "No/Such_Zone";
  await act(() => renderer!.update(view()));
  expect(renderer!.root.findAllByType("time")).toHaveLength(1);
  expect(JSON.stringify(renderer!.toJSON())).toContain("Dates use UTC");
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

it.each([undefined, false])(
  "removes the project task upgrade notice when the live capability changes from %s to true",
  async (flag) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.tasksV2 = flag as boolean;
    const view = () => (
      <>
        <ProjectTasks
          environmentId={environmentId}
          projectId={projectId}
          selected={null}
          onSelect={() => {}}
        />
        <ProjectWorkspaceSettings environmentId={environmentId} projectId={projectId} />
      </>
    );
    await act(() => {
      renderer = create(view());
    });
    expect(JSON.stringify(renderer!.toJSON())).toContain("Tasks need a newer server.");
    expect(mocks.newCommand).not.toHaveBeenCalled();
    mocks.tasksV2 = true;
    await act(() => renderer!.update(view()));
    expect(JSON.stringify(renderer!.toJSON())).not.toContain("Tasks need a newer server.");
  },
);

it.each(["absent", "false", "cached-only"])(
  "keeps legacy title edits on a %s task capability",
  async (state) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.tasksV2 =
      state === "cached-only"
        ? true
        : state === "false"
          ? false
          : (undefined as unknown as boolean);
    mocks.liveSource = state !== "cached-only";
    const task = {
      id: "wskt_00000000-0000-4000-8000-000000000001",
      projectId,
      title: "Legacy",
      column: "To do",
    };
    mocks.command.mockResolvedValue({ _tag: "Success", value: { ...task, title: "Renamed" } });
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
    await act(() =>
      renderer!.root
        .findByProps({ "aria-label": "Task title" })
        .props.onChange({ target: { value: "Renamed" } }),
    );
    await act(() =>
      renderer!.root.findAllByType("form")[1]!.props.onSubmit({ preventDefault() {} }),
    );
    expect(mocks.command).toHaveBeenLastCalledWith({
      environmentId,
      input: { id: task.id, projectId, title: "Renamed", column: "To do" },
    });
    expect(mocks.newCommand).not.toHaveBeenCalled();
    expect(renderer!.root.findAllByProps({ "aria-label": "Due date" })).toHaveLength(0);
  },
);

it("reads, saves and clears the owning project's description without changing raw whitespace", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.description = "Brand and growth";
  mocks.command.mockResolvedValue({ _tag: "Success", value: {} });
  const view = (env = environmentId) => (
    <ProjectWorkspaceSettings environmentId={env} projectId={projectId} />
  );
  await act(() => {
    renderer = create(view());
  });
  const description = () => renderer!.root.findByProps({ "aria-label": "Project description" });
  expect(description().props.value).toBe("Brand and growth");
  expect(description().props.maxLength).toBe(600);
  const submit = () => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} });
  const raw = ` ${"x".repeat(598)} `;
  await act(() => description().props.onChange({ target: { value: raw } }));
  await act(submit);
  expect(mocks.command.mock.calls.at(-1)?.[0]).toMatchObject({
    environmentId,
    input: {
      projectId,
      description: raw,
      taskColumns: ["To do", "Done"],
      browserThreadId: "missing-thread",
    },
  });
  await act(() => description().props.onChange({ target: { value: "" } }));
  await act(submit);
  expect(mocks.command.mock.calls.at(-1)?.[0].input.description).toBeNull();
  await act(() => description().props.onChange({ target: { value: " \n\t\u2003 " } }));
  await act(submit);
  expect(mocks.command.mock.calls.at(-1)?.[0].input.description).toBeNull();
  mocks.description = "Another device";
  await act(() => renderer!.update(view()));
  expect(description().props.value).toBe("Another device");
  await act(() => description().props.onChange({ target: { value: "Unsaved" } }));
  mocks.description = "Other environment";
  await act(() => renderer!.update(view(EnvironmentId.make("other"))));
  expect(description().props.value).toBe("Other environment");
});
it("keeps old-server settings compatible and prevents read-only description saves", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.command.mockResolvedValue({ _tag: "Success", value: {} });
  const view = () => (
    <ProjectWorkspaceSettings environmentId={environmentId} projectId={projectId} />
  );
  await act(() => {
    renderer = create(view());
  });
  const description = () => renderer!.root.findByProps({ "aria-label": "Project description" });
  expect(description().props.value).toBe("");
  expect(description().props.disabled).toBe(true);
  expect(JSON.stringify(renderer!.toJSON())).toContain("Project descriptions need a newer server.");
  const submit = () => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} });
  await act(submit);
  expect(mocks.command.mock.calls.at(-1)?.[0].input).not.toHaveProperty("description");
  mocks.description = null;
  await act(() => renderer!.update(view()));
  expect(description().props.disabled).toBe(false);
  expect(JSON.stringify(renderer!.toJSON())).not.toContain(
    "Project descriptions need a newer server.",
  );
  await act(() => description().props.onChange({ target: { value: "Draft" } }));
  mocks.command.mockClear();
  mocks.operate = false;
  await act(() => renderer!.update(view()));
  await act(submit);
  expect(mocks.command).not.toHaveBeenCalled();
  expect(description().props.value).toBe("Draft");
});
it("associates the description limit and old-server hints with the textarea", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const view = () => (
    <ProjectWorkspaceSettings environmentId={environmentId} projectId={projectId} />
  );
  await act(() => {
    renderer = create(view());
  });
  const description = () => renderer!.root.findByProps({ "aria-label": "Project description" });
  const hintIds = () => description().props["aria-describedby"].split(" ");
  const limit = () =>
    renderer!.root.findAllByType("p").find((p) => p.children.join("") === "Up to 600 characters.")!;
  const oldServer = renderer!.root
    .findAllByType("p")
    .find((p) => p.children.join("") === "Project descriptions need a newer server.")!;
  expect(limit()).toBeDefined();
  expect(limit().props.className).toContain("text-muted-foreground");
  expect(limit().props.id).toBeTruthy();
  expect(oldServer.props.id).toBeTruthy();
  expect(hintIds()).toContain(limit().props.id);
  expect(hintIds()).toContain(oldServer.props.id);
  const oldServerId = oldServer.props.id;
  mocks.description = null;
  await act(() => renderer!.update(view()));
  expect(hintIds()).toEqual([limit().props.id]);
  expect(hintIds()).not.toContain(oldServerId);
});
it("marks oversize descriptions invalid and clears the error when the draft fits", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.description = null;
  mocks.command.mockResolvedValue({ _tag: "Success", value: {} });
  await act(() => {
    renderer = create(
      <ProjectWorkspaceSettings environmentId={environmentId} projectId={projectId} />,
    );
  });
  const description = () => renderer!.root.findByProps({ "aria-label": "Project description" });
  const submit = () => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} });
  expect(description().props["aria-invalid"]).toBeUndefined();
  for (const value of [` ${"x".repeat(600)} `, " ".repeat(601)]) {
    await act(() => description().props.onChange({ target: { value } }));
    mocks.command.mockClear();
    await act(submit);
    expect(mocks.command).not.toHaveBeenCalled();
    expect(renderer!.root.findByProps({ role: "alert" }).children.join("")).toBe(
      "Use a project description of at most 600 characters.",
    );
    expect(description().props["aria-invalid"]).toBe(true);
  }
  await act(() => description().props.onChange({ target: { value: "x".repeat(600) } }));
  expect(description().props["aria-invalid"]).toBeUndefined();
  expect(renderer!.root.findAllByProps({ role: "alert" })).toHaveLength(0);
  await act(submit);
  expect(mocks.command.mock.calls.at(-1)?.[0].input.description).toBe("x".repeat(600));
});
