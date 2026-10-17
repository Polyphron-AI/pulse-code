// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { RegistryContext } from "@effect/atom-react";
import { Atom, AtomRegistry, AsyncResult } from "effect/unstable/reactivity";
import { EnvironmentId, ProjectId, type WorkspaceTaskPage } from "@t3tools/contracts";
import { WorkspaceResourcesPanel } from "./WorkspaceResourcesPanel";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  WorkspaceResourcesProvider,
  resolveResourceProject,
  useWorkspaceResourceState,
} from "./workspaceResourceState";

const boundary = vi.hoisted(() => ({ query: vi.fn(), subscriptions: 0 }));
vi.mock("../../state/workspaceTools", () => ({
  workspaceTools: {
    queryTasks: (request: unknown) => boundary.query(request),
    transitionTask: {},
    patchTask: {},
    upsertTask: {},
    deleteTask: {},
  },
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => [
    { environmentId: "a", id: "p", title: "SynKEK" },
    { environmentId: "a", id: "q", title: "Other" },
  ],
}));
vi.mock("../../state/environments", () => ({ useConnectedEnvironmentIds: () => ["a"] }));
vi.mock("../../hooks/useSettings", () => ({ useEnvironmentSettings: () => null }));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({
    workspaceTasksV2: true,
    workspaceTools: true,
    workspaceLinks: true,
    ready: true,
  }),
}));
vi.mock("./useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => false }));
vi.mock("./WorkspaceToolsPanel", () => ({ WorkspaceProjectFiles: () => <p>Project files</p> }));
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemMenu: ({ children }: { children: React.ReactNode }) => children,
}));
const environmentId = EnvironmentId.make("a"),
  projectId = ProjectId.make("p");
let root: Root, node: HTMLDivElement;
afterEach(async () => {
  if (root) await act(() => root.unmount());
  node?.remove();
  vi.unstubAllGlobals();
});
it("preserves Files while Tasks opens and mounts one selected resource body", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const resize = (width: number) =>
    (
      window as unknown as {
        happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
      }
    ).happyDOM.setWindowSize({ width, height: 800 });
  resize(1280);
  const registry = AtomRegistry.make();
  const requests: unknown[] = [];
  const changes = Atom.make((get) => {
    boundary.subscriptions++;
    get.addFinalizer(() => {
      boundary.subscriptions--;
    });
    return 0;
  });
  const page: WorkspaceTaskPage = {
    tasks: [],
    total: 0,
    openTotal: 0,
    nextCursor: null,
    projects: [],
    laneTotals: [],
  };
  const query = Atom.make((get) => {
    get(changes);
    requests.push({ method: "pulse.workspace.queryTasks" });
    return AsyncResult.success(page);
  });
  boundary.query.mockReturnValue(query);
  const projects = [
    { environmentId, id: projectId, title: "SynKEK" },
    { environmentId, id: ProjectId.make("q"), title: "Other" },
  ];
  const storage = { getItem: () => null, setItem: () => {} };
  const defaultCandidates = [projectId];
  function App({
    candidates = defaultCandidates,
    missing = false,
  }: {
    candidates?: ProjectId[];
    missing?: boolean;
  }) {
    const wide = useMediaQuery("xl");
    const state = useWorkspaceResourceState(environmentId, {
      storage,
      presentation: wide ? "dock" : "sheet",
    });
    const [space, setSpace] = useState("calendar");
    const project = resolveResourceProject({
      environmentId,
      projects: missing ? [] : projects,
      explicitProjectId: state.projectId,
      owningProjectIds: candidates,
      confirmedProjectIds: [],
    });
    return (
      <RegistryContext.Provider value={registry}>
        <WorkspaceResourcesProvider value={state}>
          <WorkspaceEngagement
            environmentId={environmentId}
            space={space === "tasks" ? "tasks" : "calendar"}
            layout="full"
            header={{ title: space, spaceLabel: space, environmentLabel: "a" }}
            resources={
              <WorkspaceResourcesPanel
                environmentId={environmentId}
                project={project}
                projects={projects}
                selectedItem={null}
                onOpen={() => {}}
                footer={null}
              />
            }
          >
            <button onClick={() => setSpace("tasks")}>Open Tasks destination</button>
            <p>Calendar date 2026-10-13</p>
          </WorkspaceEngagement>
        </WorkspaceResourcesProvider>
      </RegistryContext.Provider>
    );
  }
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  const openDestination = () =>
    act(() => getByRole(node, "button", { name: "Open Tasks destination" }).click());
  const chooseResourceTool = () =>
    act(async () => {
      getByRole(node, "tab", { name: "Tasks" }).click();
    });
  const activeTaskBodies = () =>
    document.querySelectorAll('section[aria-label="Project tasks"]').length;
  const resizeToCompactWithSheetOpen = () => act(() => resize(1279));
  try {
    await import("./ProjectTasksResource");
    await act(() => root.render(<App />));
    await act(() => window.dispatchEvent(new Event("resize")));
    expect(getByRole(node, "tab", { name: "Files" }).getAttribute("aria-selected")).toBe("true");
    await openDestination();
    expect(getByRole(node, "tab", { name: "Files" }).getAttribute("aria-selected")).toBe("true");
    expect(getByRole(node, "combobox", { name: "Choose project" }).textContent).toContain("SynKEK");
    expect(requests).toHaveLength(0);
    await chooseResourceTool();
    expect(node.textContent).toContain("Project tasks");
    expect(activeTaskBodies()).toBe(1);
    expect(requests).toHaveLength(1);
    expect(boundary.subscriptions).toBe(1);
    await resizeToCompactWithSheetOpen();
    expect(activeTaskBodies()).toBe(1);
    expect(boundary.subscriptions).toBe(1);
    expect(getByRole(document.body, "dialog", { name: "Resources" })).toBeDefined();
    await act(() => resize(1280));
    expect(activeTaskBodies()).toBe(1);
    await act(() => getByRole(node, "button", { name: "Close resources" }).click());
    expect(activeTaskBodies()).toBe(0);
    await act(async () => {
      getByRole(node, "button", { name: "Resources" }).click();
    });
    expect(activeTaskBodies()).toBe(1);
    expect(boundary.subscriptions).toBe(1);
    await act(() => getByRole(node, "combobox", { name: "Choose project" }).click());
    await act(() => getByRole(document.body, "option", { name: "Other" }).click());
    await act(() => root.render(<App candidates={[projectId]} />));
    expect(getByRole(node, "combobox", { name: "Choose project" }).textContent).toContain("Other");
    await act(() => root.render(<App missing />));
    expect(node.textContent).toContain("This project is unavailable");
    expect(activeTaskBodies()).toBe(0);
    await act(() => root.unmount());
    root = createRoot(node);
    await act(() => root.render(<App candidates={[projectId, ProjectId.make("q")]} />));
    expect(node.textContent).toContain("Choose a project to see its resources.");
    expect(queryByRole(node, "tabpanel")?.textContent).not.toContain("Project tasks");
    await act(() => root.render(<App candidates={[]} />));
    expect(node.textContent).toContain("Choose a project to see its resources.");
  } finally {
    await act(() => root.unmount());
    registry.dispose();
  }
});
