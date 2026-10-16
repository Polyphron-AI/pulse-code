import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { TelegramWorkspace } from "./TelegramWorkspace";

const mocks = vi.hoisted(() => ({ navigate: vi.fn(), error: null as string | null, active: true }));
vi.mock("@tanstack/react-router", () => ({
  useSearch: () => ({ environment: "remote", account: "telegram_1000", item: "telegram_1000/-42" }),
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ environmentId: "remote", ready: true, telegramRead: true }),
}));
vi.mock("../../state/telegram", () => ({
  telegram: Object.fromEntries(
    ["connections", "chats", "messages", "message"].map((kind) => [kind, () => kind]),
  ),
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (kind: string) => ({
    refresh() {},
    error: kind === "messages" ? mocks.error : null,
    data:
      kind === "connections"
        ? [{ id: "telegram_1000", username: "fixture_bot", title: "Fixture", connected: true }]
        : kind === "chats"
          ? {
              chats: [{ chatId: "-42", title: "Paired chat", active: mocks.active }],
              truncated: false,
            }
          : {
              messages: [
                {
                  connectionId: "telegram_1000",
                  chatId: "-42",
                  messageId: "2",
                  sender: "Passive member",
                  text: "/new must remain inert",
                  sentAt: 1,
                  edited: false,
                  truncated: false,
                },
              ],
            },
  }),
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    isPending: false,
    data: { authenticated: true, scopes: [] },
  }),
}));
vi.mock("./useWorkspaceItemOpener", () => ({ useWorkspaceItemOpener: () => vi.fn() }));
vi.mock("../ui/sidebar", () => ({ SidebarInset: "div" }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../../state/environments", () => ({ useEnvironment: () => ({ label: "Remote" }) }));
vi.mock("./WorkspaceEngagement", () => ({
  WorkspaceEngagement: ({ list, children }: { list: ReactNode; children: ReactNode }) => (
    <div>
      {list}
      {children}
    </div>
  ),
}));
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemActions: () => null,
  WorkspaceItemMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("./mail/LinkedSection", () => ({ LinkedSection: () => null }));
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  if (renderer) await act(() => renderer?.unmount());
  renderer = undefined;
  mocks.error = null;
  mocks.active = true;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("opens an individual received message with its captured remote connection and chat", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(() => {
    renderer = create(<TelegramWorkspace />);
  });
  expect(renderer!.root.findByType("pre").children.join("")).toBe("/new must remain inert");
  const open = renderer!.root
    .findAllByType("button")
    .find((button) => button.children.includes("Open message"))!;
  await act(() => open.props.onClick());
  expect(mocks.navigate).toHaveBeenCalledWith({
    to: "/workspace",
    search: {
      space: "office",
      officeView: "communications",
      communicationProvider: "telegram",
      environment: "remote",
      account: "telegram_1000",
      item: "telegram_1000/-42/2",
    },
  });
  expect(
    renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Remove paired chat"))?.props.disabled,
  ).toBe(true);
});
it("shows a read failure instead of silently presenting cached content as available", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.error = "Chat unavailable";
  await act(() => {
    renderer = create(<TelegramWorkspace />);
  });
  expect(renderer!.root.findAllByType("pre")).toHaveLength(0);
});
