// @vitest-environment happy-dom
import { act, useLayoutEffect, useMemo, type ReactNode } from "react";
import { create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, afterEach } from "vite-plus/test";
import { createRoot } from "react-dom/client";
import { getByRole, getAllByRole } from "@testing-library/dom";
import {
  EnvironmentId,
  EnvironmentAuthorizationError,
  ProjectId,
  WorkspaceToolsError,
  type WorkspaceProjectOverview,
  type WorkspaceItemRef,
  type WorkspaceTask,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { createWorkspaceMockupModule } from "./dev/projectsMockupModule";
import { createWorkspaceMockupSession } from "./dev/workspaceMockupFixtures";
import { ProjectsSpace } from "./ProjectsSpace";
import { ProjectsOverviewView, type ProjectsOverviewViewProps } from "./ProjectsOverviewView";
import { WorkspaceItemMenuView } from "./WorkspaceItemMenuView";
import {
  WorkspaceResourcesProvider,
  useWorkspaceResourceState,
  type WorkspaceResourcesState,
} from "./workspaceResourceState";
const mocks = vi.hoisted(() => ({
  item: undefined as string | undefined,
  project: "project",
  view: "linked" as string | undefined,
  navigate: vi.fn(),
  create: vi.fn(),
  createCommand: vi.fn(),
  wait: vi.fn(),
  thread: vi.fn(),
  toast: vi.fn(),
  realCreation: false,
  link: vi.fn(),
  overview: vi.fn(),
  overviewRender: vi.fn(),
  threadShells: vi.fn(),
  refresh: vi.fn(),
  overviewAvailable: true,
  overviewError: null as string | null,
  overviewFailure: null as unknown,
  overviewPending: false,
  pendingPages: null as number | null,
  pendingFilter: null as string | null,
  empty: false,
  pages: 1,
  rendererMode: false,
  hub: vi.fn(),
  resources: vi.fn(),
  header: vi.fn(),
  tasksV2: false,
  configState: "ready" as "ready" | "pending" | "error",
  task: null as WorkspaceTask | null,
  listeners: new Set<() => void>(),
}));
vi.mock("@tanstack/react-router", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useSearch: () => {
      useSyncExternalStore(
        (listener) => {
          mocks.listeners.add(listener);
          return () => mocks.listeners.delete(listener);
        },
        () => `${mocks.project}:${mocks.item}:${mocks.view}`,
      );
      return { project: mocks.project, environment: "remote", item: mocks.item, view: mocks.view };
    },
    useNavigate: () => mocks.navigate,
    useRouter: () => null,
    Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  };
});
vi.mock("../../state/entities", () => ({
  useProjects: () => [
    { id: "local-one", environmentId: "local", title: "Local one" },
    { id: "local-two", environmentId: "local", title: "Local two" },
    { id: "project", environmentId: "remote", title: "SynKEK" },
    { id: "website", environmentId: "remote", title: "Website" },
  ],
  useThreadShells: () => {
    mocks.threadShells();
    return [];
  },
  waitForProject: (...args: unknown[]) => mocks.wait(...args),
}));
vi.mock("../../hooks/useNewProject", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../hooks/useNewProject")>();
  return { useNewProject: () => (mocks.realCreation ? original.useNewProject() : mocks.create) };
});
vi.mock("../../state/projects", () => ({ projectEnvironment: { createNew: "create-project" } }));
vi.mock("../../state/sourceControl", () => ({
  sourceControlEnvironment: { publishRepository: "publish-project" },
}));
vi.mock("../../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => mocks.thread }));
vi.mock("../ui/toast", () => ({
  stackedThreadToast: (value: unknown) => value,
  toastManager: { add: (value: unknown) => mocks.toast(value) },
}));
vi.mock("../../state/environments", () => ({ useConnectedEnvironmentIds: () => ["remote"] }));
vi.mock("./useWorkspaceHeaderModel", () => ({
  useWorkspaceHeaderModel: (...args: unknown[]) => {
    mocks.header(...args);
    return { title: "Projects", environmentLabel: "Remote", spaceLabel: "Projects" };
  },
}));
vi.mock("./mail/useMailCapabilities", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useMailCapabilities: () => {
      useSyncExternalStore(
        (listener) => {
          mocks.listeners.add(listener);
          return () => mocks.listeners.delete(listener);
        },
        () => `${mocks.tasksV2}:${mocks.overviewAvailable}`,
      );
      return {
        environmentId: "remote",
        workspaceItemContext: true,
        workspaceTools: true,
        workspaceProjectOverview: mocks.overviewAvailable,
        workspaceTasksV2: mocks.tasksV2,
        ready: true,
        workspaceLinks: true,
      };
    },
  };
});
vi.mock("../../state/workspaceTools", () => ({
  workspaceTools: {
    overview: (target: { input: { filter: string; drive: string }; pages?: number }) => {
      mocks.overview(target);
      return { kind: "overview", ...target };
    },
    task: () => "task",
    config: () => "config",
    tasks: () => "tasks",
  },
}));
vi.mock("../../state/workspaceLinks", () => ({
  workspaceLinks: {
    link: "link-project",
    projectHub: () => {
      mocks.hub();
      return "hub";
    },
  },
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (
    query:
      | string
      | null
      | { kind: string; input: { filter: string; drive: string }; pages?: number },
  ) =>
    useMemo(() => {
      if (typeof query === "object" && query?.kind === "overview") {
        const projects = mocks.empty
          ? []
          : [
              {
                projectId: ProjectId.make("project"),
                title: "SynKEK",
                description: "Brand and growth",
                driveRoot: "linked",
                channels: {
                  count: 0,
                  complete: false,
                  providers: [{ provider: "slack", count: 0, complete: false }],
                },
              },
              {
                projectId: ProjectId.make("website"),
                title: "Website",
                description: "Public site",
                driveRoot: "none",
                channels: { count: 2, complete: true, providers: [] },
              },
            ].filter(
              (p) =>
                `${p.title} ${p.description}`
                  .toLowerCase()
                  .includes(query.input.filter.toLowerCase()) &&
                (query.input.drive === "all" ||
                  (p.driveRoot === "linked") === (query.input.drive === "linked")),
            );
        return {
          data:
            mocks.pendingPages === query.pages || mocks.pendingFilter === query.input.filter
              ? undefined
              : {
                  projects:
                    mocks.overviewAvailable || query.input.drive === "all"
                      ? projects.slice(0, query.pages ?? 1)
                      : [],
                  incomplete: !mocks.overviewAvailable,
                  nextCursor: (query.pages ?? 1) < projects.length ? "next" : undefined,
                },
          error: mocks.overviewError,
          failure: mocks.overviewFailure,
          isPending:
            mocks.overviewPending ||
            mocks.pendingPages === query.pages ||
            mocks.pendingFilter === query.input.filter,
          refresh: mocks.refresh,
        };
      }
      return {
        data:
          query === "hub"
            ? { related: [], truncated: false }
            : query === "config" && mocks.configState === "ready"
              ? {
                  projectId: "project",
                  taskColumns: ["To do", "Done"],
                  completedColumn: "Done",
                  revision: 0,
                }
              : query === "tasks"
                ? { tasks: [], incomplete: false }
                : query === "task"
                  ? mocks.task
                  : null,
        error:
          query === "task" && !mocks.task
            ? "This task was deleted."
            : query === "config" && mocks.configState === "error"
              ? "Config unavailable"
              : null,
        isPending: query === "config" && mocks.configState === "pending",
        refresh() {},
      };
    }, [
      JSON.stringify(query),
      mocks.empty,
      mocks.overviewAvailable,
      mocks.overviewError,
      mocks.overviewFailure,
      mocks.overviewPending,
      mocks.pendingPages,
      mocks.pendingFilter,
      mocks.task,
      mocks.configState,
    ]),
}));
vi.mock("./WorkspaceResourcesPanel", () => ({
  WorkspaceProjectResources: (props: unknown) => {
    mocks.resources(props);
    return null;
  },
}));
vi.mock("./WorkspaceItemActions", async () => {
  const { useAtomCommand } = await import("../../state/use-atom-command");
  const { workspaceLinks } = await import("../../state/workspaceLinks");
  return {
    WorkspaceItemActions: ({
      environmentId,
      item,
    }: {
      environmentId: EnvironmentId;
      item: { ref: WorkspaceItemRef };
    }) => {
      const link = useAtomCommand(workspaceLinks.link);
      return (
        <button
          onClick={() =>
            link({
              environmentId,
              input: {
                a: item,
                b: { ref: { type: "project", projectId: ProjectId.make("website") } },
              },
            })
          }
        >
          {item.ref.type} actions
        </button>
      );
    },
    WorkspaceItemMenu: ({ children }: { children: ReactNode }) => children,
  };
});
vi.mock("./ProjectsOverviewView", async (importOriginal) => {
  const original = await importOriginal<typeof import("./ProjectsOverviewView")>();
  return {
    ...original,
    ProjectsOverviewView: (props: ProjectsOverviewViewProps) => {
      mocks.overviewRender();
      return <original.ProjectsOverviewView {...props} />;
    },
  };
});
vi.mock("./ProjectTasks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ProjectTasks")>()),
}));
vi.mock("../../hooks/useSettings", () => ({
  useEnvironmentSettings: (_id: unknown, select: (settings: unknown) => unknown) =>
    select({ workspaceDisplayTimeZone: "UTC", workspaceOwnerProfile: null }),
}));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    data: { authenticated: true, scopes: ["orchestration:operate"] },
  }),
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: unknown) =>
    command === "create-project" ? mocks.createCommand : mocks.link,
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
      expect(mocks.overview).not.toHaveBeenCalled();
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
      expect(mocks.link).not.toHaveBeenCalled();
      expect(mocks.overview).not.toHaveBeenCalled();
    } finally {
      await act(() => root.unmount());
      node.remove();
      vi.clearAllMocks();
      vi.unstubAllGlobals();
    }
  },
);

