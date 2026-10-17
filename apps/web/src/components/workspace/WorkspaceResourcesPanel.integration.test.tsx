// @vitest-environment happy-dom
import { act, useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { EnvironmentId, ProjectId, type WorkspaceLinkEndpoint } from "@t3tools/contracts";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { WorkspaceProjectResources } from "./WorkspaceResourcesPanel";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { useMediaQuery } from "../../hooks/useMediaQuery";
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
  desktop: false,
  toolsAvailable: true,
  linksAvailable: true,
  acquire: vi.fn(),
  release: vi.fn(),
  linkQuery: vi.fn(),
}));
// Environment atom builders and transport results are external to the frame.
// Real state, resolver, frame, lazy switch and Files/Browser containers remain mounted.
vi.mock("../../state/entities", () => ({
  useProjects: () => boundary.projects,
  useThreadShells: () =>
    boundary.desktop ? [{ environmentId: "a", projectId: "same", id: "browser-thread" }] : [],
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
          : key === "config"
            ? { browserThreadId: "browser-thread" }
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
  useMailCapabilities: () => ({
    ready: true,
    workspaceLinks: boundary.linksAvailable,
    workspaceTools: boundary.toolsAvailable,
  }),
}));
vi.mock("./mail/useMailLinks", () => ({ useMailLinks: () => ({ linkItem: boundary.link }) }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => boundary.command }));
vi.mock("./useWorkspaceItemOpener", () => ({ useWorkspaceItemOpener: () => boundary.open }));
vi.mock("../../state/preview", () => ({ previewEnvironment: { open: {} } }));
vi.mock("../../previewStateStore", () => ({
  isPreviewSupportedInRuntime: () => boundary.desktop,
  useThreadPreviewState: () => ({ snapshot: null }),
}));
vi.mock("./ProjectTasks", () => ({
  ProjectTasks: () => {
    throw new Error("Unsupported task body was invoked.");
  },
  workspaceToolsError: String,
}));
vi.mock("./DriveFiles", () => ({ DriveFileAccess: () => <span>Explicit read available</span> }));
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemActions: () => null,
  WorkspaceItemMenu: ({
    children,
    item,
    environmentId,
  }: {
    children: import("react").ReactNode;
    item: WorkspaceLinkEndpoint;
    environmentId: string;
  }) => (
    <div>
      {children}
      <button onClick={() => boundary.open(environmentId, item.ref)}>Project row actions</button>
    </div>
  ),
}));
vi.mock("../preview/openPreviewSession", () => ({ openPreviewSession: boundary.command }));
vi.mock("../preview/PreviewPanel", () => ({
  PreviewPanel: () => {
    useEffect(() => {
      boundary.acquire();
      return () => {
        boundary.release();
      };
    }, []);
    return <p>Preview lease</p>;
  },
}));
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
  const wide = useMediaQuery("xl");
  const state = useWorkspaceResourceState(environmentId, {
    storage,
    presentation: wide ? "dock" : "sheet",
  });
  useLayoutEffect(() => {
    resources = state;
  }, [state]);
  return (
    <WorkspaceResourcesProvider value={state}>
      <button>Environment selector</button>
      <WorkspaceEngagement
        environmentId={environmentId}
        space="projects"
        layout="full"
        header={{ title: "Projects", spaceLabel: "Projects", environmentLabel: "Environment" }}
        resources={<WorkspaceProjectResources selectedItem={item} />}
        linkedContext={{
          item: { ref: { type: "url", url: "https://example.invalid/a" }, title: "Item A" },
          render: () => <p>Item links</p>,
        }}
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
  boundary.desktop = false;
  boundary.toolsAvailable = true;
  boundary.linksAvailable = true;
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

it("restores project row actions on the frame picker and Auto resumes item inference", async () => {
  await mount(
    <App
      item={{ ref: { type: "project", projectId: ProjectId.make("same") }, title: "Owned project" }}
    />,
  );
  await act(() => getByRole(node, "combobox", { name: "Choose project" }).click());
  await act(() => getByRole(document.body, "button", { name: "Project row actions" }).click());
  expect(boundary.open).toHaveBeenCalledWith("a", { type: "project", projectId: "same" });
  await act(() => getByRole(document.body, "option", { name: "A project" }).click());
  expect(resources.projectId).toBe("same");
  await act(() => getByRole(node, "combobox", { name: "Choose project" }).click());
  await act(() => getByRole(document.body, "option", { name: "Auto" }).click());
  expect(resources.projectId).toBeNull();
  expect(getByRole(node, "combobox", { name: "Choose project" }).textContent).toContain(
    "A project",
  );
  expect(boundary.link).not.toHaveBeenCalled();
});

it("does not steal environment-selector focus when the next environment has Resources closed", async () => {
  saved.set(
    "pulse.workspace.resources.v1:b",
    JSON.stringify({ version: 1, open: false, projectId: null, tabs: {} }),
  );
  await mount();
  const selector = getByRole(node, "button", { name: "Environment selector" });
  await act(() => selector.focus());
  await act(() => root!.render(<App environmentId={EnvironmentId.make("b")} />));
  expect(resources.open).toBe(false);
  expect(document.activeElement).toBe(selector);
});
it("retains the Browser address while closing its preview across context and compact resize", async () => {
  boundary.desktop = true;
  boundary.command.mockResolvedValue({ _tag: "Success", value: {} });
  await mount();
  await act(() => resources.openResource({ projectId: ProjectId.make("same"), tab: "browser" }));
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  const address = getByRole(node, "textbox", { name: "Browser page address" }) as HTMLInputElement;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      address,
      "https://example.invalid/keep",
    );
    address.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(() => getByRole(node, "button", { name: "Open Browser" }).click());
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  expect(boundary.acquire).toHaveBeenCalledTimes(1);
  await act(() => getByRole(node, "button", { name: "Linked context", hidden: true }).click());
  expect(queryByRole(document.body, "dialog", { name: "Project Browser" })).toBeNull();
  expect(boundary.release).toHaveBeenCalledTimes(1);
  for (const width of [1279, 1024, 768, 390, 1280]) {
    await act(() => {
      (
        window as unknown as {
          happyDOM: { setWindowSize(size: { width: number; height: number }): void };
        }
      ).happyDOM.setWindowSize({ width, height: 844 });
    });
    expect(boundary.acquire).toHaveBeenCalledTimes(1);
    expect(boundary.release).toHaveBeenCalledTimes(1);
    expect(queryByRole(document.body, "dialog", { name: "Project Browser" })).toBeNull();
  }
  await act(() => getByRole(node, "button", { name: "Back to resources" }).click());
  expect(getByRole(node, "textbox", { name: "Browser page address" })).toBe(address);
  expect(address.value).toBe("https://example.invalid/keep");
  expect(queryByRole(document.body, "dialog", { name: "Project Browser" })).toBeNull();
  expect(boundary.acquire).toHaveBeenCalledTimes(1);
  expect(boundary.release).toHaveBeenCalledTimes(1);
  expect(boundary.command).toHaveBeenCalledTimes(1);
  await act(() => getByRole(node, "button", { name: "Open Browser" }).click());
  expect(getByRole(document.body, "dialog", { name: "Project Browser" })).toBeDefined();
  expect(boundary.acquire).toHaveBeenCalledTimes(2);
  expect(boundary.command).toHaveBeenCalledTimes(2);
});
it("uses the same mounted shell for local, direct, opaque relay/tunnel, disconnected and old-server states", async () => {
  await mount();
  for (const mode of [
    "local",
    "direct-remote",
    "relay-opaque",
    "tunnel-opaque",
    "disconnected",
    "old-server",
  ]) {
    const env = mode === "disconnected" ? null : EnvironmentId.make(mode);
    boundary.projects = env ? [{ environmentId: env, id: "same", title: `${mode} project` }] : [];
    boundary.toolsAvailable = mode !== "old-server";
    boundary.linksAvailable = mode !== "old-server";
    boundary.linkQuery.mockClear();
    await act(() =>
      root!.render(
        <App
          environmentId={env}
          item={{ ref: { type: "project", projectId: ProjectId.make("same") } }}
        />,
      ),
    );
    expect(node.querySelectorAll("[data-workspace-engagement]")).toHaveLength(1);
    expect(node.textContent).toContain("Connection status unavailable");
    if (env) {
      expect(getByRole(node, "combobox", { name: "Choose project" }).textContent).toContain(
        `${mode} project`,
      );
      if (mode === "old-server") {
        await act(() => getByRole(node, "tab", { name: "Tasks" }).click());
        await act(async () => {
          await vi.dynamicImportSettled();
        });
        expect(getByRole(node, "tabpanel").textContent).toContain("Tasks need a newer server.");
        expect(boundary.linkQuery).not.toHaveBeenCalled();
      }
    } else expect(node.textContent).toContain("Connect an environment to see project resources.");
  }
  expect(boundary.command).not.toHaveBeenCalled();
  expect(boundary.open).not.toHaveBeenCalled();
  expect(boundary.link).not.toHaveBeenCalled();
});

vi.mock("./useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => true }));
