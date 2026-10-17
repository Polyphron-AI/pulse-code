// @vitest-environment happy-dom
import { act, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getByRole, getByText, getAllByRole, queryByRole } from "@testing-library/dom";
import { beforeEach, afterEach, expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  chatResourceId,
  type ChatRequest,
  type ChatResult,
  type ChatConversation,
  type ChatMessage,
  ProjectId,
} from "@t3tools/contracts";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import * as chat from "./communicationsChat";
import { chatEndpoint } from "./communicationsChat";

const boundary = vi.hoisted(() => ({
  menu: vi.fn(),
  command: vi.fn(),
  navigate: vi.fn(),
  external: vi.fn(),
  startThread: vi.fn(),
  connected: true,
  operate: true,
  toast: vi.fn(),
  lookup: vi.fn(),
  zone: "Africa/Johannesburg",
}));
vi.mock("../ui/toast", () => ({ toastManager: { add: boundary.toast } }));
vi.mock("../../localApi", () => ({
  readLocalApi: () => ({
    contextMenu: { show: boundary.menu },
    shell: { openExternal: boundary.external },
  }),
}));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useNavigate: () => boundary.navigate,
  useRouter: () => ({ state: { location: { href: "/workspace?space=communications" } } }),
}));
vi.mock("@effect/atom-react", async (original) => ({
  ...(await original<typeof import("@effect/atom-react")>()),
  useAtomValue: () => DEFAULT_RESOLVED_KEYBINDINGS,
}));
vi.mock("../../state/server", () => ({ primaryServerKeybindingsAtom: {} }));
vi.mock("../../state/environments", () => ({
  useEnvironment: () => ({ label: "Source" }),
  useConnectedEnvironmentIds: () => (boundary.connected ? ["source-env"] : []),
}));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    data: { authenticated: true, scopes: boundary.operate ? ["orchestration:operate"] : [] },
  }),
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => [
    { id: ProjectId.make("p1"), title: "Project", environmentId: EnvironmentId.make("source-env") },
  ],
  useThreadShells: () => [],
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (query: unknown) => {
    useEffect(() => {
      boundary.lookup(query);
    }, [JSON.stringify(query)]);
    return { data: { linked: [] }, error: null, refresh: () => {} };
  },
}));
vi.mock("../../state/workspaceLinks", () => ({
  workspaceLinks: { list: (input: unknown) => input, link: "link", unlink: "unlink" },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: string) => (input: unknown) => boundary.command(command, input),
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ workspaceLinks: true, workspaceItemContext: true }),
}));
vi.mock("../../hooks/useHandleNewThread", () => ({
  useNewThreadHandler: () => boundary.startThread,
}));
vi.mock("../../hooks/useNewProject", () => ({ useNewProject: () => async () => false }));

