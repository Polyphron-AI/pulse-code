// @vitest-environment happy-dom
import { act, useCallback, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, getAllByRole, queryByRole } from "@testing-library/dom";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  RunId,
  WorkspaceLinkList,
  type WorkspaceItemRef,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { makeThreadFixture } from "../../test-fixtures";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { useComposerDraftStore, type DraftId } from "../../composerDraftStore";
import { newDraftId } from "../../lib/utils";
import { WorkspaceAgents } from "./WorkspaceAgents";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";
import { createWorkspaceMockupModule } from "./dev/agentsMockupModule";
import { createWorkspaceMockupSession } from "./dev/workspaceMockupFixtures";

type Query = { environmentId: EnvironmentId; input: { item: WorkspaceItemRef } };
const boundary = vi.hoisted(() => ({
  query: vi.fn(),
  link: vi.fn<(...args: unknown[]) => Promise<void>>(),
  unlink: vi.fn<(...args: unknown[]) => Promise<void>>(),
  history: vi.fn(),
  detail: vi.fn(),
  llm: vi.fn(),
  command: vi.fn(),
  navigate: vi.fn(),
  start: vi.fn<(...args: unknown[]) => Promise<{ draftId: DraftId; threadId: ThreadId } | null>>(),
  operate: true,
  connected: true,
  supported: true,
  ready: true,
}));
const environmentId = EnvironmentId.make("remote");
const projectId = ProjectId.make("p");
const assigned = {
  id: "wl_00000000-0000-0000-0000-000000000001",
  item: { ref: { type: "thread", threadId: "t1" }, title: "Stale title" },
  status: "confirmed",
  source: { type: "user" },
  updatedAt: "2026-10-13T09:00:00.000Z",
};
const decode = Schema.decodeUnknownSync(WorkspaceLinkList);
const projectList = decode({
  linked: [assigned],
  suggested: [
    {
      ...assigned,
      id: "wl_00000000-0000-0000-0000-000000000004",
      status: "suggested",
      item: { ref: { type: "thread", threadId: "t4" }, title: "Suggested agent" },
    },
  ],
  truncated: false,
});
const empty = decode({ linked: [], suggested: [], truncated: false });
const messageList = decode({
  linked: [
    {
      ...assigned,
      item: { ref: { type: "thread", threadId: "t3" }, title: "Message-only helper" },
    },
  ],
  suggested: [],
  truncated: false,
});
const listeners = new Map<string, Set<() => void>>();
let lists = new Map<string, WorkspaceLinkList>();
const keyOf = (input: Query) => `${input.environmentId}:${JSON.stringify(input.input.item)}`;
const projectKey = (env = "remote", id = "p") =>
  keyOf({
    environmentId: EnvironmentId.make(env),
    input: { item: { type: "project", projectId: ProjectId.make(id) } },
  });
