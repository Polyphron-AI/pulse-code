// @vitest-environment happy-dom
import { act, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  defaultStringifySearch,
} from "@tanstack/react-router";
import {
  fireEvent,
  getByRole,
  getAllByRole,
  getByText,
  queryByRole,
  queryByText,
} from "@testing-library/dom";
import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  chatResourceId,
  EnvironmentId,
  ProjectId,
  type ChatRequest,
  type ChatResult,
} from "@t3tools/contracts";
import { ConnectCommunicationsDialog } from "./ConnectCommunicationsDialog";
import { Route } from "../../routes/_chat.workspace";
import { parseWorkspaceSearch } from "./workspaceNavigation";
import { useWorkspaceResourceState, WorkspaceResourcesContext } from "./workspaceResourceState";

const boundary = vi.hoisted(() => ({
  primary: "local",
  links: false,
  projects: [] as Array<{ id: string; title: string; environmentId: string }>,
  linked: [] as Array<{
    item: { ref: { type: "provider-resource"; provider: "slack"; resourceId: string } };
    status: "confirmed" | "suggested";
  }>,
}));
vi.mock("./calendar/CalendarSpace", () => ({
  CalendarSpace: () => null,
  CalendarNotesProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("./meetings/MeetingsSpace", () => ({ MeetingsSpace: () => null }));
vi.mock("./mail/MailSpace", () => ({ MailSpace: () => null }));
vi.mock("./ProjectsSpace", () => ({ ProjectsSpace: () => null }));
vi.mock("./OfficeWorkspace", () => ({ OfficeWorkspace: () => null }));
vi.mock("./TasksSpace", () => ({ TasksSpace: () => null }));
vi.mock("../../state/environments", () => ({
  usePrimaryEnvironmentId: () => boundary.primary,
  useEnvironment: () => ({ label: "Selected environment" }),
  useConnectedEnvironmentIds: () => [boundary.primary],
}));
vi.mock("../../hooks/useSettings", () => ({ useEnvironmentSettings: () => undefined }));
vi.mock("../../state/entities", () => ({
  useProjects: () => boundary.projects,
  useThreadShells: () => [],
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: (id?: EnvironmentId) => ({
    environmentId: id ?? EnvironmentId.make(boundary.primary),
    ready: true,
    workspaceLinks: boundary.links,
  }),
}));
vi.mock("./useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => true }));
vi.mock("./WorkspaceResourcesPanel", () => ({
  WorkspaceProjectResources: () => <p>Project resources</p>,
}));
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemMenu: ({ children }: { children: ReactNode }) => children,
  WorkspaceItemActions: () => null,
}));
vi.mock("./useWorkspaceItemOpener", () => ({ useWorkspaceItemOpener: () => () => {} }));
vi.mock("../../state/workspaceLinks", () => ({
  workspaceLinks: { list: (input: unknown) => input },
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: () => ({
    data: { linked: boundary.linked },
    error: null,
    refresh: () => {},
  }),
}));
const account = {
  id: "slack_a",
  provider: "slack" as const,
  label: "Approved source",
  identity: "Maya",
};
const channel = {
  id: "C1",
  accountId: account.id,
  title: "marketing",
  kind: "channel" as const,
  workspace: "SynKEK",
  workspaceId: "T1",
  canSend: false,
};
const dm = { ...channel, id: "D1", title: "Maya Chen", kind: "dm" as const };
const source = (id = "C1", messageId?: string) =>
  chatResourceId({
    version: 1,
    transport: "desktop",
    connectionId: account.id,
    workspaceId: "T1",
    conversationId: id,
    ...(messageId ? { messageId, replyRootId: messageId } : {}),
  });
const originalBridge = Object.getOwnPropertyDescriptor(window, "desktopBridge");
const storage = { getItem: () => null, setItem: () => {} };
let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
  boundary.primary = "local";
  boundary.links = false;
  boundary.projects = [];
  boundary.linked = [];
  if (originalBridge) Object.defineProperty(window, "desktopBridge", originalBridge);
  else Reflect.deleteProperty(window, "desktopBridge");
  (
    window as unknown as {
      happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
    }
  ).happyDOM.setWindowSize({ width: 1280, height: 800 });
  vi.unstubAllGlobals();
});
async function render(
  search: Record<string, unknown> = {},
  invoke?: (request: ChatRequest) => Promise<ChatResult>,
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const requests: ChatRequest[] = [];
  Object.defineProperty(window, "desktopBridge", {
    configurable: true,
    value: {
      communicationsInvoke: async (request: ChatRequest): Promise<ChatResult> => {
        requests.push(request);
        return invoke
          ? invoke(request)
          : request.operation === "accounts.list"
            ? { ok: true, accounts: [account] }
            : request.operation === "conversations.list"
              ? { ok: true, conversations: [channel, dm] }
              : {
                  ok: true,
                  messages: [
                    {
                      id: "1",
                      accountId: account.id,
                      conversationId: "C1",
                      author: "Maya Chen",
                      date: "2026-10-13T09:12:00Z",
                      text: "Exact source message",
                    },
                  ],
                };
      },
    },
  });
  const rootRoute = createRootRoute();
  const chatRoute = createRoute({ getParentRoute: () => rootRoute, id: "_chat" });
  const workspace = createRoute({
    getParentRoute: () => chatRoute,
    path: "workspace",
    validateSearch: parseWorkspaceSearch,
    component: Route.options.component!,
  });
  const history = createMemoryHistory({
    initialEntries: [
      "/workspace" +
        defaultStringifySearch({
          space: "communications",
          environment: "local",
          communicationProvider: "slack",
          account: account.id,
          ...search,
        }),
    ],
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([chatRoute.addChildren([workspace])]),
    history,
    defaultPendingMinMs: 0,
  });
  await router.load();
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  function Resources({ children }: { children: ReactNode }) {
    const state = useWorkspaceResourceState(EnvironmentId.make("local"), {
      storage,
      presentation: "sheet",
    });
    return (
      <WorkspaceResourcesContext value={state}>
        <button type="button" onClick={() => state.chooseProject(ProjectId.make("resource-only"))}>
          Choose independent resource project
        </button>
        <output aria-label="Independent resource project">{state.projectId}</output>
        {children}
      </WorkspaceResourcesContext>
    );
  }
  await act(async () =>
    root.render(
      <Resources>
        <RouterProvider router={router} />
      </Resources>,
    ),
  );
  cleanup = async () => {
    await act(async () => root.unmount());
    node.remove();
  };
  return { node, router, history, requests };
}
it("shows granted Slack DMs and loaded search without fetching histories", async () => {
  const { node, requests } = await render();
  expect(getByRole(node, "button", { name: "Open Maya Chen" })).toBeDefined();
  expect(requests.map((request) => request.operation)).toEqual([
    "accounts.list",
    "conversations.list",
  ]);
  await act(async () =>
    fireEvent.change(getByRole(node, "textbox", { name: "Search loaded conversations" }), {
      target: { value: "Maya" },
    }),
  );
  expect(queryByRole(node, "button", { name: "Open marketing" })).toBeNull();
  expect(requests).toHaveLength(2);
});
it("retains exact routes and channel Back without changing the resource project", async () => {
  const { node, router, history, requests } = await render();
  await act(async () =>
    getByRole(node, "button", { name: "Choose independent resource project" }).click(),
  );
  const beforeResources = requests.length;
  await act(async () => getByRole(node, "button", { name: "Resources" }).click());
  expect(requests).toHaveLength(beforeResources);
  await act(async () => getByRole(node, "button", { name: "Open marketing" }).click());
  expect(router.state.location.search.item).toBe(source());
  expect(node.textContent).toContain("Exact source message");
  const afterOpen = requests.length;
  await act(async () => getByRole(node, "button", { name: "Resources" }).click());
  expect(getByRole(node, "heading", { name: "# marketing" })).toBeDefined();
  expect(requests).toHaveLength(afterOpen);
  await act(async () =>
    router.navigate({
      to: "/workspace",
      search: { ...router.state.location.search, item: source("C1", "1") },
    }),
  );
  expect(router.state.location.search.item).toBe(source("C1", "1"));
  await act(async () => history.back());
  expect(router.state.location.search.item).toBe(source());
  await act(async () => getByRole(node, "button", { name: "Back to list" }).click());
  expect(router.state.location.search.item).toBeUndefined();
  expect(getByRole(node, "status", { name: "Independent resource project" }).textContent).toBe(
    "resource-only",
  );
});
it("makes zero desktop or unsupported RPC requests for another environment", async () => {
  const { node, requests } = await render({ environment: "other", item: source() });
  expect(requests).toEqual([]);
  expect(
    getByText(node, "This conversation is available only on its desktop connection."),
  ).toBeDefined();
});
it.each([
  {
    name: "an unavailable deep link",
    environment: "other",
    item: source(),
    heading: "Conversation unavailable here",
    message: "This conversation is available only on its desktop connection.",
  },
  {
    name: "an unavailable desktop connection",
    environment: "other",
    heading: "Your conversations, together",
    message:
      "Open Pulse desktop to connect your accounts. Credentials and sessions stay on that computer; this web connection cannot access them.",
  },
  {
    name: "no connected accounts",
    environment: "local",
    heading: "Your conversations, together",
    message:
      "Choose an account from Communications accounts and settings, connect Slack, or add a Discord bot. Connect Telegram bots in Settings.",
  },
])(
  "keeps the phone explanation beside Accounts for $name",
  async ({ name: _name, heading, message, ...search }) => {
    (
      window as unknown as {
        happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
      }
    ).happyDOM.setWindowSize({ width: 390, height: 800 });
    const { node, requests } = await render(search, async () => ({ ok: true, accounts: [] }));
    const list = getByRole(node, "region", { name: "Item list" });
    expect(getByRole(list, "heading", { name: heading })).toBeDefined();
    expect(getByText(list, message)).toBeDefined();
    expect(queryByRole(getByRole(node, "region", { name: "Selected item" }), "heading")).toBeNull();
    await act(async () =>
      getByRole(list, "button", { name: "Communications accounts and settings" }).click(),
    );
    expect(getByRole(list, "button", { name: "Connect chat" })).toBeDefined();
    expect(requests.map((request) => request.operation)).toEqual(
      search.environment === "local" ? ["accounts.list"] : [],
    );
  },
);
it("keeps legacy saves unchanged on mounting the on-device Later view", async () => {
  const key = "pulse:communications:later:chat:v1";
  const previous = window.localStorage.getItem(key);
  window.localStorage.setItem(key, "[]");
  try {
    const { node } = await render({ view: "later" });
    expect(getByText(node, "Saved messages on this device.")).toBeDefined();
    expect(window.localStorage.getItem(key)).toBe("[]");
  } finally {
    if (previous === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, previous);
  }
});

