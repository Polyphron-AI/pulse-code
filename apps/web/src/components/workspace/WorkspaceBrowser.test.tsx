// @vitest-environment happy-dom
import {
  act,
  StrictMode,
  useCallback,
  useSyncExternalStore,
  useLayoutEffect,
  type ComponentProps,
  type ReactNode,
} from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { AsyncResult } from "effect/unstable/reactivity";
import * as Cause from "effect/Cause";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  WorkspaceLinkList,
  type WorkspaceLinkEndpoint,
  type PreviewSessionSnapshot,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import {
  applyPreviewServerEvent,
  applyPreviewServerSnapshot,
  readThreadPreviewState,
  reconcilePreviewServerSessions,
  resetPreviewStateForTests,
  useThreadPreviewState,
} from "../../previewStateStore";
import { AppAtomRegistryProvider } from "../../rpc/atomRegistry";
import { previewRuntimeTabId } from "../../browser/previewRuntimeTabId";
import { openPreviewSession } from "../preview/openPreviewSession";
import type { PreviewPanel } from "../preview/PreviewPanel";
import { WorkspaceBrowser } from "./WorkspaceBrowser";
import { WorkspaceResourceBody } from "./WorkspaceResourceBody";
import {
  WorkspaceResourcesBodyContext,
  WorkspaceResourcesProvider,
  useWorkspaceResourceState,
  type WorkspaceResourcesState,
} from "./workspaceResourceState";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { createWorkspaceMockupModule } from "./dev/browserMockupModule";
import { createWorkspaceMockupSession } from "./dev/workspaceMockupFixtures";
import { LinkedSection } from "./mail/LinkedSection";
import { useWorkspaceItemOpener } from "./useWorkspaceItemOpener";

const decodeLinkList = Schema.decodeUnknownSync(WorkspaceLinkList);