it("removes the upgrade notice throughout the Projects project-task path after a live capability flip", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.item = undefined;
  mocks.tasksV2 = false;
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
    expect(node.textContent).toContain("Tasks need a newer server.");
    await act(() => {
      mocks.tasksV2 = true;
      for (const listener of mocks.listeners) listener();
    });
    expect(node.textContent).not.toContain("Tasks need a newer server.");
    expect(getByRole(node, "heading", { name: "Tasks" })).toBeDefined();
  } finally {
    await act(() => root.unmount());
    node.remove();
    mocks.tasksV2 = false;
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  }
});

it.each(["ready", "pending", "error"] as const)(
  "shows the selected task actions once with config %s",
  async (state) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    mocks.task = {
      id: "wskt_00000000-0000-0000-0000-000000000001",
      projectId: ProjectId.make("project"),
      title: "Selected task",
      column: "To do",
    };
    mocks.item = JSON.stringify({ type: "task", taskId: mocks.task.id });
    mocks.configState = state;
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
      if (state === "ready")
        expect(getByRole(node, "textbox", { name: "Task title" })).toBeDefined();
      expect(getAllByRole(node, "button", { name: "task actions" })).toHaveLength(1);
    } finally {
      await act(() => root.unmount());
      node.remove();
      mocks.task = null;
      mocks.item = undefined;
      mocks.configState = "ready";
      vi.clearAllMocks();
      vi.unstubAllGlobals();
    }
  },
);

