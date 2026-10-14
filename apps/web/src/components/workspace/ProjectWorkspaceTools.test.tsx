import { act, type ButtonHTMLAttributes, type InputHTMLAttributes } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type ChatMembership,
  type ChatRequest,
  type ChatResult,
  type OfficeRequest,
  type OfficeResult,
  type ProjectOffice,
} from "@t3tools/contracts";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

vi.mock("./ProjectResourcePanel", () => ({ ProjectResourcePanel: () => null }));
vi.mock("../ui/button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("../ui/input", () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
import { ProjectWorkspaceTools } from "./ProjectWorkspaceTools";

const conversations: ProjectOffice["conversations"] = [
  { provider: "slack", accountId: "slack-account", conversationId: "launch", title: "Launch" },
  {
    provider: "discord",
    accountId: "discord-account",
    conversationId: "marketing",
    title: "Marketing",
  },
];
const project: EnvironmentProject = {
  id: ProjectId.make("project"),
  environmentId: EnvironmentId.make("environment"),
  title: "SynKEK",
  workspaceRoot: "/projects/SynKEK",
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-10-12T00:00:00.000Z",
  updatedAt: "2026-10-12T00:00:00.000Z",
  office: { conversations, agentThreadIds: [] },
};
const chatInvoke = vi.fn<(request: ChatRequest) => Promise<ChatResult>>();
const officeInvoke = vi.fn<(request: OfficeRequest) => Promise<OfficeResult>>();
let renderer: ReactTestRenderer | undefined;
function props(currentProject = project, save = vi.fn().mockResolvedValue(true)) {
  return {
    project: currentProject,
    tool: "Settings" as const,
    onToolChange: vi.fn(),
    onSaveOffice: save,
    account: undefined,
    conversations: [],
    onOpenFile: vi.fn(),
    onOpenUrl: vi.fn(),
    onClose: vi.fn(),
  };
}
function button(text: string) {
  const found = renderer!.root
    .findAllByType("button")
    .find((entry) => entry.children.includes(text));
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}
async function openMembers() {
  await act(async () => {
    renderer = create(<ProjectWorkspaceTools {...props()} />);
  });
  await act(async () => button("Members & roles").props.onClick());
}
function membership(members: ChatMembership["members"], nextCursor?: string): ChatResult {
  return {
    ok: true,
    membership: {
      scope: "channel",
      title: "Source members",
      note: "Roles from the source",
      members,
      ...(nextCursor ? { nextCursor } : {}),
    },
  };
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", { desktopBridge: { communicationsInvoke: chatInvoke, officeInvoke } });
  chatInvoke.mockReset();
  officeInvoke.mockReset().mockResolvedValue({ ok: true, accounts: [] });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

it("clears source members on selection and ignores the previous source's late response", async () => {
  chatInvoke.mockResolvedValueOnce(
    membership([{ id: "alex", displayName: "Alex from Slack", roles: ["Admin"] }]),
  );
  await openMembers();
  await act(async () => button("Load members").props.onClick());
  expect(renderer!.root.findAllByType("li")).toHaveLength(1);
  let finish: (result: ChatResult) => void = () => {};
  chatInvoke.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await act(async () => button("Refresh members").props.onClick());
  await act(async () =>
    renderer!.root.findByType("select").props.onChange({
      target: { value: JSON.stringify(["discord", "discord-account", "marketing"]) },
    }),
  );
  expect(renderer!.root.findAllByType("li")).toHaveLength(0);
  expect(button("Load members").props.disabled).toBe(false);
  await act(async () => finish(membership([{ id: "late", displayName: "Late Slack member" }])));
  expect(renderer!.root.findAllByType("li")).toHaveLength(0);
  chatInvoke.mockResolvedValueOnce(
    membership([{ id: "discord", displayName: "Discord member", roles: ["Marketing"] }]),
  );
  await act(async () => button("Load members").props.onClick());
  expect(chatInvoke).toHaveBeenLastCalledWith({
    operation: "members.list",
    accountId: "discord-account",
    conversationId: "marketing",
  });
  expect(JSON.stringify(renderer!.toJSON())).toContain("Discord member");
  expect(JSON.stringify(renderer!.toJSON())).not.toContain("Alex from Slack");
});

it("deduplicates membership pages and preserves loaded members after a refresh failure", async () => {
  chatInvoke.mockResolvedValueOnce(
    membership([{ id: "alex", displayName: "Alex old" }], "next-page"),
  );
  await openMembers();
  await act(async () => button("Load members").props.onClick());
  chatInvoke.mockResolvedValueOnce(
    membership([
      { id: "alex", displayName: "Alex updated", roles: ["Admin"] },
      { id: "sam", displayName: "Sam", roles: ["Member"] },
    ]),
  );
  await act(async () => button("Load more members").props.onClick());
  expect(chatInvoke).toHaveBeenLastCalledWith({
    operation: "members.list",
    accountId: "slack-account",
    conversationId: "launch",
    cursor: "next-page",
  });
  expect(renderer!.root.findAllByType("li")).toHaveLength(2);
  expect(JSON.stringify(renderer!.toJSON())).toContain("Alex updated");
  expect(JSON.stringify(renderer!.toJSON())).not.toContain("Alex old");
  chatInvoke.mockRejectedValueOnce(new Error("offline"));
  await act(async () => button("Refresh members").props.onClick());
  expect(renderer!.root.findAllByType("li")).toHaveLength(2);
  expect(renderer!.root.findByProps({ role: "alert" })).toBeDefined();
});

it("shows no invented members when desktop membership access is unavailable", async () => {
  vi.stubGlobal("window", {});
  await openMembers();
  expect(button("Load members").props.disabled).toBe(true);
  expect(renderer!.root.findAllByType("li")).toHaveLength(0);
  expect(chatInvoke).not.toHaveBeenCalled();
  expect(JSON.stringify(renderer!.toJSON())).toContain(
    "Open Pulse desktop to read source membership.",
  );
});

it("saves the resolved Drive folder with the latest project connections after a concurrent update", async () => {
  const drive = { accountId: "google-account", folderId: "old-folder", folderName: "Old folder" };
  const initialProject = { ...project, office: { conversations, agentThreadIds: [], drive } };
  const save = vi.fn().mockResolvedValue(true);
  let finishLookup: (result: OfficeResult) => void = () => {};
  const lookup = new Promise<OfficeResult>((resolve) => {
    finishLookup = resolve;
  });
  officeInvoke.mockImplementation(async (request) =>
    request.operation === "accounts.list"
      ? {
          ok: true,
          accounts: [
            {
              id: drive.accountId,
              provider: "google",
              email: "alex@example.test",
              capabilities: ["drive"],
              status: "connected",
              selectedCalendarIds: [],
            },
          ],
        }
      : lookup,
  );
  await act(async () => {
    renderer = create(<ProjectWorkspaceTools {...props(initialProject, save)} />);
  });
  await act(async () =>
    renderer!.root
      .findByType("input")
      .props.onChange({ target: { value: "https://drive.google.com/drive/folders/new-folder" } }),
  );
  await act(async () => button("Link folder").props.onClick());
  expect(officeInvoke).toHaveBeenLastCalledWith({
    operation: "drive.get",
    accountId: drive.accountId,
    fileId: "new-folder",
  });
  const updatedProject = {
    ...initialProject,
    office: { ...initialProject.office, agentThreadIds: [ThreadId.make("new-agent")] },
  };
  await act(async () => {
    renderer!.update(<ProjectWorkspaceTools {...props(updatedProject, save)} />);
  });
  await act(async () =>
    finishLookup({
      ok: true,
      file: {
        id: "new-folder",
        name: "SynKEK Drive",
        mimeType: "application/vnd.google-apps.folder",
        parents: [],
      },
    }),
  );
  expect(save).toHaveBeenCalledWith({
    ...updatedProject.office,
    drive: { accountId: drive.accountId, folderId: "new-folder", folderName: "SynKEK Drive" },
  });
  expect(save).toHaveBeenCalledTimes(1);
});
