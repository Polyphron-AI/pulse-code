// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getByRole, getByText } from "@testing-library/dom";
import { beforeEach, afterEach, expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  parseChatResourceId,
  workspaceItemFromUrl,
  type WorkspaceItemRef,
  type WorkspaceLinkEndpoint,
} from "@t3tools/contracts";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { WorkspaceItemActions, WorkspaceItemMenu } from "./WorkspaceItemActions";
import { useWorkspaceItemOpener } from "./useWorkspaceItemOpener";
import { useMailLinks } from "./mail/useMailLinks";
import { parseWorkspaceItemDrag } from "./mail/linkedItems";
import { chatEndpoint, chatReferenceKey } from "./communicationsChat";
import { useComposerDraftStore } from "../../composerDraftStore";
import { newDraftId } from "../../lib/utils";

const boundary = vi.hoisted(() => ({
  menu: vi.fn(),
  command: vi.fn(),
  navigate: vi.fn(),
  external: vi.fn(),
  startThread: vi.fn(),
  connected: true,
  operate: true,
  toast: vi.fn(),
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
  useEnvironmentQuery: () => ({ data: { linked: [] }, error: null, refresh: () => {} }),
}));
vi.mock("../../state/workspaceLinks", () => ({
  workspaceLinks: { list: () => null, link: "link", unlink: "unlink" },
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

const environmentId = EnvironmentId.make("source-env");
const account = {
  id: "slack_a",
  provider: "slack" as const,
  label: "Renamable label",
  identity: "A",
};
const conversation = {
  id: "C1",
  accountId: account.id,
  workspace: "Renamable workspace",
  workspaceId: "T1",
  title: "marketing",
  kind: "channel" as const,
  canSend: false,
};
const message = {
  id: "1760343120.000002",
  accountId: account.id,
  conversationId: "C1",
  threadId: "1760343120.000001",
  author: "A",
  date: "2026-10-13T09:12:00Z",
  text: "Original",
};
const a = chatEndpoint(account, conversation, message)!;
const b = chatEndpoint(account, { ...conversation, id: "C2" })!;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  boundary.menu.mockReset();
  boundary.connected = true;
  boundary.operate = true;
  boundary.external.mockResolvedValue(undefined);
  boundary.command.mockResolvedValue({ _tag: "Success", value: undefined });
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function mount() {
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  return {
    node,
    root,
    close: async () => {
      await act(() => root.unmount());
      node.remove();
    },
  };
}
function Row({ item }: { item: WorkspaceLinkEndpoint }) {
  const { unlink } = useMailLinks(environmentId);
  return (
    <>
      <WorkspaceItemMenu environmentId={environmentId} item={item}>
        <button>Conversation row</button>
      </WorkspaceItemMenu>
      <button onClick={() => void unlink("wl_00000000-0000-4000-8000-000000000001")}>Unlink</button>
    </>
  );
}

it.each([false, true])(
  "pins the clicked message and original viewing endpoint after selecting B, cancel=%s",
  async (cancel) => {
    const view = await mount();
    try {
      await act(() => view.root.render(<Row item={a} />));
      await act(() => fireEvent.contextMenu(view.node.querySelector('[draggable="true"]')!));
      await act(() => view.root.render(<Row item={b} />));
      boundary.menu.mockResolvedValueOnce(cancel ? null : "project:p1");
      await act(() => getByRole(document.body, "button", { name: "Add to project" }).click());
      if (cancel) expect(boundary.command).not.toHaveBeenCalled();
      else
        expect(boundary.command).toHaveBeenCalledWith("link", {
          environmentId,
          input: {
            a,
            b: { ref: { type: "project", projectId: "p1" }, title: "Project" },
            viewing: a,
            source: { type: "action", action: "add-to-project" },
          },
        });
      expect(boundary.navigate).not.toHaveBeenCalled();
    } finally {
      await view.close();
    }
  },
);

it("links, unlinks and relinks the same endpoint and origin", async () => {
  const view = await mount();
  try {
    await act(() => view.root.render(<Row item={a} />));
    for (let count = 0; count < 2; count++) {
      await act(() => fireEvent.contextMenu(view.node.querySelector('[draggable="true"]')!));
      boundary.menu.mockResolvedValueOnce("project:p1");
      await act(() => getByRole(document.body, "button", { name: "Add to project" }).click());
      if (count === 0) await act(() => getByRole(view.node, "button", { name: "Unlink" }).click());
    }
    const writes = boundary.command.mock.calls;
    expect(writes.map(([command]) => command)).toEqual(["link", "unlink", "link"]);
    expect(writes[0]).toEqual(writes[2]);
    expect(writes[1]).toEqual([
      "unlink",
      { environmentId, input: { id: "wl_00000000-0000-4000-8000-000000000001" } },
    ]);
  } finally {
    await view.close();
  }
});

it("allows a same-environment drop and refuses a foreign endpoint without a write", async () => {
  const view = await mount();
  try {
    await act(() => view.root.render(<Row item={a} />));
    for (const sourceEnvironment of [environmentId, "other-env"]) {
      const raw = JSON.stringify({ environmentId: sourceEnvironment, item: b });
      expect(parseWorkspaceItemDrag(raw, environmentId)).toEqual(
        sourceEnvironment === environmentId ? b : undefined,
      );
      await act(() =>
        fireEvent.drop(view.node.querySelector('[draggable="true"]')!, {
          dataTransfer: { getData: () => raw },
        }),
      );
    }
    expect(boundary.command).toHaveBeenCalledExactlyOnceWith("link", {
      environmentId,
      input: { a, b, viewing: a },
    });
    expect(getByText(document.body, "Drop an item from this environment.")).toBeDefined();
  } finally {
    await view.close();
  }
});

it.each(["connected", "operate"] as const)(
  "prevents detail writes when %s is revoked",
  async (permission) => {
    const view = await mount();
    try {
      boundary[permission] = false;
      await act(() =>
        view.root.render(<WorkspaceItemActions environmentId={environmentId} item={a} />),
      );
      boundary.menu.mockResolvedValueOnce("project:p1");
      await act(() => getByRole(view.node, "button", { name: "Add to project" }).click());
      expect(boundary.command).not.toHaveBeenCalled();
    } finally {
      await view.close();
    }
  },
);

it("uses source identity and the same Slack reply root for menus, save and retained chips", () => {
  expect(parseChatResourceId(a.ref.type === "provider-resource" ? a.ref.resourceId : "")).toEqual({
    version: 1,
    transport: "desktop",
    connectionId: account.id,
    workspaceId: "T1",
    conversationId: "C1",
    messageId: message.id,
    replyRootId: message.threadId,
  });
  expect(chatEndpoint(account, { ...conversation, workspace: "Renamed" }, message)).toEqual(a);
  const { threadId: _threadId, ...parent } = message;
  const root = chatEndpoint(account, conversation, parent)!;
  expect(
    parseChatResourceId(root.ref.type === "provider-resource" ? root.ref.resourceId : "")
      ?.replyRootId,
  ).toBeUndefined();
  const { workspaceId: _workspaceId, ...legacyConversation } = conversation;
  expect(chatEndpoint(account, legacyConversation, message)).toBeUndefined();
  const discord = chatEndpoint({ ...account, provider: "discord" }, conversation, message)!;
  expect(
    parseChatResourceId(discord.ref.type === "provider-resource" ? discord.ref.resourceId : ""),
  ).not.toHaveProperty("replyRootId");
  const resourceId = a.ref.type === "provider-resource" ? a.ref.resourceId : "";
  const saved = {
    provider: "slack",
    accountId: account.id,
    conversationId: conversation.id,
    messageId: message.id,
    resourceId,
    environmentId,
  };
  expect(chatReferenceKey(saved)).not.toBe(
    chatReferenceKey({ ...saved, environmentId: "other-env" }),
  );
});

function Opener({
  item,
  openPage,
}: {
  item: WorkspaceItemRef;
  openPage?: ((ref: Extract<WorkspaceItemRef, { type: "url" }>) => void) | undefined;
}) {
  const open = useWorkspaceItemOpener(environmentId, openPage ? { openPage } : {});
  return <button onClick={() => open(item)}>Open item</button>;
}
it("opens a Slack endpoint in its captured environment and account", async () => {
  const view = await mount();
  try {
    await act(() => view.root.render(<Opener item={a.ref} />));
    await act(() => getByRole(view.node, "button").click());
    expect(boundary.navigate).toHaveBeenCalledWith({
      to: "/workspace",
      search: {
        space: "communications",
        communicationProvider: "slack",
        environment: environmentId,
        account: account.id,
        item: a.ref.type === "provider-resource" ? a.ref.resourceId : "",
      },
    });
  } finally {
    await view.close();
  }
});

it("opens normalized Teams URLs through this client's external opener even with a resource Browser", async () => {
  const view = await mount();
  const openPage = vi.fn();
  try {
    const item = workspaceItemFromUrl(
      "https://teams.microsoft.com/l/message/room/message?context=keep&utm_source=mail#fragment",
    )!;
    await act(() => view.root.render(<Opener item={item} openPage={openPage} />));
    await act(() => getByRole(view.node, "button").click());
    expect(boundary.external).toHaveBeenCalledExactlyOnceWith(
      "https://teams.microsoft.com/l/message/room/message?context=keep",
    );
    expect(boundary.navigate).not.toHaveBeenCalled();
    expect(openPage).not.toHaveBeenCalled();
  } finally {
    await view.close();
  }
});

it("retains the exact clicked Slack message and origin in a new thread's composer chips", async () => {
  const view = await mount();
  const draftId = newDraftId();
  boundary.startThread.mockResolvedValueOnce({ draftId, threadId: ThreadId.make("thread") });
  const retain = vi
    .spyOn(useComposerDraftStore.getState(), "addThreadContexts")
    .mockImplementation(() => {});
  try {
    await act(() => view.root.render(<Row item={a} />));
    await act(() => fireEvent.contextMenu(view.node.querySelector('[draggable="true"]')!));
    await act(() => view.root.render(<Row item={b} />));
    boundary.menu.mockResolvedValueOnce("project:p1");
    await act(() => getByRole(document.body, "button", { name: "Start thread" }).click());
    expect(retain).toHaveBeenCalledWith(
      draftId,
      [expect.objectContaining({ kind: "workspace-item", item: a, viewing: a })],
      { insertAtCaret: false },
    );
    expect(boundary.command).not.toHaveBeenCalled();
  } finally {
    retain.mockRestore();
    await view.close();
  }
});

it.each(["connected", "operate"] as const)(
  "refuses a pending picker after %s is revoked",
  async (permission) => {
    const view = await mount();
    let resolvePicker!: (value: string | null) => void;
    const picker = new Promise<string | null>((resolve) => {
      resolvePicker = resolve;
    });
    boundary.menu.mockReturnValueOnce(picker);
    try {
      await act(() =>
        view.root.render(<WorkspaceItemActions environmentId={environmentId} item={a} />),
      );
      await act(() => getByRole(view.node, "button", { name: "Add to project" }).click());
      expect(boundary.menu).toHaveBeenCalledTimes(1);
      boundary[permission] = false;
      await act(() =>
        view.root.render(<WorkspaceItemActions environmentId={environmentId} item={a} />),
      );
      await act(async () => {
        resolvePicker("project:p1");
        await picker;
      });
      expect(boundary.command).not.toHaveBeenCalled();
    } finally {
      await view.close();
    }
  },
);

it.each(["teams.microsoft.com", "teams.microsoft.us", "teams.live.com", "teams.cloud.microsoft"])(
  "hands off the anchored Teams host %s",
  async (host) => {
    const view = await mount();
    const openPage = vi.fn();
    try {
      await act(() =>
        view.root.render(
          <Opener item={{ type: "url", url: `https://${host}/l/message/x` }} openPage={openPage} />,
        ),
      );
      await act(() => getByRole(view.node, "button").click());
      expect(boundary.external).toHaveBeenCalledWith(`https://${host}/l/message/x`);
      expect(openPage).not.toHaveBeenCalled();
    } finally {
      await view.close();
    }
  },
);

it.each(["javascript:alert(1)", "file:///C:/x.exe"])(
  "rejects %s at the opener with feedback",
  async (url) => {
    const view = await mount();
    const openPage = vi.fn();
    try {
      for (const page of [undefined, openPage]) {
        await act(() => view.root.render(<Opener item={{ type: "url", url }} openPage={page} />));
        await act(() => getByRole(view.node, "button").click());
      }
      expect(boundary.external).not.toHaveBeenCalled();
      expect(boundary.navigate).not.toHaveBeenCalled();
      expect(openPage).not.toHaveBeenCalled();
      expect(boundary.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "This item cannot be opened here." }),
      );
    } finally {
      await view.close();
    }
  },
);

it("keeps a lookalike Teams host in the Browser", async () => {
  const view = await mount();
  const openPage = vi.fn();
  const item = { type: "url" as const, url: "https://teams.microsoft.com.evil.example/x" };
  try {
    await act(() => view.root.render(<Opener item={item} openPage={openPage} />));
    await act(() => getByRole(view.node, "button").click());
    expect(boundary.external).not.toHaveBeenCalled();
    expect(openPage).toHaveBeenCalledWith(item);
  } finally {
    await view.close();
  }
});

it("reports a failed external handoff", async () => {
  const view = await mount();
  boundary.external.mockRejectedValueOnce(new Error("OS refused"));
  try {
    await act(() =>
      view.root.render(<Opener item={{ type: "url", url: "https://teams.cloud.microsoft/x" }} />),
    );
    await act(() => getByRole(view.node, "button").click());
    expect(boundary.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Unable to open this link. Try again from the source app.",
      }),
    );
  } finally {
    await view.close();
  }
});
