// @vitest-environment happy-dom
import { act, useSyncExternalStore, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  defaultStringifySearch,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, getByRole, queryByRole } from "@testing-library/dom";
import { EnvironmentId, ProjectId, type WorkspaceNote } from "@t3tools/contracts";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { AppSidebarLayout } from "./AppSidebarLayout";
import { Route } from "../routes/_chat.workspace";
import { WorkspaceEngagement } from "./workspace/WorkspaceEngagement";
import { WorkspaceProjectResources } from "./workspace/WorkspaceResourcesPanel";
import { WorkspaceSpaceSelector } from "./workspace/WorkspaceSpaceSelector";
import { useWorkspaceHeaderModel } from "./workspace/useWorkspaceHeaderModel";
import { useWorkspaceResources } from "./workspace/workspaceResourceState";
import {
  parseWorkspaceSearch,
  rememberCodeLocation,
  type WorkspaceSearch,
} from "./workspace/workspaceNavigation";
import { openMeetingNote } from "./workspace/meetings/meetingNotes";

const state = vi.hoisted(() => ({
  reads: vi.fn(),
  commands: vi.fn(),
  listeners: new Set<() => void>(),
  subscriptions: new Map<string, Set<() => void>>(),
  connected: true,
}));
const environment = EnvironmentId.make("return-a");
const otherEnvironment = EnvironmentId.make("return-b");
const project = ProjectId.make("resources");
const noteId = "wsn_00000000-0000-0000-0000-000000000001";
const secondNoteId = "wsn_00000000-0000-0000-0000-000000000002";
function noteRef(resourceId = noteId) {
  return { type: "provider-resource", provider: "workspace-note", resourceId } as const;
}