const mocks = vi.hoisted(() => ({
  desktop: true,
  connected: true,
  operate: true,
  configured: true,
  configError: null as string | null,
  configLoading: false,
  config: vi.fn(),
  configuredThread: "t",
  readError: null as string | null,
  open: vi.fn(),
  external: vi.fn(),
  link: vi.fn(),
  list: vi.fn(),
  refresh: vi.fn(),
  previewMounts: 0,
  focusUrlNonce: null as number | null,
  openInBrowser: vi.fn(),
  realLocalApi: false,
  linksSupported: true,
  capabilitiesReady: true,
  projectLinks: null as WorkspaceLinkList | null,
  linkQueries: vi.fn(),
  linkEnvironment: vi.fn(),
  unlink: vi.fn(),
  actionItems: vi.fn(),
  linksByEnvironment: new Map<string, WorkspaceLinkList>(),
  linkListeners: new Map<string, Set<() => void>>(),
  listRequests: new Map<string, number>(),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("../../state/workspaceLinks", () => ({
  workspaceLinks: {
    list: (input: {
      environmentId: EnvironmentId;
      input: { item: { type: "project"; projectId: ProjectId } };
    }) => {
      mocks.linkQueries(input);
      return input;
    },
  },
}));
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemActions: ({
    item,
    environmentId,
    layout,
  }: {
    item: WorkspaceLinkEndpoint;
    environmentId: EnvironmentId;
    layout?: "toolbar" | "menu";
  }) => {
    mocks.actionItems({ item, environmentId, layout });
    return <button>Start thread from {item.title}</button>;
  },
  WorkspaceItemMenu: ({
    children,
    provenance,
    item,
    environmentId,
  }: {
    children: ReactNode;
    provenance?: ReactNode;
    item: WorkspaceLinkEndpoint;
    environmentId: EnvironmentId;
  }) => (
    <div data-page-menu={JSON.stringify({ item, environmentId })}>
      {children}
      {provenance}
    </div>
  ),
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => [],
  useAllEnvironmentProjectSnapshotsReady: () => true,
  useThreadShell: (ref: { environmentId: string; threadId: string } | null) =>
    [
      { id: "t", projectId: "p", environmentId: "other" },
      { id: "t-other-env", projectId: "p", environmentId: "other" },
      { id: "t-chat-project", projectId: "q", environmentId: "remote" },
      { id: "t", projectId: "p", environmentId: "remote" },
    ].find((thread) => thread.id === ref?.threadId && thread.environmentId === ref.environmentId) ??
    null,
  useThreadShells: () => [
    { id: "t", projectId: "p", environmentId: "other", title: "Colliding Browser thread" },
    { id: "t-other-env", projectId: "p", environmentId: "other", title: "Other thread" },
    { id: "t-chat-project", projectId: "q", environmentId: "remote", title: "Chat thread" },
    { id: "t", projectId: "p", environmentId: "remote", title: "Browser thread" },
  ],
}));
vi.mock("../../state/environments", () => ({
  useConnectedEnvironmentIds: () => (mocks.connected ? ["remote", "other"] : []),
}));
vi.mock("../../state/workspaceTools", () => ({
  workspaceTools: {
    config: (input: unknown) => {
      mocks.config(input);
      return "config";
    },
  },
}));
vi.mock("../../state/preview", () => ({
  previewEnvironment: {
    open: {},
    list: (input: unknown) => {
      mocks.list(input);
      return "preview";
    },
  },
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (input: unknown) => {
    const request =
      typeof input === "object" && input !== null && "environmentId" in input
        ? (input as { environmentId: string; input: { item: { projectId: string } } })
        : null;
    const key = request ? `${request.environmentId}:${request.input.item.projectId}` : "disabled";
    const linked = useSyncExternalStore(
      useCallback(
        (listener) => {
          const listeners = mocks.linkListeners.get(key) ?? new Set();
          if (request && listeners.size === 0)
            mocks.listRequests.set(key, (mocks.listRequests.get(key) ?? 0) + 1);
          mocks.linkListeners.set(key, listeners);
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        [key],
      ),
      () =>
        request
          ? (mocks.linksByEnvironment.get(request.environmentId) ?? mocks.projectLinks)
          : null,
    );
    return {
      data:
        input === "config"
          ? mocks.configLoading
            ? undefined
            : { browserThreadId: mocks.configured ? mocks.configuredThread : "missing" }
          : linked,
      error: input === "preview" ? mocks.readError : input === "config" ? mocks.configError : null,
      refresh: mocks.refresh,
    };
  },
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => mocks.open }));
vi.mock("../../previewStateStore", async (original) => ({
  ...(await original<typeof import("../../previewStateStore")>()),
  isPreviewSupportedInRuntime: () => mocks.desktop,
}));
vi.mock("../../browser/browserDefaults", () => ({
  resolveBrowserDefaults: async () => ({}),
  browserDefaultOpenViewport: () => ({ _tag: "fill" }),
  browserDefaultOpenProfileId: () => "work",
}));
vi.mock("../../localApi", async (original) => {
  const actual = await original<typeof import("../../localApi")>();
  return {
    ...actual,
    readLocalApi: () =>
      mocks.realLocalApi ? actual.createLocalApi() : { shell: { openExternal: mocks.external } },
  };
});
vi.mock("./mail/useMailLinks", () => ({
  useMailLinks: (environmentId: EnvironmentId) => ({
    linkItem: (a: WorkspaceLinkEndpoint, b: WorkspaceLinkEndpoint) => {
      mocks.linkEnvironment(environmentId);
      return mocks.link(a, b);
    },
    unlink: mocks.unlink,
  }),
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({
    workspaceTools: true,
    workspaceLinks: mocks.linksSupported,
    ready: mocks.capabilitiesReady,
  }),
}));
vi.mock("./useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => mocks.operate }));
vi.mock("./ProjectTasks", () => ({ workspaceToolsError: () => "Preview unavailable" }));
vi.mock("../preview/PreviewPanel", () => ({
  PreviewPanel: function FakePreview({
    threadRef,
    visible,
    renderChrome,
  }: ComponentProps<typeof PreviewPanel>) {
    const state = useThreadPreviewState(threadRef);
    const status = state.snapshot?.navStatus;
    const url = status && status._tag !== "Idle" ? status.url : "";
    mocks.previewMounts += 1;
    return visible ? (
      <div>
        {renderChrome?.({
          url,
          loading: status?._tag === "Loading",
          canGoBack: true,
          canGoForward: true,
          refreshDisabled: !url,
          focusUrlNonce: mocks.focusUrlNonce ?? undefined,
          onOpenInBrowser: mocks.openInBrowser,
          onBack() {},
          onForward() {},
          onRefresh() {},
          onSubmit: (url) => {
            void openPreviewSession({ openPreview: mocks.open, threadRef, url });
          },
        })}
        <section aria-label="Incumbent Browser">
          {status && status._tag !== "Idle" ? `${status.title} ${status.url}` : "No page"}
          <span>
            {state.activeTabId
              ? previewRuntimeTabId(threadRef, state.serverEpoch, state.activeTabId)
              : ""}
          </span>
        </section>
      </div>
    ) : null;
  },
}));

const environmentId = EnvironmentId.make("remote");
const threadRef = { environmentId, threadId: ThreadId.make("t") };
const selectedItem = {
  ref: { type: "project" as const, projectId: ProjectId.make("q") },
  title: "Selected chat project",
};
const props = {
  environmentId,
  projectId: ProjectId.make("p"),
  selectedItem,
  request: null,
  onOpen() {},
};
const snapshot = {
  threadId: threadRef.threadId,
  tabId: "tab-1",
  profileId: "work",
  navStatus: { _tag: "Success", url: "https://example.test/page", title: "Original page" },
  canGoBack: false,
  canGoForward: false,
  updatedAt: "2026-10-17T08:00:00.000Z",
} satisfies PreviewSessionSnapshot;
let renderer: ReactTestRenderer | undefined;
let root: Root | undefined;
let node: HTMLDivElement | undefined;
let resourceState: WorkspaceResourcesState;
const storage = { getItem: () => null, setItem() {} };
function ResourceApp({
  initialRequest = null,
  engagement = false,
  linked = false,
  onOpen = props.onOpen,
}: {
  initialRequest?: ComponentProps<typeof WorkspaceBrowser>["request"];
  engagement?: boolean;
  linked?: boolean;
  onOpen?: ComponentProps<typeof WorkspaceBrowser>["onOpen"];
}) {
  const wide = useMediaQuery("xl");
  const state = useWorkspaceResourceState(environmentId, {
    storage,
    presentation: wide ? "dock" : "sheet",
  });
  useLayoutEffect(() => {
    resourceState = state;
  }, [state]);
  const { openResource } = state;
  const openLinked = useWorkspaceItemOpener(environmentId, {
    openPage: (ref) => openResource({ tab: "browser", projectId: props.projectId, request: ref }),
  });
  useLayoutEffect(() => {
    if (initialRequest)
      openResource({ tab: "browser", projectId: props.projectId, request: initialRequest });
  }, [initialRequest, openResource]);
  const body = <WorkspaceBrowser {...props} request={state.request} onOpen={onOpen} />;
  return (
    <AppAtomRegistryProvider>
      <WorkspaceResourcesProvider value={state}>
        {linked ? (
          <LinkedSection
            environmentId={environmentId}
            item={selectedItem.ref}
            title={selectedItem.title}
            mode="context"
            onOpen={openLinked}
          />
        ) : null}
        {engagement ? (
          <WorkspaceEngagement
            environmentId={environmentId}
            space="projects"
            layout="full"
            header={{ title: "Project", environmentLabel: "Remote", spaceLabel: "Projects" }}
            resources={body}
            linkedContext={{ item: selectedItem, render: () => <p>Selected message context</p> }}
          >
            <p>Selected message</p>
            <textarea aria-label="Center draft" defaultValue="Unsent reply" />
          </WorkspaceEngagement>
        ) : state.open ? (
          body
        ) : null}
      </WorkspaceResourcesProvider>
    </AppAtomRegistryProvider>
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  resetPreviewStateForTests();
  mocks.desktop = true;
  mocks.connected = true;
  mocks.operate = true;
  mocks.configured = true;
  mocks.configuredThread = "t";
  mocks.configError = null;
  mocks.configLoading = false;
  mocks.readError = null;
  mocks.previewMounts = 0;
  mocks.linksByEnvironment.clear();
  mocks.listRequests.clear();
  mocks.focusUrlNonce = null;
  mocks.realLocalApi = false;
  mocks.linksSupported = true;
  mocks.capabilitiesReady = true;
  mocks.link.mockReset().mockResolvedValue(undefined);
  mocks.unlink.mockReset().mockResolvedValue(undefined);
  mocks.projectLinks = decodeLinkList({
    linked: [],
    suggested: [],
    truncated: false,
  });
  (
    window as unknown as {
      happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
    }
  ).happyDOM.setWindowSize({ width: 1280, height: 800 });
  mocks.open.mockResolvedValue(AsyncResult.success(snapshot));
});
afterEach(async () => {
  await act(() => renderer?.unmount());
  await act(() => root?.unmount());
  renderer = undefined;
  root = undefined;
  node?.remove();
  node = undefined;
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const mount = async (overrides: Partial<ComponentProps<typeof WorkspaceBrowser>> = {}) => {
  await act(() => {
    renderer = create(
      overrides.request ? (
        <ResourceApp initialRequest={overrides.request} />
      ) : (
        <AppAtomRegistryProvider>
          <WorkspaceBrowser {...props} {...overrides} />
        </AppAtomRegistryProvider>
      ),
    );
  });
};
const setAddress = async (value: string) =>
  act(() =>
    renderer!.root
      .findByProps({ "aria-label": "Browser page address" })
      .props.onChange({ target: { value } }),
  );
const submit = async () =>
  act(() => renderer!.root.findByType("form").props.onSubmit({ preventDefault() {} }));
const text = () => JSON.stringify(renderer!.toJSON());
const clickText = async (label: string) =>
  act(() =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children === label)!
      .props.onClick(),
  );

const editInput = (input: HTMLElement, value: string) => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(
    input,
    value,
  );
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

it.each(["scope change", "unmount"])(
  "drops a late Link rejection after %s through the keyed resource body",
  async (transition) => {
    applyPreviewServerSnapshot(threadRef, snapshot);
    applyPreviewServerSnapshot(
      { ...threadRef, environmentId: EnvironmentId.make("other") },
      snapshot,
    );
    let reject!: (cause: Error) => void;
    mocks.link.mockImplementationOnce(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    const consoleError = vi.spyOn(console, "error");
    node = document.createElement("div");
    document.body.append(node);
    root = createRoot(node);
    const render = (environment = environmentId) =>
      root!.render(
        <AppAtomRegistryProvider>
          <WorkspaceResourceBody {...props} environmentId={environment} tab="browser" />
        </AppAtomRegistryProvider>,
      );
    await act(() => render());
    await act(() => getByRole(node!, "button", { name: "Browser actions" }).click());
    await act(() => getByRole(document.body, "button", { name: "Link this page" }).click());
    if (transition === "scope change") await act(() => render(EnvironmentId.make("other")));
    else {
      await act(() => root!.unmount());
      root = undefined;
    }
    await act(() => reject(new Error("late failure")));
    if (!root) {
      root = createRoot(node);
      await act(() => render());
    }
    expect(document.body.textContent).not.toContain("late failure");
    expect(document.body.textContent).not.toContain("already being linked");
    await act(() => getByRole(node!, "button", { name: "Browser actions" }).click());
    const link = getByRole(document.body, "button", { name: "Link this page" });
    expect(link.hasAttribute("disabled")).toBe(false);
    expect(link.getAttribute("aria-disabled")).not.toBe("true");
    expect(mocks.linkEnvironment.mock.calls).toEqual([[environmentId]]);
    expect(consoleError).not.toHaveBeenCalled();
  },
);

it.each(["environment change", "project change", "unmount"])(
  "drops a late Link rejection after %s through a non-keyed Browser",
  async (transition) => {
    applyPreviewServerSnapshot(threadRef, snapshot);
    applyPreviewServerSnapshot(
      { ...threadRef, environmentId: EnvironmentId.make("other") },
      snapshot,
    );
    applyPreviewServerSnapshot(
      { ...threadRef, threadId: ThreadId.make("t-chat-project") },
      { ...snapshot, threadId: ThreadId.make("t-chat-project") },
    );
    let reject!: (cause: Error) => void;
    mocks.link.mockImplementationOnce(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    const consoleError = vi.spyOn(console, "error");
    node = document.createElement("div");
    document.body.append(node);
    root = createRoot(node);
    const render = (scope: Partial<typeof props> = {}) =>
      root!.render(
        <AppAtomRegistryProvider>
          <WorkspaceBrowser {...props} {...scope} />
        </AppAtomRegistryProvider>,
      );
    await act(() => render());
    await act(() => getByRole(node!, "button", { name: "Browser actions" }).click());
    await act(() => getByRole(document.body, "button", { name: "Link this page" }).click());
    await act(() => getByRole(node!, "button", { name: "Browser actions" }).click());
    const address = getByRole(node!, "textbox", { name: "Browser page address" });
    if (transition === "environment change")
      await act(() => render({ environmentId: EnvironmentId.make("other") }));
    else if (transition === "project change") {
      mocks.configuredThread = "t-chat-project";
      await act(() => render({ projectId: ProjectId.make("q") }));
    } else {
      await act(() => root!.unmount());
      root = undefined;
    }
    if (root) {
      expect(getByRole(node!, "textbox", { name: "Browser page address" })).not.toBe(address);
      expect(address.isConnected).toBe(false);
      expect(
        getByRole<HTMLInputElement>(node!, "textbox", { name: "Browser page address" }).disabled,
      ).toBe(false);
    }
    await act(() => reject(new Error("late failure")));
    if (!root) {
      root = createRoot(node);
      await act(() => render());
    }
    expect(document.body.textContent).not.toContain("late failure");
    expect(document.body.textContent).not.toContain("already being linked");
    await act(() => getByRole(node!, "button", { name: "Browser actions" }).click());
    const link = getByRole(document.body, "button", { name: "Link this page" });
    expect(link.hasAttribute("disabled")).toBe(false);
    expect(link.getAttribute("aria-disabled")).not.toBe("true");
    expect(mocks.linkEnvironment.mock.calls).toEqual([[environmentId]]);
    expect(consoleError).not.toHaveBeenCalled();
  },
);

it.each(["", "   "])("shows the linked-page fallback for a blank saved title %j", async (title) => {
  mocks.projectLinks = decodeLinkList({
    linked: [
      {
        id: "wl_00000000-0000-0000-0000-000000000001",
        item: { ref: { type: "url", url: "https://example.test/saved" }, title },
        status: "confirmed",
        source: { type: "user" },
        updatedAt: "2026-10-17T08:00:00.000Z",
      },
    ],
    suggested: [],
    truncated: false,
  });
  applyPreviewServerSnapshot(threadRef, snapshot);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() =>
    root!.render(
      <AppAtomRegistryProvider>
        <WorkspaceBrowser {...props} />
      </AppAtomRegistryProvider>,
    ),
  );
  const input = getByRole(node, "textbox", { name: "Browser page address" });
  await act(() => editInput(input, "saved"));
  await act(() =>
    input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  const results = getByRole(node, "region", { name: "Linked pages" });
  const row = getByRole(results, "button", { name: "Linked page: https://example.test/saved" });
  expect(row.textContent).toBe("Linked pagehttps://example.test/saved");
  expect(getByRole(results, "button", { name: "Open Linked page" })).toBeDefined();
});

it("admits only one Link before the pending state can render", async () => {
  mocks.desktop = false;
  let finish!: () => void;
  mocks.link.mockImplementation(
    () =>
      new Promise<void>((done) => {
        finish = done;
      }),
  );
  await mount();
  await setAddress("https://example.test/page");
  const button = renderer!.root
    .findAllByType("button")
    .find((button) => button.props.children === "Link this page")!;
  const click = button.props.onClick;
  await act(() => {
    click();
    click();
  });
  expect(mocks.link).toHaveBeenCalledOnce();
  expect(button.props["aria-disabled"]).toBe(true);
  expect(text()).toContain("This page is already being linked.");
  await act(() => finish());
});

it("closes only results on Escape inside the 390px Resources sheet", async () => {
  (
    window as unknown as {
      happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
    }
  ).happyDOM.setWindowSize({ width: 390, height: 844 });
  applyPreviewServerSnapshot(threadRef, snapshot);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() => root!.render(<ResourceApp engagement />));
  await act(() => getByRole(node!, "button", { name: "Resources" }).click());
  const sheet = getByRole(document.body, "dialog", { name: "Resources" });
  const input = getByRole(sheet, "textbox", { name: "Browser page address" });
  await act(() => {
    input.focus();
    editInput(input, "Q3: roadmap");
  });
  await act(() =>
    input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  const results = getByRole(document.body, "region", { name: "Linked pages" });
  expect(sheet.contains(results)).toBe(true);
  expect(results.parentElement?.contains(input)).toBe(true);
  await act(() =>
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );
  expect(queryByRole(document.body, "region", { name: "Linked pages" })).toBeNull();
  expect(getByRole(document.body, "dialog", { name: "Resources" })).toBe(sheet);
  expect(document.activeElement).toBe(input);
});

it("keeps a truthful reason when a menu opened during loading reaches Success", async () => {
  applyPreviewServerSnapshot(threadRef, {
    ...snapshot,
    navStatus: { ...snapshot.navStatus, _tag: "Loading" },
  });
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() =>
    root!.render(
      <AppAtomRegistryProvider>
        <WorkspaceBrowser {...props} />
      </AppAtomRegistryProvider>,
    ),
  );
  await act(() => getByRole(node!, "button", { name: "Browser actions" }).click());
  await act(() => applyPreviewServerSnapshot(threadRef, snapshot));
  const menu = getByRole(document.body, "dialog", { name: "Browser actions" });
  expect(menu.textContent).toContain("Reopen this menu to link the loaded page.");
  expect(menu.textContent).not.toContain("Enter an http or https address before linking.");
});

it("shows loading instead of choosing a thread while Browser config is pending", async () => {
  mocks.configLoading = true;
  await mount({ request: { type: "url", url: "https://example.test/page" } });
  expect(text()).toContain("Loading Browser settings...");
  expect(text()).not.toContain("Choose an available Browser thread");
});

it.each([false, true])(
  "keeps canonical result menus, provenance and guarded Unlink with failure=%s",
  async (failure) => {
    mocks.desktop = false;
    const id = "wl_00000000-0000-0000-0000-000000000001";
    mocks.projectLinks = decodeLinkList({
      linked: [
        {
          id,
          item: {
            ref: { type: "url", url: "https://example.test/handbook?utm_source=demo#intro" },
            title: "Project handbook",
          },
          status: "confirmed",
          source: { type: "user" },
          updatedAt: "2026-10-13T09:00:00.000Z",
        },
      ],
      suggested: [],
      truncated: false,
    });
    let finish!: () => void;
    let reject!: (cause: Error) => void;
    mocks.unlink.mockImplementation(
      () =>
        new Promise<void>((done, fail) => {
          finish = done;
          reject = fail;
        }),
    );
    await mount();
    await setAddress("handbook");
    await submit();
    const row = renderer!.root.findByProps({
      "data-page-menu": JSON.stringify({
        item: {
          ref: { type: "url", url: "https://example.test/handbook" },
          title: "Project handbook",
        },
        environmentId,
      }),
    });
    expect(row.findAllByType("p").map((p) => p.props.children)).toContain("Linked by you");
    const click = row.findAllByType("button").find((b) => b.props.children === "Unlink")!
      .props.onClick;
    await act(() => {
      click();
      click();
    });
    expect(mocks.unlink).toHaveBeenCalledExactlyOnceWith(id);
    await act(() => (failure ? reject(new Error("Unlink failed")) : finish()));
    if (failure) expect(text()).toContain("Unlink failed");
    else expect(text()).not.toContain("could not be unlinked");
  },
);

it.each([false, true])("searches direct pages and opens results in desktop=%s", async (desktop) => {
  mocks.desktop = desktop;
  if (desktop) applyPreviewServerSnapshot(threadRef, snapshot);
  mocks.projectLinks = decodeLinkList({
    linked: [
      {
        id: "wl_00000000-0000-0000-0000-000000000001",
        item: {
          ref: { type: "url", url: "https://example.test/handbook?utm_source=demo#intro" },
          title: "Project handbook",
        },
        status: "confirmed",
        source: { type: "user" },
        updatedAt: "2026-10-13T09:00:00.000Z",
      },
    ],
    suggested: [],
    truncated: true,
  });
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() =>
    root!.render(
      <AppAtomRegistryProvider>
        <WorkspaceBrowser {...props} />
      </AppAtomRegistryProvider>,
    ),
  );
  const input = getByRole(node, "textbox", { name: "Browser page address" });
  expect(mocks.linkQueries).not.toHaveBeenCalled();
  await act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, "HANDBOOK");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(() =>
    input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  const results = getByRole(document.body, "region", { name: "Linked pages" });
  expect(getByRole(results, "list").textContent).toContain("Project handbook");
  expect(results.textContent).toContain("Only loaded linked pages are searched.");
  expect(mocks.linkQueries).toHaveBeenLastCalledWith({
    environmentId,
    input: { item: { type: "project", projectId: props.projectId } },
  });
  expect(mocks.external).not.toHaveBeenCalled();
  expect(mocks.open).not.toHaveBeenCalled();
  await act(() => getByRole(results, "button", { name: "Open Project handbook" }).click());
  if (desktop)
    expect(mocks.open).toHaveBeenCalledExactlyOnceWith({
      environmentId,
      input: {
        threadId: "t",
        url: "https://example.test/handbook?utm_source=demo#intro",
        profileId: "work",
        viewport: { _tag: "fill" },
      },
    });
  else
    expect(mocks.external).toHaveBeenCalledExactlyOnceWith(
      "https://example.test/handbook?utm_source=demo#intro",
    );
  expect(queryByRole(document.body, "region", { name: "Linked pages" })).toBeNull();
});

it("links the captured page to the captured target after navigation", async () => {
  applyPreviewServerSnapshot(threadRef, snapshot);
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  mocks.link.mockImplementationOnce(() => pending);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  const render = (overrides: Partial<ComponentProps<typeof WorkspaceBrowser>> = {}) =>
    root!.render(
      <AppAtomRegistryProvider>
        <WorkspaceResourceBody {...props} {...overrides} tab="browser" />
      </AppAtomRegistryProvider>,
    );
  await act(() => render());
  await act(() => getByRole(node!, "button", { name: "Browser actions" }).click());
  await act(() => {
    const link = getByRole(document.body, "button", { name: "Link this page" });
    link.focus();
    link.click();
  });
  expect(mocks.link.mock.calls[0]).toEqual([
    selectedItem,
    { ref: { type: "url", url: "https://example.test/page" }, title: "Original page" },
  ]);
  const link = getByRole(document.body, "button", { name: "Link this page" });
  expect(link.hasAttribute("disabled")).toBe(false);
  expect(link.getAttribute("aria-disabled")).toBe("true");
  expect(document.activeElement).toBe(link);
  expect(document.body.textContent).toContain("This page is already being linked.");
  await act(() => {
    applyPreviewServerSnapshot(threadRef, {
      ...snapshot,
      navStatus: { _tag: "Success", url: "https://changed.test/", title: "Changed page" },
    });
    render({ selectedItem: { ...selectedItem, title: "Another target" } });
  });
  await act(() =>
    applyPreviewServerSnapshot(
      { environmentId: EnvironmentId.make("other"), threadId: threadRef.threadId },
      {
        ...snapshot,
        navStatus: {
          _tag: "Success",
          url: "https://other.test/",
          title: "Same IDs in another environment",
        },
      },
    ),
  );
  await act(() =>
    render({
      environmentId: EnvironmentId.make("other"),
      selectedItem: { ...selectedItem, title: "Colliding target" },
    }),
  );
  await act(() => finish());
  expect(mocks.link.mock.calls).toEqual([
    [
      selectedItem,
      { ref: { type: "url", url: "https://example.test/page" }, title: "Original page" },
    ],
  ]);
  expect(mocks.linkEnvironment.mock.calls).toEqual([[environmentId]]);
  expect(mocks.link).toHaveBeenCalledOnce();
});

it.each(["Loading", "LoadFailed"] as const)("disables Link with a named %s reason", async (tag) => {
  applyPreviewServerSnapshot(threadRef, {
    ...snapshot,
    navStatus: {
      ...snapshot.navStatus,
      _tag: tag,
      description: "Failed",
      code: -1,
    },
  });
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() =>
    root!.render(
      <AppAtomRegistryProvider>
        <WorkspaceBrowser {...props} />
      </AppAtomRegistryProvider>,
    ),
  );
  await act(() => getByRole(node!, "button", { name: "Browser actions" }).click());
  expect(
    getByRole(document.body, "button", { name: "Link this page" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(document.body.textContent).toContain(
    tag === "Loading"
      ? "Wait for this page to finish loading before linking."
      : "This page failed to load. Reload it before linking.",
  );
});

it("opens a real Linked row into the existing scoped Browser and exposes a gated address", async () => {
  mocks.operate = false;
  const raw = "https://example.test/handbook?id=7&utm_source=demo#intro";
  mocks.projectLinks = decodeLinkList({
    linked: [
      {
        id: "wl_00000000-0000-0000-0000-000000000001",
        item: { ref: { type: "url", url: raw }, title: "Project handbook" },
        status: "confirmed",
        source: { type: "user" },
        updatedAt: "2026-10-13T09:00:00.000Z",
      },
    ],
    suggested: [],
    truncated: false,
  });
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() => root!.render(<ResourceApp linked />));
  await act(() => getByRole(node!, "button", { name: "url: Project handbook" }).click());
  expect(resourceState.request).toEqual({ type: "url", url: raw });
  expect(
    (getByRole(node!, "textbox", { name: "Browser page address" }) as HTMLInputElement).value,
  ).toBe(raw);
  expect(mocks.open).not.toHaveBeenCalled();
  expect(mocks.external).not.toHaveBeenCalled();
  await act(() => getByRole(node!, "button", { name: "Open in new tab" }).click());
  expect(mocks.external).toHaveBeenCalledExactlyOnceWith(raw);
  mocks.operate = true;
  await act(() => root!.render(<ResourceApp linked onOpen={() => {}} />));
  expect(resourceState.request).toBeNull();
  expect(mocks.open).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: { threadId: "t", url: raw, profileId: "work", viewport: { _tag: "fill" } },
  });
});

it("freezes the page menu and target until close after navigation and selection change", async () => {
  applyPreviewServerSnapshot(threadRef, snapshot);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  const render = (title: string) =>
    root!.render(
      <AppAtomRegistryProvider>
        <WorkspaceBrowser {...props} selectedItem={{ ...selectedItem, title }} />
      </AppAtomRegistryProvider>,
    );
  await act(() => render("Original target"));
  await act(() => getByRole(node!, "button", { name: "Browser actions" }).click());
  await act(() => {
    render("Later target");
    applyPreviewServerSnapshot(threadRef, {
      ...snapshot,
      navStatus: { _tag: "Success", url: "https://later.test/", title: "Later page" },
    });
  });
  expect(getByRole(document.body, "dialog", { name: "Browser actions" }).textContent).toContain(
    "Link to Original target",
  );
  expect(mocks.actionItems).toHaveBeenLastCalledWith({
    environmentId,
    layout: "menu",
    item: { ref: { type: "url", url: snapshot.navStatus.url }, title: "Original page" },
  });
  await act(() => getByRole(document.body, "button", { name: "Link this page" }).click());
  expect(mocks.link).toHaveBeenLastCalledWith(
    { ...selectedItem, title: "Original target" },
    { ref: { type: "url", url: snapshot.navStatus.url }, title: "Original page" },
  );
  await act(() =>
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );
  await act(() => getByRole(node!, "button", { name: "Browser actions" }).click());
  expect(getByRole(document.body, "dialog", { name: "Browser actions" }).textContent).toContain(
    "Link to Later target",
  );
  expect(mocks.actionItems).toHaveBeenLastCalledWith({
    environmentId,
    layout: "menu",
    item: { ref: { type: "url", url: "https://later.test/" }, title: "Later page" },
  });
});

it("clears an empty search and reports no matches without opening a page", async () => {
  mocks.desktop = false;
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() =>
    root!.render(
      <AppAtomRegistryProvider>
        <WorkspaceBrowser {...props} />
      </AppAtomRegistryProvider>,
    ),
  );
  const input = getByRole(node, "textbox", { name: "Browser page address" });
  const edit = (value: string) => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!.call(
      input,
      value,
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };
  await act(() => edit("No matching pages"));
  await act(() =>
    input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(getByRole(document.body, "region", { name: "Linked pages" }).textContent).toContain(
    "No linked pages match. Paste an http or https address to open a page.",
  );
  await act(() => edit(""));
  await act(() =>
    input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(queryByRole(document.body, "region", { name: "Linked pages" })).toBeNull();
  expect(queryByRole(document.body, "alert")).toBeNull();
  expect(mocks.external).not.toHaveBeenCalled();
  expect(mocks.open).not.toHaveBeenCalled();
});

it("opens a directly entered native URL with its query and fragment intact", async () => {
  applyPreviewServerSnapshot(threadRef, snapshot);
  await mount();
  await setAddress(" https://example.test/page?id=7&utm_source=demo#intro ");
  await submit();
  expect(mocks.open.mock.calls[0]![0].input.url).toBe(
    "https://example.test/page?id=7&utm_source=demo#intro",
  );
});

it("keeps the pasted link target when external opening is blocked", async () => {
  mocks.desktop = false;
  mocks.external.mockResolvedValue(undefined);
  await mount();
  const address = "https://example.test/pasted?id=7&utm_source=x#/settings";
  await setAddress(address);
  await clickText("Open in new tab");
  expect(text()).toContain("Open this page in your browser");
  expect(text()).toContain("Link target");
  expect(text()).toContain("https://example.test/pasted");
  expect(text()).toContain("If no tab opened, allow pop-ups and try again, or copy this address.");
  expect(text()).not.toContain("Page opened successfully");
  expect(renderer!.root.findAllByType("iframe")).toHaveLength(0);
  expect(
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children === "Open in new tab")!.props.disabled,
  ).toBe(false);
  expect(mocks.external).toHaveBeenCalledExactlyOnceWith(address);
});

it("prefills and acknowledges web requests without opening an external tab automatically", async () => {
  mocks.desktop = false;
  await mount({ request: { type: "url", url: "https://example.test/requested" } });
  expect(renderer!.root.findByType("input").props.value).toBe("https://example.test/requested");
  expect(resourceState.request).toBeNull();
  expect(mocks.external).not.toHaveBeenCalled();
  await act(() =>
    resourceState.openResource({
      tab: "browser",
      projectId: props.projectId,
      request: { type: "url", url: "https://example.test/newest" },
    }),
  );
  expect(renderer!.root.findByType("input").props.value).toBe("https://example.test/newest");
  expect(resourceState.request).toBeNull();
  await act(() => resourceState.close());
  await act(() => resourceState.reopen());
  expect(renderer!.root.findByType("input").props.value).toBe("https://example.test/newest");
});

it("seeds the first requested page before the lazy chrome mounts", async () => {
  const request = { type: "url" as const, url: snapshot.navStatus.url };
  await mount({ request });
  expect(renderer!.root.findByType("input").props.value).toBe(request.url);
});

it("prefills an unsupported desktop's external alternative and acknowledges it without navigating", async () => {
  mocks.readError = "Preview is not supported on this server";
  await mount({ request: { type: "url", url: "https://example.test/fallback" } });
  expect(renderer!.root.findByType("input").props.value).toBe("https://example.test/fallback");
  expect(text()).toContain("External-tab Browser");
  expect(resourceState.request).toBeNull();
  expect(mocks.open).not.toHaveBeenCalled();
  expect(mocks.external).not.toHaveBeenCalled();
  await clickText("Open in new tab");
  expect(mocks.external).toHaveBeenCalledExactlyOnceWith("https://example.test/fallback");
});

it("resets the address for another project or environment with the same project id", async () => {
  mocks.desktop = false;
  function ScopedBrowser({
    environment,
    project,
  }: {
    environment: EnvironmentId;
    project: ProjectId;
  }) {
    const state = useWorkspaceResourceState(environment, { storage });
    return (
      <WorkspaceResourcesProvider value={state}>
        <WorkspaceBrowser
          key={`${environment}:${project}`}
          {...props}
          environmentId={environment}
          projectId={project}
        />
      </WorkspaceResourcesProvider>
    );
  }
  const render = (environment = environmentId, project = props.projectId) => (
    <AppAtomRegistryProvider>
      <ScopedBrowser environment={environment} project={project} />
    </AppAtomRegistryProvider>
  );
  await act(() => {
    renderer = create(render());
  });
  await setAddress("https://example.test/private");
  await act(() => renderer!.update(render(environmentId, ProjectId.make("q"))));
  expect(renderer!.root.findByType("input").props.value).toBe("");
  await setAddress("https://example.test/other-project");
  await act(() => renderer!.update(render(EnvironmentId.make("other"), ProjectId.make("q"))));
  expect(renderer!.root.findByType("input").props.value).toBe("");
  await act(() => renderer!.update(render()));
  expect(renderer!.root.findByType("input").props.value).toBe("https://example.test/private");
});

it.each(["disconnected", "reader", "missing-thread"])(
  "opens only the latest pending request after a desktop %s gate clears",
  async (reason) => {
    mocks.connected = reason !== "disconnected";
    mocks.operate = reason !== "reader";
    mocks.configured = reason !== "missing-thread";
    await act(() => {
      renderer = create(<ResourceApp />);
    });
    // Every request is sent while the gate is closed, including the newest one.
    await act(() =>
      resourceState.openResource({
        tab: "browser",
        projectId: props.projectId,
        request: { type: "url", url: "https://example.test/first" },
      }),
    );
    for (const path of ["second", "latest"])
      await act(() =>
        resourceState.openResource({
          tab: "browser",
          projectId: props.projectId,
          request: { type: "url", url: `https://example.test/${path}` },
        }),
      );
    expect(mocks.open).not.toHaveBeenCalled();
    expect(resourceState.request).toEqual({ type: "url", url: "https://example.test/latest" });
    mocks.connected = true;
    mocks.operate = true;
    mocks.configured = true;
    await act(() =>
      // Mock hook values do not notify consumers, so invalidate the Browser's compiled JSX cache.
      renderer!.update(<ResourceApp onOpen={() => {}} />),
    );
    expect(resourceState.request).toBeNull();
    expect(mocks.open).toHaveBeenCalledOnce();
    expect(mocks.open).toHaveBeenLastCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ url: "https://example.test/latest" }),
      }),
    );
  },
);

