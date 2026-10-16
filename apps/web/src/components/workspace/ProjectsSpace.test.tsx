// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { getByRole, getAllByRole } from "@testing-library/dom";
import { EnvironmentId } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { ProjectsSpace } from "./ProjectsSpace";
import { WorkspaceResourcesProvider, useWorkspaceResourceState } from "./workspaceResourceState";
const mocks = vi.hoisted(() => ({ item: undefined as string | undefined, hub: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  useSearch: () => ({ project: "project", environment: "remote", item: mocks.item }),
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => [{ id: "project", environmentId: "remote", title: "Project" }],
  useThreadShells: () => [],
}));
vi.mock("../../hooks/useNewProject", () => ({ useNewProject: () => vi.fn() }));
vi.mock("./useWorkspaceHeaderModel", () => ({
  useWorkspaceHeaderModel: () => ({
    title: "Projects",
    environmentLabel: "Remote",
    spaceLabel: "Projects",
  }),
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({
    environmentId: "remote",
    workspaceItemContext: true,
    workspaceTools: true,
    workspaceLinks: true,
  }),
}));
vi.mock("../../state/workspaceTools", () => ({ workspaceTools: { task: () => "task" } }));
vi.mock("../../state/workspaceLinks", () => ({
  workspaceLinks: {
    projectHub: () => {
      mocks.hub();
      return "hub";
    },
  },
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (query: string | null) => ({
    data: query === "hub" ? { related: [], truncated: false } : null,
    error: query === "task" ? "This task was deleted." : null,
    isPending: false,
    refresh() {},
  }),
}));
vi.mock("./WorkspaceResourcesPanel", () => ({ WorkspaceProjectResources: () => null }));
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemActions: () => null,
  WorkspaceItemMenu: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./ProjectTasks", () => ({
  ProjectTasks: () => null,
  ProjectWorkspaceSettings: () => null,
}));
vi.mock("./mail/LinkedSection", () => ({ LinkedSection: () => <p>Direct links</p> }));
vi.mock("./useWorkspaceItemOpener", () => ({
  useWorkspaceItemOpener: () => vi.fn(),
  parseTaskLocation: (raw: string | undefined) => (raw ? JSON.parse(raw) : null),
}));
it.each([false, true])(
  "owns one-hop discovery in Linked context and never substitutes a missing task: %s",
  async (missingTask) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    (
      window as unknown as {
        happyDOM: { setWindowSize(size: { width: number; height: number }): void };
      }
    ).happyDOM.setWindowSize({ width: 1280, height: 800 });
    mocks.item = missingTask
      ? JSON.stringify({ type: "task", taskId: "wskt_00000000-0000-0000-0000-000000000001" })
      : undefined;
    function App() {
      const state = useWorkspaceResourceState(EnvironmentId.make("remote"), {
        storage: { getItem: () => null, setItem() {} },
      });
      return (
        <WorkspaceResourcesProvider value={state}>
          <ProjectsSpace />
        </WorkspaceResourcesProvider>
      );
    }
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(() => root.render(<App />));
      expect(mocks.hub).not.toHaveBeenCalled();
      await act(() => getByRole(node, "button", { name: "Linked context" }).click());
      if (missingTask) {
        expect(getByRole(node, "heading", { name: "Unavailable task" })).toBeDefined();
        expect(getByRole(node, "complementary", { name: "Linked context" }).textContent).toContain(
          "This task was deleted.",
        );
        expect(mocks.hub).not.toHaveBeenCalled();
      } else
        expect(getAllByRole(node, "region", { name: "Related through linked items" })).toHaveLength(
          1,
        );
    } finally {
      await act(() => root.unmount());
      node.remove();
      vi.clearAllMocks();
      vi.unstubAllGlobals();
    }
  },
);
