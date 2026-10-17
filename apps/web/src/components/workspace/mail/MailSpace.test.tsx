import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, type MailConversation, type MailMessageListItem } from "@t3tools/contracts";
import { MailSpace } from "./MailSpace";
import { ProjectsSpace } from "../ProjectsSpace";
import { LinkedSection } from "./LinkedSection";
import { WorkspaceLinkedContext } from "../WorkspaceLinkedContext";
import { WorkspaceHeader, type WorkspaceHeaderModel } from "../WorkspaceHeader";
import { WorkspaceProjectResources } from "../WorkspaceResourcesPanel";
import { MailMessageView } from "./MailMessageView";
import { MailConversationList } from "./MailConversationList";
import { WorkspaceEngagement } from "../WorkspaceEngagement";
const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  environment: "remote-env" as string | null,
  search: {} as Record<string, string>,
  view: "messages",
  listMany: vi.fn(),
  linksAvailable: true,
}));
const message = (uid: number): MailMessageListItem => ({
  ref: { accountId: "account", mailbox: "INBOX", uidValidity: 1, uid },
  subject: `Message ${uid}`,
  seen: true,
  flagged: false,
  answered: false,
});
const conversation: MailConversation = {
  id: "conversation",
  messages: [message(1), message(2)],
  newest: message(2),
};
const task = { type: "task" as const, taskId: "wskt_00000000-0000-0000-0000-000000000001" };
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useSearch: () => mocks.search,
  Link: "a",
}));
vi.mock("../../../hooks/useLocalStorage", () => ({ useLocalStorage: () => [mocks.view, vi.fn()] }));
vi.mock("./useMailCapabilities", () => ({
  useMailCapabilities: () => ({
    environmentId: mocks.environment === null ? null : EnvironmentId.make(mocks.environment),
    ready: true,
    mailRead: true,
    mailConversations: true,
    workspaceLinks: mocks.linksAvailable,
    workspaceTools: true,
  }),
}));
vi.mock("../../../state/entities", () => ({
  useProjects: () => [],
  useThreadShells: () => [],
  useThreadShell: () => null,
  useAllEnvironmentProjectSnapshotsReady: () => true,
}));
vi.mock("../../../state/environments", () => ({ useEnvironment: () => ({ label: "Remote" }) }));
vi.mock("./MailNav", () => ({ MailNav: () => null }));
// The resource frame has its own provider/query integration suite.
vi.mock("../WorkspaceResourcesPanel", () => ({
  WorkspaceProjectResources: () => <p>Project resources</p>,
}));
vi.mock("../../../hooks/useNewProject", () => ({ useNewProject: () => vi.fn() }));
vi.mock("../../../mail/mailState", () => ({ pulseMailAccounts: () => "accounts" }));
vi.mock("../../../mail/mailReadState", () => ({ pulseMailMessage: () => "message" }));
vi.mock("../../../state/workspaceLinks", () => ({
  workspaceLinks: {
    list: () => "links",
    listMany: (args: unknown) => {
      mocks.listMany(args);
      return "conversation-links";
    },
    projectHub: () => null,
  },
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
        : query === "conversation-links"
          ? { linked: [], suggested: [], truncated: false }
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
    linkedContext,
    header,
    list,
  }: {
    children: ReactNode;
    resources: ReactNode;
    linkedContext?: {
      item: import("@t3tools/contracts").WorkspaceLinkEndpoint | null;
      render: (item: import("@t3tools/contracts").WorkspaceLinkEndpoint) => ReactNode;
    };
    header: WorkspaceHeaderModel;
    list?: ReactNode;
  }) => (
    <>
      <WorkspaceHeader model={header} resourcesOpen={false} onResources={() => {}} />
      {list}
      <div>{children}</div>
      <aside>
        {linkedContext?.item ? linkedContext.render(linkedContext.item) : null}
        {resources}
      </aside>
    </>
  ),
}));
vi.mock("../WorkspaceItemActions", () => ({
  WorkspaceItemMenu: ({ children }: { children: ReactNode }) => children,
  WorkspaceItemActions: () => null,
}));
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
vi.mock("./MailConversationList", () => ({
  MailConversationList: ({ onSelect }: { onSelect: (next: MailConversation) => void }) => (
    <button onClick={() => onSelect(conversation)}>Select conversation</button>
  ),
}));
vi.mock("./ProjectMailList", () => ({ ProjectMailList: () => null }));
let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  if (renderer) await act(() => renderer?.unmount());
  renderer = undefined;
  mocks.environment = "remote-env";
  mocks.view = "messages";
  mocks.linksAvailable = true;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("infers resources from the newest conversation message that the reader expands", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.view = "conversations";
  mocks.search = { environment: "remote-env", account: "account" };
  await act(() => {
    renderer = create(<MailSpace />);
  });
  await act(() =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children === "Select conversation")!
      .props.onClick(),
  );
  expect(renderer!.root.findByType(WorkspaceProjectResources).props.selectedItem).toMatchObject({
    ref: { type: "mail", location: { uid: 2 } },
    title: "Message 2",
  });
  const readers = renderer!.root.findAllByType(MailMessageView);
  expect(readers).toHaveLength(1);
  expect(readers[0]!.props.item.location.uid).toBe(2);
  expect(mocks.listMany).toHaveBeenCalledWith({
    environmentId: "remote-env",
    input: {
      items: [
        expect.objectContaining({ type: "mail", location: expect.objectContaining({ uid: 1 }) }),
        expect.objectContaining({ type: "mail", location: expect.objectContaining({ uid: 2 }) }),
      ],
    },
  });
  const context = renderer!.root.findByType(WorkspaceLinkedContext);
  expect(context.props.item.ref.location.uid).toBe(2);
  expect(context.props.linkedData).toEqual({ linked: [], suggested: [], truncated: false });
});

