import * as Cause from "effect/Cause";
// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { ProjectTasks, ProjectWorkspaceSettings } from "./ProjectTasks";
import { WorkspaceEngagement, WorkspaceItemMutationContext } from "./WorkspaceEngagement";
import { useWorkspaceResourceState, WorkspaceResourcesProvider } from "./workspaceResourceState";
const mocks = vi.hoisted(() => ({ command: vi.fn(), operate: true }));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    isPending: false,
    data: { authenticated: true, scopes: mocks.operate ? ["orchestration:operate"] : [] },
  }),
}));
vi.mock("../../state/entities", () => ({ useThreadShells: () => [] }));
vi.mock("../../state/workspaceTools", () => ({
  workspaceTools: {
    config: () => "config",
    tasks: () => "tasks",
    saveConfig: {},
    upsertTask: {},
    deleteTask: {},
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
          }
        : { tasks: [], incomplete: false },
    error: null,
  }),
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => mocks.command }));
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
