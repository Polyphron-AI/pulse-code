// @vitest-environment happy-dom
import { act, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { getByRole, getAllByRole, getByText } from "@testing-library/dom";
import { beforeAll, expect, it, vi } from "vite-plus/test";
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
  search: {
    space: "communications" as const,
    communicationProvider: "slack" as const,
    environment: "source-env",
    account: "slack_a",
    item: "",
    view: "chats" as "chats" | "later",
  },
  listeners: new Set<() => void>(),
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
  createFileRoute: () => (options: object) => ({
    options,
    useSearch: () =>
      useSyncExternalStore(
        (listener) => {
          boundary.listeners.add(listener);
          return () => {
            boundary.listeners.delete(listener);
          };
        },
        () => boundary.search,
      ),
  }),
  useSearch: () =>
    useSyncExternalStore(
      (listener) => {
        boundary.listeners.add(listener);
        return () => {
          boundary.listeners.delete(listener);
        };
      },
      () => boundary.search,
    ),
  Link: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
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
  useMailCapabilities: () => ({
    environmentId: EnvironmentId.make("source-env"),
    workspaceLinks: true,
    workspaceItemContext: true,
  }),
}));
vi.mock("../../hooks/useHandleNewThread", () => ({
  useNewThreadHandler: () => boundary.startThread,
}));
vi.mock("../../hooks/useNewProject", () => ({ useNewProject: () => async () => false }));

vi.mock("./calendar/CalendarSpace", () => ({
  CalendarNotesProvider: ({ children }: { children: ReactNode }) => children,
  CalendarSpace: () => null,
}));
vi.mock("./mail/MailSpace", () => ({ MailSpace: () => null }));
vi.mock("./ProjectsSpace", () => ({ ProjectsSpace: () => null }));
vi.mock("./OfficeWorkspace", () => ({ OfficeWorkspace: () => null }));
vi.mock("./TasksSpace", () => ({ TasksSpace: () => null }));
vi.mock("./meetings/MeetingsSpace", () => ({ MeetingsSpace: () => null }));
import { Route } from "../../routes/_chat.workspace";
import { CommunicationsWorkspace, type ChatSource } from "./CommunicationsWorkspace";
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
function ResourceProvider({ children }: { children: ReactNode }) {
  const resources = useWorkspaceResourceState(env, {
    storage: { getItem: () => null, setItem: () => {} },
    presentation: "sheet",
  });
  return <WorkspaceResourcesContext value={resources}>{children}</WorkspaceResourcesContext>;
}

const Component = Route.options.component!;
beforeAll(async () => {
  await Component.preload?.();
});

it.each(["route search", "equal source"])(
  "keeps loaded pages and makes no provider requests on a new %s",
  async (change) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    boundary.search = {
      ...boundary.search,
      item: chatResourceId({
        version: 1,
        transport: "desktop",
        connectionId: account.id,
        workspaceId: "T1",
        conversationId: channel.id,
      }),
      view: "chats",
    };
    boundary.connected = true;
    boundary.operate = true;
    const requests: ChatRequest[] = [];
    const bridge = Object.getOwnPropertyDescriptor(window, "desktopBridge");
    Object.defineProperty(window, "desktopBridge", {
      configurable: true,
      value: {
        communicationsInvoke: async (request: ChatRequest): Promise<ChatResult> => {
          requests.push(request);
          if (request.operation === "accounts.list") return { ok: true, accounts: [account] };
          if (request.operation === "conversations.list")
            return request.cursor
              ? { ok: true, conversations: [{ ...channel, id: "C2", title: "Second page" }] }
              : { ok: true, conversations: [channel], nextCursor: "page2" };
          if (request.operation === "messages.list") return { ok: true, messages: [rootMessage] };
          throw new Error("Unexpected write");
        },
      },
    });
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    const source: ChatSource = {
      provider: "slack",
      resourceId: boundary.search.item,
      resource: {
        version: 1,
        transport: "desktop",
        connectionId: account.id,
        workspaceId: "T1",
        conversationId: channel.id,
      },
    };
    const render = (nextSource: ChatSource) =>
      root.render(
        <ResourceProvider>
          {change === "route search" ? (
            <Component />
          ) : (
            <CommunicationsWorkspace source={nextSource} />
          )}
        </ResourceProvider>,
      );
    try {
      await act(() => render(source));
      expect(getByText(node, rootMessage.text)).toBeDefined();
      await act(() =>
        getAllByRole(node, "button", { name: "Load more conversations" })[0]!.click(),
      );
      expect(getByRole(node, "button", { name: /Second page Team/ })).toBeDefined();
      const before = requests.length;
      await act(() => {
        if (change === "route search") {
          boundary.search = { ...boundary.search, view: "later" };
          boundary.listeners.forEach((listener) => listener());
        } else {
          const nextSource = { ...source, resource: { ...source.resource } };
          expect(nextSource).not.toBe(source);
          expect(nextSource).toEqual(source);
          render(nextSource);
        }
      });
      expect(requests).toHaveLength(before);
      expect(requests.filter((request) => request.operation === "accounts.list")).toHaveLength(1);
      expect(requests.filter((request) => request.operation === "conversations.list")).toHaveLength(
        2,
      );
      expect(getByRole(node, "button", { name: /Second page Team/ })).toBeDefined();
    } finally {
      await act(() => root.unmount());
      node.remove();
      if (bridge) Object.defineProperty(window, "desktopBridge", bridge);
      else Reflect.deleteProperty(window, "desktopBridge");
      vi.unstubAllGlobals();
    }
  },
);