vi.mock("./WorkspaceEngagement", async (importOriginal) => {
  const original = await importOriginal<typeof import("./WorkspaceEngagement")>();
  return {
    ...original,
    WorkspaceEngagement: (props: import("./WorkspaceEngagement").WorkspaceEngagementProps) =>
      mocks.rendererMode ? (
        <div>
          {props.children}
          {props.resources}
        </div>
      ) : (
        <original.WorkspaceEngagement {...props} />
      ),
  };
});
vi.mock("../ui/dialog", () => ({
  Dialog: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: ReactNode;
  }) =>
    open ? (
      <>
        {children}
        <button onClick={() => onOpenChange(false)}>Dismiss dialog</button>
      </>
    ) : null,
  DialogPopup: ({ children }: { children: ReactNode }) => (
    <section role="dialog">{children}</section>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
let overviewView: ReactTestRenderer | undefined;
beforeEach(() => {
  mocks.project = "project";
  mocks.item = undefined;
  mocks.navigate.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue(false);
  mocks.wait.mockResolvedValue({ id: "created" });
});
afterEach(async () => {
  await act(() => overviewView?.unmount());
  overviewView = undefined;
  mocks.rendererMode = false;
  mocks.view = "linked";
  mocks.overviewAvailable = true;
  mocks.overviewError = null;
  mocks.overviewFailure = null;
  mocks.overviewPending = false;
  mocks.pendingPages = null;
  mocks.pendingFilter = null;
  mocks.realCreation = false;
  mocks.empty = false;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
let resourceState: WorkspaceResourcesState;
async function mountOverview() {
  mocks.view = undefined;
  mocks.rendererMode = true;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  function App() {
    const state = useWorkspaceResourceState(EnvironmentId.make("remote"), {
      storage: { getItem: () => null, setItem() {} },
    });
    useLayoutEffect(() => {
      resourceState = state;
    }, [state]);
    return (
      <WorkspaceResourcesProvider value={state}>
        <ProjectsSpace />
      </WorkspaceResourcesProvider>
    );
  }
  await act(() => {
    overviewView = create(<App />);
  });
  return overviewView!;
}
const button = (view: ReactTestRenderer, text: string) =>
  view.root.findAllByType("button").find((b) => b.children.join("") === text)!;
const textContent = (node: ReactTestInstance | string): string =>
  typeof node === "string" ? node : node.children.map(textContent).join("");
async function searchFor(view: ReactTestRenderer, query: string) {
  await act(() =>
    view.root
      .findByProps({ "aria-label": "Find a project" })
      .props.onChange({ target: { value: query } }),
  );
  await act(() => view.root.findAllByType("form")[0]!.props.onSubmit({ preventDefault() {} }));
}
it("observes commands from the project actions mounted by ProjectsSpace", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.rendererMode = true;
  await act(() => {
    overviewView = create(<ProjectsSpace />);
  });
  await act(() => button(overviewView!, "project actions").props.onClick());
  expect(mocks.link).toHaveBeenCalledTimes(1);
  expect(mocks.link).toHaveBeenCalledWith({
    environmentId: "remote",
    input: {
      a: { ref: { type: "project", projectId: "project" }, title: "SynKEK" },
      b: { ref: { type: "project", projectId: "website" } },
    },
  });
});
it.each([
  new Error("Temporary payload limit telemetry unavailable"),
  new WorkspaceToolsError({
    kind: "unavailable",
    message: "Reconnect the environment to update projects.",
  }),
])(
  "offers Retry for a transient typed failure and calls the observable refresh: %s",
  async (failure) => {
    mocks.overviewError = failure.message;
    mocks.overviewFailure = failure;
    const view = await mountOverview();
    expect(button(view, "Retry")).toBeDefined();
    await act(() => button(view, "Retry").props.onClick());
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  },
);
it.each([
  new WorkspaceToolsError({ kind: "invalid-input", message: "Choose a smaller result set." }),
  new WorkspaceToolsError({ kind: "not-found", message: "No project available." }),
  new WorkspaceToolsError({ kind: "conflict", message: "Project state changed." }),
  new EnvironmentAuthorizationError({
    message: "Permission required.",
    requiredScope: "orchestration:operate",
  }),
])("does not retry a non-retryable failure: %s", async (failure) => {
  mocks.overviewError = failure.message;
  mocks.overviewFailure = failure;
  const view = await mountOverview();
  expect(button(view, "Retry")).toBeUndefined();
});
it("retains loaded cards during More and drops them for a new pending search", async () => {
  const view = await mountOverview();
  mocks.pendingPages = 2;
  await act(() => button(view, "More projects").props.onClick());
  expect(view.root.findByProps({ "aria-label": "Select SynKEK" })).toBeDefined();
  expect(JSON.stringify(view.toJSON())).toContain("Updating projects...");
  mocks.pendingFilter = "public";
  await searchFor(view, "public");
  expect(mocks.overview).toHaveBeenLastCalledWith(expect.objectContaining({ pages: 1 }));
  expect(view.root.findAllByProps({ "aria-label": "Select SynKEK" })).toHaveLength(0);
  expect(view.root.findAllByProps({ "aria-label": "Select Website" })).toHaveLength(0);
  expect(JSON.stringify(view.toJSON())).toContain("Loading projects...");
});
it("shows the titles-only limitation on an older server, including a no-match search", async () => {
  mocks.overviewAvailable = false;
  mocks.empty = true;
  const view = await mountOverview();
  await searchFor(view, "description phrase");
  expect(JSON.stringify(view.toJSON())).toContain("Searching titles only on this server.");
  expect(JSON.stringify(view.toJSON())).toContain("No matching projects.");
  expect(mocks.overview).toHaveBeenLastCalledWith(
    expect.objectContaining({ metadataAvailable: false }),
  );
});
it("keeps the routed card, header and resource owner aligned while resource selection stays independent", async () => {
  const view = await mountOverview();
  expect(view.root.findByProps({ "aria-label": "Select SynKEK" }).props["aria-pressed"]).toBe(true);
  expect(mocks.header).toHaveBeenLastCalledWith("remote", "Projects", "Projects", "SynKEK");
  expect(mocks.resources).toHaveBeenLastCalledWith(
    expect.objectContaining({
      owningProjectId: "project",
      selectedItem: { ref: { type: "project", projectId: "project" }, title: "SynKEK" },
    }),
  );
  await act(() => resourceState.chooseProject(ProjectId.make("website")));
  expect(resourceState.projectId).toBe("website");
  expect(mocks.navigate).not.toHaveBeenCalled();
  expect(view.root.findByProps({ "aria-label": "Select SynKEK" }).props["aria-pressed"]).toBe(true);
  await act(() => button(view, "More projects").props.onClick());
  await act(() => view.root.findByProps({ "aria-label": "Select Website" }).props.onClick());
  expect(mocks.navigate).toHaveBeenLastCalledWith({
    to: "/workspace",
    search: { space: "projects", environment: "remote", project: "website" },
  });
  await act(() => {
    mocks.project = "website";
    for (const listener of mocks.listeners) listener();
  });
  expect(view.root.findByProps({ "aria-label": "Select Website" }).props["aria-pressed"]).toBe(
    true,
  );
  expect(view.root.findByProps({ "aria-label": "Select SynKEK" }).props["aria-pressed"]).toBe(
    false,
  );
  expect(mocks.header).toHaveBeenLastCalledWith("remote", "Projects", "Projects", "Website");
  expect(mocks.resources).toHaveBeenLastCalledWith(
    expect.objectContaining({
      owningProjectId: "website",
      selectedItem: { ref: { type: "project", projectId: "website" }, title: "Website" },
    }),
  );
});
it("searches descriptions before paging and selects without leaving the overview or linking", async () => {
  const view = await mountOverview();
  await searchFor(view, "growth");
  const card = view.root.findByProps({ "aria-label": "Select SynKEK" });
  await act(() => card.props.onClick());
  expect(mocks.navigate).toHaveBeenLastCalledWith({
    to: "/workspace",
    search: { space: "projects", environment: "remote", project: "project" },
  });
  expect(view.root.findByProps({ "aria-label": "Your projects" })).toBeDefined();
  expect(mocks.overview).toHaveBeenLastCalledWith(
    expect.objectContaining({ input: expect.objectContaining({ filter: "growth" }) }),
  );
  expect(mocks.link).not.toHaveBeenCalled();
  expect(JSON.stringify(view.toJSON())).toContain("count unknown");
  expect(JSON.stringify(view.toJSON())).not.toContain("0 channels");
});
it("appends More and resets pages for title search and root filters", async () => {
  const view = await mountOverview();
  await act(() => button(view, "More projects").props.onClick());
  expect(view.root.findByProps({ "aria-label": "Select Website" })).toBeDefined();
  expect(button(view, "More projects")).toBeUndefined();
  await act(() =>
    view.root
      .findByProps({ "aria-label": "Filter projects" })
      .props.onChange({ target: { value: "unlinked" } }),
  );
  expect(mocks.overview).toHaveBeenLastCalledWith(
    expect.objectContaining({ pages: 1, input: expect.objectContaining({ drive: "unlinked" }) }),
  );
  expect(view.root.findByProps({ "aria-label": "Select Website" })).toBeDefined();
  await act(() => button(view, "Reset search and filters").props.onClick());
  await act(() => button(view, "More projects").props.onClick());
  await searchFor(view, "website");
  expect(mocks.overview).toHaveBeenLastCalledWith(
    expect.objectContaining({ pages: 1, input: expect.objectContaining({ filter: "website" }) }),
  );
  await act(() => button(view, "Reset search and filters").props.onClick());
  expect(mocks.overview).toHaveBeenLastCalledWith(
    expect.objectContaining({ pages: 1, input: { filter: "", drive: "all" } }),
  );
  expect(view.root.findByProps({ "aria-label": "Find a project" }).props.value).toBe("");
  expect(view.root.findByProps({ "aria-label": "Filter projects" }).props.value).toBe("all");
});
it.each(["linked", "unlinked"])(
  "distinguishes empty projects from no matches and unavailable Drive filtering: %s",
  async (drive) => {
    mocks.empty = true;
    const view = await mountOverview();
    expect(JSON.stringify(view.toJSON())).toContain("No projects yet");
    await searchFor(view, "missing");
    expect(JSON.stringify(view.toJSON())).toContain("No matching projects");
    await act(() => {
      mocks.overviewAvailable = false;
      for (const listener of mocks.listeners) listener();
    });
    await act(() =>
      view.root
        .findByProps({ "aria-label": "Filter projects" })
        .props.onChange({ target: { value: drive } }),
    );
    expect(JSON.stringify(view.toJSON())).toContain("Drive status unavailable on this server");
    expect(mocks.overview).toHaveBeenLastCalledWith(
      expect.objectContaining({ metadataAvailable: false }),
    );
    expect(JSON.stringify(view.toJSON())).not.toContain("No matching projects");
  },
);
it("offers reset instead of retry for an oversized-title cursor failure", async () => {
  mocks.overviewError = "Project title exceeds the 2048-byte project overview cursor limit.";
  mocks.overviewFailure = new WorkspaceToolsError({
    kind: "invalid-input",
    message: mocks.overviewError,
  });
  const view = await mountOverview();
  expect(button(view, "Retry")).toBeUndefined();
  expect(button(view, "Reset search and filters")).toBeDefined();
});
it("commits search only on submit without a duplicate refresh", async () => {
  const view = await mountOverview();
  const reads = mocks.overview.mock.calls.length;
  await act(() =>
    view.root
      .findByProps({ "aria-label": "Find a project" })
      .props.onChange({ target: { value: "  public  " } }),
  );
  expect(mocks.overview).toHaveBeenCalledTimes(reads);
  await act(() => view.root.findAllByType("form")[0]!.props.onSubmit({ preventDefault() {} }));
  expect(mocks.overview).toHaveBeenLastCalledWith(
    expect.objectContaining({ pages: 1, input: expect.objectContaining({ filter: "public" }) }),
  );
  expect(view.root.findByProps({ "aria-label": "Select Website" })).toBeDefined();
  expect(view.root.findAllByProps({ "aria-label": "Select SynKEK" })).toHaveLength(0);
  expect(mocks.refresh).not.toHaveBeenCalled();
  await act(() =>
    view.root
      .findByProps({ "aria-label": "Find a project" })
      .props.onChange({ target: { value: "" } }),
  );
  expect(mocks.overview).toHaveBeenLastCalledWith(
    expect.objectContaining({ pages: 1, input: expect.objectContaining({ filter: "" }) }),
  );
});
it("offers reset instead of retry for the server's oversized metadata failure", async () => {
  mocks.overviewError = "Project summary metadata exceeds the bounded overview response.";
  mocks.overviewFailure = new WorkspaceToolsError({
    kind: "invalid-input",
    message: mocks.overviewError,
  });
  const view = await mountOverview();
  expect(button(view, "Retry")).toBeUndefined();
  expect(button(view, "Reset search and filters")).toBeDefined();
});
it.each(["Close", "Dismiss dialog"])(
  "dismisses created-project recovery with %s without recreating",
  async (label) => {
    const view = await mountOverview();
    mocks.navigate.mockRejectedValueOnce(new Error("Navigation unavailable"));
    mocks.create.mockImplementationOnce(async (input) => {
      await input.onCreated({ environmentId: "remote", projectId: "new" });
      return true;
    });
    await act(() => view.root.findByProps({ "aria-label": "New project" }).props.onClick());
    await act(() =>
      view.root
        .findByProps({ "aria-label": "Project name" })
        .props.onChange({ target: { value: "New" } }),
    );
    await act(async () => {
      await view.root
        .findByProps({ "aria-label": "Create project" })
        .props.onSubmit({ preventDefault() {} });
    });
    const dismiss =
      button(view, label) ??
      view.root
        .findAllByType("button")
        .find((candidate) => candidate.props["aria-label"] === label);
    expect(dismiss).toBeDefined();
    expect(button(view, "Cancel")).toBeUndefined();
    await act(() => dismiss!.props.onClick());
    expect(view.root.findAllByProps({ role: "dialog" })).toHaveLength(0);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledTimes(1);
  },
);
it("ignores dismissal during creation and reports a second Open project failure", async () => {
  const view = await mountOverview();
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  mocks.create.mockImplementationOnce(async (input) => {
    await pending;
    await input.onCreated({ environmentId: "remote", projectId: "new" });
    return true;
  });
  mocks.navigate
    .mockRejectedValueOnce(new Error("nav 1"))
    .mockRejectedValueOnce(new Error("nav 2"));
  await act(() => view.root.findByProps({ "aria-label": "New project" }).props.onClick());
  await act(() =>
    view.root
      .findByProps({ "aria-label": "Project name" })
      .props.onChange({ target: { value: "New" } }),
  );
  let submitting!: Promise<void>;
  await act(() => {
    submitting = view.root
      .findByProps({ "aria-label": "Create project" })
      .props.onSubmit({ preventDefault() {} });
  });
  await act(() => button(view, "Dismiss dialog").props.onClick());
  expect(view.root.findAllByProps({ role: "dialog" })).toHaveLength(1);
  expect(mocks.create).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish();
    await submitting;
  });
  await act(async () => {
    await button(view, "Open project").props.onClick();
  });
  expect(JSON.stringify(view.toJSON())).toContain(
    "Could not open the project. Try Open project again.",
  );
  expect(view.root.findAllByProps({ role: "dialog" })).toHaveLength(1);
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.navigate).toHaveBeenCalledTimes(2);
  expect(mocks.navigate).toHaveBeenLastCalledWith({
    to: "/workspace",
    search: { space: "projects", environment: "remote", project: "new" },
  });
});
it("creates explicitly once, keeps failed input, and cancels without a command", async () => {
  const view = await mountOverview();
  const overviewReads = mocks.overview.mock.calls.length;
  await act(() => view.root.findByProps({ "aria-label": "New project" }).props.onClick());
  await act(() =>
    view.root
      .findByProps({ "aria-label": "Project name" })
      .props.onChange({ target: { value: "  New name  " } }),
  );
  expect(mocks.overview).toHaveBeenCalledTimes(overviewReads);
  await act(() => button(view, "Cancel").props.onClick());
  expect(mocks.create).not.toHaveBeenCalled();
  await act(() => view.root.findByProps({ "aria-label": "New project" }).props.onClick());
  await act(() =>
    view.root
      .findByProps({ "aria-label": "Project name" })
      .props.onChange({ target: { value: "  New name  " } }),
  );
  const submit = view.root.findByProps({ "aria-label": "Create project" });
  await act(async () => {
    await submit.props.onSubmit({ preventDefault() {} });
  });
  expect(view.root.findByProps({ "aria-label": "Project name" }).props.value).toBe("  New name  ");
  expect(JSON.stringify(view.toJSON())).toContain("Could not create the project. Try again.");
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({
      environmentId: "remote",
      name: "New name",
      openThread: false,
      github: null,
    }),
  );
});
it("recovers an existing created ref after navigation failure without a second create", async () => {
  const view = await mountOverview();
  mocks.navigate.mockRejectedValueOnce(new Error("Navigation unavailable"));
  mocks.create.mockImplementationOnce(async (input) => {
    await input.onCreated({ environmentId: "remote", projectId: "new" });
    return true;
  });
  await act(() => view.root.findByProps({ "aria-label": "New project" }).props.onClick());
  await act(() =>
    view.root
      .findByProps({ "aria-label": "Project name" })
      .props.onChange({ target: { value: "New name" } }),
  );
  const submit = view.root.findByProps({ "aria-label": "Create project" });
  await act(async () => {
    const a = submit.props.onSubmit({ preventDefault() {} });
    const b = submit.props.onSubmit({ preventDefault() {} });
    await Promise.all([a, b]);
  });
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(view.toJSON())).toContain("Project created. Open project to continue.");
  expect(
    view.root
      .findAllByType("p")
      .filter(
        (paragraph) => paragraph.children.join("") === "Project created. Open project to continue.",
      ),
  ).toHaveLength(1);
  await act(async () => {
    await button(view, "Open project").props.onClick();
  });
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.navigate).toHaveBeenLastCalledWith({
    to: "/workspace",
    search: { space: "projects", environment: "remote", project: "new" },
  });
  expect(view.root.findAllByProps({ role: "dialog" })).toHaveLength(0);
});