import { ChatCommunicationsWorkspace } from "./ChatCommunicationsWorkspace";
import { WorkspaceResourcesContext, useWorkspaceResourceState } from "./workspaceResourceState";
vi.mock("./WorkspaceResourcesPanel", () => ({ WorkspaceProjectResources: () => null }));
vi.mock("../../hooks/useSettings", () => ({
  useEnvironmentSettings: (
    _id: unknown,
    select: (settings: { workspaceDisplayTimeZone: string }) => unknown,
  ) => select({ workspaceDisplayTimeZone: boundary.zone }),
}));
const env = EnvironmentId.make("source-env");
const account = { id: "slack_a", provider: "slack" as const, label: "Slack", identity: "Asha" };
const channel: ChatConversation = {
  id: "C1",
  accountId: account.id,
  workspace: "Team",
  workspaceId: "T1",
  title: "marketing",
  kind: "channel",
  canSend: true,
};
const rootMessage: ChatMessage = {
  id: "1760343120.000001",
  accountId: account.id,
  conversationId: channel.id,
  author: "Asha",
  date: "2026-10-13T09:12:00Z",
  text: "Channel message",
};
const reply: ChatMessage = {
  ...rootMessage,
  id: "1760343120.000002",
  threadId: rootMessage.id,
  author: "Leo",
  text: "Real reply",
};
const savedKey = "pulse:communications:later:chat:v1";
function ResourceProvider({ children }: { children: ReactNode }) {
  const resources = useWorkspaceResourceState(env, {
    storage: { getItem: () => null, setItem: () => {} },
    presentation: "sheet",
  });
  return <WorkspaceResourcesContext value={resources}>{children}</WorkspaceResourcesContext>;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  boundary.menu.mockReset();
  boundary.connected = true;
  boundary.operate = true;
  boundary.zone = "Africa/Johannesburg";
  boundary.external.mockResolvedValue(undefined);
  boundary.command.mockResolvedValue({ _tag: "Success", value: undefined });
  window.localStorage.removeItem(savedKey);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.removeItem(savedKey);
});
async function mountChat(
  options: {
    source?: boolean;
    message?: ChatMessage;
    initialRoot?: string | undefined;
    channels?: ChatConversation[];
    messages?: ChatMessage[];
    environmentId?: EnvironmentId | null;
    bot?: boolean;
    missing?: boolean;
  } = {},
) {
  const requests: ChatRequest[] = [];
  const initial = options.message ?? rootMessage;
  const resource = {
    version: 1 as const,
    transport: "desktop" as const,
    connectionId: account.id,
    workspaceId: "T1",
    conversationId: channel.id,
    messageId: initial.id,
    ...(options.initialRoot ? { replyRootId: options.initialRoot } : {}),
  };
  const resourceId = chatResourceId(resource);
  const bridge = Object.getOwnPropertyDescriptor(window, "desktopBridge");
  Object.defineProperty(window, "desktopBridge", {
    configurable: true,
    value: {
      communicationsInvoke: async (request: ChatRequest): Promise<ChatResult> => {
        requests.push(request);
        if (request.operation === "conversations.list")
          return { ok: true, conversations: options.channels ?? [channel] };
        if (request.operation === "messages.list") {
          if (options.bot && request.threadId)
            return { ok: false, error: { code: "unsupported", message: "User token required" } };
          return {
            ok: true,
            messages: options.missing
              ? []
              : request.threadId
                ? [rootMessage, reply]
                : (options.messages ?? [initial]),
            ...(request.cursor ? {} : { nextCursor: "older" }),
          };
        }
        if (request.operation === "messages.send")
          return { ok: true, message: { ...rootMessage, id: "sent", text: request.text } };
        throw new Error("Unexpected request");
      },
    },
  });
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  const render = () =>
    root.render(
      <ResourceProvider>
        <ChatCommunicationsWorkspace
          account={account}
          environmentId={options.environmentId === undefined ? env : options.environmentId}
          {...(options.source
            ? { source: { provider: account.provider, resource, resourceId } }
            : {})}
        />
      </ResourceProvider>,
    );
  await act(render);
  return {
    node,
    requests,
    resourceId,
    render,
    close: async () => {
      await act(() => root.unmount());
      node.remove();
      if (bridge) Object.defineProperty(window, "desktopBridge", bridge);
      else Reflect.deleteProperty(window, "desktopBridge");
    },
  };
}
async function openChannel(node: HTMLElement) {
  await act(() => getByRole(node, "button", { name: /marketing Team/ }).click());
}

it.each(["America/Los_Angeles", "Pacific/Kiritimati"])(
  "uses workspace display zone %s through the calendar formatter",
  async (zone) => {
    boundary.zone = zone;
    const view = await mountChat({ source: true });
    try {
      expect(view.node.querySelector("time")?.textContent).toBe(
        zone === "America/Los_Angeles" ? "02:12" : "23:12",
      );
      expect(view.node.querySelector("time")?.dateTime).toBe(rootMessage.date);
    } finally {
      await view.close();
    }
  },
);

