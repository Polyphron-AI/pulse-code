import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId } from "@t3tools/contracts";
import { MailSpace } from "./MailSpace";
import { ProjectsSpace } from "../ProjectsSpace";
import { LinkedSection } from "./LinkedSection";
import { WorkspaceHeader, type WorkspaceHeaderModel } from "../WorkspaceHeader";
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  environment: "remote-env",
  search: {} as Record<string, string>,
}));
const task = { type: "task" as const, taskId: "wskt_00000000-0000-0000-0000-000000000001" };
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useSearch: () => mocks.search,
  Link: "a",
}));
vi.mock("../../../hooks/useLocalStorage", () => ({ useLocalStorage: () => ["messages", vi.fn()] }));
vi.mock("./useMailCapabilities", () => ({
  useMailCapabilities: () => ({
    environmentId: EnvironmentId.make(mocks.environment),
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
vi.mock("../../../state/environments", () => ({ useEnvironment: () => ({ label: "Remote" }) }));
vi.mock("./MailNav", () => ({ MailNav: () => null }));
vi.mock("../ProjectsNav", () => ({ ProjectsNav: () => null }));
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
        ? [
            { id: "account", address: "first@example.test" },
            { id: "second", address: "second@example.test" },
          ]
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
  WorkspaceEngagement: ({
    children,
    resources,
    header,
    list,
  }: {
    children: ReactNode;
    resources: ReactNode;
    header: WorkspaceHeaderModel;
    list?: ReactNode;
  }) => (
    <>
      <WorkspaceHeader model={header} resourcesOpen={false} onResources={() => {}} />
      {list}
      <div>{children}</div>
      <aside>{resources}</aside>
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
  mocks.environment = "remote-env";
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

it("keeps Projects context linking scoped to project items", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(() => {
    renderer = create(
      <LinkedSection
        environmentId={EnvironmentId.make("remote-env")}
        item={{ type: "mail", accountId: "account", messageId: "<fixture@test>" }}
        title="Mail"
        onOpen={() => {}}
      />,
    );
  });
  await act(() =>
    renderer!.root
      .findAllByType("button")
      .find((node) => node.props.children === "Projects")!
      .props.onClick(),
  );
  expect(renderer!.root.findAllByProps({ "aria-label": "Paste a link" })).toHaveLength(0);
  await act(() =>
    renderer!.root
      .findAllByType("button")
      .find((node) => node.children.includes("Link to"))!
      .props.onClick(),
  );
  expect(
    renderer!.root.findByProps({ "aria-label": "Find an item to link" }).props.placeholder,
  ).toBe("Find a project");
});

it("updates the shared Mail header on account and folder changes while retaining Resources", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.search = { environment: "remote-env", account: "account" };
  await act(() => {
    renderer = create(<MailSpace />);
  });
  expect(renderer!.root.findByType("h1").children.join("")).toBe("Inbox");
  expect(JSON.stringify(renderer!.toJSON())).toContain("first@example.test");
  mocks.search = { environment: "remote-env", account: "second", folder: "Sent" };
  await act(() => renderer!.update(<MailSpace />));
  expect(renderer!.root.findByType("h1").children.join("")).toBe("Sent");
  expect(JSON.stringify(renderer!.toJSON())).toContain("second@example.test");
  expect(JSON.stringify(renderer!.toJSON())).not.toContain("first@example.test");
  expect(
    renderer!.root
      .findAllByType("button")
      .filter((button) => button.children.includes("Resources")),
  ).toHaveLength(1);
});