it("opens an immediately admissible request exactly once under StrictMode", async () => {
  await mount({ request: { type: "url", url: snapshot.navStatus.url } });
  await act(() => renderer!.unmount());
  mocks.open.mockClear();
  const request = { type: "url" as const, url: "https://example.test/strict" };
  await act(() => {
    renderer = create(
      <StrictMode>
        <AppAtomRegistryProvider>
          <WorkspaceResourcesProvider value={resourceState}>
            <WorkspaceBrowser {...props} request={request} />
          </WorkspaceResourcesProvider>
        </AppAtomRegistryProvider>
      </StrictMode>,
    );
  });
  expect(mocks.open).toHaveBeenCalledOnce();
  expect(renderer!.root.findByType("input").props.value).toBe(request.url);
});

it("retains a draft through linked-context hiding and preview-read error remounts", async () => {
  const render = (hidden = false) => (
    <AppAtomRegistryProvider>
      <WorkspaceResourcesBodyContext value={{ hidden, restoreFocus() {} }}>
        <WorkspaceBrowser {...props} />
      </WorkspaceResourcesBodyContext>
    </AppAtomRegistryProvider>
  );
  await act(() => {
    renderer = create(render());
  });
  await setAddress("https://example.test/half-typed");
  await act(() => renderer!.update(render(true)));
  await act(() => renderer!.update(render()));
  expect(renderer!.root.findByType("input").props.value).toBe("https://example.test/half-typed");
  mocks.readError = "Preview unavailable";
  await act(() => renderer!.update(render()));
  expect(renderer!.root.findByType("input").props.value).toBe("https://example.test/half-typed");
  mocks.readError = null;
  await act(() => renderer!.update(render()));
  expect(renderer!.root.findByType("input").props.value).toBe("https://example.test/half-typed");
});

