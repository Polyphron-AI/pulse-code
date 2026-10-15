import { renderToStaticMarkup } from "react-dom/server";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { EnvironmentId, ProjectId, type ScopedProjectRef } from "@t3tools/contracts";
import { WorkspaceItemActions } from "./WorkspaceItemActions";

const mocks = vi.hoisted(() => ({
  createProject:
    vi.fn<
      (input: { onCreated?: (project: ScopedProjectRef) => Promise<void> }) => Promise<boolean>
    >(),
  linkToProject: vi.fn<(...args: unknown[]) => Promise<void>>(),
  startThread: vi.fn(async () => null),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ state: { location: { href: "/workspace" } } }),
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => DEFAULT_RESOLVED_KEYBINDINGS }));
vi.mock("../../state/server", () => ({ primaryServerKeybindingsAtom: {} }));
vi.mock("../../state/entities", () => ({ useProjects: () => [], useThreadShells: () => [] }));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: () => ({ data: { linked: [] }, error: null, refresh: vi.fn() }),
}));
vi.mock("../../state/workspaceLinks", () => ({ workspaceLinks: { list: vi.fn() } }));
vi.mock("../../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => mocks.startThread }));
vi.mock("../../hooks/useNewProject", () => ({ useNewProject: () => mocks.createProject }));
vi.mock("./mail/useMailLinks", () => ({
  useMailLinks: () => ({ linkToProject: mocks.linkToProject }),
  linkErrorText: () => "Failed",
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ workspaceLinks: true, workspaceItemContext: true }),
}));
vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipPopup: () => null,
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));

describe("workspace action entrances", () => {
  it("renders selected-item actions and shortcut labels without crashing the reader", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceItemActions
        shortcuts
        environmentId={EnvironmentId.make("test-env")}
        item={{ ref: { type: "url", url: "https://example.test/brief" }, title: "Brief" }}
      />,
    );
    expect(markup).toContain("Start thread");
    expect(markup).toContain("Add to project");
    expect(markup).toContain("Start project");
    expect(markup).toContain('data-workspace-action="startThread"');
    expect(markup).not.toContain('title="');
  });
});

it("retries source linking against the created project without creating a duplicate", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.createProject.mockClear();
  mocks.linkToProject.mockReset();
  mocks.startThread.mockClear();
  const environmentId = EnvironmentId.make("test-env");
  const project = scopeProjectRef(environmentId, ProjectId.make("created-project"));
  mocks.createProject.mockImplementation(async (input) => {
    await input.onCreated?.(project);
    return true;
  });
  mocks.linkToProject
    .mockRejectedValueOnce(new Error("Link unavailable"))
    .mockResolvedValue(undefined);
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <WorkspaceItemActions
        environmentId={environmentId}
        item={{ ref: { type: "url", url: "https://example.test/source" }, title: "Source" }}
      />,
    );
  });
  try {
    await act(async () => {
      renderer.root
        .findAllByType("button")
        .find((button) => button.props.children === "Start project")!
        .props.onClick();
    });
    await act(async () => {
      renderer.root
        .findAllByType("button")
        .find((button) => button.props.children === "Cancel")!
        .props.onClick();
    });
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.linkToProject).not.toHaveBeenCalled();
    await act(async () => {
      renderer.root
        .findAllByType("button")
        .find((button) => button.props.children === "Start project")!
        .props.onClick();
    });
    await act(async () => {
      renderer.root.findByType("input").props.onChange({ target: { value: "Launch" } });
    });
    await act(async () => {
      renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
    expect(mocks.createProject).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByType("input").props.disabled).toBe(true);
    await act(async () => {
      renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
    expect(mocks.createProject).toHaveBeenCalledTimes(1);
    expect(mocks.linkToProject).toHaveBeenCalledTimes(2);
    expect(mocks.startThread).toHaveBeenCalledWith(project);
  } finally {
    await act(async () => renderer.unmount());
    vi.unstubAllGlobals();
  }
});