it.each(["bot", "user-top-level", "reply"])(
  "reopens %s into the matching history and composer target",
  async (kind) => {
    const message = kind === "reply" ? reply : rootMessage;
    const view = await mountChat({
      source: true,
      message,
      initialRoot: rootMessage.id,
      bot: kind === "bot",
    });
    try {
      const history = view.requests.filter((r) => r.operation === "messages.list");
      expect(history[0]).toEqual({
        operation: "messages.list",
        accountId: account.id,
        conversationId: channel.id,
      });
      if (kind !== "reply") expect(history).toHaveLength(1);
      expect(queryByRole(view.node, "complementary", { name: "Message thread" }) !== null).toBe(
        kind === "reply",
      );
      expect(view.node.querySelector(`article[aria-current="true"]`)?.textContent).toContain(
        message.text,
      );
      const area =
        kind === "reply"
          ? getByRole(view.node, "complementary", { name: "Message thread" })
          : getByRole(view.node, "region", { name: "Chat history" });
      await act(() =>
        fireEvent.change(getByRole(area, "textbox", { name: "Message text" }), {
          target: { value: "Hello" },
        }),
      );
      await act(() => fireEvent.submit(area.querySelector("form")!));
      expect(view.requests.find((r) => r.operation === "messages.send")).toEqual(
        expect.objectContaining({
          conversationId: channel.id,
          ...(kind === "reply" ? { replyToId: rootMessage.id } : {}),
        }),
      );
      if (kind !== "reply")
        expect(view.requests.find((r) => r.operation === "messages.send")).not.toHaveProperty(
          "replyToId",
        );
      await act(() => getByRole(view.node, "button", { name: "Load earlier messages" }).click());
      expect(view.requests.at(-1)).toEqual({
        operation: "messages.list",
        accountId: account.id,
        conversationId: channel.id,
        cursor: "older",
      });
      if (kind === "reply") {
        await act(() => getByRole(view.node, "button", { name: "Load more replies" }).click());
        expect(view.requests.at(-1)).toEqual({
          operation: "messages.list",
          accountId: account.id,
          conversationId: channel.id,
          threadId: rootMessage.id,
          cursor: "older",
        });
      }
    } finally {
      await view.close();
    }
  },
);

it("tabbing through messages neither retargets actions nor starts lookups; explicit select and Escape do", async () => {
  const view = await mountChat({ messages: [rootMessage, reply] });
  try {
    await openChannel(view.node);
    const articles = getAllByRole(view.node, "article");
    const before = boundary.lookup.mock.calls.length;
    for (const row of articles)
      await act(() => {
        fireEvent.keyDown(row, { key: "Tab" });
        row.focus();
      });
    expect(boundary.lookup).toHaveBeenCalledTimes(before);
    expect(articles.every((row) => !row.hasAttribute("aria-current"))).toBe(true);
    boundary.menu.mockResolvedValueOnce("project:p1");
    await act(() => getByRole(view.node, "button", { name: "Add to project" }).click());
    expect(boundary.command.mock.calls.at(-1)?.[1].input.a.ref).toEqual(
      chatEndpoint(account, channel)!.ref,
    );
    await act(() => fireEvent.keyDown(articles[1]!, { key: "Enter" }));
    expect(articles[1]!.getAttribute("aria-current")).toBe("true");
    expect(articles[1]!.className).toContain("bg-sidebar-row-active");
    expect(getByRole(view.node, "button", { name: "Clear message selection" })).toBeDefined();
    boundary.menu.mockResolvedValueOnce("project:p1");
    await act(() => getByRole(view.node, "button", { name: "Add to project" }).click());
    expect(boundary.command.mock.calls.at(-1)?.[1].input.a.ref).toEqual(
      chatEndpoint(account, channel, reply)!.ref,
    );
    await act(() => fireEvent.keyDown(articles[1]!, { key: "Escape" }));
    expect(articles[1]!.hasAttribute("aria-current")).toBe(false);
  } finally {
    await view.close();
  }
});