it("keeps a failed account refresh in the list and retains the one selected header", async () => {
  let fail = false;
  const { node } = await render({ item: source() }, async (request) => {
    if (request.operation === "accounts.list")
      return fail
        ? { ok: false, error: { code: "network", message: "Account refresh failed" } }
        : { ok: true, accounts: [account] };
    if (request.operation === "conversations.list")
      return { ok: true, conversations: [channel, dm] };
    return { ok: true, messages: [] };
  });
  fail = true;
  await act(async () =>
    getByRole(node, "button", { name: "Communications accounts and settings" }).click(),
  );
  await act(async () => getByRole(node, "button", { name: "Refresh account list" }).click());
  expect(
    getByRole(getByRole(node, "region", { name: "Item list" }), "alert").textContent,
  ).toContain("Account refresh failed");
  expect(getByRole(node, "heading", { name: "# marketing" })).toBeDefined();
  expect(node.querySelectorAll("[data-workspace-engagement-header]")).toHaveLength(1);
});
it("ignores delayed history after channel selection changes", async () => {
  let resolve!: (result: ChatResult) => void;
  const pending = new Promise<ChatResult>((done) => {
    resolve = done;
  });
  const { node } = await render({}, async (request) => {
    if (request.operation === "accounts.list") return { ok: true, accounts: [account] };
    if (request.operation === "conversations.list")
      return { ok: true, conversations: [channel, dm] };
    if (request.operation === "messages.list" && request.conversationId === "C1") return pending;
    return {
      ok: true,
      messages: [
        {
          id: "2",
          accountId: account.id,
          conversationId: "D1",
          author: "Maya Chen",
          date: "2026-10-13T09:12:00Z",
          text: "Selected DM history",
        },
      ],
    };
  });
  await act(async () => getByRole(node, "button", { name: "Open marketing" }).click());
  await act(async () => getByRole(node, "button", { name: "Open Maya Chen" }).click());
  await act(async () =>
    resolve({
      ok: true,
      messages: [
        {
          id: "1",
          accountId: account.id,
          conversationId: "C1",
          author: "Maya Chen",
          date: "2026-10-13T09:12:00Z",
          text: "Stale channel history",
        },
      ],
    }),
  );
  expect(node.textContent).toContain("Selected DM history");
  expect(node.textContent).not.toContain("Stale channel history");
});
it("keeps the list search and keyboard search through phone Back", async () => {
  (
    window as unknown as {
      happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
    }
  ).happyDOM.setWindowSize({ width: 390, height: 800 });
  const { node } = await render();
  const list = getByRole(node, "region", { name: "Item list" });
  list.scrollTop = 120;
  const input = getByRole(node, "textbox", { name: "Search loaded conversations" });
  await act(async () => fireEvent.change(input, { target: { value: "marketing" } }));
  await act(async () => getByRole(node, "button", { name: "Open marketing" }).click());
  await act(async () => getByRole(node, "button", { name: "Back to list" }).click());
  expect(input.isConnected).toBe(true);
  expect(getByRole(node, "textbox", { name: "Search loaded conversations" })).toBe(input);
  expect(
    (getByRole(node, "textbox", { name: "Search loaded conversations" }) as HTMLInputElement).value,
  ).toBe("marketing");
  expect(getByRole(node, "region", { name: "Item list" }).scrollTop).toBe(120);
  document.body.focus();
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true })),
  );
  expect(document.activeElement).toBe(input);
});
it("cancels desktop setup without connecting or retaining its token", async () => {
  const { node, requests } = await render();
  await act(async () =>
    getByRole(node, "button", { name: "Communications accounts and settings" }).click(),
  );
  await act(async () => getByRole(node, "button", { name: "Connect chat" }).click());
  expect(document.body.textContent).toContain(
    "Credentials are sent directly to the desktop service. They are not stored in browser storage.",
  );
  const token = getByText(document.body, "Slack user or bot token").parentElement!.querySelector(
    "input",
  )!;
  await act(async () => fireEvent.change(token, { target: { value: "fake-private-token" } }));
  await act(async () => getByRole(document.body, "button", { name: "Cancel" }).click());
  expect(queryByRole(document.body, "dialog")).toBeNull();
  expect(requests.every((request) => request.operation !== "accounts.connectToken")).toBe(true);
  await act(async () => getByRole(node, "button", { name: "Connect chat" }).click());
  expect(
    getByText(document.body, "Slack user or bot token").parentElement!.querySelector("input")!
      .value,
  ).toBe("");
});

