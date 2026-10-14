import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import { ProjectsOverview } from "./ProjectsOverview";

const project: EnvironmentProject = {
  id: ProjectId.make("one"),
  environmentId: EnvironmentId.make("local"),
  title: "SynKEK",
  workspaceRoot: "/projects/synkek",
  scripts: [],
  defaultModelSelection: null,
  createdAt: "2026-10-12T00:00:00Z",
  updatedAt: "2026-10-12T00:00:00Z",
  office: {
    conversations: [],
    agentThreadIds: [],
    drive: { accountId: "google", folderId: "folder", folderName: "Marketing" },
  },
};
let renderer: ReactTestRenderer;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});
async function render(projects: readonly EnvironmentProject[] = [project]) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const select = vi.fn();
  const createProject = vi.fn();
  const open = vi.fn();
  await act(async () => {
    renderer = create(
      <ProjectsOverview
        projects={projects}
        selectedProject={project}
        onSelect={select}
        onCreate={createProject}
        onOpenConversations={open}
      />,
    );
  });
  return { select, createProject, open };
}
it("searches real project names and Drive folders and distinguishes no matches", async () => {
  await render();
  const search = renderer.root.findByProps({ "aria-label": "Search projects" });
  await act(async () => search.props.onChange({ target: { value: "marketing" } }));
  expect(renderer.root.findAllByProps({ "aria-label": "Manage SynKEK" })).toHaveLength(1);
  await act(async () => search.props.onChange({ target: { value: "missing" } }));
  expect(JSON.stringify(renderer.toJSON())).toContain("No matching projects");
});
it("selects management independently of opening project conversations", async () => {
  const { select, open } = await render();
  await act(async () =>
    renderer.root.findByProps({ "aria-label": "Manage SynKEK" }).props.onClick(),
  );
  expect(select).toHaveBeenCalledWith(project);
  expect(open).not.toHaveBeenCalled();
  await act(async () =>
    renderer.root.findByProps({ "aria-label": "Open conversations for SynKEK" }).props.onClick(),
  );
  expect(open).toHaveBeenCalledWith(project);
});
it("offers creation for an empty environment without invented projects", async () => {
  const { createProject } = await render([]);
  expect(JSON.stringify(renderer.toJSON())).toContain("Start your first project");
  expect(renderer.root.findAllByProps({ "aria-label": "Manage SynKEK" })).toHaveLength(0);
  await act(async () => renderer.root.findByProps({ "aria-label": "New project" }).props.onClick());
  expect(createProject).toHaveBeenCalledOnce();
});
