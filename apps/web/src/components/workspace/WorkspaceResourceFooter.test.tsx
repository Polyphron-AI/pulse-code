// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { WorkspaceResourceFooter, resourceConnectionLabel } from "./WorkspaceResourceFooter";
import { WorkspaceProjectResources } from "./WorkspaceResourcesPanel";
import { WorkspaceResourcesProvider, useWorkspaceResourceState } from "./workspaceResourceState";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
  operate: true,
  environmentId: "remote",
}));
vi.mock("../../state/entities", () => ({
  useProjects: () =>
    ["a", "b"].map((id) => ({ id, title: id, environmentId: mocks.environmentId })),
  useAllEnvironmentProjectSnapshotsReady: () => true,
  useThreadShell: () => null,
  useThreadShells: () => [],
}));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    isPending: false,
    data: { authenticated: true, scopes: mocks.operate ? ["orchestration:operate"] : [] },
  }),
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (query: { projectId: string } | null) => {
    if (query) mocks.read(query);
    return {
      data: query
        ? { projectId: query.projectId, taskColumns: ["To do", "Done"], browserThreadId: null }
        : null,
      error: null,
    };
  },
}));
vi.mock("../../state/workspaceTools", () => ({
  workspaceTools: {
    config: ({ input }: { input: { projectId: string } }) => input,
    saveConfig: {},
  },
}));
vi.mock("../../state/workspaceLinks", () => ({ workspaceLinks: { list: () => null } }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => mocks.save }));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ workspaceTools: true, workspaceLinks: true }),
}));
vi.mock("./WorkspaceResourceBody", () => ({ WorkspaceResourceBody: () => <p>Resource body</p> }));
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemActions: () => null,
  WorkspaceItemMenu: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("./useWorkspaceItemOpener", () => ({ useWorkspaceItemOpener: () => () => {} }));
let root: Root | undefined;
let node: HTMLDivElement;
const scope = { environmentId: EnvironmentId.make("remote"), projectId: ProjectId.make("a") };
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  node?.remove();
  vi.clearAllMocks();
  mocks.operate = true;
  mocks.environmentId = "remote";
  vi.unstubAllGlobals();
});
async function mount(children: React.ReactNode) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() => root!.render(children));
}
it.each([
  [[], "Connection status unavailable"],
  [[{ state: "connected" as const }], "Connected"],
  [
    [{ state: "connected" as const }, { state: "unknown" as const }],
    "Connection status unavailable",
  ],
  [[{ state: "unknown" as const }, { state: "unavailable" as const }], "Unavailable"],
])("labels only known project-source health: %j", (observations, label) => {
  expect(resourceConnectionLabel(observations)).toBe(label);
});
it("shows sample status only for samples and opens settings for the supplied scope without reading connections", async () => {
  const settings = vi.fn();
  await mount(
    <WorkspaceResourceFooter
      scope={scope}
      observations={[]}
      sample={false}
      onSettings={settings}
    />,
  );
  expect(node.textContent).toContain("Connection status unavailable");
  expect(node.textContent).not.toContain("Sample project connections");
  await act(() => getByRole(node, "button", { name: "Project workspace settings" }).click());
  expect(settings).toHaveBeenCalledWith(scope);
  expect(mocks.read).not.toHaveBeenCalled();
  await act(() =>
    root!.render(
      <WorkspaceResourceFooter scope={scope} observations={[]} sample onSettings={settings} />,
    ),
  );
  expect(node.textContent).toContain("Sample project connections");
});
function Live() {
  const [environmentId, setEnvironment] = useState(scope.environmentId);
  const state = useWorkspaceResourceState(environmentId, {
    presentation: "dock",
    storage: {
      getItem: () => JSON.stringify({ version: 1, projectId: "a", open: true }),
      setItem() {},
    },
  });
  return (
    <WorkspaceResourcesProvider value={state}>
      <button data-select-b onClick={() => state.chooseProject(ProjectId.make("b"))}>
        Select B
      </button>
      <button data-switch-environment onClick={() => setEnvironment(EnvironmentId.make("another"))}>
        Switch environment
      </button>
      <WorkspaceProjectResources />
    </WorkspaceResourcesProvider>
  );
}
it("captures settings A across resource selection B, cancels without saving, and retains the resource tab", async () => {
  mocks.save.mockResolvedValue({ _tag: "Success", value: {} });
  await mount(<Live />);
  expect(mocks.read).not.toHaveBeenCalled();
  await act(() => getByRole(node, "tab", { name: "Browser" }).click());
  await act(() => getByRole(node, "button", { name: "Project workspace settings" }).click());
  await act(() => node.querySelector<HTMLButtonElement>("[data-select-b]")!.click());
  const dialog = getByRole(document.body, "dialog", { name: "Project workspace settings" });
  await act(() => getByRole(dialog, "button", { name: "Save workspace settings" }).click());
  expect(mocks.save).toHaveBeenCalledWith({
    environmentId: "remote",
    input: { projectId: "a", taskColumns: ["To do", "Done"], browserThreadId: null },
  });
  await act(() => getByRole(dialog, "button", { name: "Close" }).click());
  expect(getByRole(node, "tab", { name: "Files" }).getAttribute("aria-selected")).toBe("true");
  expect(getByRole(node, "combobox", { name: "Choose project" }).textContent).toContain("b");
  mocks.save.mockClear();
  await act(() => getByRole(node, "button", { name: "Project workspace settings" }).click());
  await act(() => getByRole(document.body, "button", { name: "Close" }).click());
  expect(mocks.save).not.toHaveBeenCalled();
  expect(queryByRole(document.body, "dialog")).toBeNull();
});
it("cancels scoped settings on environment change", async () => {
  await mount(<Live />);
  await act(() => getByRole(node, "button", { name: "Project workspace settings" }).click());
  await act(() => node.querySelector<HTMLButtonElement>("[data-switch-environment]")!.click());
  expect(queryByRole(document.body, "dialog")).toBeNull();
  expect(mocks.save).not.toHaveBeenCalled();
});
it.each(["local", "direct-remote", "relay", "tunnel", null])(
  "keeps project health unknown without observations in connection mode %s",
  async (mode) => {
    mocks.environmentId = mode ?? "disconnected";
    function App() {
      const state = useWorkspaceResourceState(mode === null ? null : EnvironmentId.make(mode), {
        storage: {
          getItem: () => JSON.stringify({ version: 1, projectId: "a", open: true }),
          setItem() {},
        },
      });
      return (
        <WorkspaceResourcesProvider value={state}>
          <WorkspaceProjectResources />
        </WorkspaceResourcesProvider>
      );
    }
    await mount(<App />);
    expect(node.textContent).toContain("Connection status unavailable");
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  },
);
