// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent, getByRole, queryByRole } from "@testing-library/dom";
import { expect, it, vi } from "vite-plus/test";
import * as DateTime from "effect/DateTime";
import { EnvironmentId, ProjectId, type WorkspaceTaskPage } from "@t3tools/contracts";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { MailRow } from "./mail/MailMessageList";
import { ProjectTasksResource } from "./ProjectTasksResource";

const state = vi.hoisted(() => ({ operate: false, write: vi.fn() }));
vi.mock("./useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => state.operate }));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({
    ready: true,
    workspaceLinks: true,
    workspaceTasksV2: true,
    workspaceItemContext: true,
  }),
}));
vi.mock("../../state/environments", () => ({
  useConnectedEnvironmentIds: () => ["menu-environment"],
}));
vi.mock("../../state/entities", () => ({ useProjects: () => [], useThreadShells: () => [] }));
vi.mock("../../hooks/useSettings", () => ({ useEnvironmentSettings: () => null }));
vi.mock("../../state/server", () => ({ primaryServerKeybindingsAtom: {} }));
vi.mock("@effect/atom-react", () => ({ useAtomValue: () => DEFAULT_RESOLVED_KEYBINDINGS }));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ state: { location: { href: "/workspace" } } }),
}));
vi.mock("../../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => state.write }));
vi.mock("../../hooks/useNewProject", () => ({ useNewProject: () => state.write }));
vi.mock("./mail/useMailLinks", () => ({
  useMailLinks: () => ({ linkItem: state.write }),
  linkErrorText: String,
}));
vi.mock("../../state/workspaceLinks", () => ({ workspaceLinks: { list: () => "links" } }));
vi.mock("../../state/workspaceTools", () => ({
  workspaceTools: { task: () => null, config: () => null, transitionTask: {} },
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.write }));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (query: unknown) => ({
    data: query ? { linked: [] } : null,
    failure: null,
    error: null,
  }),
}));
vi.mock("./WorkspaceTaskEditor", () => ({
  useTaskDateClock: () => DateTime.makeUnsafe("2026-10-13T12:00:00Z"),
  WorkspaceTaskEditor: () => null,
  workspaceTaskSummary: (value: unknown) => value,
}));
vi.mock("./TasksSpace", () => ({
  useWorkspaceTaskPages: () => ({
    view: { page, status: "ready", error: null, onLoadMore: () => {}, onRetry: () => {} },
    cursor: null,
    failure: null,
  }),
}));
const environmentId = EnvironmentId.make("menu-environment");
const projectId = ProjectId.make("menu-project");
const page: WorkspaceTaskPage = {
  tasks: [
    {
      id: "menu-task",
      projectId,
      projectTitle: "Project",
      title: "Review launch",
      column: "Open",
      done: false,
      revision: 1,
      dueOn: null,
      areaLabel: "",
      owner: null,
    },
  ],
  projects: [
    {
      projectId,
      taskColumns: ["Open", "Done"],
      browserThreadId: null,
      completedColumn: "Done",
      revision: 1,
    },
  ],
  total: 1,
  openTotal: 1,
  nextCursor: null,
  laneTotals: [],
};

it.each(["Mail", "Tasks"] as const)(
  "keeps %s readable and hides its menu without operate, then opens generic actions with operate",
  async (consumer) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    state.operate = false;
    state.write.mockClear();
    const render = () =>
      root.render(
        consumer === "Mail" ? (
          <MailRow
            environmentId={environmentId}
            message={{
              ref: { accountId: "account", mailbox: "INBOX", uidValidity: 1, uid: 1 },
              subject: "Review launch",
              seen: true,
              flagged: false,
              answered: false,
            }}
            active={false}
            onSelect={() => {}}
          />
        ) : (
          <ProjectTasksResource
            environmentId={environmentId}
            projectId={projectId}
            request={null}
            selectedItem={null}
            onOpen={() => {}}
          />
        ),
      );
    try {
      await act(render);
      expect(node.textContent).toContain("Review launch");
      expect(queryByRole(node, "button", { name: "Item actions" })).toBeNull();
      await act(() => fireEvent.contextMenu(node.querySelector("[draggable=true]")!));
      expect(queryByRole(document.body, "dialog")).toBeNull();
      state.operate = true;
      await act(render);
      const trigger = getByRole(node, "button", { name: "Item actions" });
      await act(() => fireEvent.click(trigger));
      const popup = getByRole(document.body, "dialog");
      expect(getByRole(popup, "button", { name: /Add to project/ })).toBeDefined();
      expect(popup.getAttribute("data-align")).toBe("end");
      await act(() => fireEvent.keyDown(trigger, { key: "Escape" }));
      expect(queryByRole(document.body, "dialog")).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect(state.write).not.toHaveBeenCalled();
    } finally {
      await act(() => root.unmount());
      node.remove();
      vi.unstubAllGlobals();
    }
  },
);