it.each(["conversation", "message"])(
  "keeps the %s menu trigger visible and reserves row space",
  async (kind) => {
    const view = await mountChat();
    try {
      if (kind === "message") await openChannel(view.node);
      const row =
        kind === "message"
          ? getByRole(view.node, "article")
          : getByRole(view.node, "button", { name: /marketing Team/ });
      await act(() => fireEvent.keyDown(row, { key: "ContextMenu" }));
      const host = row.closest("[data-workspace-menu-open=true]")!;
      expect(host).not.toBeNull();
      const trigger = getByRole(host as HTMLElement, "button", { name: "Item actions" });
      expect(trigger.parentElement!.className).toContain(
        "group-has-[[data-workspace-menu-open=true]]/chatrow:opacity-100",
      );
      expect(trigger.closest(".group\\/chatrow")).not.toBeNull();
      expect(trigger.parentElement!.className).toContain("right-3");
      expect(row.className).toContain("pr-12");
      if (kind === "message") expect(row.getAttribute("aria-current")).toBe("true");
      await act(() => fireEvent.keyDown(trigger, { key: "Escape" }));
      expect(queryByRole(document.body, "dialog")).toBeNull();
    } finally {
      await view.close();
    }
  },
);

it("matches exact legacy saved messages, renders them in Later and toggles without duplicates or rewriting", async () => {
  const old = {
    provider: account.provider,
    accountId: account.id,
    conversationId: channel.id,
    messageId: rootMessage.id,
  };
  const foreign = { ...old, accountId: "other" };
  window.localStorage.setItem(savedKey, JSON.stringify([old, foreign]));
  const view = await mountChat({ source: true });
  try {
    expect(
      getByRole(view.node, "button", { name: "Remove from Later" }).getAttribute("aria-pressed"),
    ).toBe("true");
    await act(() => getByRole(view.node, "button", { name: "Later" }).click());
    expect(getByText(view.node, rootMessage.text)).toBeDefined();
    expect(queryByRole(view.node, "list", { name: "Unavailable saved references" })).toBeNull();
    expect(JSON.parse(window.localStorage.getItem(savedKey)!)).toEqual([old, foreign]);
    await act(() => getByRole(view.node, "button", { name: "Remove from Later" }).click());
    expect(JSON.parse(window.localStorage.getItem(savedKey)!)).toEqual([foreign]);
    await act(() => getByRole(view.node, "button", { name: "Home" }).click());
    await act(() => getByRole(view.node, "button", { name: "Save for Later" }).click());
    const entries = JSON.parse(window.localStorage.getItem(savedKey)!);
    expect(entries).toHaveLength(2);
    expect(entries[1]).toEqual(
      expect.objectContaining({ environmentId: env, resourceId: view.resourceId }),
    );
  } finally {
    await view.close();
  }
});

it.each(["no-environment", "reopen", "too-long"])(
  "shows the true %s reason once per list",
  async (kind) => {
    const { workspaceId: _workspaceId, ...oldChannel } = channel;
    const channels =
      kind === "reopen"
        ? [oldChannel, { ...oldChannel, id: "C2", title: "second" }]
        : kind === "too-long"
          ? [{ ...channel, id: "x".repeat(81) }]
          : [channel];
    const view = await mountChat({
      channels,
      environmentId: kind === "no-environment" ? null : env,
    });
    try {
      const reason =
        kind === "no-environment"
          ? "Choose an environment to use chat actions."
          : kind === "reopen"
            ? "Reopen this account in an updated desktop app to use chat actions."
            : "This conversation or message address is too long to link.";
      expect(getByText(view.node, reason)).toBeDefined();
      expect(queryByRole(view.node, "button", { name: "Item actions" })).toBeNull();
    } finally {
      await view.close();
    }
  },
);