it.each(["javascript:alert(1)", "file:///secret", `https://example.test/${"x".repeat(2048)}`])(
  "rejects unsafe addresses: %s",
  async (address) => {
    mocks.desktop = false;
    await mount();
    await setAddress(address);
    await submit();
    expect(mocks.external).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
    expect(text()).toContain("Enter an http or https address.");
  },
);

it("pasting a new address replaces only the external link target", async () => {
  mocks.desktop = false;
  applyPreviewServerSnapshot(threadRef, snapshot);
  await mount();
  await setAddress("https://example.test/first");
  await clickText("Open in new tab");
  await setAddress("https://example.test/next?id=7&utm_source=x#a");
  const card = renderer!.root.findByType("section");
  expect(card.findByType("dd").props.children).toBe("https://example.test/next?id=7");
  await clickText("Link this page");
  expect(mocks.external).toHaveBeenCalledExactlyOnceWith("https://example.test/first");
  expect(mocks.link).toHaveBeenCalledExactlyOnceWith(selectedItem, {
    ref: { type: "url", url: "https://example.test/next?id=7" },
    title: "https://example.test/next?id=7",
  });
  expect(readThreadPreviewState(threadRef).snapshot).toEqual(snapshot);
  expect(mocks.previewMounts).toBe(0);
});

