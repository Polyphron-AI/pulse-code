// @vitest-environment happy-dom
import { act, StrictMode, useLayoutEffect, type ComponentProps } from "react";
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
import {
  WorkspaceResourcesBodyContext,
  WorkspaceResourcesProvider,
  useWorkspaceResourceState,
  type WorkspaceResourcesState,
} from "./workspaceResourceState";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { createWorkspaceMockupModule } from "./dev/browserMockupModule";
import { createWorkspaceMockupSession } from "./dev/workspaceMockupFixtures";

const mocks = vi.hoisted(() => ({
  desktop: true,
  connected: true,
  operate: true,
  configured: true,
  configError: null as string | null,
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
}));
vi.mock("../../state/entities", () => ({
  useThreadShell: (ref: { environmentId: string; threadId: string } | null) =>
    [
      { id: "t-other-env", projectId: "p", environmentId: "other" },
      { id: "t-chat-project", projectId: "q", environmentId: "remote" },
      { id: "t", projectId: "p", environmentId: "remote" },
    ].find((thread) => thread.id === ref?.threadId && thread.environmentId === ref.environmentId) ??
    null,
  useThreadShells: () => [
    { id: "t-other-env", projectId: "p", environmentId: "other" },
    { id: "t-chat-project", projectId: "q", environmentId: "remote" },
    { id: "t", projectId: "p", environmentId: "remote" },
  ],
}));
vi.mock("../../state/environments", () => ({
  useConnectedEnvironmentIds: () => (mocks.connected ? ["remote"] : []),
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
  useEnvironmentQuery: (input: unknown) => ({
    data:
      input === "config"
        ? { browserThreadId: mocks.configured ? mocks.configuredThread : "missing" }
        : null,
    error: input === "preview" ? mocks.readError : input === "config" ? mocks.configError : null,
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
vi.mock("../../localApi", async (original) => {
  const actual = await original<typeof import("../../localApi")>();
  return {
    ...actual,
    readLocalApi: () =>
      mocks.realLocalApi ? actual.createLocalApi() : { shell: { openExternal: mocks.external } },
  };
});
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
}: {
  initialRequest?: ComponentProps<typeof WorkspaceBrowser>["request"];
  engagement?: boolean;
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
  useLayoutEffect(() => {
    if (initialRequest)
      openResource({ tab: "browser", projectId: props.projectId, request: initialRequest });
  }, [initialRequest, openResource]);
  const body = <WorkspaceBrowser {...props} request={state.request} />;
  return (
    <AppAtomRegistryProvider>
      <WorkspaceResourcesProvider value={state}>
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
  mocks.readError = null;
  mocks.previewMounts = 0;
  mocks.focusUrlNonce = null;
  mocks.realLocalApi = false;
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

it("keeps the pasted link target when external opening is blocked", async () => {
  mocks.desktop = false;
  mocks.external.mockResolvedValue(undefined);
  await mount();
  await setAddress("https://example.test/pasted?utm_source=test#section");
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
  expect(mocks.external).toHaveBeenCalledExactlyOnceWith("https://example.test/pasted");
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
  const render = (environment = environmentId, project = props.projectId) => (
    <AppAtomRegistryProvider>
      <WorkspaceBrowser
        key={`${environment}:${project}`}
        {...props}
        environmentId={environment}
        projectId={project}
      />
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
});

it.each(["disconnected", "reader", "missing-thread"])(
  "opens only the latest pending request after a desktop %s gate clears",
  async (reason) => {
    mocks.connected = reason !== "disconnected";
    mocks.operate = reason !== "reader";
    mocks.configured = reason !== "missing-thread";
    await mount({ request: { type: "url", url: "https://example.test/first" } });
    for (const path of ["second", "latest"])
      await act(() =>
        resourceState.openResource({
          tab: "browser",
          projectId: props.projectId,
          request: { type: "url", url: `https://example.test/${path}` },
        }),
      );
    expect(mocks.open).not.toHaveBeenCalled();
    mocks.connected = true;
    mocks.operate = true;
    mocks.configured = true;
    await act(() =>
      renderer!.update(
        <ResourceApp initialRequest={{ type: "url", url: "https://example.test/latest" }} />,
      ),
    );
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

it.each([
  "javascript:alert(1)",
  "file:///secret",
  "",
  `https://example.test/${"x".repeat(2048)}`,
  "project design notes",
])("rejects unsafe addresses: %s", async (address) => {
  mocks.desktop = false;
  await mount();
  await setAddress(address);
  await submit();
  expect(mocks.external).not.toHaveBeenCalled();
  expect(mocks.open).not.toHaveBeenCalled();
  expect(text()).toContain("Enter an http or https address.");
});

it("pasting a new address replaces only the external link target", async () => {
  mocks.desktop = false;
  applyPreviewServerSnapshot(threadRef, snapshot);
  await mount();
  await setAddress("https://example.test/first");
  await clickText("Open in new tab");
  await setAddress("https://example.test/next?utm_source=test#section");
  await clickText("Link this page");
  expect(mocks.external).toHaveBeenCalledExactlyOnceWith("https://example.test/first");
  expect(mocks.link).toHaveBeenCalledExactlyOnceWith(selectedItem, {
    ref: { type: "url", url: "https://example.test/next" },
    title: "https://example.test/next",
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
  expect(copy).toHaveBeenLastCalledWith("https://example.test/copy");
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
  await mount();
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
  expect(renderer!.root.findAllByProps({ children: "Link this page" })).toHaveLength(0);
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
