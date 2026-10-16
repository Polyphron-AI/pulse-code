// @vitest-environment happy-dom
import { act, useLayoutEffect, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole } from "@testing-library/dom";
import { EnvironmentId, ProjectId, type WorkspaceLinkEndpoint } from "@t3tools/contracts";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { WorkspaceProjectResources } from "./WorkspaceResourcesPanel";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import {
  useWorkspaceResourceState,
  WorkspaceResourcesProvider,
  type WorkspaceResourcesState,
} from "./workspaceResourceState";

const boundary = vi.hoisted(() => ({
  revision: 0,
  listeners: new Set<() => void>(),
  ready: true,
  projects: [
    { environmentId: "a", id: "same", title: "A project" },
    { environmentId: "b", id: "same", title: "B project" },
  ],
  taskA: null as { projectId: string } | null,
  link: vi.fn(),
  command: vi.fn(),
  open: vi.fn(),
  linkQuery: vi.fn(),
}));
// Environment atom builders and transport results are external to the frame.
// Real state, resolver, frame, lazy switch and Files/Browser containers remain mounted.
vi.mock("../../state/entities", () => ({
  useProjects: () => boundary.projects,
  useThreadShells: () => [],
  useThreadShell: () => null,
  useAllEnvironmentProjectSnapshotsReady: () => boundary.ready,
}));
vi.mock("../../state/workspaceLinks", () => ({
  workspaceLinks: {
    list: ({
      environmentId,
      input,
    }: {
      environmentId: string;
      input: { item: { type: string; projectId?: string } };
    }) => {
      boundary.linkQuery(environmentId, input.item);
      return `${environmentId}:${input.item.type}:${input.item.projectId ?? "selected"}`;
    },
  },
}));
vi.mock("../../state/workspaceTools", () => ({
  workspaceTools: {
    task: ({ environmentId }: { environmentId: string }) => `${environmentId}:task`,
    config: () => "config",
  },
}));
const subscribe = (listener: () => void) => {
  boundary.listeners.add(listener);
  return () => {
    boundary.listeners.delete(listener);
  };
};
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (key: string | null) => {
    useSyncExternalStore(subscribe, () => boundary.revision);
    return {
      data:
        key === "a:task"
          ? boundary.taskA
          : key?.includes(":project:")
            ? {
                linked: [
                  {
                    id: "file",
                    item: {
                      ref: { type: "file", provider: "google-drive", fileId: "brief" },
                      title: "Project brief",
                    },
                  },
                ],
                suggested: [],
              }
            : key
              ? {
                  linked: [],
                  suggested: [{ item: { ref: { type: "project", projectId: "same" } } }],
                }
              : null,
      error: null,
    };
  },
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ workspaceLinks: true, workspaceTools: true }),
}));
vi.mock("./mail/useMailLinks", () => ({ useMailLinks: () => ({ linkItem: boundary.link }) }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => boundary.command }));
vi.mock("./useWorkspaceItemOpener", () => ({ useWorkspaceItemOpener: () => boundary.open }));
vi.mock("../../state/preview", () => ({ previewEnvironment: { open: {} } }));
vi.mock("../../previewStateStore", () => ({
  isPreviewSupportedInRuntime: () => false,
  useThreadPreviewState: () => ({ snapshot: null }),
}));
vi.mock("./ProjectTasks", () => ({
  useWorkspaceCanOperate: () => true,
  workspaceToolsError: String,
}));
vi.mock("./DriveFiles", () => ({ DriveFileAccess: () => <span>Explicit read available</span> }));
vi.mock("./WorkspaceItemActions", () => ({ WorkspaceItemActions: () => null }));
vi.mock("../preview/openPreviewSession", () => ({ openPreviewSession: boundary.command }));
vi.mock("../../localApi", () => ({
  readLocalApi: () => ({ shell: { openExternal: boundary.open } }),
}));