it("renders the real overview in recipe 04 and settles fake actions without live reads", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const session = createWorkspaceMockupSession("04");
  const module = createWorkspaceMockupModule(session);
  try {
    expect(module.readyRegions).toEqual(["center"]);
    await act(() => {
      overviewView = create(<>{module.center}</>);
    });
    const view = overviewView!;
    expect(view.root.findByProps({ "aria-label": "Your projects" })).toBeDefined();
    expect(view.root.findAllByType(WorkspaceItemMenuView)).toHaveLength(3);
    expect(
      view.root.findAllByProps({ "aria-label": "Item actions" }).length,
    ).toBeGreaterThanOrEqual(3);
    await act(() =>
      view.root.findByProps({ "aria-label": "Select Pulse website" }).props.onClick(),
    );
    await module.settled();
    await session.settled();
    expect(session.operations.at(-1)).toEqual(
      expect.objectContaining({
        kind: "navigate",
        item: { type: "project", projectId: "fixture-pulse-website" },
      }),
    );
    await act(() => view.root.findByProps({ "aria-label": "New project" }).props.onClick());
    await act(() => button(view, "Cancel").props.onClick());
    expect(
      session.operations.filter((operation) => operation.kind === "start-project"),
    ).toHaveLength(0);
    await act(() => view.root.findByProps({ "aria-label": "New project" }).props.onClick());
    await act(() =>
      view.root
        .findByProps({ "aria-label": "Project name" })
        .props.onChange({ target: { value: "Sample launch" } }),
    );
    await act(() =>
      view.root
        .findByProps({ "aria-label": "Create project" })
        .props.onSubmit({ preventDefault() {} }),
    );
    await module.settled();
    expect(session.operations.at(-1)).toEqual(
      expect.objectContaining({ kind: "start-project", value: "Sample launch" }),
    );
    expect(view.root.findByProps({ "aria-label": "Select Sample launch" })).toBeDefined();
    expect(mocks.overview).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  } finally {
    module.dispose();
    session.dispose();
  }
});

