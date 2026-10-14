import { act, type ButtonHTMLAttributes } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
const request = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("./useCommunicationsRequest", () => ({
  useCommunicationsRequest: () => ({
    run: request.run,
    available: true,
    busy: false,
    error: undefined,
  }),
}));
vi.mock("../ui/button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
import { TaskPeoplePicker } from "./TaskPeoplePicker";
const project: EnvironmentProject = {
  environmentId: EnvironmentId.make("environment"),
  id: ProjectId.make("project"),
  title: "SynKEK",
  workspaceRoot: "/projects/synkek",
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  office: {
    conversations: [
      { provider: "slack", accountId: "account", conversationId: "channel", title: "Launch" },
    ],
    agentThreadIds: [],
  },
};
let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  request.run.mockReset();
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});
const button = (label: string) =>
  renderer.root.findAllByType("button").find((button) => button.children.join("") === label)!;
async function selectChannel() {
  await act(async () =>
    renderer.root
      .findByProps({ "aria-label": "Task member channel" })
      .props.onChange({ target: { value: JSON.stringify(["slack", "account", "channel"]) } }),
  );
}

it("uses channel-only membership, removes bots and retains pagination through empty pages", async () => {
  const change = vi.fn();
  request.run
    .mockResolvedValueOnce({
      ok: true,
      membership: {
        scope: "channel",
        members: [{ id: "bot", displayName: "Bot", isBot: true }],
        nextCursor: "next",
        note: "",
      },
    })
    .mockResolvedValueOnce({
      ok: true,
      membership: { scope: "channel", members: [{ id: "alex", displayName: "Alex" }], note: "" },
    });
  await act(async () => {
    renderer = create(
      <TaskPeoplePicker
        project={project}
        assignee={null}
        followers={[]}
        disabled={false}
        onChange={change}
      />,
    );
  });
  await selectChannel();
  await act(async () => button("Load channel members").props.onClick());
  expect(request.run).toHaveBeenCalledWith({
    operation: "members.list",
    accountId: "account",
    conversationId: "channel",
    channelOnly: true,
  });
  expect(renderer.root.findAllByProps({ "aria-label": "Task assignee" })).toHaveLength(0);
  await act(async () => button("Load more members").props.onClick());
  expect(request.run.mock.calls[1]?.[0].cursor).toBe("next");
  await act(async () =>
    renderer.root.findByProps({ "aria-label": "Task assignee" }).props.onChange({
      target: { value: JSON.stringify(["slack", "account", "channel", "alex"]) },
    }),
  );
  expect(change).toHaveBeenCalledWith(
    {
      provider: "slack",
      accountId: "account",
      conversationId: "channel",
      memberId: "alex",
      displayName: "Alex",
    },
    [],
  );
});

it("never offers workspace-scoped member results for assignment", async () => {
  request.run.mockResolvedValue({
    ok: true,
    membership: { scope: "workspace", members: [{ id: "alex", displayName: "Alex" }], note: "" },
  });
  await act(async () => {
    renderer = create(
      <TaskPeoplePicker
        project={project}
        assignee={null}
        followers={[]}
        disabled={false}
        onChange={vi.fn()}
      />,
    );
  });
  await selectChannel();
  await act(async () => button("Load channel members").props.onClick());
  expect(renderer.root.findAllByProps({ "aria-label": "Task assignee" })).toHaveLength(0);
  expect(JSON.stringify(renderer.toJSON())).toContain("could not verify channel membership");
});
