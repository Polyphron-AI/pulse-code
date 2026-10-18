// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { WorkspaceResourceBody, type WorkspaceResourceBodyProps } from "./WorkspaceResourceBody";
import { WorkspaceResourcesPanelView } from "./WorkspaceResourcesPanelView";
const mounts = vi.hoisted(() => ({ browser: vi.fn(), agents: vi.fn() }));

vi.mock("./ProjectDriveExplorer", () => ({
  ProjectDriveExplorer: () => <p>Project files</p>,
}));
vi.mock("./WorkspaceAgents", () => ({
  WorkspaceAgents: (props: WorkspaceResourceBodyProps) => {
    mounts.agents(props);
    return <p>Assigned project agents</p>;
  },
}));
vi.mock("./WorkspaceBrowser", () => ({
  WorkspaceBrowser: ({ request, onOpen }: WorkspaceResourceBodyProps) => {
    const [initial] = useState(() => {
      mounts.browser();
      return true;
    });
    return (
      <button
        data-initial={initial}
        onClick={() => {
          if (request) onOpen(request);
        }}
      >
        Requested Browser page
      </button>
    );
  },
}));
it("forwards a requested Browser page and releases its body when switching to Files", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  const root = createRoot(node);
  const onOpen = vi.fn();
  const props = {
    environmentId: EnvironmentId.make("remote"),
    projectId: ProjectId.make("p"),
    selectedItem: null,
    request: { type: "url" as const, url: "https://example.test/request" },
    onOpen,
  };
  try {
    await act(() => root.render(<WorkspaceResourceBody {...props} tab="browser" />));
    await act(() => getByRole(node, "button", { name: "Requested Browser page" }).click());
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(props.request);
    await act(() => root.render(<WorkspaceResourceBody {...props} tab="files" />));
    expect(queryByRole(node, "button", { name: "Requested Browser page" })).toBeNull();
    expect(node.textContent).toBe("Project files");
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("fills the resource body with a definite height and remounts Browser for a different project", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mounts.browser.mockClear();
  const node = document.createElement("div");
  const root = createRoot(node);
  const props = {
    environmentId: EnvironmentId.make("remote"),
    projectId: ProjectId.make("p"),
    selectedItem: null,
    request: null,
    onOpen() {},
  };
  const render = (projectId: ProjectId) => (
    <WorkspaceResourcesPanelView
      projects={[]}
      selectedProjectId={projectId}
      status="selected"
      tab="browser"
      onTabChange={() => {}}
      onChooseProject={() => {}}
      onClose={() => {}}
      footer={null}
      body={<WorkspaceResourceBody {...props} projectId={projectId} tab="browser" />}
    />
  );
  try {
    await act(() => root.render(render(props.projectId)));
    const body = node.querySelector("[data-workspace-resource-body]")!;
    const wrapper = getByRole(body as HTMLElement, "button", {
      name: "Requested Browser page",
    }).parentElement!;
    expect(wrapper.parentElement).toBe(body);
    for (const className of ["flex", "h-full", "min-h-0", "flex-col"])
      expect(wrapper.classList.contains(className)).toBe(true);
    expect(mounts.browser).toHaveBeenCalledTimes(1);
    await act(() => root.render(render(ProjectId.make("other-project"))));
    expect(mounts.browser).toHaveBeenCalledTimes(2);
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it("dispatches Agents with canonical project scope", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  const root = createRoot(node);
  const props = {
    environmentId: EnvironmentId.make("remote"),
    projectId: ProjectId.make("p"),
    projectTitle: "Resource project",
    selectedItem: { ref: { type: "project" as const, projectId: ProjectId.make("different") } },
    request: null,
    onOpen: vi.fn(),
  };
  try {
    await act(() => root.render(<WorkspaceResourceBody {...props} tab="agents" />));
    expect(node.textContent).toBe("Assigned project agents");
    expect(mounts.agents).toHaveBeenLastCalledWith(expect.objectContaining(props));
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});
