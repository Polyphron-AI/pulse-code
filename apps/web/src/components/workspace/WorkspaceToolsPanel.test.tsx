import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { WorkspaceToolsPanel } from "./WorkspaceToolsPanel";
const mocks = vi.hoisted(() => ({
  desktop: false,
  external: vi.fn(),
  link: vi.fn(),
  preview: vi.fn(),
  query: vi.fn(),
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => [{ id: "p", environmentId: "remote", title: "Project" }],
  useThreadShells: () => [
    { id: "t", projectId: "p", environmentId: "remote", title: "Live thread title" },
  ],
}));
vi.mock("../../state/workspaceLinks", () => ({ workspaceLinks: { list: () => "links" } }));
vi.mock("../../state/workspaceTools", () => ({
  workspaceTools: { config: () => "config", task: () => "task" },
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
vi.mock("../../state/preview", () => ({ previewEnvironment: { open: {} } }));
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
  useWorkspaceCanOperate: () => true,
  workspaceToolsError: () => "Synthetic error",
}));
vi.mock("./WorkspaceItemActions", () => ({
  WorkspaceItemActions: () => <button>Start thread</button>,
}));
vi.mock("./DriveFiles", () => ({ DriveFileAccess: () => <button>Read file</button> }));
vi.mock("../preview/openPreviewSession", () => ({
  openPreviewSession: (input: unknown) => mocks.preview(input),
}));
vi.mock("../preview/PreviewPanel", () => ({ PreviewPanel: () => <div>Incumbent Browser</div> }));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/dialog", () => ({
  Dialog: ({ open, children }: { open: boolean; children: unknown }) => (open ? children : null),
  DialogPopup: "section",
  DialogHeader: "header",
  DialogTitle: "h2",
  DialogPanel: "div",
}));
let renderer: ReactTestRenderer | undefined;
const item = {
  ref: { type: "project" as const, projectId: ProjectId.make("p") },
  title: "Project",
};
const environmentId = EnvironmentId.make("remote");
afterEach(async () => {
  if (renderer) await act(() => renderer?.unmount());
  renderer = undefined;
  mocks.desktop = false;
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
it("lists confirmed Files and Agents, uses live thread titles, and links the current external page to the captured source", async () => {
  mocks.external.mockResolvedValue(undefined);
  mocks.link.mockResolvedValue(undefined);
  await mount();
  expect(renderer!.root.findAllByProps({ "aria-label": "Files tool" })).toHaveLength(1);
  expect(renderer!.root.findAllByProps({ "aria-label": "Agents tool" })).toHaveLength(1);
  const text = JSON.stringify(renderer!.toJSON());
  expect(text).toContain("Brief");
  expect(text).toContain("Live thread title");
  expect(text).not.toContain("Suggested only");
  await act(() =>
    renderer!.root
      .findByType("input")
      .props.onChange({ target: { value: "https://example.test/page?utm_source=fixture" } }),
  );
  await act(() =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children === "Open in new tab")!
      .props.onClick(),
  );
  expect(mocks.external).toHaveBeenCalledWith("https://example.test/page");
  await act(() =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children === "Link this page")!
      .props.onClick(),
  );
  expect(mocks.link).toHaveBeenCalledWith(item, {
    ref: { type: "url", url: "https://example.test/page" },
    title: "https://example.test/page",
  });
});
it("opens the incumbent desktop preview through the configured environment-local Browser thread", async () => {
  mocks.desktop = true;
  mocks.preview.mockResolvedValue({ _tag: "Success", value: {} });
  await mount();
  await act(() =>
    renderer!.root
      .findByType("input")
      .props.onChange({ target: { value: "https://example.test/page" } }),
  );
  await act(() =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.props.children === "Open Browser")!
      .props.onClick(),
  );
  expect(mocks.preview).toHaveBeenCalledWith(
    expect.objectContaining({
      threadRef: { environmentId: "remote", threadId: "t" },
      url: "https://example.test/page",
    }),
  );
  expect(mocks.external).not.toHaveBeenCalled();
});
