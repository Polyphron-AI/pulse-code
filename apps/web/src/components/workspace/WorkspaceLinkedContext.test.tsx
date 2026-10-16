// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, getAllByRole, queryByRole } from "@testing-library/dom";
import {
  EnvironmentId,
  ProjectId,
  type WorkspaceLinkList,
  type WorkspaceLinkView,
  type WorkspaceLinkEndpoint,
} from "@t3tools/contracts";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { WorkspaceLinkedContext } from "./WorkspaceLinkedContext";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { WorkspaceResourcesPanel } from "./WorkspaceResourcesPanel";
import { useWorkspaceResourceState, WorkspaceResourcesProvider } from "./workspaceResourceState";

const mocks = vi.hoisted(() => ({
  list: { linked: [], suggested: [], truncated: false } as WorkspaceLinkList,
  queries: vi.fn(),
  linkItem: vi.fn(),
  unlink: vi.fn(),
  accept: vi.fn(),
  dismiss: vi.fn(),
  refresh: vi.fn(),
  related: [] as { item: WorkspaceLinkEndpoint; via: WorkspaceLinkEndpoint }[],
  taskLoading: false,
}));
vi.mock("../../state/workspaceLinks", () => ({
  workspaceLinks: {
    list: (input: unknown) => ({ kind: "list", ...(input as object) }),
    suggestions: (input: unknown) => ({ kind: "suggestions", ...(input as object) }),
    projectHub: (input: unknown) => ({ kind: "hub", ...(input as object) }),
    acceptSuggestion: "accept",
    dismissSuggestion: "dismiss",
    refreshSuggestions: "refresh",
  },
}));
vi.mock("../../state/workspaceTools", () => ({
  workspaceTools: { task: (input: unknown) => ({ kind: "task", ...(input as object) }) },
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (query: { kind: string } | null) => {
    mocks.queries(query);
    return {
      data:
        query?.kind === "list"
          ? mocks.list
          : query?.kind === "suggestions"
            ? { status: "ready", cached: true, incomplete: false }
            : query?.kind === "hub"
              ? { related: mocks.related, truncated: false }
              : query?.kind === "task"
                ? mocks.taskLoading
                  ? null
                  : {
                      id: "wskt_00000000-0000-0000-0000-000000000001",
                      projectId: "p",
                      title: "Task",
                      column: "To do",
                    }
                : null,
      error: null,
      refresh: vi.fn(),
    };
  },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (name: "accept" | "dismiss" | "refresh") => mocks[name],
}));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    isPending: false,
    data: { authenticated: true, scopes: ["orchestration:operate"] },
  }),
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => [{ environmentId: "a", id: "p", title: "Linked project" }],
  useThreadShells: () => [],
  useThreadShell: () => null,
  useAllEnvironmentProjectSnapshotsReady: () => true,
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({
    workspaceLinks: true,
    workspaceSuggestions: true,
    workspaceItemContext: true,
    workspaceTools: true,
  }),
}));
vi.mock("./mail/useMailLinks", () => ({
  useMailLinks: () => ({ linkItem: mocks.linkItem, unlink: mocks.unlink }),
  linkErrorText: String,
}));
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("./DriveFiles", () => ({ DriveSearch: () => null, DriveFileAccess: () => null }));
vi.mock("./WorkspaceToolsPanel", () => ({
  WorkspaceProjectFiles: () => <p>Files body</p>,
  WorkspaceBrowser: () => <p>Browser body</p>,
}));

const environmentId = EnvironmentId.make("a");
const item: WorkspaceLinkEndpoint = {
  ref: { type: "url", url: "https://example.invalid/a" },
  title: "Page A",
};
const p = ProjectId.make("p");
const q = ProjectId.make("q");
const origin = { confirmedAt: "2026-10-14T10:00:00Z", viewing: item };
function link(id: number, endpoint: WorkspaceLinkEndpoint): WorkspaceLinkView {
  return {
    id: `wslk_00000000-0000-0000-0000-${String(id).padStart(12, "0")}`,
    item: endpoint,
    status: "confirmed",
    source: { type: "user" },
    updatedAt: "2026-10-14T10:00:00Z",
    origin,
  };
}
const confirmed = link(1, {
  ref: { type: "url", url: "https://example.invalid/linked" },
  title: "Linked page",
});
const suggestion: WorkspaceLinkView = {
  ...link(2, {
    ref: { type: "url", url: "https://example.invalid/suggested" },
    title: "Suggested page",
  }),
  status: "suggested",
  source: { type: "model", model: "test-model", reason: "Same launch" },
};
let root: Root | undefined;
let node: HTMLDivElement;
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  node?.remove();
  mocks.related = [];
  mocks.taskLoading = false;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