it("selects a successful create in Workspace and closes the creation panel", async () => {
  const view = await mountOverview();
  mocks.create.mockImplementationOnce(async (input) => {
    await input.onCreated({ environmentId: "remote", projectId: "created" });
    return true;
  });
  await act(() => view.root.findByProps({ "aria-label": "New project" }).props.onClick());
  await act(() =>
    view.root
      .findByProps({ "aria-label": "Project name" })
      .props.onChange({ target: { value: "Created" } }),
  );
  await act(async () => {
    await view.root
      .findByProps({ "aria-label": "Create project" })
      .props.onSubmit({ preventDefault() {} });
  });
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.navigate).toHaveBeenLastCalledWith({
    to: "/workspace",
    search: { space: "projects", environment: "remote", project: "created" },
  });
  expect(view.root.findAllByProps({ "aria-label": "Create project" })).toHaveLength(0);
  expect(view.root.findByProps({ "aria-label": "Your projects" })).toBeDefined();
});

it("keeps thrown pre-create failure input and reports the command error", async () => {
  const view = await mountOverview();
  mocks.create.mockRejectedValueOnce(new Error("Create service unavailable"));
  await act(() => view.root.findByProps({ "aria-label": "New project" }).props.onClick());
  await act(() =>
    view.root
      .findByProps({ "aria-label": "Project name" })
      .props.onChange({ target: { value: "Keep my name" } }),
  );
  await act(async () => {
    await view.root
      .findByProps({ "aria-label": "Create project" })
      .props.onSubmit({ preventDefault() {} });
  });
  expect(view.root.findByProps({ "aria-label": "Project name" }).props.value).toBe("Keep my name");
  expect(JSON.stringify(view.toJSON())).toContain("Create service unavailable");
  expect(mocks.navigate).not.toHaveBeenCalled();
});

