import * as Cause from "effect/Cause";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { ProjectTasks, ProjectWorkspaceSettings } from "./ProjectTasks";
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
