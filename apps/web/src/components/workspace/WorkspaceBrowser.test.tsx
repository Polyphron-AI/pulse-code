// @vitest-environment happy-dom
import { act, type ComponentProps } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { AsyncResult } from "effect/unstable/reactivity";
import * as Cause from "effect/Cause";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type PreviewSessionSnapshot,
} from "@t3tools/contracts";
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
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";
import { createWorkspaceMockupModule } from "./dev/browserMockupModule";
import { createWorkspaceMockupSession } from "./dev/workspaceMockupFixtures";

const mocks = vi.hoisted(() => ({
  desktop: true,
  connected: true,
  operate: true,
  configured: true,
  readError: null as string | null,
  open: vi.fn(),
  external: vi.fn(),
  link: vi.fn(),
  list: vi.fn(),
  refresh: vi.fn(),
  previewMounts: 0,
}));
vi.mock("../../state/entities", () => ({
  useThreadShells: () => [
    { id: "t", projectId: "p", environmentId: "other" },
    { id: "t", projectId: "q", environmentId: "remote" },
    { id: "t", projectId: "p", environmentId: "remote" },
  ],
}));
vi.mock("../../state/environments", () => ({
  useConnectedEnvironmentIds: () => (mocks.connected ? ["remote"] : []),
}));
vi.mock("../../state/workspaceTools", () => ({ workspaceTools: { config: () => "config" } }));
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
  useEnvironmentQuery: (input: unknown) => ({
    data: input === "config" ? { browserThreadId: mocks.configured ? "t" : "missing" } : null,
    error: input === "preview" ? mocks.readError : null,
    refresh: mocks.refresh,
  }),
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
vi.mock("../../localApi", () => ({
  readLocalApi: () => ({ shell: { openExternal: mocks.external } }),
}));
vi.mock("./mail/useMailLinks", () => ({ useMailLinks: () => ({ linkItem: mocks.link }) }));
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
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  resetPreviewStateForTests();
  mocks.desktop = true;
  mocks.connected = true;
  mocks.operate = true;
  mocks.configured = true;
  mocks.readError = null;
  mocks.previewMounts = 0;
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
  vi.unstubAllGlobals();
});
const mount = async (overrides: Partial<ComponentProps<typeof WorkspaceBrowser>> = {}) => {
  await act(() => {
    renderer = create(
      <AppAtomRegistryProvider>
        <WorkspaceBrowser {...props} {...overrides} />
      </AppAtomRegistryProvider>,
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
  await act(() => root!.render(<WorkspaceBrowser {...props} />));
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
    "Thoughtful products, made for everyday life.",
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
  await act(() => root!.render(<WorkspaceBrowser {...props} />));
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