async function mount(content?: ReactNode) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  (
    window as unknown as {
      happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
    }
  ).happyDOM.setWindowSize({ width: 1280, height: 800 });
  mocks.list = {
    linked: [
      confirmed,
      link(3, { ref: { type: "project", projectId: p }, title: "Linked project" }),
    ],
    suggested: [suggestion],
    truncated: false,
  };
  mocks.accept.mockResolvedValue({ _tag: "Success" });
  mocks.dismiss.mockResolvedValue({ _tag: "Success" });
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  await act(() =>
    root!.render(
      content ?? (
        <WorkspaceLinkedContext environmentId={environmentId} item={item} onOpen={() => {}} />
      ),
    ),
  );
}
it("opens confirmed context and preserves Linked, Suggested, projects, provenance and explicit decisions", async () => {
  const onOpen = vi.fn();
  await mount(<WorkspaceLinkedContext environmentId={environmentId} item={item} onOpen={onOpen} />);
  expect(node.textContent).toContain("Things you connected to this item.");
  expect(node.textContent!.indexOf("Linked page")).toBeLessThan(
    node.textContent!.indexOf("Suggested page"),
  );
  expect(node.textContent).toContain("while viewing 'Page A'");
  expect(getAllByRole(node, "group", { name: "Context views" })[0]!.textContent).toBe(
    "LinkedProjects",
  );
  await act(() => getByRole(node, "button", { name: "url: Linked page" }).click());
  expect(onOpen).toHaveBeenCalledWith(confirmed.item.ref);
  await act(() => getByRole(node, "button", { name: "Projects" }).click());
  expect(getByRole(node, "button", { name: "project: Linked project" })).toBeDefined();
  expect(queryByRole(node, "button", { name: "url: Linked page" })).toBeNull();
  expect(mocks.linkItem).not.toHaveBeenCalled();
  expect(mocks.accept).not.toHaveBeenCalled();
  expect(mocks.dismiss).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
it.each(["Accept", "Dismiss"])(
  "runs only the explicit %s command and renders the returned relationship",
  async (decision) => {
    await mount();
    await act(() => getByRole(node, "button", { name: decision }).click());
    if (decision === "Accept") {
      expect(mocks.accept).toHaveBeenCalledWith({
        environmentId,
        input: { id: suggestion.id, viewing: item },
      });
      expect(mocks.dismiss).not.toHaveBeenCalled();
      mocks.list = {
        ...mocks.list,
        linked: [...mocks.list.linked, { ...suggestion, status: "confirmed", origin }],
        suggested: [],
      };
    } else {
      expect(mocks.dismiss).toHaveBeenCalledWith({ environmentId, input: { id: suggestion.id } });
      expect(mocks.accept).not.toHaveBeenCalled();
      mocks.list = { ...mocks.list, suggested: [] };
    }
    await act(() =>
      root!.render(
        <WorkspaceLinkedContext environmentId={environmentId} item={item} onOpen={() => {}} />,
      ),
    );
    expect(queryByRole(node, "button", { name: "Accept" })).toBeNull();
    if (decision === "Accept")
      expect(node.textContent).toContain("Accepted suggestion from test-model: Same launch");
    else expect(node.textContent).not.toContain("Suggested page");
    expect(mocks.linkItem).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  },
);
it("keeps unavailable links and one-hop discovery visible without granting context", async () => {
  mocks.related = [
    {
      item: { ref: { type: "url", url: "https://example.invalid/via" }, title: "One-hop page" },
      via: confirmed.item,
    },
  ];
  await mount(
    <WorkspaceLinkedContext
      environmentId={environmentId}
      item={{ ref: { type: "project", projectId: p }, title: "Linked project" }}
      onOpen={() => {}}
    />,
  );
  mocks.list = {
    ...mocks.list,
    linked: [
      ...mocks.list.linked,
      link(4, {
        ref: { type: "project", projectId: ProjectId.make("removed") },
        title: "Deleted project",
      }),
    ],
  };
  await act(() =>
    root!.render(
      <WorkspaceLinkedContext
        environmentId={environmentId}
        item={{ ref: { type: "project", projectId: p }, title: "Linked project" }}
        onOpen={() => {}}
      />,
    ),
  );
  expect(
    getByRole(node, "button", { name: "project: Deleted project" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(node.textContent).toContain("Unavailable: this project was removed.");
  expect(node.textContent).toContain("Via Linked page");
  expect(node.textContent).toContain(
    "These items are not project context until you link them directly.",
  );
  expect(mocks.linkItem).not.toHaveBeenCalled();
});
it("captures item A through header context while resource project B changes independently", async () => {
  const onOpen = vi.fn();
  function App({
    selected = item,
    env = environmentId,
  }: {
    selected?: WorkspaceLinkEndpoint;
    env?: EnvironmentId;
  }) {
    const state = useWorkspaceResourceState(env, {
      storage: { getItem: () => null, setItem: () => {} },
    });
    return (
      <WorkspaceResourcesProvider value={state}>
        <WorkspaceEngagement
          environmentId={env}
          space="projects"
          layout="full"
          header={{ title: "Projects", environmentLabel: env, spaceLabel: "Projects" }}
          linkedContext={{
            item: selected,
            render: (target) => (
              <WorkspaceLinkedContext environmentId={env} item={target} onOpen={onOpen} />
            ),
          }}
          resources={
            <WorkspaceResourcesPanel
              environmentId={env}
              project={
                state.projectId
                  ? {
                      kind: "selected",
                      scope: { environmentId: env, projectId: state.projectId },
                      title: state.projectId,
                    }
                  : { kind: "choose", candidates: [] }
              }
              projects={[
                { id: p, title: "Project A" },
                { id: q, title: "Project B" },
              ]}
              selectedItem={selected}
              onOpen={onOpen}
              footer="Connection status unavailable"
            />
          }
        >
          <button onClick={() => state.openResource({ projectId: q, tab: "browser" })}>
            Choose resource B
          </button>
        </WorkspaceEngagement>
      </WorkspaceResourcesProvider>
    );
  }
  await mount(<App />);
  await act(() => getByRole(node, "button", { name: "Linked context" }).click());
  await act(() =>
    root!.render(
      <App
        selected={{ ref: { type: "url", url: "https://example.invalid/b" }, title: "Page B" }}
      />,
    ),
  );
  expect(getByRole(node, "heading", { name: "Page A" })).toBeDefined();
  await act(() => getByRole(node, "button", { name: "Choose resource B" }).click());
  await act(() => getByRole(node, "button", { name: "Accept" }).click());
  expect(mocks.accept).toHaveBeenCalledWith({
    environmentId,
    input: { id: suggestion.id, viewing: item },
  });
  await act(() => getByRole(node, "button", { name: "url: Linked page" }).click());
  expect(onOpen).toHaveBeenCalledWith(confirmed.item.ref);
  expect(getAllByRole(node, "complementary")).toHaveLength(1);
  await act(() => getByRole(node, "button", { name: "Back to resources" }).click());
  expect(getByRole(node, "combobox", { name: "Choose project" }).textContent).toContain(
    "Project B",
  );
  expect(getByRole(node, "tab", { name: "Browser" }).getAttribute("aria-selected")).toBe("true");
  expect(mocks.linkItem).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
  await act(() => getByRole(node, "button", { name: "Linked context" }).click());
  await act(() => root!.render(<App env={EnvironmentId.make("b")} />));
  expect(queryByRole(node, "heading", { name: "Linked context" })).toBeNull();
  expect(node.textContent).not.toContain("Page A");
});
it("shows loading while finding the selected task's project, then its related items", async () => {
  mocks.taskLoading = true;
  const task: WorkspaceLinkEndpoint = {
    ref: { type: "task", taskId: "wskt_00000000-0000-0000-0000-000000000001" },
    title: "Task",
  };
  await mount(
    <WorkspaceLinkedContext environmentId={environmentId} item={task} onOpen={() => {}} />,
  );
  expect(node.textContent).toContain("Finding this task's project...");
  expect(queryByRole(node, "region", { name: "Related through linked items" })).toBeNull();
  mocks.taskLoading = false;
  await act(() =>
    root!.render(
      <WorkspaceLinkedContext environmentId={environmentId} item={task} onOpen={() => {}} />,
    ),
  );
  expect(node.textContent).not.toContain("Finding this task's project...");
  expect(getByRole(node, "region", { name: "Related through linked items" })).toBeDefined();
});
it("shows the selected task's project discovery once, labelled through its original item", async () => {
  const onOpen = vi.fn();
  const related = {
    ref: { type: "url" as const, url: "https://example.invalid/discovery" },
    title: "Project discovery",
  };
  mocks.related = [{ item: related, via: confirmed.item }];
  await mount(
    <WorkspaceLinkedContext
      environmentId={environmentId}
      item={{
        ref: { type: "task", taskId: "wskt_00000000-0000-0000-0000-000000000001" },
        title: "Task",
      }}
      onOpen={onOpen}
    />,
  );
  expect(getAllByRole(node, "region", { name: "Related through linked items" })).toHaveLength(1);
  expect(node.textContent).toContain("Via Linked page");
  expect(node.textContent).toContain("this task's project");
  expect(mocks.queries).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "hub", environmentId, input: { projectId: p, threadIds: [] } }),
  );
  await act(() => getByRole(node, "button", { name: "Project discovery" }).click());
  expect(onOpen).toHaveBeenCalledWith(related.ref);
  expect(mocks.linkItem).not.toHaveBeenCalled();
  expect(mocks.accept).not.toHaveBeenCalled();
});