it("keeps a rejected external address editable and retries it", async () => {
  mocks.desktop = false;
  mocks.external.mockRejectedValueOnce(new Error("Unable to open link."));
  await mount();
  await setAddress("https://example.test/retry");
  await clickText("Open in new tab");
  expect(text()).toContain("Unable to open link.");
  expect(renderer!.root.findByType("input").props.value).toBe("https://example.test/retry");
  await clickText("Open in new tab");
  expect(mocks.external).toHaveBeenCalledTimes(2);
  expect(renderer!.root.findAllByProps({ role: "alert" })).toHaveLength(0);
});

it("clears a failed-open alert when the address changes", async () => {
  mocks.desktop = false;
  mocks.external.mockRejectedValueOnce(new Error("Unable to open link."));
  await mount();
  await setAddress("https://example.test/failed");
  await clickText("Open in new tab");
  expect(text()).toContain("Unable to open link.");
  await setAddress("https://example.test/edited");
  expect(renderer!.root.findAllByProps({ role: "alert" })).toHaveLength(0);
});

it("lets the external card grow without an inner scroll fold", async () => {
  mocks.desktop = false;
  await mount({ selectedItem: null });
  await setAddress(`https://example.test/${"long-address/".repeat(30)}?utm_source=x#a`);
  // happy-dom cannot measure clipping. Captures must also check scrollHeight <= clientHeight.
  const card = renderer!.root.findByProps({ "aria-label": "External-tab Browser" });
  const classes = String(card.props.className).split(/\s+/);
  expect(classes).toContain("min-h-[311px]");
  expect(classes.some((name) => /^(?:.*:)?h-/.test(name))).toBe(false);
  expect(classes).not.toContain("overflow-y-auto");
  expect(classes).not.toContain("overflow-hidden");
  expect(card.findAllByType("button").map((button) => button.props.children)).toContain(
    "Link this page",
  );
  expect(card.findAllByType("p").map((paragraph) => paragraph.props.children)).toContain(
    "If no tab opened, allow pop-ups and try again, or copy this address.",
  );
});

it("explains a divergent Link target only when tracking parameters or fragments were removed", async () => {
  mocks.desktop = false;
  await mount();
  const hint = "Tracking parameters and #fragments are left out of the link.";
  await setAddress("https://example.test/page");
  expect(text()).not.toContain(hint);
  await setAddress("https://example.test/page?id=7&utm_source=x#a");
  expect(text()).toContain(hint);
  await setAddress("https://example.test/page?id=7");
  expect(text()).not.toContain(hint);
  await setAddress("https://example.test");
  expect(text()).not.toContain(hint);
  await setAddress("HTTPS://EXAMPLE.TEST/page?id=7");
  expect(text()).not.toContain(hint);
  await setAddress("https://example.test/page?id=7&%55TM_source=x");
  expect(text()).toContain(hint);
  await setAddress("https://example.test/page?id=7#/settings");
  expect(text()).toContain(hint);
});

it("checks capabilities before describing linking as unsupported", async () => {
  mocks.desktop = false;
  mocks.capabilitiesReady = false;
  mocks.linksSupported = false;
  await mount();
  await setAddress("https://example.test/page");
  expect(text()).toContain("Checking whether this server supports linking.");
  expect(text()).not.toContain("This server does not support linking yet.");
  await clickText("Link this page");
  expect(mocks.link).not.toHaveBeenCalled();
  mocks.capabilitiesReady = true;
  mocks.linksSupported = true;
  await act(() =>
    renderer!.update(
      <AppAtomRegistryProvider>
        <WorkspaceBrowser {...props} onOpen={() => {}} />
      </AppAtomRegistryProvider>,
    ),
  );
  expect(text()).not.toContain("Checking whether this server supports linking.");
  await clickText("Link this page");
  expect(mocks.link).toHaveBeenCalledOnce();
});

it("explains the disabled desktop Link when no item is selected", async () => {
  applyPreviewServerSnapshot(threadRef, snapshot);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() =>
    root!.render(
      <AppAtomRegistryProvider>
        <WorkspaceBrowser {...props} selectedItem={null} />
      </AppAtomRegistryProvider>,
    ),
  );
  await act(() => getByRole(node!, "button", { name: "Browser actions" }).click());
  const link = getByRole(document.body, "button", { name: "Link this page" });
  expect(link).toHaveProperty("disabled", true);
  expect(link.nextElementSibling?.textContent).toBe("Select an item to link this page to.");
  expect(document.body.textContent?.match(/Select an item to link this page to\./g)).toHaveLength(
    1,
  );
});

it("explains unsupported linking on an older desktop server without an impossible retry", async () => {
  mocks.readError = "Preview is not supported on this server";
  mocks.linksSupported = false;
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() =>
    root!.render(
      <AppAtomRegistryProvider>
        <WorkspaceBrowser {...props} />
      </AppAtomRegistryProvider>,
    ),
  );
  const card = getByRole(node, "region", { name: "External-tab Browser" });
  expect(card.textContent).toContain("This server does not support linking yet.");
  expect(card.textContent).not.toContain("Retry before linking");
  expect(getByRole(card, "button", { name: "Link this page" })).toHaveProperty("disabled", true);
  await act(() => getByRole(node!, "button", { name: "Browser actions" }).click());
  expect(queryByRole(document.body, "button", { name: "Retry" })).toBeNull();
});

it("links the pasted address when desktop preview reads fail but linking is supported", async () => {
  mocks.readError = "Preview is not supported on this server";
  applyPreviewServerSnapshot(threadRef, snapshot);
  await mount();
  await setAddress("https://example.test/fallback?id=7&utm_source=x#a");
  await clickText("Link this page");
  expect(mocks.link).toHaveBeenCalledExactlyOnceWith(selectedItem, {
    ref: { type: "url", url: "https://example.test/fallback?id=7" },
    title: "https://example.test/fallback?id=7",
  });
});