it("uses the real creation hook through ProjectsSpace without opening a Code draft on success", async () => {
  mocks.realCreation = true;
  mocks.createCommand.mockResolvedValueOnce({
    _tag: "Success",
    value: { projectId: ProjectId.make("created"), workspaceRoot: "/projects/created" },
  });
  const view = await mountOverview();
  await act(() => view.root.findByProps({ "aria-label": "New project" }).props.onClick());
  await act(() =>
    view.root
      .findByProps({ "aria-label": "Project name" })
      .props.onChange({ target: { value: "  Created  " } }),
  );
  await act(async () => {
    await view.root
      .findByProps({ "aria-label": "Create project" })
      .props.onSubmit({ preventDefault() {} });
  });
  expect(mocks.createCommand).toHaveBeenCalledExactlyOnceWith({
    environmentId: "remote",
    input: { name: "Created" },
  });
  expect(mocks.wait).toHaveBeenCalledExactlyOnceWith({
    environmentId: "remote",
    projectId: "created",
  });
  expect(mocks.navigate).toHaveBeenLastCalledWith({
    to: "/workspace",
    search: { space: "projects", environment: "remote", project: "created" },
  });
  expect(mocks.thread).not.toHaveBeenCalled();
  expect(view.root.findAllByProps({ role: "dialog" })).toHaveLength(0);
  expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ title: "Created Created" }),
  );
});
it("contains navigation failure locally while the real creation hook finishes successfully", async () => {
  mocks.realCreation = true;
  mocks.createCommand.mockResolvedValueOnce({
    _tag: "Success",
    value: { projectId: ProjectId.make("created"), workspaceRoot: "/projects/created" },
  });
  mocks.navigate.mockRejectedValueOnce(new Error("Navigation unavailable"));
  const view = await mountOverview();
  await act(() => view.root.findByProps({ "aria-label": "New project" }).props.onClick());
  await act(() =>
    view.root
      .findByProps({ "aria-label": "Project name" })
      .props.onChange({ target: { value: "Created" } }),
  );
  await act(async () => {
    await view.root
      .findByProps({ "aria-label": "Create project" })
      .props.onSubmit({ preventDefault() {} });
  });
  expect(mocks.createCommand).toHaveBeenCalledTimes(1);
  expect(mocks.wait).toHaveBeenCalledExactlyOnceWith({
    environmentId: "remote",
    projectId: "created",
  });
  expect(mocks.toast).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ title: "Created Created" }),
  );
  expect(mocks.thread).not.toHaveBeenCalled();
  expect(
    textContent(view.root).match(/Project created\. Open project to continue\./g),
  ).toHaveLength(1);
  await act(() => button(view, "Close").props.onClick());
  expect(view.root.findAllByProps({ role: "dialog" })).toHaveLength(0);
  expect(mocks.createCommand).toHaveBeenCalledTimes(1);
});
it("does not subscribe the overview to thread shells or rerender cards while typing a creation name", async () => {
  const view = await mountOverview();
  expect(mocks.threadShells).not.toHaveBeenCalled();
  await act(() => view.root.findByProps({ "aria-label": "New project" }).props.onClick());
  const renders = mocks.overviewRender.mock.calls.length;
  const reads = mocks.overview.mock.calls.length;
  await act(() =>
    view.root
      .findByProps({ "aria-label": "Project name" })
      .props.onChange({ target: { value: "Typing a project name" } }),
  );
  expect(mocks.overviewRender).toHaveBeenCalledTimes(renders);
  expect(mocks.overview).toHaveBeenCalledTimes(reads);
  expect(mocks.threadShells).not.toHaveBeenCalled();
});