it("sends a server token only to its explicit environment and suppresses a completion after cancel", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const connected = vi.fn();
  let resolve!: (value: typeof account) => void;
  const pending = new Promise<typeof account>((done) => {
    resolve = done;
  });
  const connect = vi.fn(() => pending);
  const rootRoute = createRootRoute();
  function Dialog() {
    const [open, setOpen] = useState(true);
    return open ? (
      <ConnectCommunicationsDialog
        destination={{
          kind: "server",
          environmentId: EnvironmentId.make("chosen-server"),
          label: "Chosen source",
          connect,
        }}
        onClose={() => setOpen(false)}
        onConnected={connected}
      />
    ) : null;
  }
  const route = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Dialog });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  cleanup = async () => {
    await act(async () => root.unmount());
    node.remove();
  };
  await act(async () => root.render(<RouterProvider router={router} />));
  expect(document.body.textContent).toContain(
    "Credentials stay in the selected environment. Source: Chosen source.",
  );
  const input = getByText(document.body, "Slack user or bot token").parentElement!.querySelector(
    "input",
  )!;
  await act(async () => fireEvent.change(input, { target: { value: "fake-server-token" } }));
  await act(async () => fireEvent.submit(input.closest("form")!));
  expect(input.value).toBe("");
  expect(JSON.stringify(window.localStorage)).not.toContain("fake-server-token");
  expect(connect).toHaveBeenCalledExactlyOnceWith({
    environmentId: "chosen-server",
    provider: "slack",
    token: "fake-server-token",
  });
  await act(async () => getByRole(document.body, "button", { name: "Cancel" }).click());
  await act(async () => resolve(account));
  expect(connected).not.toHaveBeenCalled();
  expect(queryByRole(document.body, "dialog")).toBeNull();
});