it("returns focus to Browser actions after Escape in the standard 390px sheet", async () => {
  (
    window as unknown as {
      happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
    }
  ).happyDOM.setWindowSize({ width: 390, height: 844 });
  applyPreviewServerSnapshot(threadRef, snapshot);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() => root!.render(<ResourceApp engagement />));
  await act(() => getByRole(node!, "button", { name: "Resources" }).click());
  const dialog = getByRole(document.body, "dialog", { name: "Resources" });
  const trigger = getByRole(dialog, "button", { name: "Browser actions" });
  await act(() => {
    trigger.focus();
    trigger.click();
  });
  const action = getByRole(document.body, "button", { name: "Open in new tab" });
  await act(() => {
    action.focus();
    action.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(document.activeElement).toBe(trigger);
  expect(trigger.getAttribute("aria-label")).toBe("Browser actions");
  expect(queryByRole(document.body, "button", { name: "Open in new tab" })).toBeNull();
});

it.each([
  ["reader", "Permission to operate this environment is required to link this page."],
  ["disconnected", "Reconnect to link this page."],
  ["older-server", "This server does not support linking yet."],
])("explains the disabled Link action for %s", async (reason, hint) => {
  mocks.desktop = false;
  mocks.operate = reason !== "reader";
  mocks.connected = reason !== "disconnected";
  mocks.linksSupported = reason !== "older-server";
  await mount();
  await setAddress("https://example.test/page");
  const card = renderer!.root.findByType("section");
  expect(card.findAllByType("p").map((p) => p.props.children)).toContain(hint);
  expect(
    card.findAllByType("button").find((button) => button.props.children === "Link this page")!.props
      .disabled,
  ).toBe(true);
  await clickText("Link this page");
  expect(mocks.link).not.toHaveBeenCalled();
  await clickText("Open in new tab");
  expect(mocks.external).toHaveBeenCalledExactlyOnceWith("https://example.test/page");
});

it("keeps the no-selection hint inside the external card", async () => {
  mocks.desktop = false;
  await mount({ selectedItem: null });
  expect(
    renderer!.root
      .findByType("section")
      .findAllByType("p")
      .map((p) => p.props.children),
  ).toContain("Select an item to link this page to.");
});

it.each(["address", "Open"])(
  "keeps focus on %s throughout a pending external open",
  async (focused) => {
    mocks.desktop = false;
    let finish = () => {};
    mocks.external.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    node = document.createElement("div");
    document.body.append(node);
    root = createRoot(node);
    await act(() =>
      root!.render(
        <ResourceApp
          initialRequest={{ type: "url", url: "https://example.test/focus#/settings" }}
        />,
      ),
    );
    const input = getByRole<HTMLInputElement>(node, "textbox", { name: "Browser page address" });
    const card = getByRole(node, "region", { name: "External-tab Browser" });
    const open = getByRole<HTMLButtonElement>(card, "button", { name: "Open in new tab" });
    const control = focused === "address" ? input : open;
    const invoke = () =>
      focused === "address"
        ? input
            .closest("form")!
            .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
        : open.click();
    await act(() => {
      control.focus();
      invoke();
    });
    expect(document.activeElement).toBe(control);
    expect(control.disabled).toBe(false);
    expect(input.readOnly).toBe(true);
    expect(open.getAttribute("aria-disabled")).toBe("true");
    await act(() => invoke());
    expect(mocks.external).toHaveBeenCalledOnce();
    await act(() => finish());
    expect(document.activeElement).toBe(control);
    expect(input.readOnly).toBe(false);
  },
);

it("announces Copied briefly and clears its reset timer when hidden", async () => {
  vi.useFakeTimers();
  mocks.desktop = false;
  vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
  await act(() => {
    renderer = create(<ResourceApp />);
  });
  await setAddress("https://example.test/copy#a");
  await clickText("Copy address");
  expect(text()).toContain("Copied");
  await act(() => vi.advanceTimersByTime(2000));
  expect(text()).not.toContain("Copied");
  await clickText("Copy address");
  expect(vi.getTimerCount()).toBe(1);
  await act(() => resourceState.close());
  expect(vi.getTimerCount()).toBe(0);
});

it("matches the external fixture's hints and copy feedback to the production card", async () => {
  vi.useFakeTimers();
  const session = createWorkspaceMockupSession("05", null, null, "external");
  const module = createWorkspaceMockupModule(session);
  try {
    await act(() => {
      renderer = create(<>{module.resource}</>);
    });
    const hint = "Select an item to link this page to.";
    expect(
      renderer!.root
        .findByType("section")
        .findAllByType("p")
        .map((p) => p.props.children),
    ).toContain(hint);
    const address = "https://example.test/fixture?id=7&utm_source=x#/settings";
    await setAddress(address);
    expect(renderer!.root.findByType("dd").props.children).toBe(
      "https://example.test/fixture?id=7",
    );
    expect(text()).toContain("Tracking parameters and #fragments are left out of the link.");
    await clickText("Copy address");
    expect(text()).toContain("Copied");
    await clickText("Open in new tab");
    await module.settled();
    expect(session.operations.map((operation) => operation.value)).toEqual([address, address]);
    expect(mocks.external).not.toHaveBeenCalled();
    expect(mocks.link).not.toHaveBeenCalled();
    await act(() => renderer!.unmount());
    renderer = undefined;
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    module.dispose();
    session.dispose();
  }
});

it("offers Copy address through the existing clipboard path and retains copy failures", async () => {
  mocks.desktop = false;
  const copy = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockRejectedValueOnce(new Error("denied"))
    .mockResolvedValue(undefined);
  await mount();
  await setAddress("https://example.test/copy?utm_source=test#section");
  await clickText("Copy address");
  expect(text()).toContain("Failed to copy page address to the clipboard.");
  await clickText("Copy address");
  expect(copy).toHaveBeenLastCalledWith("https://example.test/copy?utm_source=test#section");
  expect(text()).toContain("Copied");
  expect(renderer!.root.findByType("input").props.value).toBe(
    "https://example.test/copy?utm_source=test#section",
  );
  expect(mocks.external).not.toHaveBeenCalled();
});

it("keeps retry and focus usable when the real browser helper returns an unknown popup outcome", async () => {
  mocks.desktop = false;
  mocks.realLocalApi = true;
  const open = vi.spyOn(window, "open").mockReturnValue(null);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() =>
    root!.render(
      <ResourceApp initialRequest={{ type: "url", url: "https://example.test/popup" }} />,
    ),
  );
  const input = getByRole<HTMLInputElement>(node, "textbox", { name: "Browser page address" });
  const card = getByRole(node, "region", { name: "External-tab Browser" });
  await act(() => getByRole(card, "button", { name: "Open in new tab" }).click());
  expect(open).toHaveBeenCalledExactlyOnceWith(
    "https://example.test/popup",
    "_blank",
    "noopener,noreferrer",
  );
  expect(card.textContent).toContain(
    "If no tab opened, allow pop-ups and try again, or copy this address.",
  );
  expect(queryByRole(node, "alert")).toBeNull();
  expect(node.textContent).not.toContain("Page opened successfully");
  expect(input.value).toBe("https://example.test/popup");
  await act(() => {
    input.focus();
    input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(open).toHaveBeenCalledTimes(2);
  expect(document.activeElement).toBe(input);
  expect(node.querySelector("iframe")).toBeNull();
});

it.each([
  [390, 844],
  [1024, 800],
])(
  "retains the external address, center draft and focus through the %ix%i Resources journey",
  async (width, height) => {
    mocks.desktop = false;
    const dom = (
      window as unknown as {
        happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
      }
    ).happyDOM;
    dom.setWindowSize({ width, height });
    node = document.createElement("div");
    document.body.append(node);
    root = createRoot(node);
    await act(() => root!.render(<ResourceApp engagement />));
    const trigger = getByRole<HTMLButtonElement>(node, "button", { name: "Resources" });
    await act(() => {
      trigger.focus();
      trigger.click();
    });
    const longUrl = `https://example.test/${"long-address/".repeat(30)}`;
    await act(() =>
      resourceState.openResource({
        tab: "browser",
        projectId: props.projectId,
        request: { type: "url", url: longUrl },
      }),
    );
    let dialog = getByRole(document.body, "dialog", { name: "Resources" });
    expect(getByRole(dialog, "textbox", { name: "Browser page address" })).toHaveProperty(
      "value",
      longUrl,
    );
    expect(getByRole(dialog, "region", { name: "External-tab Browser" }).textContent).toContain(
      longUrl,
    );
    const menu = getByRole(dialog, "button", { name: "Browser actions" });
    await act(() => {
      menu.focus();
      menu.click();
    });
    await act(() =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(document.activeElement).toBe(menu);
    await act(() => getByRole(dialog, "button", { name: "Close" }).click());
    expect(document.activeElement).toBe(trigger);
    expect(getByRole(node, "textbox", { name: "Center draft" })).toHaveProperty(
      "value",
      "Unsent reply",
    );
    expect(node.textContent).toContain("Selected message");
    await act(() => trigger.click());
    dialog = getByRole(document.body, "dialog", { name: "Resources" });
    const input = getByRole(dialog, "textbox", { name: "Browser page address" });
    expect(input).toHaveProperty("value", longUrl);
    await act(() => dom.setWindowSize({ width: 1280, height: 800 }));
    expect(queryByRole(document.body, "dialog", { name: "Resources" })).toBeNull();
    expect(document.querySelectorAll('[aria-label="External-tab Browser"]')).toHaveLength(1);
    expect(getByRole(node, "complementary", { name: "Resources" }).contains(input)).toBe(true);
    await act(() => dom.setWindowSize({ width, height }));
    expect(document.querySelectorAll('[aria-label="External-tab Browser"]')).toHaveLength(1);
    expect(getByRole(document.body, "dialog", { name: "Resources" }).contains(input)).toBe(true);
    expect(mocks.previewMounts).toBe(0);
    expect(mocks.open).not.toHaveBeenCalled();
  },
);

it("shows the configured desktop page in the resource body without opening a dialog", async () => {
  await mount();
  await setAddress("https://example.test/page");
  await submit();
  expect(renderer!.root.findAllByProps({ role: "dialog" })).toHaveLength(0);
  expect(text()).toContain("Incumbent Browser");
  expect(text()).toContain("Original page");
  expect(mocks.open).toHaveBeenCalledExactlyOnceWith({
    environmentId: "remote",
    input: {
      threadId: "t",
      url: "https://example.test/page",
      viewport: { _tag: "fill" },
      profileId: "work",
    },
  });
});

it("keeps address edits from rendering the preview tree", async () => {
  await act(() => {
    renderer = create(<ResourceApp />);
  });
  const renders = mocks.previewMounts;
  await setAddress("https://example.test/a");
  await setAddress("https://example.test/another");
  expect(mocks.previewMounts).toBe(renders);
});

it("surfaces the first typed-address open failure", async () => {
  mocks.open.mockResolvedValue(AsyncResult.failure(Cause.fail(new Error("Unsupported preview"))));
  await mount();
  await setAddress(snapshot.navStatus.url);
  await submit();
  expect(text()).toContain("Preview unavailable");
});

it("consumes a request before Resources closes and reopens", async () => {
  const request = { type: "url" as const, url: snapshot.navStatus.url };
  await mount({ request });
  expect(resourceState.request).toBeNull();
  await act(() =>
    applyPreviewServerEvent(threadRef, {
      type: "navigated",
      tabId: snapshot.tabId,
      threadId: threadRef.threadId,
      serverEpoch: "epoch-1",
      revision: 1,
      createdAt: snapshot.updatedAt,
      snapshot: {
        ...snapshot,
        navStatus: {
          _tag: "Success",
          url: "https://example.test/redirect",
          title: "Redirected page",
        },
      },
    }),
  );
  await act(() => resourceState.close());
  await act(() => resourceState.reopen());
  expect(text()).toContain("Redirected page");
  expect(mocks.open).toHaveBeenCalledTimes(1);
  await act(() =>
    resourceState.openResource({ tab: "browser", projectId: props.projectId, request }),
  );
  expect(mocks.open).toHaveBeenCalledTimes(2);
});

it("links the observed page and handles requests arriving during Link", async () => {
  applyPreviewServerSnapshot(threadRef, snapshot);
  let finish = () => {};
  mocks.link.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() => root!.render(<ResourceApp />));
  await act(() => getByRole(node!, "button", { name: "Browser actions" }).click());
  await act(() => getByRole(document.body, "button", { name: "Link this page" }).click());
  expect(mocks.link).toHaveBeenCalledExactlyOnceWith(selectedItem, {
    ref: { type: "url", url: snapshot.navStatus.url },
    title: "Original page",
  });
  await act(() =>
    resourceState.openResource({
      tab: "browser",
      projectId: props.projectId,
      request: { type: "url", url: "https://example.test/after-link" },
    }),
  );
  expect(mocks.open).not.toHaveBeenCalled();
  await act(() => finish());
  expect(mocks.open).toHaveBeenCalledOnce();
  expect(resourceState.request).toBeNull();
});

it("retries a failed requested open from Browser actions", async () => {
  mocks.open.mockResolvedValueOnce(
    AsyncResult.failure(Cause.fail(new Error("Unsupported preview"))),
  );
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() =>
    root!.render(<ResourceApp initialRequest={{ type: "url", url: snapshot.navStatus.url }} />),
  );
  expect(getByRole(node, "alert").textContent).toContain("Preview unavailable");
  await act(() => getByRole(node!, "button", { name: "Browser actions" }).click());
  await act(() => getByRole(document.body, "button", { name: "Retry" }).click());
  expect(mocks.open).toHaveBeenCalledTimes(2);
  expect(queryByRole(node, "alert")).toBeNull();
});

it("honours focus-address and reuses the incumbent external opener", async () => {
  applyPreviewServerSnapshot(threadRef, snapshot);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() =>
    root!.render(
      <AppAtomRegistryProvider>
        <WorkspaceBrowser {...props} />
      </AppAtomRegistryProvider>,
    ),
  );
  mocks.focusUrlNonce = 1;
  await act(() =>
    root!.render(
      <AppAtomRegistryProvider>
        <WorkspaceBrowser {...props} />
      </AppAtomRegistryProvider>,
    ),
  );
  expect(document.activeElement).toBe(getByRole(node, "textbox", { name: "Browser page address" }));
  await act(() => getByRole(node!, "button", { name: "Browser actions" }).click());
  await act(() => getByRole(document.body, "button", { name: "Open in new tab" }).click());
  expect(mocks.openInBrowser).toHaveBeenCalledOnce();
  expect(mocks.external).not.toHaveBeenCalled();
});