function metadataView(projects: readonly WorkspaceProjectOverview[]) {
  const props: ProjectsOverviewViewProps = {
    projects,
    selectedProjectId: null,
    query: "",
    driveFilter: "all",
    pending: false,
    error: null,
    hasMore: false,
    roster: [],
    onQueryChange: vi.fn(),
    onSearch: vi.fn(),
    onDriveFilterChange: vi.fn(),
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onMore: vi.fn(),
    onRetry: vi.fn(),
    createButtonRef: null,
  };
  return <ProjectsOverviewView {...props} />;
}
it("renders unavailable and incomplete metadata without inventing zeros", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(() => {
    overviewView = create(
      metadataView([
        {
          projectId: ProjectId.make("unavailable"),
          title: "Unavailable",
          description: null,
          driveRoot: "unavailable",
          channels: { count: null, complete: false, providers: [] },
        },
        {
          projectId: ProjectId.make("partial"),
          title: "Partial",
          description: null,
          driveRoot: "none",
          channels: {
            count: 3,
            complete: false,
            providers: [{ provider: "slack", count: 3, complete: false }],
          },
        },
        {
          projectId: ProjectId.make("singular"),
          title: "Singular",
          description: null,
          driveRoot: "linked",
          channels: {
            count: 1,
            complete: true,
            providers: [{ provider: "slack", count: 1, complete: true }],
          },
        },
      ]),
    );
  });
  const text = JSON.stringify(overviewView!.toJSON());
  expect(text).toContain("Drive status unavailable");
  expect(text).toContain("Channel count unknown");
  expect(text).toContain("3+ channels");
  expect(text).toContain("1 channel");
  expect(text).not.toContain("1 channels");
  expect(text).not.toContain("0 channels");
  expect(text).toContain("Slack");
});
it.each([
  {
    label: "complete dated source",
    members: { count: 9, complete: true, source: "Slack", observedAt: "2026-10-01T00:00:00Z" },
    visible: true,
  },
  {
    label: "incomplete",
    members: { count: 9, complete: false, source: "Slack", observedAt: "2026-10-01T00:00:00Z" },
    visible: false,
  },
  {
    label: "missing source",
    members: { count: 9, complete: true, source: "  ", observedAt: "2026-10-01T00:00:00Z" },
    visible: false,
  },
  {
    label: "invalid date",
    members: { count: 9, complete: true, source: "Slack", observedAt: "unknown" },
    visible: false,
  },
])(
  "shows member counts only with complete, sourced, dated metadata: $label",
  async ({ members, visible }) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const { complete, ...metadata } = members;
    const project = {
      projectId: ProjectId.make("members"),
      title: "Members",
      description: null,
      driveRoot: "none",
      channels: { count: null, complete: false, providers: [] },
      members: { ...metadata, complete: true },
    } satisfies WorkspaceProjectOverview;
    // Exercise malformed old-server metadata without bypassing the typed fixture.
    if (!complete) Object.defineProperty(project.members, "complete", { value: false });
    await act(() => {
      overviewView = create(metadataView([project]));
    });
    const text = textContent(overviewView!.root);
    expect(text.includes("9 members")).toBe(visible);
    if (visible) expect(text).toContain("Slack, as of 2026-10-01T00:00:00Z");
  },
);