let root: Root | undefined;
let node: HTMLDivElement;
let resources: WorkspaceResourcesState;
const saved = new Map<string, string>();
const storage = {
  getItem: (key: string) => saved.get(key) ?? null,
  setItem: (key: string, value: string) => {
    saved.set(key, value);
  },
};
function App({
  environmentId = EnvironmentId.make("a"),
  item = null,
}: {
  environmentId?: EnvironmentId | null;
  item?: WorkspaceLinkEndpoint | null;
}) {
  const state = useWorkspaceResourceState(environmentId, { storage });
  useLayoutEffect(() => {
    resources = state;
  }, [state]);
  return (
    <WorkspaceResourcesProvider value={state}>
      <WorkspaceEngagement
        environmentId={environmentId}
        space="projects"
        layout="full"
        header={{ title: "Projects", spaceLabel: "Projects", environmentLabel: "Environment" }}
        resources={<WorkspaceProjectResources selectedItem={item} />}
      >
        <p>Center selection</p>
      </WorkspaceEngagement>
    </WorkspaceResourcesProvider>
  );
}
async function mount(element = <App />) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  (
    window as unknown as {
      happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
    }
  ).happyDOM.setWindowSize({ width: 1280, height: 800 });
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() => root!.render(element));
}
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  node?.remove();
  saved.clear();
  boundary.ready = true;
  boundary.taskA = null;
  boundary.projects = [
    { environmentId: "a", id: "same", title: "A project" },
    { environmentId: "b", id: "same", title: "B project" },
  ];
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("does not write links, start providers or change roots through actual picker and tab actions", async () => {
  await mount();
  await act(() => getByRole(node, "combobox", { name: "Choose project" }).click());
  await act(() => getByRole(document.body, "option", { name: "A project" }).click());
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  expect(getByRole(node, "tabpanel").textContent).toContain("Project brief");
  await act(() => getByRole(node, "tab", { name: "Browser" }).click());
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  expect(getByRole(node, "tabpanel").textContent).toContain("Select an item to link this page.");
  expect(
    (getByRole(node, "button", { name: "Link this page" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(boundary.link).not.toHaveBeenCalled();
  expect(boundary.command).not.toHaveBeenCalled();
  expect(boundary.open).not.toHaveBeenCalled();
  const linkQueries = boundary.linkQuery.mock.calls.length;
  const address = getByRole(node, "textbox", { name: "Browser page address" }) as HTMLInputElement;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      address,
      "https://example.invalid/draft",
    );
    address.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(() =>
    root!.render(
      <App
        item={{
          ref: { type: "url", url: "https://example.invalid/selected" },
          title: "Another selection",
        }}
      />,
    ),
  );
  expect(
    (getByRole(node, "textbox", { name: "Browser page address" }) as HTMLInputElement).value,
  ).toBe("https://example.invalid/draft");
  expect(boundary.linkQuery).toHaveBeenCalledTimes(linkQueries);
});

it("ignores suggestions and late resource handoffs across A/B/A generations with equal project ids", async () => {
  await mount(<App item={{ ref: { type: "task", taskId: "task-a" }, title: "A task" }} />);
  expect(node.textContent).toContain("Choose a project to see its resources.");
  const openFromA = resources.openResource;
  let resolve!: () => void;
  const result = new Promise<void>((done) => {
    resolve = done;
  }).then(() => {
    openFromA({
      projectId: ProjectId.make("same"),
      tab: "browser",
      request: { type: "url", url: "https://example.invalid/late-a" },
    });
  });
  await act(() => root!.render(<App environmentId={EnvironmentId.make("b")} />));
  await act(() => resources.openResource({ projectId: ProjectId.make("same"), tab: "files" }));
  expect(getByRole(node, "combobox", { name: "Choose project" }).textContent).toContain(
    "B project",
  );
  await act(() => root!.render(<App />));
  await act(async () => {
    resolve();
    await result;
  });
  expect(resources.projectId).toBeNull();
  expect(resources.selectedTab).toBe("files");
  expect(resources.request).toBeNull();
  expect(getByRole(node, "tabpanel").textContent).toContain("Choose a project");
  await act(() => root!.render(<App environmentId={EnvironmentId.make("b")} />));
  expect(resources).toMatchObject({ projectId: "same", selectedTab: "files", request: null });
  expect(getByRole(node, "combobox", { name: "Choose project" }).textContent).toContain(
    "B project",
  );
  expect(node.textContent).not.toContain("A project");
});

it("renders real disconnected, loading, empty and deleted-project states", async () => {
  await mount(<App environmentId={null} />);
  expect(node.textContent).toContain("Connect an environment to see project resources.");
  boundary.projects = [];
  boundary.ready = false;
  await act(() =>
    root!.render(<App item={{ ref: { type: "project", projectId: ProjectId.make("same") } }} />),
  );
  expect(getByRole(node, "tabpanel").textContent).toBe("Loading projects...");
  boundary.ready = true;
  await act(() => root!.render(<App />));
  expect(getByRole(node, "tabpanel").textContent).toBe("No projects yet.");
});