it("shows external-open failures ahead of a preview-read error", async () => {
  applyPreviewServerSnapshot(threadRef, snapshot);
  mocks.readError = "Preview is not supported";
  mocks.external.mockRejectedValueOnce(new Error("External opener unavailable"));
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() =>
    root!.render(
      <AppAtomRegistryProvider>
        <WorkspaceBrowser {...props} />
      </AppAtomRegistryProvider>,
    ),
  );
  await act(() => getByRole(node!, "button", { name: "Browser actions" }).click());
  await act(() =>
    getByRole(getByRole(document.body, "dialog"), "button", { name: "Open in new tab" }).click(),
  );
  expect(getByRole(node, "alert").textContent).toBe("External opener unavailable");
});

it("handles a requested page arriving during an open", async () => {
  let finish = (_value: ReturnType<typeof AsyncResult.success<PreviewSessionSnapshot>>) => {};
  mocks.open.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mount({ request: { type: "url", url: snapshot.navStatus.url } });
  await act(() =>
    resourceState.openResource({
      tab: "browser",
      projectId: props.projectId,
      request: { type: "url", url: "https://example.test/next" },
    }),
  );
  expect(mocks.open).toHaveBeenCalledTimes(1);
  await act(() => finish(AsyncResult.success(snapshot)));
  expect(mocks.open).toHaveBeenCalledTimes(2);
  expect(mocks.open).toHaveBeenLastCalledWith(
    expect.objectContaining({
      input: expect.objectContaining({ url: "https://example.test/next" }),
    }),
  );
  expect(resourceState.request).toBeNull();
});

it("consumes requests across the engagement header close and reopen journey", async () => {
  (
    window as unknown as {
      happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
    }
  ).happyDOM.setWindowSize({ width: 1280, height: 800 });
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() =>
    root!.render(
      <ResourceApp engagement initialRequest={{ type: "url", url: snapshot.navStatus.url }} />,
    ),
  );
  const trigger = getByRole(node, "button", { name: "Resources" });
  await act(() => trigger.click());
  await act(() => trigger.click());
  expect(mocks.open).toHaveBeenCalledTimes(1);
  expect(node.textContent).toContain("Original page");
});

it("updates redirected page title and address from real preview events without replacing the draft", async () => {
  await mount();
  await setAddress(snapshot.navStatus.url);
  await submit();
  const redirected = {
    ...snapshot,
    navStatus: {
      _tag: "Success" as const,
      url: "https://example.test/redirect",
      title: "Redirected page",
    },
  };
  await act(() =>
    applyPreviewServerEvent(threadRef, {
      type: "navigated",
      tabId: snapshot.tabId,
      threadId: threadRef.threadId,
      serverEpoch: "epoch-1",
      revision: 1,
      snapshot: redirected,
      createdAt: snapshot.updatedAt,
    }),
  );
  expect(text()).toContain("Redirected page");
  expect(text()).toContain("https://example.test/redirect");
  expect(renderer!.root.findByType("input").props.value).toBe(snapshot.navStatus.url);
  expect(readThreadPreviewState(threadRef).activeTabId).toBe("tab-1");
});

it("hides, unmounts and returns to the same scoped session and tab without another open", async () => {
  await mount();
  await setAddress(snapshot.navStatus.url);
  await submit();
  const saved = readThreadPreviewState(threadRef).snapshot;
  await act(() =>
    renderer!.update(
      <AppAtomRegistryProvider>
        <WorkspaceResourcesBodyContext value={{ hidden: true, restoreFocus() {} }}>
          <WorkspaceBrowser {...props} />
        </WorkspaceResourcesBodyContext>
      </AppAtomRegistryProvider>,
    ),
  );
  expect(text()).toBe("null");
  expect(readThreadPreviewState(threadRef).snapshot).toBe(saved);
  await act(() => renderer!.unmount());
  renderer = undefined;
  await mount();
  expect(text()).toContain("Original page");
  expect(readThreadPreviewState(threadRef).snapshot).toBe(saved);
  expect(mocks.open).toHaveBeenCalledTimes(1);
});

it("uses a replacement epoch's runtime tab after reconnect while preserving the server tab", async () => {
  applyPreviewServerSnapshot(threadRef, snapshot);
  await mount();
  await act(() =>
    reconcilePreviewServerSessions(threadRef, {
      sessions: [snapshot],
      serverEpoch: "replacement",
      revision: 0,
    }),
  );
  expect(renderer!.root.findByType("span").props.children).toBe(
    previewRuntimeTabId(threadRef, "replacement", "tab-1"),
  );
  expect(readThreadPreviewState(threadRef).snapshot?.tabId).toBe("tab-1");
  expect(mocks.open).not.toHaveBeenCalled();
});

it("shows settings guidance for a missing configured thread", async () => {
  mocks.configured = false;
  await mount();
  expect(text()).toContain("Choose an available Browser thread");
  expect(mocks.previewMounts).toBe(0);
  expect(mocks.open).not.toHaveBeenCalled();
});

it.each(["denied", "disconnected"])("does not open or link when %s", async (reason) => {
  mocks.operate = reason !== "denied";
  mocks.connected = reason !== "disconnected";
  await mount({ request: { type: "url", url: snapshot.navStatus.url } });
  expect(mocks.previewMounts).toBe(0);
  expect(mocks.open).not.toHaveBeenCalled();
  expect(mocks.link).not.toHaveBeenCalled();
  expect(
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children === "Link this page")!.props.disabled,
  ).toBe(true);
  expect(renderer!.root.findByType("input").props.value).toBe(snapshot.navStatus.url);
});

it("opens a requested address in the resource project while the selected chat belongs elsewhere", async () => {
  await mount({ request: { type: "url", url: snapshot.navStatus.url } });
  expect(text()).toContain("Original page");
  expect(mocks.list).toHaveBeenCalledWith({ environmentId, input: { threadId: "t" } });
  expect(mocks.open).toHaveBeenCalledWith(
    expect.objectContaining({
      environmentId: "remote",
      input: expect.objectContaining({ threadId: "t" }),
    }),
  );
  expect(mocks.link).not.toHaveBeenCalled();
  expect(mocks.config).toHaveBeenCalledWith({ environmentId, input: { projectId: "p" } });
});

it("rejects a configured thread belonging to the selected chat project", async () => {
  mocks.configuredThread = "t-chat-project";
  await mount({ request: { type: "url", url: snapshot.navStatus.url } });
  expect(text()).toContain("Choose an available Browser thread");
  expect(mocks.previewMounts).toBe(0);
  expect(mocks.open).not.toHaveBeenCalled();
});

it.each(["reader", "disconnected", "config-error"])(
  "allows external reading with %s while Link stays disabled",
  async (reason) => {
    mocks.desktop = false;
    mocks.operate = reason !== "reader";
    mocks.connected = reason !== "disconnected";
    mocks.configError = reason === "config-error" ? "Config unavailable" : null;
    await mount();
    await setAddress("https://example.test/read");
    const buttons = renderer!.root.findAllByType("button");
    const open = buttons.find((button) => button.props.children === "Open in new tab")!;
    expect(open.props.disabled).toBe(false);
    await act(() => open.props.onClick());
    expect(mocks.external).toHaveBeenCalledWith("https://example.test/read");
    expect(
      buttons.find((button) => button.props.children === "Link this page")!.props.disabled,
    ).toBe(true);
  },
);

it("settles recipe 05 when its resource body is not mounted", async () => {
  const session = createWorkspaceMockupSession("05");
  const module = createWorkspaceMockupModule(session);
  try {
    await module.settled();
  } finally {
    module.dispose();
    session.dispose();
  }
});

it("waits for a mounted recipe 05 page load", async () => {
  const session = createWorkspaceMockupSession("05");
  const module = createWorkspaceMockupModule(session);
  await act(() => {
    renderer = create(<>{module.resource}</>);
  });
  let settled = false;
  const pending = module.settled().then(() => {
    settled = true;
  });
  await act(async () => {});
  expect(settled).toBe(false);
  await act(() => renderer!.root.findByType("iframe").props.onLoad());
  await pending;
  expect(settled).toBe(true);
  module.dispose();
  session.dispose();
});

it("releases recipe 05 readiness when the page unmounts before load", async () => {
  const session = createWorkspaceMockupSession("05");
  const module = createWorkspaceMockupModule(session);
  await act(() => {
    renderer = create(<>{module.resource}</>);
  });
  const pending = module.settled();
  await act(() => renderer!.unmount());
  renderer = undefined;
  try {
    await pending;
  } finally {
    module.dispose();
    session.dispose();
  }
});

it("keeps the truthful non-desktop fallback without mounting preview", async () => {
  mocks.desktop = false;
  await mount();
  expect(text()).toContain("External tabs do not report navigation here.");
  expect(mocks.previewMounts).toBe(0);
  expect(mocks.list).not.toHaveBeenCalled();
  expect(renderer!.root.findAllByType("iframe")).toHaveLength(0);
});