it("retains a deleted message with its reason and unchanged reference", async () => {
  const view = await mountChat({ source: true, missing: true });
  try {
    expect(
      getByText(
        view.node,
        "This message is unavailable. It may have been deleted or be outside the messages loaded here. Its saved link has been kept.",
      ),
    ).toBeDefined();
    boundary.menu.mockResolvedValueOnce("project:p1");
    await act(() => getByRole(view.node, "button", { name: "Add to project" }).click());
    expect(boundary.command.mock.calls.at(-1)?.[1].input.a.ref.resourceId).toBe(view.resourceId);
  } finally {
    await view.close();
  }
});

it("captures each message endpoint once and reuses it through search, menu and saving", async () => {
  const capture = vi.spyOn(chat, "chatItem");
  const captureEndpoint = vi.spyOn(chat, "chatEndpoint");
  const view = await mountChat();
  try {
    await openChannel(view.node);
    const messageCaptures = () =>
      [...capture.mock.calls, ...captureEndpoint.mock.calls].filter(
        (args) => args[2]?.id === rootMessage.id,
      );
    expect(messageCaptures()).toHaveLength(1);
    await act(() =>
      fireEvent.change(getByRole(view.node, "textbox", { name: "Search loaded conversations" }), {
        target: { value: "marketing" },
      }),
    );
    expect(messageCaptures()).toHaveLength(1);
    const row = getByRole(view.node, "article");
    await act(() => fireEvent.keyDown(row, { key: "ContextMenu" }));
    boundary.menu.mockResolvedValueOnce("project:p1");
    const dialog = getByRole(document.body, "dialog");
    await act(() => getByRole(dialog, "button", { name: "Add to project" }).click());
    const endpoint = boundary.command.mock.calls.at(-1)?.[1].input.a.ref;
    await act(() => getByRole(view.node, "button", { name: "Save for Later" }).click());
    expect(JSON.parse(window.localStorage.getItem(savedKey)!)[0].resourceId).toBe(
      endpoint.resourceId,
    );
    expect(messageCaptures()).toHaveLength(1);
  } finally {
    capture.mockRestore();
    captureEndpoint.mockRestore();
    await view.close();
  }
});

it("keeps unloaded legacy saves readable and removable without showing raw IDs", async () => {
  const old = {
    provider: account.provider,
    accountId: account.id,
    conversationId: channel.id,
    messageId: "old-ts",
  };
  window.localStorage.setItem(savedKey, JSON.stringify([old]));
  const view = await mountChat({ source: true });
  try {
    expect(
      getByRole(view.node, "button", { name: "Save for Later" }).getAttribute("aria-pressed"),
    ).toBe("false");
    await act(() => getByRole(view.node, "button", { name: "Later" }).click());
    const list = getByRole(view.node, "list", { name: "Unavailable saved references" });
    expect(list.textContent).toContain("marketing: Saved message (details unavailable)");
    expect(list.textContent).not.toContain("old-ts");
    expect(
      getByText(list, "This saved message is outside the messages loaded here or was removed."),
    ).toBeDefined();
    expect(JSON.parse(window.localStorage.getItem(savedKey)!)).toEqual([old]);
    await act(() => getByRole(list, "button", { name: "Remove from Later" }).click());
    expect(JSON.parse(window.localStorage.getItem(savedKey)!)).toEqual([]);
  } finally {
    await view.close();
  }
});

it.each(["connected", "operate"] as const)(
  "gates saving and sending when %s is revoked",
  async (permission) => {
    const view = await mountChat({ source: true });
    try {
      boundary[permission] = false;
      await act(view.render);
      const save = getByRole(view.node, "button", { name: "Save for Later" });
      expect(save.hasAttribute("disabled")).toBe(true);
      await act(() => save.click());
      expect(window.localStorage.getItem(savedKey)).toBeNull();
      const area = getByRole(view.node, "region", { name: "Chat history" });
      await act(() =>
        fireEvent.change(getByRole(area, "textbox", { name: "Message text" }), {
          target: { value: "Do not send" },
        }),
      );
      await act(() => fireEvent.submit(area.querySelector("form")!));
      expect(view.requests.some((request) => request.operation === "messages.send")).toBe(false);
    } finally {
      await view.close();
    }
  },
);
