import { act, type ButtonHTMLAttributes } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { DEFAULT_SERVER_SETTINGS, EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";

const commands = vi.hoisted(() => ({ create: vi.fn(), open: vi.fn(), supported: true }));
vi.mock("../../state/entities", () => ({ useThreadShells: () => [], useProjects: () => [] }));
vi.mock("../../state/threads", () => ({ threadEnvironment: { create: "create" } }));
vi.mock("../../state/preview", () => ({ previewEnvironment: { open: "open" } }));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (command: "create" | "open") => commands[command],
}));
vi.mock("../../hooks/useSettings", () => ({
  useEnvironmentSettings: () => DEFAULT_SERVER_SETTINGS,
}));
vi.mock("../../lib/utils", () => ({ newThreadId: () => ThreadId.make("browser-session") }));
vi.mock("../../previewStateStore", () => ({
  isPreviewSupportedInRuntime: () => commands.supported,
}));
vi.mock("../preview/openPreviewSession", () => ({ openPreviewSession: commands.open }));
vi.mock("../preview/PreviewPanel", () => ({ PreviewPanel: () => <div data-testid="browser" /> }));
vi.mock("../pullRequest/PullRequestDetailPanel", () => ({ PullRequestDetailPanel: () => null }));
vi.mock("../ui/button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("../ui/input", () => ({ Input: () => <input /> }));
import { ProjectResourcePanel } from "./ProjectResourcePanel";

const project: EnvironmentProject = {
  id: ProjectId.make("project-one"),
  environmentId: EnvironmentId.make("environment"),
  title: "SynKEK",
  workspaceRoot: "/projects/SynKEK",
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-10-12T00:00:00.000Z",
  updatedAt: "2026-10-12T00:00:00.000Z",
};
const office = { conversations: [], agentThreadIds: [] };
let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  commands.create.mockReset().mockResolvedValue({ _tag: "Success", value: undefined });
  commands.open.mockReset().mockResolvedValue({ _tag: "Success", value: undefined });
  commands.supported = true;
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});

it("creates an empty browser session only on explicit open and saves its project association", async () => {
  const save = vi.fn().mockResolvedValue(true);
  await act(async () => {
    renderer = create(
      <ProjectResourcePanel
        project={project}
        office={office}
        onSaveOffice={save}
        resource="Browser"
      />,
    );
  });
  expect(commands.create).not.toHaveBeenCalled();
  await act(async () => renderer!.root.findByType("button").props.onClick());
  expect(commands.create).toHaveBeenCalledWith(
    expect.objectContaining({
      environmentId: project.environmentId,
      input: expect.objectContaining({
        threadId: "browser-session",
        projectId: project.id,
        title: "Project browser",
      }),
    }),
  );
  expect(save).toHaveBeenCalledWith({ ...office, browserThreadId: "browser-session" });
  expect(renderer!.root.findByProps({ "data-testid": "browser" })).toBeDefined();
});

it("retries saving the same browser session after a failed association", async () => {
  const save = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  await act(async () => {
    renderer = create(
      <ProjectResourcePanel
        project={project}
        office={office}
        onSaveOffice={save}
        resource="Browser"
      />,
    );
  });
  await act(async () => renderer!.root.findByType("button").props.onClick());
  expect(renderer!.root.findByProps({ role: "alert" })).toBeDefined();
  await act(async () =>
    renderer!.root
      .findAllByType("button")
      .find((button) => button.children.includes("Retry"))!
      .props.onClick(),
  );
  expect(commands.create).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledTimes(2);
});

it("does not create a session when the native browser is unavailable", async () => {
  commands.supported = false;
  await act(async () => {
    renderer = create(
      <ProjectResourcePanel
        project={project}
        office={office}
        onSaveOffice={vi.fn()}
        resource="Browser"
        targetUrl="https://example.com"
      />,
    );
  });
  expect(commands.create).not.toHaveBeenCalled();
  expect(commands.open).not.toHaveBeenCalled();
});

it("opens the latest shared URL when it changes during browser creation", async () => {
  let finishCreation: (value: unknown) => void = () => {};
  commands.create.mockReturnValue(
    new Promise((resolve) => {
      finishCreation = resolve;
    }),
  );
  const save = vi.fn().mockResolvedValue(true);
  await act(async () => {
    renderer = create(
      <ProjectResourcePanel
        project={project}
        office={office}
        onSaveOffice={save}
        resource="Browser"
        targetUrl="https://example.com/first"
      />,
    );
  });
  await act(async () => {
    renderer!.update(
      <ProjectResourcePanel
        project={project}
        office={office}
        onSaveOffice={save}
        resource="Browser"
        targetUrl="https://example.com/second"
      />,
    );
  });
  await act(async () => finishCreation({ _tag: "Success", value: undefined }));
  expect(commands.create).toHaveBeenCalledTimes(1);
  expect(commands.open).toHaveBeenLastCalledWith(
    expect.objectContaining({ url: "https://example.com/second" }),
  );
});
