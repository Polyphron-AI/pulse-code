// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { fireEvent, getByRole, getAllByRole, queryByRole } from "@testing-library/dom";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type ThreadPullRequestLink,
  type WorkspaceLinkView,
} from "@t3tools/contracts";
import { WorkspacePullRequestsPanel } from "./WorkspacePullRequestsPanel";

const environmentId = EnvironmentId.make("remote");
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const projectId = ProjectId.make("synkek");
const otherEnvironment = EnvironmentId.make("local");
const originalUrl = "https://GITHUB.COM/synkek/site/pull/42/files#diff";
const pr: ThreadPullRequestLink = {
  host: "github.com",
  repository: "synkek/site",
  number: 42,
  url: originalUrl,
  source: "manual",
  linkedAt: "2026-10-13T07:00:00Z",
  snapshot: null,
  stack: null,
};
const shell = (id: string) => ({
  environmentId,
  projectId,
  id: ThreadId.make(id),
  title: id === "a" ? "Design" : "Build",
  pullRequests: [pr],
  linkedPullRequest: { projectId, repository: pr.repository, number: pr.number, url: pr.url },
});
const direct: WorkspaceLinkView = {
  id: "wl_00000000-0000-0000-0000-000000000001",
  item: { ref: { type: "url", url: "https://github.com/synkek/site/pull/42" } },
  status: "confirmed",
  source: { type: "user" },
  updatedAt: "2026-10-13T07:00:00Z",
};
const state = vi.hoisted(() => ({
  threads: [] as ReturnType<typeof shell>[],
  links: [] as WorkspaceLinkView[],
  mode: "multiple" as "multiple" | "single" | "unsupported",
  connected: true,
  canOperate: true,
  complete: true,
  error: null as string | null,
  truncated: false,
  canPreview: true,
  read: vi.fn(),
  refresh: vi.fn(),
  changeLink: vi.fn(),
  unlink: vi.fn(),
  linkItem: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("../../state/entities", () => ({
  useThreadShells: () => state.threads,
  useAllEnvironmentShellsBootstrapped: () => state.complete,
  useProjects: () =>
    [environmentId, otherEnvironment].map((environmentId) => ({
      environmentId,
      id: projectId,
      repositoryIdentity: {
        provider: "github",
        canonicalKey: "github.com/synkek/site",
        displayName: "synkek/site",
        locator: { remoteUrl: "https://github.com/synkek/site.git" },
      },
    })),
  useServerConfigs: () =>
    new Map(
      [environmentId, otherEnvironment].map((id) => [
        id,
        {
          environment: {
            capabilities: {
              pullRequests: id === otherEnvironment || state.canPreview,
              threadPullRequests: state.mode === "multiple",
              threadPullRequestLinking: state.mode === "single",
            },
          },
        },
      ]),
    ),
}));
vi.mock("../../state/threads", () => ({
  threadEnvironment: {
    linkPullRequest: "native-link",
    unlinkPullRequest: "native-unlink",
    updateMetadata: "legacy-update",
  },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: string) => async (payload: unknown) => {
    if (command === "native-unlink" || command === "legacy-update")
      await state.changeLink(command, payload);
    else if (command === "workspace-unlink") await state.unlink(payload);
    else if (command === "workspace-link") await state.linkItem(payload);
    else throw new Error(`Unexpected mutation: ${command}`);
    return { _tag: "Success", value: undefined };
  },
}));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    data: {
      authenticated: state.canOperate,
      scopes: state.canOperate ? ["orchestration:operate"] : [],
    },
  }),
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ ready: true, workspaceLinks: true }),
}));
vi.mock("../../state/environments", () => ({
  useConnectedEnvironmentIds: () =>
    state.connected ? [environmentId, otherEnvironment] : [otherEnvironment],
  usePrimaryEnvironmentId: () => otherEnvironment,
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (atom: unknown) => ({
    data: atom ? { linked: state.links, suggested: [], truncated: state.truncated } : null,
    error: state.error,
    isPending: false,
    refresh: state.refresh,
  }),
}));
vi.mock("../../state/workspaceLinks", () => ({
  workspaceLinks: {
    link: "workspace-link",
    unlink: "workspace-unlink",
    list: (input: unknown) => {
      state.read(input);
      return input;
    },
  },
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => state.navigate }));
vi.mock("../../browser/useOpenLink", () => ({ useOpenLink: () => vi.fn() }));
vi.mock("../../state/server", () => ({ serverEnvironment: {} }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  state.threads = [shell("a"), shell("b")];
  state.links = [direct];
  state.mode = "multiple";
  state.connected = true;
  state.canOperate = true;
  state.complete = true;
  state.canPreview = true;
  state.error = null;
  state.truncated = false;
  state.changeLink.mockImplementation(
    async (
      _command: string,
      payload: { environmentId: EnvironmentId; input: { threadId: ThreadId } },
    ) => {
      state.threads = state.threads.map((thread) =>
        thread.id === payload.input.threadId
          ? { ...thread, pullRequests: [], linkedPullRequest: null! }
          : thread,
      );
    },
  );
  state.unlink.mockImplementation(async (payload: { input: { id: string } }) => {
    state.links = state.links.filter((link) => link.id !== payload.input.id);
  });
  state.linkItem.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function render(project: ProjectId | null = projectId) {
  await act(async () =>
    root.render(<WorkspacePullRequestsPanel environmentId={environmentId} projectId={project} />),
  );
}
async function click(name: string) {
  if (name.startsWith("Unlink") && !queryByRole(container, "button", { name })) {
    await act(async () =>
      fireEvent.click(getByRole(container, "button", { name: "Sources for synkek/site #42" })),
    );
  }
  await act(async () => fireEvent.click(getByRole(container, "button", { name })));
}

it("removes the chosen native source and keeps the direct URL and other thread", async () => {
  await render();
  expect(getByRole(container, "heading", { name: "Project pull requests" })).toBeTruthy();
  expect(getAllByRole(container, "listitem")).toHaveLength(1);
  expect(container.textContent).toContain("Project link · Design · Build");
  await click("Unlink from Design");
  expect(state.changeLink).toHaveBeenCalledExactlyOnceWith("native-unlink", {
    environmentId,
    input: { threadId: "a", host: "github.com", repository: "synkek/site", number: 42 },
  });
  await render();
  expect(getAllByRole(container, "listitem")).toHaveLength(1);
  expect(container.textContent).toContain("Project link · Build");
  expect(queryByRole(container, "button", { name: "Unlink from Design" })).toBeNull();
  await click("Unlink from project link");
  await render();
  expect(state.unlink).toHaveBeenCalledExactlyOnceWith({ environmentId, input: { id: direct.id } });
  expect(container.textContent).toContain("Via Build");
  expect(state.linkItem).not.toHaveBeenCalled();
});

it("honors legacy single mode and updates only the chosen thread", async () => {
  state.mode = "single";
  state.links = [];
  state.threads[0]!.pullRequests = [
    { ...pr, number: 99, url: "https://github.com/synkek/site/pull/99" },
  ];
  await render();
  expect(container.textContent).not.toContain("#99");
  await click("Unlink from Design");
  await render();
  expect(state.changeLink).toHaveBeenCalledExactlyOnceWith("legacy-update", {
    environmentId,
    input: { threadId: "a", linkedPullRequest: null },
  });
  expect(container.textContent).toContain("Via Build");
});

it("selects through the real Code opener without linking, host mutations or provider work", async () => {
  await render();
  await click("Open in Code");
  expect(state.navigate).toHaveBeenCalledWith(
    expect.objectContaining({
      to: "/pull-requests",
      search: expect.objectContaining({
        selectedEnvironmentId: environmentId,
        selectedProjectId: projectId,
        number: 42,
      }),
    }),
  );
  expect(state.linkItem).not.toHaveBeenCalled();
  expect(state.changeLink).not.toHaveBeenCalled();
  expect(state.unlink).not.toHaveBeenCalled();
  expect(state.read).toHaveBeenCalledWith({
    environmentId,
    input: { item: { type: "project", projectId } },
  });
  expect(
    state.read.mock.calls.every(
      ([read]) => read.environmentId === environmentId && read.input.item.type === "project",
    ),
  ).toBe(true);
  expect(queryByRole(container, "button", { name: /merge|review|comment|watch/i })).toBeNull();
});

it("keeps a usable external link when disconnected and never borrows another environment", async () => {
  await render();
  state.read.mockClear();
  state.connected = false;
  state.canPreview = false;
  await render();
  expect(getByRole(container, "link", { name: "Open on host" }).getAttribute("href")).toBe(
    direct.item.ref.type === "url" ? direct.item.ref.url : "",
  );
  expect(
    (getByRole(container, "button", { name: "Open in Code" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(state.read).not.toHaveBeenCalled();
  expect(container.textContent).toContain("Showing loaded links");
  expect(state.navigate).not.toHaveBeenCalled();
});

it("keeps an owning environment auth error with no cross-environment retry", async () => {
  state.error = "Authentication required in remote";
  await render();
  expect(getByRole(container, "alert").textContent).toContain(state.error);
  expect(
    (getByRole(container, "button", { name: "Open in Code" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await click("Retry");
  expect(state.refresh).toHaveBeenCalledOnce();
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.read.mock.calls.every(([read]) => read.environmentId === environmentId)).toBe(true);
});

it("links only after the explicit form submission and preserves project origin", async () => {
  await render();
  expect(state.linkItem).not.toHaveBeenCalled();
  await click("Link pull request");
  await act(async () =>
    fireEvent.change(getByRole(container, "textbox", { name: "Pull request URL" }), {
      target: { value: "https://github.com/synkek/site/pull/51" },
    }),
  );
  await act(async () =>
    fireEvent.submit(getByRole(container, "form", { name: "Link pull request" })),
  );
  expect(state.linkItem).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: {
      a: { ref: { type: "project", projectId } },
      b: { ref: { type: "url", url: "https://github.com/synkek/site/pull/51" } },
      viewing: { ref: { type: "project", projectId } },
    },
  });
  expect(state.changeLink).not.toHaveBeenCalled();
});

it("shows choose, known empty, unknown status, incomplete and unavailable sources truthfully", async () => {
  await render(null);
  expect(container.textContent).toContain("Choose a project to see pull requests");
  expect(state.read).not.toHaveBeenCalled();
  state.threads = [];
  state.links = [];
  await render();
  expect(container.textContent).toContain("No linked pull requests");
  state.links = [direct];
  await render();
  expect(container.textContent).toContain("Status unavailable");
  state.truncated = true;
  await render();
  expect(container.textContent).toContain("Showing loaded links");
  state.links = [
    {
      ...direct,
      item: {
        ref: { type: "thread", threadId: ThreadId.make("missing") },
        title: "Deleted design",
      },
    },
  ];
  await render();
  expect(container.textContent).toContain("Deleted design");
  expect(container.textContent).toContain("Source thread unavailable");
  expect(container.textContent).not.toContain("No linked pull requests");
});

it("reports mutation failures without removing other provenance or trying another environment", async () => {
  state.changeLink.mockRejectedValueOnce(new Error("Authentication required"));
  await render();
  await click("Unlink from Design");
  expect(getByRole(container, "alert").textContent).toContain("Authentication required");
  expect(container.textContent).toContain("Project link · Design · Build");
  expect(state.changeLink).toHaveBeenCalledOnce();
  expect(state.unlink).not.toHaveBeenCalled();
});