function publish(env: string, list: WorkspaceLinkList, id = "p") {
  const key = projectKey(env, id);
  lists.set(key, list);
  listeners.get(key)?.forEach((listener) => listener());
}
const initialShells = () => [
  ...[
    ["t1", "SEO analyst"],
    ["t2", "Merely project-owned"],
    ["t3", "Message-only helper"],
    ["t4", "Suggested agent"],
  ].map(([id, title]) =>
    makeThreadFixture({ environmentId, projectId, id: ThreadId.make(id!), title: title! }),
  ),
  makeThreadFixture({
    environmentId: EnvironmentId.make("other"),
    projectId,
    id: ThreadId.make("t1"),
    title: "Other environment collision",
  }),
];
let shells = initialShells();
let shellRevision = 0;
const requests = new Map<string, number>();
const shellListeners = new Set<() => void>();
vi.mock("../../state/entities", () => ({
  useProjects: () => [{ id: projectId, environmentId, title: "Project" }],
  useThreadShells: () => {
    useSyncExternalStore(
      (listener) => {
        shellListeners.add(listener);
        return () => {
          shellListeners.delete(listener);
        };
      },
      () => shellRevision,
    );
    return shells;
  },
  useThread: boundary.detail,
  useThreadHistory: boundary.history,
}));
vi.mock("../../state/workspaceLinks", () => ({
  workspaceLinks: {
    list: (input: Query) => {
      boundary.query(input);
      return input;
    },
  },
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (input: Query | null) => {
    const key = input ? keyOf(input) : "disabled";
    const data = useSyncExternalStore(
      useCallback(
        (listener) => {
          const set = listeners.get(key) ?? new Set();
          if (key !== "disabled" && set.size === 0) requests.set(key, (requests.get(key) ?? 0) + 1);
          listeners.set(key, set);
          set.add(listener);
          return () => {
            set.delete(listener);
          };
        },
        [key],
      ),
      () => lists.get(key) ?? null,
    );
    return { data, error: null, refresh: vi.fn() };
  },
}));
vi.mock("../../state/environments", () => ({
  useConnectedEnvironmentIds: () => (boundary.connected ? ["remote", "other"] : []),
}));
vi.mock("./useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => boundary.operate }));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({
    ready: boundary.ready,
    workspaceLinks: boundary.supported,
    workspaceItemContext: true,
  }),
}));
vi.mock("./mail/useMailLinks", () => ({
  useMailLinks: () => ({ linkItem: boundary.link, unlink: boundary.unlink }),
  linkErrorText: (cause: unknown) => (cause instanceof Error ? cause.message : "Failed"),
}));
vi.mock("./DriveFiles", () => ({ DriveFileAccess: () => null }));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ state: { location: { href: "/workspace" } } }),
}));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => DEFAULT_RESOLVED_KEYBINDINGS }));
vi.mock("../../state/server", () => ({ primaryServerKeybindingsAtom: {} }));
vi.mock("../../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => boundary.start }));
vi.mock("../../hooks/useNewProject", () => ({ useNewProject: () => vi.fn() }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => boundary.command }));
let root: Root;
let node: HTMLDivElement;
const onOpen = vi.fn();
const props = {
  environmentId,
  projectId,
  projectTitle: "Project",
  selectedItem: { ref: { type: "url" as const, url: "https://example.test/message" } },
  request: null,
  onOpen,
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  onOpen.mockClear();
  requests.clear();
  boundary.connected = boundary.operate = boundary.supported = boundary.ready = true;
  boundary.link.mockResolvedValue(undefined);
  boundary.unlink.mockResolvedValue(undefined);
  boundary.start.mockResolvedValue(null);
  lists = new Map([
    [projectKey(), projectList],
    [keyOf({ environmentId, input: { item: props.selectedItem.ref } }), messageList],
    [projectKey("other"), empty],
  ]);
  shells = initialShells();
  shellRevision++;
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
});
afterEach(async () => {
  await act(() => root.unmount());
  node.remove();
  vi.unstubAllGlobals();
});
const mount = () => act(() => root.render(<WorkspaceAgents {...props} />));
const click = (name: string) => act(() => getByRole(document.body, "button", { name }).click());
const choose = async () => {
  await click("Project agent actions");
  await click("Link existing thread");
};
const deferred = () => {
  let resolve!: () => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

it("shows only confirmed project-thread assignments", async () => {
  await mount();
  expect(node.textContent).toContain("SEO analyst");
  for (const absent of [
    "Merely project-owned",
    "Message-only helper",
    "Suggested agent",
    "Other environment collision",
  ])
    expect(node.textContent).not.toContain(absent);
  expect(boundary.query).toHaveBeenCalledWith({
    environmentId,
    input: { item: { type: "project", projectId } },
  });
  expect(
    boundary.query.mock.calls.every(
      ([input]) => input.environmentId === environmentId && input.input.item.type === "project",
    ),
  ).toBe(true);
});
it.each(["empty", "suggested-only"])("keeps %s assignments empty", async (state) => {
  lists.set(projectKey(), {
    ...projectList,
    linked: [],
    suggested: state === "empty" ? [] : projectList.suggested,
  });
  await mount();
  expect(node.textContent).toContain("No agents assigned");
  expect(queryByRole(node, "button", { name: "Open conversation →" })).toBeNull();
});
it("updates title and state from shells without reading histories", async () => {
  await mount();
  const original = shells[0]!;
  await act(() => {
    shells = [
      {
        ...original,
        title: "New role",
        runtime: {
          status: "running",
          activeRunId: RunId.make("run"),
          providerInstanceId: original.providerInstanceId,
          providerName: null,
          lastError: null,
          updatedAt: "2026-10-13T09:00:00.000Z",
        },
      },
      ...shells.slice(1),
    ];
    shellRevision++;
    shellListeners.forEach((listener) => listener());
  });
  expect(node.textContent).toContain("New role");
  expect(node.textContent).toContain("Working");
  for (const spy of [
    boundary.history,
    boundary.detail,
    boundary.llm,
    boundary.command,
    boundary.start,
  ])
    expect(spy).not.toHaveBeenCalled();
});
it.each([
  "waiting",
  "queued",
  "starting",
  "preparing",
  "failed",
  "cancelled",
  "interrupted",
  "rolled_back",
  "completed",
  "idle",
] as const)("renders known run status %s", async (status) => {
  const original = shells[0]!;
  shells[0] = {
    ...original,
    runtime: {
      status,
      activeRunId: null,
      providerInstanceId: original.providerInstanceId,
      providerName: null,
      lastError: null,
      updatedAt: "2026-10-13T09:00:00.000Z",
    },
  };
  await mount();
  const expected = {
    waiting: "Waiting for your input",
    queued: "Queued",
    starting: "Starting",
    preparing: "Starting",
    failed: "Last run failed",
    cancelled: "Not running",
    interrupted: "Not running",
    rolled_back: "Not running",
    completed: "Ready for your next instruction",
    idle: "Ready for your next instruction",
  };
  expect(node.textContent).toContain(expected[status]);
});
it("keeps missing assignments actionable and archived conversations openable", async () => {
  shells = shells.filter((thread) => thread.id !== "t1");
  await mount();
  expect(node.textContent).toContain("Stale title");
  expect(
    getByRole<HTMLButtonElement>(node, "button", { name: "Open conversation →" }).disabled,
  ).toBe(true);
  await click("Actions for Stale title");
  await click("Unassign from project");
  expect(boundary.unlink).toHaveBeenCalledExactlyOnceWith(projectList.linked[0]!.id);
  shells = initialShells().map((thread) => ({ ...thread, archivedAt: "2026-10-13T09:00:00.000Z" }));
  await mount();
  await click("Open conversation →");
  expect(onOpen).toHaveBeenCalledExactlyOnceWith({ type: "thread", threadId: "t1" });
  expect(boundary.start).not.toHaveBeenCalled();
});
it("awaits assignment acknowledgement, excludes assigned and foreign shells, and cancels cleanly", async () => {
  await mount();
  await choose();
  const picker = getByRole(node, "region", { name: "Link existing thread" });
  expect(picker.textContent).not.toContain("SEO analyst");
  expect(picker.textContent).not.toContain("Other environment collision");
  await click("Cancel");
  expect(boundary.link).not.toHaveBeenCalled();
  await choose();
  const gate = deferred();
  boundary.link.mockReturnValueOnce(gate.promise);
  await click("thread: Merely project-owned");
  expect(boundary.link).toHaveBeenCalledExactlyOnceWith(
    { ref: { type: "project", projectId }, title: "Project" },
    { ref: { type: "thread", threadId: "t2" }, title: "Merely project-owned" },
  );
  expect(getByRole(node, "region", { name: "Link existing thread" })).toBeDefined();
  await act(() => gate.resolve());
  expect(queryByRole(node, "region", { name: "Link existing thread" })).toBeNull();
});
it("retains failed assignments and unassignments for retry without deleting or stopping work", async () => {
  await mount();
  await choose();
  boundary.link.mockRejectedValueOnce(new Error("Try assignment again"));
  await click("thread: Merely project-owned");
  expect(getByRole(node, "alert").textContent).toBe("Try assignment again");
  await click("thread: Merely project-owned");
  const threadsBefore = shells;
  const messageBefore = lists.get(
    keyOf({ environmentId, input: { item: props.selectedItem.ref } }),
  );
  await click("Actions for SEO analyst");
  boundary.unlink.mockRejectedValueOnce(new Error("Try unassign again"));
  await click("Unassign from project");
  expect(getByRole(node, "alert").textContent).toBe("Try unassign again");
  await click("Unassign from project");
  expect(shells).toBe(threadsBefore);
  expect(lists.get(keyOf({ environmentId, input: { item: props.selectedItem.ref } }))).toBe(
    messageBefore,
  );
  expect(boundary.command).not.toHaveBeenCalled();
  expect(boundary.start).not.toHaveBeenCalled();
});
it("blocks double unassign while the acknowledgement is pending", async () => {
  const gate = deferred();
  boundary.unlink.mockReturnValueOnce(gate.promise);
  await mount();
  await click("Actions for SEO analyst");
  const button = getByRole(document.body, "button", { name: "Unassign from project" });
  await act(() => {
    button.click();
    button.click();
  });
  expect(boundary.unlink).toHaveBeenCalledTimes(1);
  await act(() => gate.resolve());
});
it.each(["denied", "disconnected", "old-server", "loading"])(
  "gates %s state using live permission and capability",
  async (state) => {
    boundary.operate = state !== "denied";
    boundary.connected = state !== "disconnected";
    boundary.supported = state !== "old-server";
    boundary.ready = state !== "loading";
    await mount();
    await click("Project agent actions");
    expect(
      getByRole<HTMLButtonElement>(document.body, "button", { name: "Link existing thread" })
        .disabled,
    ).toBe(true);
    expect(boundary.link).not.toHaveBeenCalled();
    expect(boundary.unlink).not.toHaveBeenCalled();
    if (state === "disconnected") {
      expect(node.textContent).toContain("Status unavailable");
      boundary.connected = true;
      await mount();
      expect(node.textContent).not.toContain("Reconnect");
    }
    if (state === "old-server") {
      expect(node.textContent).not.toContain("SEO analyst");
      expect(boundary.query).not.toHaveBeenCalled();
    }
  },
);
it("keeps capability absence authoritative over cached assignments", async () => {
  await mount();
  boundary.supported = false;
  await mount();
  expect(node.textContent).not.toContain("SEO analyst");
  expect(node.textContent).toContain("not available on this server");
});
it("updates only the subscribed environment after a second-client change", async () => {
  await mount();
  const before = node.textContent;
  await act(() => publish("other", projectList));
  expect(node.textContent).toBe(before);
  await act(() => publish("remote", empty));
  expect(node.textContent).toContain("No agents assigned");
  await act(() => publish("remote", projectList));
  expect(node.textContent).toContain("SEO analyst");
});
it("releases its query and all UI while hidden", async () => {
  await mount();
  await act(() =>
    root.render(
      <WorkspaceResourcesBodyContext value={{ hidden: true, restoreFocus() {} }}>
        <WorkspaceAgents {...props} />
      </WorkspaceResourcesBodyContext>,
    ),
  );
  expect(node.textContent).toBe("");
  expect(listeners.get(projectKey())?.size ?? 0).toBe(0);
});
it("shows truncation and discards a pending old-project picker on scope change", async () => {
  lists.set(projectKey(), { ...projectList, truncated: true });
  await mount();
  expect(node.textContent).toContain("Some project assignments are not shown.");
  await choose();
  const gate = deferred();
  boundary.link.mockReturnValueOnce(gate.promise);
  await click("thread: Merely project-owned");
  await act(() => root.render(<WorkspaceAgents {...props} projectId={ProjectId.make("q")} />));
  await act(() => gate.reject(new Error("Old project failure")));
  expect(node.textContent).not.toContain("Old project failure");
  expect(queryByRole(node, "region", { name: "Link existing thread" })).toBeNull();
});
it("opens a project-context draft without an assignment until submission and supports removing its chip", async () => {
  const draftId = newDraftId();
  boundary.start.mockResolvedValueOnce({ draftId, threadId: ThreadId.make("draft-thread") });
  await mount();
  await click("Project agent actions");
  await click("Start thread");
  expect(boundary.start).toHaveBeenCalledExactlyOnceWith({ environmentId, projectId });
  const contexts = useComposerDraftStore.getState().draftsByThreadKey[draftId]!.threadContexts;
  expect(
    contexts.some(
      (context) =>
        context.kind === "workspace-item" &&
        context.item.ref.type === "project" &&
        context.item.ref.projectId === projectId,
    ),
  ).toBe(true);
  expect(boundary.link).not.toHaveBeenCalled();
  expect(boundary.command).not.toHaveBeenCalled();
  const projectContext = contexts.find(
    (context) => context.kind === "workspace-item" && context.item.ref.type === "project",
  )!;
  useComposerDraftStore.getState().setThreadContexts(
    draftId,
    contexts.filter((context) => context.contextId !== projectContext.contextId),
  );
  expect(
    useComposerDraftStore
      .getState()
      .draftsByThreadKey[draftId]!.threadContexts.some(
        (context) => context.kind === "workspace-item" && context.item.ref.type === "project",
      ),
  ).toBe(false);
  expect(boundary.link).not.toHaveBeenCalled();
});
it("renders recipe 06 through the pure view with settled fake commands and disposal", async () => {
  const session = createWorkspaceMockupSession("06");
  const module = createWorkspaceMockupModule(session);
  await act(() => root.render(module.resource));
  expect(module.readyRegions).toEqual(["resource"]);
  expect(node.textContent).toContain("Reviewing keyword opportunities");
  expect(node.textContent).toContain("General agents assigned to SynKEK");
  expect(getAllByRole(node, "button", { name: "Open conversation →" })).toHaveLength(3);
  await act(() => getAllByRole(node, "button", { name: "Open conversation →" })[0]!.click());
  await module.settled();
  expect(session.operations).toEqual([
    { kind: "open-thread", item: { type: "thread", threadId: "thread-seo" }, value: null },
  ]);
  module.dispose();
  await act(() => getAllByRole(node, "button", { name: "Open conversation →" })[0]!.click());
  await module.settled();
  expect(session.operations).toHaveLength(1);
  expect(boundary.query).not.toHaveBeenCalled();
  expect(boundary.start).not.toHaveBeenCalled();
  session.dispose();
});

it("keeps one assignment subscription across shell updates and releases it when hidden", async () => {
  await mount();
  expect(requests.get(projectKey())).toBe(1);
  await act(() => {
    shellRevision++;
    shellListeners.forEach((listener) => listener());
  });
  expect(requests.get(projectKey())).toBe(1);
  expect(listeners.get(projectKey())?.size).toBe(1);
  await act(() =>
    root.render(
      <WorkspaceResourcesBodyContext value={{ hidden: true, restoreFocus() {} }}>
        <WorkspaceAgents {...props} />
      </WorkspaceResourcesBodyContext>,
    ),
  );
  expect(listeners.get(projectKey())?.size).toBe(0);
});

it.each(["hasPendingApprovals", "hasPendingUserInput"] as const)(
  "prioritizes %s over an idle shell",
  async (flag) => {
    shells[0] = { ...shells[0]!, [flag]: true };
    await mount();
    expect(node.textContent).toContain("Waiting for your input");
  },
);
it("cancels the general project-agent menu without creating work", async () => {
  await mount();
  await click("Project agent actions");
  await click("Project agent actions");
  expect(boundary.start).not.toHaveBeenCalled();
  expect(boundary.link).not.toHaveBeenCalled();
  expect(boundary.command).not.toHaveBeenCalled();
});
it("shows a confirmed new assignment event after the project-context draft handoff", async () => {
  const draftId = newDraftId();
  boundary.start.mockResolvedValueOnce({ draftId, threadId: ThreadId.make("draft-thread") });
  await mount();
  await click("Project agent actions");
  await click("Start thread");
  const draft = useComposerDraftStore.getState().draftsByThreadKey[draftId]!;
  const projectContext = draft.threadContexts.find(
    (context) => context.kind === "workspace-item" && context.item.ref.type === "project",
  )!;
  expect(draft.prompt).toContain(String(projectContext.contextId));
  expect(boundary.link).not.toHaveBeenCalled();
  // The existing server confirmation service owns submission; this is its subscribed UI result.
  await act(() => {
    shells = [
      ...shells,
      makeThreadFixture({
        environmentId,
        projectId,
        id: ThreadId.make("draft-thread"),
        title: "New project agent",
      }),
    ];
    shellRevision++;
    shellListeners.forEach((listener) => listener());
    publish(
      "remote",
      decode({
        linked: [
          ...projectList.linked,
          {
            ...assigned,
            id: "wl_00000000-0000-0000-0000-000000000005",
            item: { ref: { type: "thread", threadId: "draft-thread" } },
          },
        ],
        suggested: [],
        truncated: false,
      }),
    );
  });
  expect(node.textContent).toContain("New project agent");
  expect(getAllByRole(node, "button", { name: "Open conversation \u2192" })).toHaveLength(2);
});