it("groups only confirmed linked conversations and reuses their endpoint across projects", async () => {
  boundary.links = true;
  boundary.projects = [
    { id: ProjectId.make("one"), title: "One", environmentId: "local" },
    { id: ProjectId.make("two"), title: "Two", environmentId: "local" },
  ];
  boundary.linked = [
    {
      item: { ref: { type: "provider-resource", provider: "slack", resourceId: source() } },
      status: "suggested",
    },
  ];
  const { node, router } = await render();
  expect(queryByRole(node, "button", { name: "Toggle One" })).toBeNull();
  boundary.linked = [{ ...boundary.linked[0]!, status: "confirmed" }];
  await act(async () =>
    router.navigate({
      to: "/workspace",
      search: { ...router.state.location.search, view: "chats" },
    }),
  );
  const rows = getAllByRole(node, "button", { name: "Open marketing" });
  expect(rows).toHaveLength(2);
  expect(getByRole(node, "button", { name: "Toggle One" })).toBeDefined();
  expect(getByRole(node, "button", { name: "Toggle Two" })).toBeDefined();
  await act(async () => rows[1]!.click());
  expect(router.state.location.search.item).toBe(source());
  expect(node.textContent).toContain("One · Slack");
});
it("omits bot-only Discord DMs even if a source returns one", async () => {
  const { node, requests } = await render(
    { communicationProvider: "discord", account: "discord_a" },
    async (request) =>
      request.operation === "accounts.list"
        ? { ok: true, accounts: [{ ...account, id: "discord_a", provider: "discord" }] }
        : {
            ok: true,
            conversations: [
              { ...channel, accountId: "discord_a" },
              { ...dm, accountId: "discord_a" },
            ],
          },
  );
  expect(getByRole(node, "button", { name: "Open marketing" })).toBeDefined();
  expect(queryByRole(node, "button", { name: "Open Maya Chen" })).toBeNull();
  expect(requests.every((request) => request.operation !== "messages.list")).toBe(true);
});
it("discards a pending desktop response after switching environments", async () => {
  let resolve!: (result: ChatResult) => void;
  const pending = new Promise<ChatResult>((done) => {
    resolve = done;
  });
  const { node, router, requests } = await render({}, async (request) =>
    request.operation === "accounts.list"
      ? { ok: true, accounts: [account] }
      : request.operation === "conversations.list"
        ? { ok: true, conversations: [channel] }
        : pending,
  );
  await act(async () => getByRole(node, "button", { name: "Open marketing" }).click());
  const before = requests.length;
  await act(async () =>
    router.navigate({
      to: "/workspace",
      search: { ...router.state.location.search, environment: "other" },
    }),
  );
  await act(async () =>
    resolve({
      ok: true,
      messages: [
        {
          id: "old",
          accountId: account.id,
          conversationId: channel.id,
          author: "Maya",
          date: "2026-10-13T09:12:00Z",
          text: "Old environment body",
        },
      ],
    }),
  );
  expect(node.textContent).not.toContain("Old environment body");
  expect(node.textContent).toContain(
    "This conversation is available only on its desktop connection.",
  );
  expect(requests).toHaveLength(before);
});