it("keeps the captured conversation aggregate and newest link target after selecting another conversation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.view = "conversations";
  mocks.search = { environment: "remote-env", account: "account" };
  await act(() => {
    renderer = create(<MailSpace />);
  });
  await act(() => renderer!.root.findByType(MailConversationList).props.onSelect(conversation));
  const captured = renderer!.root.findByType(WorkspaceEngagement).props.linkedContext;
  const next = { id: "next", messages: [message(3)], newest: message(3) };
  await act(() => renderer!.root.findByType(MailConversationList).props.onSelect(next));
  mocks.listMany.mockClear();
  await act(() => renderer!.update(captured.render(captured.item)));
  expect(mocks.listMany).toHaveBeenLastCalledWith({
    environmentId: "remote-env",
    input: {
      items: conversation.messages.map((entry) =>
        expect.objectContaining({
          type: "mail",
          location: expect.objectContaining({ uid: entry.ref.uid }),
        }),
      ),
    },
  });
  expect(renderer!.root.findByType(WorkspaceLinkedContext).props.item).toMatchObject({
    ref: { type: "mail", location: { uid: 2 } },
    title: "Message 2",
  });
});

it("does not query conversation links when the server does not support links", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.view = "conversations";
  mocks.linksAvailable = false;
  mocks.search = { environment: "remote-env", account: "account" };
  await act(() => {
    renderer = create(<MailSpace />);
  });
  await act(() => renderer!.root.findByType(MailConversationList).props.onSelect(conversation));
  expect(mocks.listMany).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer!.toJSON())).toContain("Workspace links need a newer server.");
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

it("distinguishes disconnected Projects from a connected environment with no projects", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.environment = null;
  mocks.search = {};
  await act(() => {
    renderer = create(<ProjectsSpace />);
  });
  expect(JSON.stringify(renderer!.toJSON())).toContain("Connect an environment to see projects.");
  expect(JSON.stringify(renderer!.toJSON())).not.toContain("No projects yet.");
  expect(
    renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Create project"))!.props.disabled,
  ).toBe(true);
  mocks.environment = "remote-env";
  await act(() => renderer!.update(<ProjectsSpace />));
  expect(JSON.stringify(renderer!.toJSON())).toContain("No projects yet.");
});
