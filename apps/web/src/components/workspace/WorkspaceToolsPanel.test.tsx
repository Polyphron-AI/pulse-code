// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { useWorkspaceResourceState, WorkspaceResourcesProvider } from "./workspaceResourceState";
import { WorkspaceToolsPanel, WorkspaceProjectFiles } from "./WorkspaceToolsPanel";
import { WorkspaceBrowser } from "./WorkspaceBrowser";
import type { ComponentProps } from "react";
import type { PreviewPanel } from "../preview/PreviewPanel";
const mocks = vi.hoisted(() => ({
  desktop: false,
  external: vi.fn(),
  link: vi.fn(),
  preview: vi.fn(),
  query: vi.fn(),
  linksQuery: vi.fn(),
  configQuery: vi.fn(),
  relatedIds: [] as string[],
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => [
    { id: "p", environmentId: "remote", title: "Project" },
    { id: "q", environmentId: "remote", title: "Second project" },
    { id: "other", environmentId: "other", title: "Other environment" },
  ],
  useThreadShell: () => ({ id: "t", projectId: "p", environmentId: "remote" }),
  useThreadShells: () => [
    { id: "t", projectId: "p", environmentId: "remote", title: "Live thread title" },
  ],
}));
vi.mock("../../state/workspaceLinks", () => ({
  workspaceLinks: {
    list: (input: unknown) => {
      mocks.linksQuery(input);
      return "links";
    },
  },
}));
vi.mock("../../state/workspaceTools", () => ({
  workspaceTools: {
    config: (input: unknown) => {
      mocks.configQuery(input);
      return "config";
    },
    task: () => "task",
  },
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (input: unknown) => {
    mocks.query(input);
    return {
      data:
        input === "config"
          ? { projectId: "p", taskColumns: ["To do"], browserThreadId: "t" }
          : input === "links"
            ? {
                linked: [
                  ...mocks.relatedIds.map((projectId) => ({
                    id: projectId,
                    item: { ref: { type: "project", projectId } },
                  })),
                  {
                    id: "f",
                    item: {
                      ref: { type: "file", provider: "google-drive", fileId: "file" },
                      title: "Brief",
                    },
                  },
                  {
                    id: "t",
                    item: { ref: { type: "thread", threadId: "t" }, title: "Stale title" },
                  },
                ],
                suggested: [
                  {
                    id: "suggested",
                    item: {
                      ref: { type: "thread", threadId: "suggested" },
                      title: "Suggested only",
                    },
                  },
                ],
              }
            : null,
      error: null,
    };
  },
}));
vi.mock("../../state/preview", () => ({ previewEnvironment: { open: {}, list: () => "preview" } }));
vi.mock("../../state/environments", () => ({ useConnectedEnvironmentIds: () => ["remote"] }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../../previewStateStore", () => ({
  isPreviewSupportedInRuntime: () => mocks.desktop,
  useThreadPreviewState: () => ({
    snapshot: {
      navStatus: {
        _tag: "Success",
        url: "https://example.test/current?utm_source=fixture",
        title: "Current page",
      },
    },
  }),
}));
vi.mock("../../localApi", () => ({
  readLocalApi: () => ({ shell: { openExternal: mocks.external } }),
}));
vi.mock("./mail/useMailLinks", () => ({ useMailLinks: () => ({ linkItem: mocks.link }) }));
vi.mock("./ProjectTasks", () => ({
  workspaceToolsError: () => "Synthetic error",
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({
    ready: true,
    workspaceLinks: true,
    workspaceTools: true,
    driveRead: true,
  }),
}));
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemActions: () => <button>Start thread</button>,
}));
vi.mock("./DriveFiles", () => ({
  DriveFileAccess: () => <button>Read file</button>,
  DriveSearch: () => <p>Account-wide Drive search</p>,
}));
vi.mock("../preview/openPreviewSession", () => ({
  openPreviewSession: (input: unknown) => mocks.preview(input),
}));
vi.mock("../preview/PreviewPanel", () => ({
  PreviewPanel: ({ visible, renderChrome, threadRef }: ComponentProps<typeof PreviewPanel>) =>
    visible ? (
      <div>
        {renderChrome?.({
          url: "https://example.test/current",
          loading: false,
          canGoBack: false,
          canGoForward: false,
          refreshDisabled: false,
          onBack() {},
          onForward() {},
          onRefresh() {},
          onSubmit: (url) => {
            void mocks.preview({ threadRef, url });
          },
        })}
        <div>Incumbent Browser</div>
      </div>
    ) : null,
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
let renderer: ReactTestRenderer | undefined;
let domRoot: Root | undefined;
let node: HTMLDivElement | undefined;
const item = {
  ref: { type: "project" as const, projectId: ProjectId.make("p") },
  title: "Project",
};
const environmentId = EnvironmentId.make("remote");
afterEach(async () => {
  if (renderer) await act(() => renderer?.unmount());
  if (domRoot) await act(() => domRoot?.unmount());
  domRoot = undefined;
  node?.remove();
  renderer = undefined;
  mocks.desktop = false;
  mocks.relatedIds = [];
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
const mount = async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(() => {
    renderer = create(
      <WorkspaceToolsPanel environmentId={environmentId} item={item} onOpen={() => {}} />,
    );
  });
};
it("lists confirmed Files and Agents without mounting a Browser tool", async () => {
  await mount();
  expect(renderer!.root.findAllByProps({ "aria-label": "Files tool" })).toHaveLength(1);
  expect(renderer!.root.findAllByProps({ "aria-label": "Agents tool" })).toHaveLength(1);
  const text = JSON.stringify(renderer!.toJSON());
  expect(text).toContain("Brief");
  expect(text).toContain("Live thread title");
  expect(text).not.toContain("Suggested only");
  expect(text).not.toContain("Browser tool");
  expect(renderer!.root.findAllByType(WorkspaceBrowser)).toHaveLength(0);
});
it("releases the inline Browser in Linked context and restores it without a dialog", async () => {
  mocks.desktop = true;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  (
    window as unknown as {
      happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
    }
  ).happyDOM.setWindowSize({ width: 1280, height: 800 });
  node = document.createElement("div");
  document.body.append(node);
  domRoot = createRoot(node);
  function App() {
    const state = useWorkspaceResourceState(environmentId, {
      storage: { getItem: () => null, setItem: () => {} },
    });
    return (
      <WorkspaceResourcesProvider value={state}>
        <WorkspaceEngagement
          environmentId={environmentId}
          space="projects"
          layout="full"
          header={{ title: "Projects", environmentLabel: "Remote", spaceLabel: "Projects" }}
          linkedContext={{ item, render: () => <p>Item links</p> }}
          resources={
            <WorkspaceBrowser
              environmentId={environmentId}
              projectId={item.ref.projectId}
              selectedItem={null}
              request={null}
              onOpen={() => {}}
            />
          }
        >
          <p>Project content</p>
        </WorkspaceEngagement>
      </WorkspaceResourcesProvider>
    );
  }
  await act(() => domRoot!.render(<App />));
  expect(node.textContent).toContain("Incumbent Browser");
  expect(queryByRole(document.body, "dialog")).toBeNull();
  await act(() => getByRole(node!, "button", { name: "Linked context", hidden: true }).click());
  expect(node.textContent).not.toContain("Incumbent Browser");
  expect(queryByRole(document.body, "dialog")).toBeNull();
  await act(() => getByRole(node!, "button", { name: "Back to resources" }).click());
  expect(node.textContent).toContain("Incumbent Browser");
  expect(queryByRole(document.body, "dialog")).toBeNull();
});

it("reads Files through the resource project rather than the selected item", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(() => {
    renderer = create(
      <WorkspaceProjectFiles
        environmentId={environmentId}
        projectId={ProjectId.make("p")}
        selectedItem={null}
        request={null}
        onOpen={() => {}}
      />,
    );
  });
  expect(mocks.linksQuery).toHaveBeenCalledWith({
    environmentId,
    input: { item: { type: "project", projectId: "p" } },
  });
  expect(JSON.stringify(renderer!.toJSON())).toContain("Brief");
  expect(mocks.link).not.toHaveBeenCalled();
});

it("allows browsing without selection and disables linking with a reason", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(() => {
    renderer = create(
      <WorkspaceBrowser
        environmentId={environmentId}
        projectId={ProjectId.make("p")}
        selectedItem={null}
        request={null}
        onOpen={() => {}}
      />,
    );
  });
  await act(() =>
    renderer!.root
      .findByProps({ "aria-label": "Browser page address" })
      .props.onChange({ target: { value: "https://example.test/page" } }),
  );
  const buttons = renderer!.root.findAllByType("button");
  expect(
    buttons.find((button) => button.props.children === "Open in new tab")!.props.disabled,
  ).toBe(false);
  expect(buttons.find((button) => button.props.children === "Link this page")!.props.disabled).toBe(
    true,
  );
  expect(JSON.stringify(renderer!.toJSON())).toContain("Select an item to link this page to.");
});

vi.mock("./useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => true }));

it("retains account-wide search beside linked files on older servers", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(() => {
    renderer = create(
      <WorkspaceProjectFiles
        environmentId={environmentId}
        projectId={ProjectId.make("p")}
        selectedItem={null}
        request={null}
        onOpen={() => {}}
      />,
    );
  });
  expect(JSON.stringify(renderer!.toJSON())).toContain("Account-wide Drive search");
});
