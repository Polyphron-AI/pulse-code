import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";
import { MailSpace } from "./MailSpace";
import { ProjectsSpace } from "../ProjectsSpace";
const mocks = vi.hoisted(() => ({ navigate: vi.fn(), search: {} as Record<string, string> }));
const task = { type: "task" as const, taskId: "wskt_00000000-0000-0000-0000-000000000001" };
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useSearch: () => mocks.search,
  Link: "a",
}));
vi.mock("../../../hooks/useLocalStorage", () => ({ useLocalStorage: () => ["messages", vi.fn()] }));
vi.mock("./useMailCapabilities", () => ({
  useMailCapabilities: () => ({
    environmentId: EnvironmentId.make("remote-env"),
    ready: true,
    mailRead: true,
    workspaceLinks: true,
    workspaceTools: true,
  }),
}));
vi.mock("../../../state/entities", () => ({
  useProjects: () => [],
  useThreadShells: () => [],
  useAllEnvironmentProjectSnapshotsReady: () => true,
}));
vi.mock("../../../hooks/useNewProject", () => ({ useNewProject: () => vi.fn() }));
vi.mock("../../../mail/mailState", () => ({ pulseMailAccounts: () => "accounts" }));
vi.mock("../../../mail/mailReadState", () => ({ pulseMailMessage: () => "message" }));
vi.mock("../../../state/workspaceLinks", () => ({
  workspaceLinks: { list: () => "links", projectHub: () => null },
}));
vi.mock("../../../state/workspaceTools", () => ({ workspaceTools: { task: () => "task" } }));
vi.mock("../../../state/query", () => ({
  useEnvironmentQuery: (query: string) => ({
    data:
      query === "accounts"
        ? [{ id: "account" }]
        : query === "links"
          ? {
              linked: [
                { id: "link", item: { ref: task, title: "Follow up" }, source: { type: "user" } },
              ],
            }
          : null,
    error: query === "task" ? "This task is unavailable." : null,
    refresh: vi.fn(),
  }),
}));
vi.mock("./useMailLinks", () => ({
  useMailLinks: () => ({ linkItem: vi.fn(), unlink: vi.fn() }),
  linkErrorText: String,
}));
vi.mock("../WorkspaceEngagement", () => ({
  WorkspaceEngagement: ({ children, linked }: { children: ReactNode; linked: ReactNode }) => (
    <>
      <div>{children}</div>
      <aside>{linked}</aside>
    </>
  ),
}));
vi.mock("../WorkspaceItemActions", () => ({
  WorkspaceItemMenu: ({ children }: { children: ReactNode }) => children,
  WorkspaceItemActions: () => null,
}));
vi.mock("../WorkspaceToolsPanel", () => ({ WorkspaceToolsPanel: () => null }));
vi.mock("../DriveFiles", () => ({ DriveSearch: () => null, DriveFileAccess: () => null }));
vi.mock("../SuggestedSection", () => ({ SuggestedSection: () => null }));
vi.mock("../ProjectTasks", () => ({
  ProjectTasks: () => null,
  ProjectWorkspaceSettings: () => null,
}));
vi.mock("../../ui/sidebar", () => ({ SidebarInset: "main" }));
vi.mock("../../ui/button", () => ({ Button: "button" }));
vi.mock("../../ui/input", () => ({ Input: "input" }));
vi.mock("../../ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => children,
  PopoverTrigger: "button",
  PopoverPopup: "aside",
}));
vi.mock("./MailMessageView", () => ({ MailMessageView: () => null }));
vi.mock("./MailMessageList", () => ({ MailMessageList: () => null }));
vi.mock("./MailConversationList", () => ({ MailConversationList: () => null }));
vi.mock("./ProjectMailList", () => ({ ProjectMailList: () => null }));
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  if (renderer) await act(() => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("opens a Mail Linked task through its environment-scoped Projects route and shows deleted-task unavailability", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.search = {
    environment: "remote-env",
    account: "account",
    item: JSON.stringify({ type: "mail", accountId: "account", messageId: "<fixture@test>" }),
  };
  await act(() => {
    renderer = create(<MailSpace />);
  });
  const row = renderer!.root
    .findAllByType("button")
    .find(
      (node) => Array.isArray(node.props.children) && node.props.children.includes("Follow up"),
    )!;
  expect(row.props.disabled).toBe(false);
  await act(() => row.props.onClick());
  expect(mocks.navigate).toHaveBeenCalledWith({
    to: "/workspace",
    search: { space: "projects", environment: "remote-env", item: JSON.stringify(task) },
  });
  mocks.search = mocks.navigate.mock.calls[0]![0].search;
  await act(() => {
    renderer!.update(<ProjectsSpace />);
  });
  expect(JSON.stringify(renderer!.toJSON())).toContain("This task is unavailable.");
});