// Keep the real authenticated layout, router, resource frame, Docs selection and
// editor. Isolate Code services and external environment/query/command boundaries.
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => DEFAULT_RESOLVED_KEYBINDINGS }));
vi.mock("../env", () => ({ isElectron: false }));
vi.mock("../state/server", () => ({
  primaryServerKeybindingsAtom: {},
  serverEnvironment: { configProjection: () => "config" },
}));
vi.mock("../state/entities", () => ({
  useProjects: () =>
    [environment, otherEnvironment].flatMap((environmentId) =>
      [project, ProjectId.make("other-project")].map((id) => ({
        environmentId,
        id,
        title: id,
        repositoryIdentity: null,
      })),
    ),
  useAllEnvironmentProjectSnapshotsReady: () => true,
  useAllEnvironmentShellsBootstrapped: () => true,
  useThreadShells: () => [],
  useThreadShell: () => null,
  useProject: () => null,
  useServerConfigs: () => new Map(),
}));
vi.mock("../state/environments", () => ({
  usePrimaryEnvironmentId: () => environment,
  useEnvironment: (id: string | null) => (id ? { label: id } : null),
  useConnectedEnvironmentIds: () => {
    useSyncExternalStore(
      (listener) => {
        state.listeners.add(listener);
        return () => {
          state.listeners.delete(listener);
        };
      },
      () => state.connected,
    );
    return state.connected ? [environment, otherEnvironment] : [];
  },
}));
vi.mock("../hooks/useSettings", () => ({
  useEnvironmentIdentificationMode: () => "none",
  useLegacySidebarEnabled: () => false,
  useEnvironmentSettings: () => undefined,
}));
vi.mock("../hooks/useThreadVisitedMigration", () => ({ useThreadVisitedMigration: () => {} }));
vi.mock("../panelAnimations", () => ({
  PanelAnimationSuppressionProvider: ({ children }: { children: ReactNode }) => children,
  usePanelAnimationSettings: () => ({ active: false, durationMs: 0 }),
  usePanelNavigationSuppression: () => false,
}));
vi.mock("./SidebarStageBackdrop", () => ({ useSidebarStageBackdropVariant: () => null }));
vi.mock("./LegacySidebar", () => ({ default: () => <WorkspaceSpaceSelector /> }));
vi.mock("./Sidebar", () => ({ default: () => <WorkspaceSpaceSelector /> }));
vi.mock("./sidebar/SidebarChrome", () => ({
  SidebarBrandWidthProbe: () => null,
  SidebarChromeHeader: () => null,
}));
vi.mock("./settings/SettingsSidebarNav", () => ({ SettingsSidebarNav: () => null }));
vi.mock("./sidebar/mainAppLocation", () => ({ MainAppLocationTracker: () => null }));
vi.mock("../composerDraftStore", () => ({
  useComposerDraftStore: (select: (store: unknown) => unknown) =>
    select({ getDraftThread: () => ({ environmentId: environment }) }),
}));
vi.mock("./workspace/mail/useMailCapabilities", () => ({
  useMailCapabilities: (id?: EnvironmentId) => ({
    environmentId: id ?? environment,
    ready: true,
    mailRead: true,
    workspaceLinks: true,
    workspaceTools: false,
    workspaceItemContext: false,
  }),
}));
vi.mock("./workspace/mail/MailNav", () => ({ MailNav: () => null }));
vi.mock("./workspace/mail/MailSpace", () => ({ MailSpace: MailCenter }));
vi.mock("./workspace/calendar/CalendarSpace", () => ({
  CalendarNotesProvider: ({ children }: { children: ReactNode }) => children,
  CalendarSpace: () => null,
}));
vi.mock("./workspace/meetings/MeetingsSpace", () => ({ MeetingsSpace: () => null }));
vi.mock("./workspace/CommunicationsWorkspace", () => ({ CommunicationsWorkspace: () => null }));
vi.mock("./workspace/TasksSpace", () => ({ TasksSpace: () => null }));
vi.mock("./workspace/ProjectsSpace", () => ({ ProjectsSpace: () => null }));
vi.mock("./workspace/OfficeWorkspace", () => ({ OfficeWorkspace: () => null }));
vi.mock("./workspace/WorkspaceLinkedContext", () => ({ WorkspaceLinkedContext: () => null }));
vi.mock("./workspace/WorkspaceItemActions", () => ({
  WorkspaceItemMenu: ({ children }: { children: ReactNode }) => children,
  WorkspaceItemActions: () => null,
}));
vi.mock("./workspace/WorkspaceResourceFooter", () => ({ WorkspaceResourceFooter: () => null }));
vi.mock("./workspace/ProjectTasks", () => ({ ProjectWorkspaceSettings: () => null }));
vi.mock("./workspace/useWorkspaceItemOpener", () => ({
  useWorkspaceItemOpener: () => state.commands,
}));
vi.mock("./workspace/DriveFiles", () => ({ DriveReader: () => <p>Drive reader</p> }));
vi.mock("./workspace/ProjectDriveExplorer", () => ({ ProjectDriveExplorer: () => <p>Files</p> }));
vi.mock("./workspace/WorkspaceBrowser", () => ({ WorkspaceBrowser: () => null }));
vi.mock("./workspace/WorkspaceAgents", () => ({ WorkspaceAgents: () => null }));
vi.mock("./workspace/ProjectTasksResource", () => ({ ProjectTasksResource: () => null }));
vi.mock("../state/workspaceNotes", () => ({
  workspaceNotes: { get: queryKey("note"), update: "update", delete: "delete", restore: "restore" },
}));
vi.mock("../state/workspaceLinks", () => ({
  workspaceLinks: {
    list: queryKey("links"),
    projectHub: queryKey("hub"),
    link: "link",
    unlink: "unlink",
  },
}));
vi.mock("../state/session", () => ({
  useEnvironmentSessionState: () => ({
    data: { authenticated: true, scopes: ["orchestration:operate"] },
  }),
}));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: () => state.commands }));
vi.mock("../browser/useOpenLink", () => ({ useOpenLink: () => state.commands }));
vi.mock("../state/threads", () => ({
  threadEnvironment: {
    linkPullRequest: "link-pr",
    unlinkPullRequest: "unlink-pr",
    updateMetadata: "metadata",
  },
}));
vi.mock("../state/query", () => ({
  useEnvironmentQuery: (query: string | null) => {
    useSyncExternalStore(
      (listener) => {
        if (query === null) return () => {};
        const listeners = state.subscriptions.get(query) ?? new Set<() => void>();
        state.subscriptions.set(query, listeners);
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      () => 0,
    );
    const data =
      query === "config"
        ? { source: "live", config: { pulseCapabilities: { workspaceNotes: true } } }
        : query?.startsWith("note:")
          ? note(JSON.parse(query.slice(5)).environmentId, JSON.parse(query.slice(5)).input.id)
          : query?.startsWith("links:")
            ? emptyLinks
            : null;
    return { data, error: null, isPending: false, refresh: vi.fn() };
  },
}));
const emptyLinks = { linked: [], suggested: [], truncated: false };
function queryKey(kind: string) {
  return (input: unknown) => {
    const query = `${kind}:${JSON.stringify(input)}`;
    state.reads(query);
    return query;
  };
}
function note(environmentId: string, id: WorkspaceNote["id"]): WorkspaceNote {
  return {
    id,
    title: `${environmentId} ${id === noteId ? "First note" : "Second note"}`,
    body: `Saved body in ${environmentId}`,
    revision: 3,
    createdAt: "2026-10-17T00:00:00Z",
    updatedAt: "2026-10-17T00:00:00Z",
  };
}
function MailCenter() {
  const search = Route.useSearch();
  const resources = useWorkspaceResources();
  const environmentId = EnvironmentId.make(search.environment!);
  const header = useWorkspaceHeaderModel(environmentId, "Email", "Email");
  return (
    <WorkspaceEngagement
      environmentId={environmentId}
      space="mail"
      layout="full"
      header={header}
      resources={<WorkspaceProjectResources />}
    >
      <p>Unrelated Mail center</p>
      <button
        onClick={() =>
          openMeetingNote(resources, {
            environmentId,
            projectId: ProjectId.make(search.project!),
            note: noteRef(),
          })
        }
      >
        Open native document
      </button>
    </WorkspaceEngagement>
  );
}

let root: Root | undefined;
let node: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("cookieStore", { set: vi.fn().mockResolvedValue(undefined) });
  window.localStorage.clear();
  rememberCodeLocation(environment, "/");
  (
    window as unknown as {
      happyDOM: { setWindowSize(size: { width: number; height: number }): void };
    }
  ).happyDOM.setWindowSize({ width: 1440, height: 900 });
  state.commands.mockResolvedValue({ _tag: "Success", value: undefined });
});
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  node?.remove();
  state.subscriptions.clear();
  state.listeners.clear();
  state.connected = true;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function mount(search: WorkspaceSearch) {
  const parent = createRootRoute({
    component: () => (
      <AppSidebarLayout>
        <Outlet />
      </AppSidebarLayout>
    ),
  });
  const chat = createRoute({ getParentRoute: () => parent, id: "_chat" });
  const workspace = createRoute({
    getParentRoute: () => chat,
    path: "workspace",
    validateSearch: parseWorkspaceSearch,
    component: Route.options.component!,
  });
  const draft = createRoute({
    getParentRoute: () => chat,
    path: "draft/$draftId",
    component: () => <p>Code draft</p>,
  });
  const thread = createRoute({
    getParentRoute: () => chat,
    path: "$environmentId/$threadId",
    component: () => <p>Code thread</p>,
  });
  const index = createRoute({
    getParentRoute: () => chat,
    path: "/",
    component: () => <p>Code</p>,
  });
  const router = createRouter({
    routeTree: parent.addChildren([chat.addChildren([workspace, draft, thread, index])]),
    history: createMemoryHistory({
      initialEntries: [
        "/workspace" + defaultStringifySearch({ ...parseWorkspaceSearch({ ...search }) }),
      ],
    }),
  });
  await router.load();
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(async () => {
    await import("./workspace/WorkspaceDocsPanel");
    await import("./workspace/WorkspaceDocsNoteView");
    await import("./workspace/WorkspacePullRequestsPanel");
    root!.render(<RouterProvider router={router} />);
  });
  return router;
}
async function click(name: string, role: "button" | "tab" = "button") {
  await act(() => getByRole(document.body, role, { name }).click());
}
async function edit(body: string) {
  await click("Edit note");
  await act(() =>
    fireEvent.change(getByRole(node, "textbox", { name: "Note text" }), {
      target: { value: body },
    }),
  );
}
function draftText() {
  return (getByRole(node, "textbox", { name: "Note text" }) as HTMLTextAreaElement).value;
}
function activeSubscriptions() {
  return [...state.subscriptions.values()].reduce((count, listeners) => count + listeners.size, 0);
}
const mailSearch: WorkspaceSearch = {
  space: "mail",
  view: "later",
  environment,
  project,
  account: "mail-account",
  folder: "Sent",
};
const nativeSearch: WorkspaceSearch = {
  space: "meetings",
  environment,
  project,
  item: JSON.stringify(noteRef()),
  day: "2026-10-17",
};
function nativeHref(search: WorkspaceSearch = nativeSearch) {
  return "/workspace" + defaultStringifySearch({ ...parseWorkspaceSearch({ ...search }) });
}
function expectTab(name: string) {
  expect(getByRole(node, "tab", { name }).getAttribute("aria-selected")).toBe("true");
}