it("opens account settings in the list pane, returns focus on Escape and can disconnect", async () => {
  let disconnected = false;
  const { node, requests } = await render({}, async (request) => {
    if (request.operation === "accounts.disconnect") {
      disconnected = true;
      return { ok: true };
    }
    if (request.operation === "accounts.list")
      return { ok: true, accounts: disconnected ? [] : [account] };
    return { ok: true, conversations: [channel] };
  });
  const list = getByRole(node, "region", { name: "Item list" });
  const control = getByRole(list, "button", { name: "Communications accounts and settings" });
  await act(async () => control.click());
  expect(getByRole(list, "combobox", { name: "Connected communications account" })).toBeDefined();
  expect(list.textContent).toContain("Maya");
  expect(getByRole(list, "button", { name: "Refresh account list" })).toBeDefined();
  const disconnect = getByRole(list, "button", { name: "Disconnect Approved source" });
  await act(async () => fireEvent.keyDown(disconnect, { key: "Escape" }));
  expect(control.closest("details")?.open).toBe(false);
  expect(document.activeElement).toBe(control);
  await act(async () => control.click());
  await act(async () => getByRole(list, "button", { name: "Disconnect Approved source" }).click());
  expect(requests.filter((request) => request.operation === "accounts.disconnect")).toEqual([
    { operation: "accounts.disconnect", accountId: account.id },
  ]);
  expect(queryByRole(node, "button", { name: "Disconnect Approved source" })).toBeNull();
  const setupList = getByRole(node, "region", { name: "Item list" });
  await act(async () =>
    getByRole(setupList, "button", { name: "Communications accounts and settings" }).click(),
  );
  expect(getByRole(setupList, "button", { name: "Connect chat" })).toBeDefined();
  const selectedItem = getByRole(node, "region", { name: "Selected item" });
  expect(
    getByRole(selectedItem, "heading", { name: "Your conversations, together" }),
  ).toBeDefined();
  expect(queryByRole(setupList, "heading", { name: "Your conversations, together" })).toBeNull();
  const explanation =
    "Choose an account from Communications accounts and settings, connect Slack, or add a Discord bot. Connect Telegram bots in Settings.";
  expect(getByText(selectedItem, explanation)).toBeDefined();
  expect(queryByText(setupList, explanation)).toBeNull();
  await act(async () => getByRole(setupList, "button", { name: "Connect chat" }).click());
  expect(
    getByRole(document.body, "dialog", { name: "Connect a communications account" }),
  ).toBeDefined();
});

