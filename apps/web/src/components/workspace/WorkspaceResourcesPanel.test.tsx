// @vitest-environment happy-dom
import { act, useEffect, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, getAllByRole, queryByRole } from "@testing-library/dom";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { WorkspaceResourcesPanel } from "./WorkspaceResourcesPanel";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { useMediaQuery } from "../../hooks/useMediaQuery";
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
  toolsAvailable: true,
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
  useMailCapabilities: () => ({ workspaceTools: bodies.toolsAvailable, workspaceLinks: true }),
}));
vi.mock("./mail/useMailLinks", () => ({ useMailLinks: () => ({ linkItem: bodies.writes }) }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => bodies.start }));
const a = EnvironmentId.make("a");
const p = ProjectId.make("project");
let root: Root | undefined;
let node: HTMLDivElement;
const storage = { getItem: () => null, setItem: () => {} };
const retainedLinkedPage = <p>Retained linked page</p>;
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  node?.remove();
  vi.clearAllMocks();
  bodies.active = 0;
  bodies.max = 0;
  bodies.toolsAvailable = true;
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
  linked = retainedLinkedPage,
}: {
  environmentId?: EnvironmentId;
  unavailable?: boolean;
  linked?: ReactNode;
}) {
  const wide = useMediaQuery("xl");
  const state = useWorkspaceResourceState(environmentId, {
    storage,
    presentation: wide ? "dock" : "sheet",
  });
  return (
    <WorkspaceResourcesProvider value={state}>
      <WorkspaceEngagement
        environmentId={environmentId}
        space="projects"
        layout="full"
        header={{ title: "Projects", spaceLabel: "Projects", environmentLabel: environmentId }}
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
        linkedContext={{
          item:
            linked === null
              ? null
              : { ref: { type: "url", url: "https://example.invalid/a" }, title: "Page A" },
          render: () => linked,
        }}
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
  expect(queryByRole(node, "complementary", { name: "Linked context" })).toBeNull();
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
it("shares one dock between live resources and linked items through header controls", async () => {
  await mount();
  const engagement = node.querySelector("[data-workspace-engagement]")!;
  const linked = getByRole(node, "button", { name: "Linked context" });
  const resources = getByRole(node, "button", { name: "Resources" });
  expect(getAllByRole(node, "complementary")).toHaveLength(1);
  expect(linked.closest("[data-workspace-header-controls]")).not.toBeNull();
  expect(linked.getAttribute("aria-expanded")).toBe("false");
  await act(() => linked.click());
  expect(getAllByRole(node, "complementary")).toHaveLength(1);
  expect(getByRole(node, "complementary", { name: "Linked context" }).textContent).toContain(
    "Retained linked page",
  );
  expect(resources.getAttribute("aria-expanded")).toBe("false");
  expect(engagement.getAttribute("data-workspace-dock-open")).toBe("true");
  await act(() => linked.click());
  await act(() => getByRole(node, "button", { name: "Close resources" }).click());
  expect(
    getAllByRole(node, "complementary", { hidden: true }).filter((dock) => !dock.hidden),
  ).toHaveLength(0);
  expect(engagement.getAttribute("data-workspace-dock-open")).toBe("false");
  await act(() => linked.click());
  expect(engagement.getAttribute("data-workspace-dock-open")).toBe("true");
  await act(() => resources.click());
  expect(getAllByRole(node, "complementary")).toHaveLength(1);
  expect(getByRole(node, "complementary", { name: "Resources" })).toBeDefined();
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
it("moves the tab stop to the selected tab after an external resource handoff", async () => {
  await mount();
  const browser = getByRole(node, "tab", { name: "Browser" });
  await act(() => {
    browser.focus();
    browser.click();
  });
  await act(() => getByRole(node, "button", { name: "Open file" }).click());
  expect(getByRole(node, "tab", { name: "Files" }).tabIndex).toBe(0);
  expect(getByRole(node, "tab", { name: "Browser" }).tabIndex).toBe(-1);
});
it("returns dock close focus to the Resources header trigger", async () => {
  await mount();
  const close = getByRole(node, "button", { name: "Close resources" });
  await act(() => {
    close.focus();
    close.click();
  });
  expect(document.activeElement).toBe(getByRole(node, "button", { name: "Resources" }));
});

it("retains the tool during Linked context and restores the same resource request on Back", async () => {
  await mount();
  await act(() => getByRole(node, "button", { name: "Open file" }).click());
  expect(bodies.active).toBe(1);
  expect(getByRole(node, "tabpanel").textContent).toContain("handoff");
  await act(() => getByRole(node, "button", { name: "Linked context" }).click());
  expect(bodies.active).toBe(1);
  expect(queryByRole(node, "tabpanel")).toBeNull();
  await act(() => getByRole(node, "button", { name: "Back to resources" }).click());
  expect(bodies.active).toBe(1);
  expect(bodies.max).toBe(1);
  expect(getByRole(node, "tabpanel").textContent).toContain("handoff");
  expect(getByRole(node, "combobox", { name: "Choose project" }).textContent).toContain(
    "a project",
  );
  expect(document.activeElement).toBe(getByRole(node, "button", { name: "Resources" }));
});
it("keeps the empty linked-context explanation reachable beside live resources", async () => {
  await mount(<App linked={null} />);
  await act(() => getByRole(node, "button", { name: "Linked context" }).click());
  expect(getByRole(node, "complementary", { name: "Linked context" }).textContent).toContain(
    "Select an item to see its linked context.",
  );
  expect(getAllByRole(node, "complementary")).toHaveLength(1);
});
it("transfers open resources on resize and restores the saved wide visibility after compact dismissal", async () => {
  await mount();
  // Prime happy-dom's media listeners with the initial wide match before resizing.
  await act(() => window.dispatchEvent(new Event("resize")));
  const resize = async (width: number) => {
    await act(() => {
      (
        window as unknown as {
          happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
        }
      ).happyDOM.setWindowSize({ width, height: 800 });
    });
  };
  await resize(390);
  expect(getByRole(document.body, "dialog", { name: "Resources" })).toBeDefined();
  expect(
    getByRole(node, "button", { name: "Resources", hidden: true }).getAttribute("aria-expanded"),
  ).toBe("true");
  await resize(1280);
  expect(getByRole(node, "complementary", { name: "Resources" })).toBeDefined();
  await act(() => getByRole(node, "button", { name: "Close resources" }).click());
  await resize(390);
  await act(() => getByRole(node, "button", { name: "Resources" }).click());
  expect(getByRole(document.body, "dialog", { name: "Resources" })).toBeDefined();
  await resize(1280);
  expect(queryByRole(document.body, "dialog")).toBeNull();
  expect(getByRole(node, "complementary", { name: "Resources" })).toBeDefined();
});
it.each(["Tasks", "Docs", "PRs"])(
  "styles the %s fallback with existing muted text tokens",
  async (tab) => {
    bodies.toolsAvailable = false;
    await mount();
    await act(() => getByRole(node, "button", { name: "Open file" }).click());
    await act(() => getByRole(node, "tab", { name: tab }).click());
    const paragraph = getByRole(node, "tabpanel").querySelector("p")!;
    expect(paragraph.classList.contains("text-sm")).toBe(true);
    expect(paragraph.classList.contains("text-muted-foreground")).toBe(true);
  },
);
it("keeps deleted selections unavailable until explicitly recovered", async () => {
  await mount();
  await act(() => getByRole(node, "button", { name: "Open file" }).click());
  await act(() => root!.render(<App unavailable />));
  expect(node.textContent).toContain("This project is unavailable");
  expect(bodies.active).toBe(0);
});

it("keeps focus on the Linked context trigger when toggled closed", async () => {
  await mount();
  const trigger = getByRole(node, "button", { name: "Linked context" });
  await act(() => {
    trigger.focus();
    trigger.click();
  });
  await act(() => trigger.click());
  expect(document.activeElement).toBe(trigger);
});