it.each(["mail", "native"] as const)(
  "retains %s Docs draft through the real Code and Workspace owner",
  async (center) => {
    const search = center === "mail" ? mailSearch : nativeSearch;
    const router = await mount(search);
    const exactHref = router.state.location.href;
    if (center === "mail") await click("Open native document");
    await edit(`Unsaved ${center} body`);
    await click("PRs", "tab");
    await click("Docs", "tab");
    expect(draftText()).toBe(`Unsaved ${center} body`);
    await click("PRs", "tab");
    expect(getByRole(node, "tab", { name: "PRs" }).getAttribute("aria-selected")).toBe("true");
    await click("Code");
    expect(router.state.location.pathname).toBe("/");
    expect(activeSubscriptions()).toBe(0);
    expect(node.querySelectorAll("[data-workspace-resource-body]")).toHaveLength(0);
    const reads = state.reads.mock.calls.length;
    await act(() => {
      for (const listener of state.listeners) listener();
    });
    expect(state.reads).toHaveBeenCalledTimes(reads);
    await click("Workspace");
    expect(router.state.location.href).toBe(exactHref);
    expect(router.state.location.search).toEqual(search);
    expect(getByRole(node, "tab", { name: "PRs" }).getAttribute("aria-selected")).toBe("true");
    await click("Docs", "tab");
    expect(draftText()).toBe(`Unsaved ${center} body`);
    expect(node.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
    expect(getByRole(node, "combobox", { name: "Choose project" }).textContent).toContain(project);
    expect(state.commands).not.toHaveBeenCalled();
  },
);

it("acknowledges repeated mode returns while fresh same-note and other-note opens still select Docs", async () => {
  const router = await mount(nativeSearch);
  await edit("Keep first draft");
  for (let round = 0; round < 2; round++) {
    await click("PRs", "tab");
    await click("Code");
    expect(activeSubscriptions()).toBe(0);
    await click("Workspace");
    expectTab("PRs");
    await click("Docs", "tab");
    expect(draftText()).toBe("Keep first draft");
  }
  await click("PRs", "tab");
  const oldKey = router.state.location.state.__TSR_key;
  await act(async () => router.navigate({ href: nativeHref() }));
  expect(router.state.location.state.__TSR_key).not.toBe(oldKey);
  expectTab("Docs");
  expect(draftText()).toBe("Keep first draft");
  await click("PRs", "tab");
  await act(async () =>
    router.navigate({
      href: nativeHref({ ...nativeSearch, item: JSON.stringify(noteRef(secondNoteId)) }),
    }),
  );
  expectTab("Docs");
  expect(queryByRole(node, "textbox", { name: "Note text" })).toBeNull();
  expect(node.textContent).toContain("Second note");
  await edit("Keep second draft");
  await act(async () => {
    router.history.back();
    await router.load();
  });
  expectTab("Docs");
  expect(draftText()).toBe("Keep first draft");
  await act(async () => {
    router.history.forward();
    await router.load();
  });
  expectTab("Docs");
  expect(draftText()).toBe("Keep second draft");
  expect(state.commands).not.toHaveBeenCalled();
});

it("scopes equal note and project IDs by environment and applies changed project intent", async () => {
  const router = await mount(nativeSearch);
  await edit("Original environment draft");
  await click("PRs", "tab");
  const other = { ...nativeSearch, environment: otherEnvironment };
  await act(async () => router.navigate({ href: nativeHref(other) }));
  expectTab("Docs");
  expect(queryByRole(node, "textbox", { name: "Note text" })).toBeNull();
  expect(node.textContent).toContain("Saved body in return-b");
  await edit("Other environment draft");
  await click("PRs", "tab");
  await act(async () => router.navigate({ href: "/return-b/thread-1" }));
  expect(activeSubscriptions()).toBe(0);
  await click("Workspace");
  expect(router.state.location.search).toEqual(other);
  expectTab("PRs");
  await click("Docs", "tab");
  expect(draftText()).toBe("Other environment draft");
  await act(async () => router.navigate({ href: nativeHref() }));
  expectTab("Docs");
  expect(draftText()).toBe("Original environment draft");
  await click("PRs", "tab");
  await act(async () =>
    router.navigate({ href: nativeHref({ ...nativeSearch, project: "other-project" }) }),
  );
  expectTab("Docs");
  expect(getByRole(node, "combobox", { name: "Choose project" }).textContent).toContain(
    "other-project",
  );
  expect(draftText()).toBe("Original environment draft");
  expect(node.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
  expect(state.commands).not.toHaveBeenCalled();
});

it.each(["mail", "native"] as const)(
  "clears the retained %s draft on real authenticated-layout disposal",
  async (center) => {
    const router = await mount(center === "mail" ? mailSearch : nativeSearch);
    if (center === "mail") await click("Open native document");
    await edit("Discard only on actual disposal");
    await click("PRs", "tab");
    await click("Code");
    await click("Workspace");
    expectTab("PRs");
    await act(() => root!.unmount());
    expect(activeSubscriptions()).toBe(0);
    root = createRoot(node);
    await act(() => root!.render(<RouterProvider router={router} />));
    if (center === "mail") {
      await click("Docs", "tab");
      expect(getByRole(node, "heading", { name: "Documents" })).toBeDefined();
      await click("Open native document");
    } else {
      expectTab("Docs");
    }
    expect(queryByRole(node, "textbox", { name: "Note text" })).toBeNull();
    expect(getByRole(node, "button", { name: "Edit note" })).toBeDefined();
    expect(state.commands).not.toHaveBeenCalled();
  },
);