it("prioritizes environment availability over the legacy Slack root notice", async () => {
  const item = chatResourceId({
    version: 1,
    transport: "desktop",
    connectionId: account.id,
    workspaceId: "T1",
    conversationId: "C1",
    messageId: "legacy",
  });
  const { node, requests } = await render({ environment: "other", item });
  expect(requests).toEqual([]);
  expect(node.textContent).toContain(
    "This conversation is available only on its desktop connection.",
  );
  expect(node.textContent).not.toContain("This legacy Slack message has no known reply root.");
});

it.each(["local", "old-server"])(
  "makes no unsupported calls for a server ref in %s",
  async (environment) => {
    const item = chatResourceId({
      version: 1,
      transport: "server",
      connectionId: account.id,
      workspaceId: "T1",
      conversationId: "C1",
    });
    const { node, requests } = await render({ environment, item });
    expect(requests).toEqual([]);
    expect(node.textContent).toContain(
      "The selected environment is unavailable. Reconnect it to read this source.",
    );
  },
);

it("returns from an open phone conversation to loaded search with Cmd+K", async () => {
  (
    window as unknown as {
      happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
    }
  ).happyDOM.setWindowSize({ width: 390, height: 800 });
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  const { node, router } = await render();
  const input = getByRole(node, "textbox", { name: "Search loaded conversations" });
  await act(async () => getByRole(node, "button", { name: "Open marketing" }).click());
  document.body.focus();
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })),
  );
  await act(async () => {
    for (const callback of frames.splice(0)) callback(0);
  });
  expect(router.state.location.search.item).toBeUndefined();
  expect(input.isConnected).toBe(true);
  expect(document.activeElement).toBe(input);
});
