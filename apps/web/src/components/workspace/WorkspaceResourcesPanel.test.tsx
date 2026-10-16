// @vitest-environment happy-dom
import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, getAllByRole, queryByRole } from "@testing-library/dom";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { WorkspaceResourcesPanel } from "./WorkspaceResourcesPanel";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import {
  useWorkspaceResourceState,
  useWorkspaceResources,
  WorkspaceResourcesProvider,
} from "./workspaceResourceState";

const bodies = vi.hoisted(() => ({
  active: 0,
  max: 0,
  files: vi.fn(),
  browser: vi.fn(),
  writes: vi.fn(),
  start: vi.fn(),
}));
function Body({
  name,
  request,
  selectedItem,
}: {
  name: string;
  request?: unknown;
  selectedItem?: unknown;
}) {
  useEffect(() => {
    bodies.active++;
    bodies.max = Math.max(bodies.max, bodies.active);
    return () => {
      bodies.active--;
    };
  }, []);
  return (
    <p>
      {name} {JSON.stringify(request)} Selected {JSON.stringify(selectedItem)}
    </p>
  );
}
vi.mock("./WorkspaceToolsPanel", () => ({
  WorkspaceProjectFiles: (props: {
    environmentId: string;
    request: unknown;
    selectedItem: unknown;
  }) => {
    bodies.files();
    return <Body {...props} name={`Files ${props.environmentId}`} />;
  },
  WorkspaceBrowser: (props: { environmentId: string; request: unknown; selectedItem: unknown }) => {
    bodies.browser();
    return <Body {...props} name={`Browser ${props.environmentId}`} />;
  },
  WorkspaceProjectAgents: () => <Body name="Agents" />,
}));
vi.mock("./ProjectTasks", () => ({ ProjectTasks: () => <Body name="Tasks" /> }));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ workspaceTools: true, workspaceLinks: true }),
}));
vi.mock("./mail/useMailLinks", () => ({ useMailLinks: () => ({ linkItem: bodies.writes }) }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => bodies.start }));
const a = EnvironmentId.make("a");
const p = ProjectId.make("project");
let root: Root | undefined;
let node: HTMLDivElement;
const storage = { getItem: () => null, setItem: () => {} };
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  node?.remove();
  vi.clearAllMocks();
  bodies.active = 0;
  bodies.max = 0;
  vi.unstubAllGlobals();
});
function Opener() {
  const { openResource } = useWorkspaceResources();
  return (
    <button
      onClick={() =>
        openResource({
          projectId: p,
          tab: "files",
          request: { type: "file", provider: "google-drive", fileId: "handoff" },
        })
      }
    >
      Open file
    </button>
  );
}
function App({
  environmentId = a,
  unavailable = false,
}: {
  environmentId?: EnvironmentId;
  unavailable?: boolean;
}) {
  const state = useWorkspaceResourceState(environmentId, { storage });
  return (
    <WorkspaceResourcesProvider value={state}>
      <WorkspaceEngagement
        environmentId={environmentId}
        space="projects"
        layout="full"
        header={{ title: "Projects", spaceLabel: "Projects", environmentLabel: environmentId }}
        resourcesOpen={state.open}
        onResourcesChange={(open) => (open ? state.reopen() : state.close())}
        resources={
          <WorkspaceResourcesPanel
            environmentId={environmentId}
            projects={[{ id: p, title: `${environmentId} project` }]}
            project={
              state.projectId === null
                ? { kind: "choose", candidates: [] }
                : unavailable
                  ? { kind: "unavailable", projectId: p }
                  : {
                      kind: "selected",
                      scope: { environmentId, projectId: p },
                      title: `${environmentId} project`,
                    }
            }
            selectedItem={null}
            onOpen={() => {}}
            footer={<p>Connection status unavailable</p>}
          />
        }
        linked={<p>Retained linked page</p>}
      >
        <Opener />
      </WorkspaceEngagement>
    </WorkspaceResourcesProvider>
  );
}
async function mount(children: ReactNode = <App />) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  (
    window as unknown as {
      happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
    }
  ).happyDOM.setWindowSize({ width: 1280, height: 800 });
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() => root!.render(children));
}
it("chooses resources before selection, mounts one lazy body, retains linked items, closes and reopens", async () => {
  await mount();
  expect(bodies.files).not.toHaveBeenCalled();
  expect(bodies.browser).not.toHaveBeenCalled();
  expect(getByRole(node, "complementary", { name: "Linked items" }).textContent).toContain(
    "Retained linked page",
  );
  await act(() => getByRole(node, "combobox", { name: "Choose project" }).click());
  await act(() => getByRole(document.body, "option", { name: "a project" }).click());
  expect(getByRole(node, "tabpanel").textContent).toContain("Files a");
  expect(bodies.browser).not.toHaveBeenCalled();
  const browser = getByRole(node, "tab", { name: "Browser" });
  const files = getByRole(node, "tab", { name: "Files" });
  files.focus();
  await act(() =>
    files.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
  );
  expect(document.activeElement).toBe(browser);
  expect(bodies.browser).not.toHaveBeenCalled();
  await act(() => browser.click());
  expect(getByRole(node, "tabpanel").textContent).toContain("Browser a");
  expect(getAllByRole(node, "tab").map((tab) => tab.textContent)).toEqual([
    "Files",
    "Browser",
    "Agents",
    "Tasks",
    "Docs",
    "PRs",
  ]);
  await act(() => getByRole(node, "button", { name: "Close resources" }).click());
  expect(bodies.active).toBe(0);
  expect(queryByRole(node, "complementary", { name: "Resources" })).toBeNull();
  await act(() => getByRole(node, "button", { name: "Resources" }).click());
  expect(getByRole(node, "tabpanel").textContent).toContain("Browser a");
  expect(bodies.max).toBe(1);
  expect(bodies.writes).not.toHaveBeenCalled();
  expect(bodies.start).not.toHaveBeenCalled();
});
it("hands a request through the shared provider without changing the selected item", async () => {
  await mount();
  await act(() => getByRole(node, "button", { name: "Open file" }).click());
  expect(getByRole(node, "tabpanel").textContent).toContain("handoff");
  expect(getByRole(node, "tabpanel").textContent).toContain("Selected null");
  await act(() => root!.render(<App environmentId={EnvironmentId.make("b")} />));
  expect(queryByRole(node, "tabpanel")?.textContent).not.toContain("Files a");
  expect(node.textContent).not.toContain("handoff");
});
it("keeps deleted selections unavailable until explicitly recovered", async () => {
  await mount();
  await act(() => getByRole(node, "button", { name: "Open file" }).click());
  await act(() => root!.render(<App unavailable />));
  expect(node.textContent).toContain("This project is unavailable");
  expect(bodies.active).toBe(0);
});
