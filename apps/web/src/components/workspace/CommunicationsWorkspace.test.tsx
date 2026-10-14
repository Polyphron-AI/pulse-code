import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

const state = vi.hoisted(() => ({
  projects: [] as EnvironmentProject[],
  navigate: vi.fn(),
  run: vi.fn(),
  command: vi.fn(),
  configs: new Map(),
}));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => state.navigate,
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => state.projects,
  useServerConfigs: () => state.configs,
}));
vi.mock("../../state/environments", () => ({ usePrimaryEnvironmentId: () => "local" }));
vi.mock("../../state/projects", () => ({
  projectEnvironment: { create: "create", update: "update" },
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.command }));
vi.mock("./useCommunicationsRequest", () => ({
  useCommunicationsRequest: () => ({ run: state.run, available: false, busy: false }),
}));
vi.mock("../ui/sidebar", () => ({
  SidebarInset: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("./EmailCommunicationsWorkspace", () => ({
  EmailCommunicationsWorkspace: () => <div data-testid="email" />,
}));
vi.mock("./ChatCommunicationsWorkspace", () => ({
  ChatCommunicationsWorkspace: () => <div data-testid="chat" />,
}));
vi.mock("./ConnectCommunicationsDialog", () => ({ ConnectCommunicationsDialog: () => null }));
vi.mock("./ProjectDrivePanel", () => ({ driveResourceId: () => undefined }));
vi.mock("./ProjectWorkspaceTools", () => ({
  ProjectWorkspaceTools: ({
    project,
    tool,
    onOpenCommunications,
  }: {
    project: EnvironmentProject;
    tool: string;
    onOpenCommunications?: () => void;
  }) => (
    <aside data-project={project.id} data-tool={tool}>
      <button aria-label="Configure conversations" onClick={onOpenCommunications} />
    </aside>
  ),
}));
import { CommunicationsWorkspace } from "./CommunicationsWorkspace";

const project: EnvironmentProject = {
  id: ProjectId.make("one"),
  environmentId: EnvironmentId.make("local"),
  title: "SynKEK",
  workspaceRoot: "/projects/synkek",
  scripts: [],
  defaultModelSelection: null,
  createdAt: "2026-10-12T00:00:00Z",
  updatedAt: "2026-10-12T00:00:00Z",
};
let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("window", {});
  state.projects = [project, { ...project, id: ProjectId.make("two"), title: "Website" }];
  state.navigate.mockReset();
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});
it("opens Projects with management content and changes selection without showing chat", async () => {
  await act(async () => {
    renderer = create(<CommunicationsWorkspace openProjects />);
  });
  expect(renderer.root.findByType("aside").props["data-tool"]).toBe("Settings");
  expect(
    renderer.root.findAllByProps({ "aria-label": "Connected communications account" }),
  ).toHaveLength(0);
  await act(async () =>
    renderer.root.findByProps({ "aria-label": "Manage Website" }).props.onClick(),
  );
  expect(renderer.root.findByType("aside").props["data-project"]).toBe("two");
  expect(renderer.root.findAllByProps({ "aria-label": "Project management" })).toHaveLength(1);
});
it("filters connected projects from the shared navigation rail", async () => {
  state.projects = [
    project,
    {
      ...project,
      id: ProjectId.make("two"),
      title: "Website",
      office: {
        conversations: [],
        agentThreadIds: [],
        drive: { accountId: "drive", folderId: "folder", folderName: "Website" },
      },
    },
  ];
  await act(async () => {
    renderer = create(<CommunicationsWorkspace openProjects />);
  });
  await act(async () => renderer.root.findByProps({ "aria-label": "Connected" }).props.onClick());
  expect(renderer.root.findAllByProps({ "aria-label": "Manage SynKEK" })).toHaveLength(0);
  expect(renderer.root.findAllByProps({ "aria-label": "Manage Website" })).toHaveLength(1);
  await act(async () =>
    renderer.root.findByProps({ "aria-label": "All projects" }).props.onClick(),
  );
  expect(renderer.root.findAllByProps({ "aria-label": "Manage SynKEK" })).toHaveLength(1);
});
it("switches to Communications keeping the selected project settings for linking", async () => {
  await act(async () => {
    renderer = create(<CommunicationsWorkspace openProjects />);
  });
  await act(async () =>
    renderer.root.findByProps({ "aria-label": "Manage Website" }).props.onClick(),
  );
  await act(async () =>
    renderer.root.findByProps({ "aria-label": "Configure conversations" }).props.onClick(),
  );
  expect(state.navigate).toHaveBeenCalledWith({
    to: "/workspace",
    search: { space: "office", officeView: "communications" },
  });
  await act(async () => renderer.update(<CommunicationsWorkspace openProjects={false} />));
  expect(renderer.root.findByType("aside").props["data-project"]).toBe("two");
  expect(renderer.root.findByType("aside").props["data-tool"]).toBe("Settings");
  expect(
    renderer.root.findAllByProps({ "aria-label": "Connected communications account" }),
  ).toHaveLength(1);
});
it("opens a different project when the requested project changes without remounting", async () => {
  await act(async () => {
    renderer = create(
      <CommunicationsWorkspace
        openProjects
        requestedProjectKey={JSON.stringify(["local", "one"])}
      />,
    );
  });
  expect(renderer.root.findByType("aside").props["data-project"]).toBe("one");
  await act(async () =>
    renderer.update(
      <CommunicationsWorkspace
        openProjects
        requestedProjectKey={JSON.stringify(["local", "two"])}
      />,
    ),
  );
  expect(renderer.root.findByType("aside").props["data-project"]).toBe("two");
});