it("surfaces an older server preview read error and retries without an unhandled rejection", async () => {
  mocks.readError = "Preview is not supported on this server";
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() =>
    root!.render(
      <AppAtomRegistryProvider>
        <WorkspaceBrowser {...props} />
      </AppAtomRegistryProvider>,
    ),
  );
  expect(getByRole(node, "alert").textContent).toContain(mocks.readError);
  await act(() => getByRole(node!, "button", { name: "Browser actions" }).click());
  await act(() => getByRole(document.body, "button", { name: "Retry" }).click());
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(mocks.open).not.toHaveBeenCalled();
});

it("reports a requested open failure and keeps the address for retry", async () => {
  mocks.open.mockResolvedValue(AsyncResult.failure(Cause.fail(new Error("Unsupported preview"))));
  await mount({ request: { type: "url", url: snapshot.navStatus.url } });
  expect(text()).toContain("Preview unavailable");
  expect(renderer!.root.findByType("input").props.value).toBe(snapshot.navStatus.url);
});

it("renders recipe 05 through the shared view with fake commands and no live preview or links", async () => {
  const session = createWorkspaceMockupSession("05");
  const module = createWorkspaceMockupModule(session);
  expect(module.readyRegions).toEqual(["resource"]);
  await act(() => {
    renderer = create(<>{module.resource}</>);
  });
  expect(renderer!.root.findByType("iframe").props.srcDoc).toContain(
    "Thoughtful products, made for<br>everyday life.",
  );
  await act(() => renderer!.root.findByType("iframe").props.onLoad());
  await setAddress("https://example.test/fixture");
  await submit();
  await module.settled();
  expect(session.operations).toEqual([
    { kind: "navigate", item: null, value: "https://example.test/fixture" },
  ]);
  expect(mocks.open).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
  expect(mocks.link).not.toHaveBeenCalled();
  module.dispose();
  await submit();
  await module.settled();
  expect(session.operations).toHaveLength(1);
  session.dispose();
});

it("returns focus to Browser actions when its compact menu closes", async () => {
  applyPreviewServerSnapshot(threadRef, snapshot);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() =>
    root!.render(
      <AppAtomRegistryProvider>
        <WorkspaceBrowser {...props} />
      </AppAtomRegistryProvider>,
    ),
  );
  const trigger = getByRole(node, "button", { name: "Browser actions" });
  await act(() => {
    trigger.focus();
    trigger.click();
  });
  expect(getByRole(document.body, "button", { name: "Reload" })).toBeDefined();
  await act(() =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(queryByRole(document.body, "button", { name: "Reload" })).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it.each(["menu", "pending unlink"])(
  "resets Browser chrome across a non-keyed scope change with %s",
  async (state) => {
    mocks.desktop = false;
    mocks.projectLinks = decodeLinkList({
      linked: [
        {
          id: "wl_00000000-0000-0000-0000-000000000001",
          item: {
            ref: { type: "url", url: "https://example.test/handbook" },
            title: "Project handbook",
          },
          status: "confirmed",
          source: { type: "user" },
          updatedAt: "2026-10-13T09:00:00.000Z",
        },
      ],
      suggested: [],
      truncated: false,
    });
    let reject!: (cause: Error) => void;
    mocks.unlink.mockImplementationOnce(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    node = document.createElement("div");
    document.body.append(node);
    root = createRoot(node);
    const render = (environment = environmentId) =>
      root!.render(
        <AppAtomRegistryProvider>
          <WorkspaceBrowser {...props} environmentId={environment} />
        </AppAtomRegistryProvider>,
      );
    await act(() => render());
    const input = getByRole<HTMLInputElement>(node, "textbox", { name: "Browser page address" });
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
        input,
        state === "menu" ? "https://example.test/old" : "handbook",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    if (state === "menu")
      await act(() => getByRole(node!, "button", { name: "Browser actions" }).click());
    else {
      await act(() =>
        input
          .closest("form")!
          .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
      );
      await act(() => getByRole(node!, "button", { name: "Unlink" }).click());
    }
    await act(() => render(EnvironmentId.make("other")));
    expect(queryByRole(document.body, "dialog", { name: "Browser actions" })).toBeNull();
    expect(queryByRole(node!, "region", { name: "Linked pages" })).toBeNull();
    expect(
      getByRole<HTMLInputElement>(node!, "textbox", { name: "Browser page address" }).value,
    ).toBe("");
    if (state === "pending unlink") await act(() => reject(new Error("Old unlink failed")));
    expect(document.body.textContent).not.toContain("Old unlink failed");
  },
);

it("restarts copied feedback after every successful copy and announces it beside the button", async () => {
  vi.useFakeTimers();
  mocks.desktop = false;
  vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
  await act(() => {
    renderer = create(<ResourceApp />);
  });
  await setAddress("https://example.test/copy");
  await clickText("Copy address");
  const firstAnnouncement = renderer!.root.findByProps({ role: "status", "aria-live": "polite" });
  await act(() => vi.advanceTimersByTime(1500));
  await clickText("Copied");
  const status = renderer!.root.findByProps({ role: "status", "aria-live": "polite" });
  expect(status.props.children).toBe("Address copied.");
  expect(status).not.toBe(firstAnnouncement);
  await act(() => vi.advanceTimersByTime(600));
  expect(text()).toContain("Copied");
  await act(() => vi.advanceTimersByTime(1400));
  expect(text()).not.toContain("Copied");
  await clickText("Copy address");
  await act(() => resourceState.close());
  expect(vi.getTimerCount()).toBe(0);
});

it("links after a scope change and keeps the new Link pending when the old one finishes", async () => {
  mocks.desktop = false;
  let oldFinish!: () => void;
  let newFinish!: () => void;
  mocks.link
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          oldFinish = resolve;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          newFinish = resolve;
        }),
    );
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  const render = (env: EnvironmentId) =>
    root!.render(
      <AppAtomRegistryProvider>
        <WorkspaceBrowser {...props} environmentId={env} />
      </AppAtomRegistryProvider>,
    );
  const address = async (value: string) =>
    act(() => {
      const input = getByRole<HTMLInputElement>(node!, "textbox", { name: "Browser page address" });
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  await act(() => render(environmentId));
  await address("https://example.test/old");
  await act(() => getByRole(node!, "button", { name: "Link this page" }).click());
  await act(() => render(EnvironmentId.make("other")));
  await address("https://example.test/new");
  await act(() => getByRole(node!, "button", { name: "Link this page" }).click());
  expect(mocks.link.mock.calls).toEqual([
    [
      selectedItem,
      { ref: { type: "url", url: "https://example.test/old" }, title: "https://example.test/old" },
    ],
    [
      selectedItem,
      { ref: { type: "url", url: "https://example.test/new" }, title: "https://example.test/new" },
    ],
  ]);
  expect(mocks.linkEnvironment.mock.calls).toEqual([
    [environmentId],
    [EnvironmentId.make("other")],
  ]);
  await act(() => oldFinish());
  const link = getByRole(node!, "button", { name: "Link this page" });
  expect(link.getAttribute("aria-disabled")).toBe("true");
  await act(() => {
    link.click();
    link.click();
  });
  expect(mocks.link).toHaveBeenCalledTimes(2);
  await act(() => newFinish());
  expect(link.getAttribute("aria-disabled")).not.toBe("true");
});

it("focuses the first enabled external popup action when opened by keyboard", async () => {
  mocks.desktop = false;
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() =>
    root!.render(
      <ResourceApp initialRequest={{ type: "url", url: "https://example.test/menu" }} />,
    ),
  );
  const trigger = getByRole(node!, "button", { name: "Browser actions" });
  await act(() => {
    trigger.focus();
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }),
    );
    trigger.click();
  });
  const popup = getByRole(document.body, "dialog", { name: "Browser actions" });
  expect(document.activeElement).toBe(popup.querySelector("button:not(:disabled)"));
});

it("keeps the Browser request budget and environment isolation at the query boundary", async () => {
  mocks.desktop = false;
  const remoteList = decodeLinkList({
    linked: [
      {
        id: "wl_00000000-0000-0000-0000-000000000009",
        item: {
          ref: { type: "url", url: "https://example.test/handbook" },
          title: "Second-client handbook",
        },
        status: "confirmed",
        source: { type: "user" },
        updatedAt: "2026-10-13T09:00:00.000Z",
      },
    ],
    suggested: [],
    truncated: false,
  });
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  const render = () => root!.render(<WorkspaceBrowser {...props} />);
  await act(() => render());
  expect(mocks.linkQueries).not.toHaveBeenCalled();
  expect(mocks.listRequests.size).toBe(0);
  const input = getByRole<HTMLInputElement>(node, "textbox", { name: "Browser page address" });
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      input,
      "handbook",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  // A submitted input event commits before the next interaction.
  await act(() =>
    input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(mocks.listRequests.get("remote:p")).toBe(1);
  const before = getByRole(node, "region", { name: "Linked pages" }).textContent;
  await act(() => {
    mocks.linksByEnvironment.set("other", remoteList);
    mocks.linkListeners.get("other:p")?.forEach((listener) => listener());
  });
  expect(getByRole(node, "region", { name: "Linked pages" }).textContent).toBe(before);
  await act(() => {
    mocks.linksByEnvironment.set("remote", remoteList);
    mocks.linkListeners.get("remote:p")?.forEach((listener) => listener());
  });
  expect(getByRole(node, "region", { name: "Linked pages" }).textContent).toContain(
    "Second-client handbook",
  );
  await act(() => render());
  expect(mocks.listRequests.get("remote:p")).toBe(1);
  await act(() =>
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
  );
  expect(mocks.linkListeners.get("remote:p")?.size).toBe(0);
  await act(() =>
    input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(mocks.listRequests.get("remote:p")).toBe(2);
  expect(mocks.open).not.toHaveBeenCalled();
  expect(mocks.external).not.toHaveBeenCalled();
});

it.each(["t", "missing"])(
  "guides a web thread without a Resources host, including loaded shell %s",
  async (threadId) => {
    mocks.desktop = false;
    node = document.createElement("div");
    document.body.append(node);
    root = createRoot(node);
    await act(() =>
      root!.render(
        <LinkedSection
          environmentId={environmentId}
          item={{ type: "thread", threadId: ThreadId.make(threadId) }}
          title="Thread"
          onOpen={() => {}}
        />,
      ),
    );
    expect(node.textContent).toContain("Open Browser from Resources and choose a project.");
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.external).not.toHaveBeenCalled();
  },
);
