import { act, type ButtonHTMLAttributes, type InputHTMLAttributes } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId, type PulseTask } from "@t3tools/contracts";

const state = vi.hoisted(() => ({
  records: [] as PulseTask[],
  mutate: vi.fn(),
  canWrite: true,
  columns: [] as { id: string; name: string; status: "review" }[],
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => [
    {
      id: "project",
      environmentId: "environment",
      title: "SynKEK",
      office: { conversations: [], agentThreadIds: [], taskColumns: state.columns },
    },
  ],
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: () => ({
    data: state.records,
    error: null,
    isPending: false,
    refresh: vi.fn(),
  }),
}));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => ({
    data: {
      authenticated: true,
      scopes: state.canWrite
        ? ["orchestration:read", "orchestration:operate"]
        : ["orchestration:read"],
    },
  }),
}));
vi.mock("../../state/tasks", () => ({ mutateTask: "mutate", tasksSubscription: () => null }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => state.mutate }));
vi.mock("./useCommunicationsRequest", () => ({
  useCommunicationsRequest: () => ({
    available: false,
    busy: false,
    error: undefined,
    run: vi.fn(),
  }),
}));
vi.mock("../ui/button", () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("../ui/input", () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
import { TasksPanel } from "./TasksPanel";

const environmentId = EnvironmentId.make("environment");
const projectId = ProjectId.make("project");
const record: PulseTask = {
  id: "task",
  title: "Write launch copy",
  description: "",
  status: "todo",
  projectId,
  tags: ["launch"],
  dueDate: null,
  recurrence: null,
  columnId: null,
  assignee: null,
  followers: [],
  source: null,
  recurrenceAnchorDate: null,
  nextOccurrenceId: null,
  parentTaskId: null,
  dependencyIds: [],
  revision: 0,
  archived: false,
  createdAt: "2026-10-12T00:00:00Z",
  updatedAt: "2026-10-12T00:00:00Z",
};
let renderer: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.records = [record];
  state.columns = [];
  state.canWrite = true;
  state.mutate.mockReset().mockResolvedValue({ _tag: "Success", value: record });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  vi.unstubAllGlobals();
});
const button = (label: string) =>
  renderer.root.findAllByType("button").find((node) => node.children.join("") === label)!;

it("updates the task list from the workspace status navigation without losing its editor", async () => {
  state.records = [
    record,
    { ...record, id: "finished", title: "Published launch copy", status: "done" },
  ];
  await act(async () => {
    renderer = create(<TasksPanel environmentId={environmentId} statusFilter="open" />);
  });
  expect(renderer.root.findAllByProps({ "aria-label": "Complete Write launch copy" })).toHaveLength(
    1,
  );
  expect(
    renderer.root.findAllByProps({ "aria-label": "Reopen Published launch copy" }),
  ).toHaveLength(0);
  await act(async () => button("Add task").props.onClick());
  await act(async () => {
    renderer.update(<TasksPanel environmentId={environmentId} statusFilter="done" />);
  });
  expect(renderer.root.findAllByProps({ "aria-label": "Complete Write launch copy" })).toHaveLength(
    0,
  );
  expect(
    renderer.root.findAllByProps({ "aria-label": "Reopen Published launch copy" }),
  ).toHaveLength(1);
  expect(renderer.root.findAllByProps({ "aria-label": "New task" })).toHaveLength(1);
});

it("completes a sidebar task using its current revision and environment", async () => {
  await act(async () => {
    renderer = create(<TasksPanel environmentId={environmentId} projectId={projectId} compact />);
  });
  await act(async () =>
    renderer.root.findByProps({ "aria-label": "Complete Write launch copy" }).props.onChange(),
  );
  expect(state.mutate).toHaveBeenCalledWith({
    environmentId,
    input: { operation: "update", ...record, status: "done" },
  });
});

it("creates tasks in the sidebar project and edits tags without a separate task store", async () => {
  await act(async () => {
    renderer = create(<TasksPanel environmentId={environmentId} projectId={projectId} compact />);
  });
  await act(async () => button("Add task").props.onClick());
  await act(async () =>
    renderer.root
      .findAllByType("input")
      .find((input) => input.props.maxLength === 240)!
      .props.onChange({ target: { value: "Publish launch" } }),
  );
  await act(async () =>
    renderer.root
      .findByProps({ placeholder: "marketing, launch" })
      .props.onChange({ target: { value: " launch, seo, launch " } }),
  );
  await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(state.mutate).toHaveBeenCalledWith({
    environmentId,
    input: expect.objectContaining({
      operation: "create",
      title: "Publish launch",
      projectId,
      tags: ["launch", "seo"],
    }),
  });
});

it("shows board columns and keeps read-only clients from mutation controls", async () => {
  state.canWrite = false;
  await act(async () => {
    renderer = create(<TasksPanel environmentId={environmentId} />);
  });
  await act(async () => button("Board").props.onClick());
  expect(renderer.root.findByProps({ "aria-label": "In progress" })).toBeDefined();
  expect(button("Add task").props.disabled).toBe(true);
  expect(
    renderer.root.findByProps({ "aria-label": "Complete Write launch copy" }).props.disabled,
  ).toBe(true);
});

it("filters archived tasks and restores using the same record revision", async () => {
  state.records = [{ ...record, archived: true, revision: 4 }];
  await act(async () => {
    renderer = create(<TasksPanel environmentId={environmentId} compact />);
  });
  await act(async () =>
    renderer.root
      .findByProps({ "aria-label": "Filter task status" })
      .props.onChange({ target: { value: "archived" } }),
  );
  await act(async () => renderer.root.findByType("article").findByType("button").props.onClick());
  await act(async () => button("Restore task").props.onClick());
  expect(state.mutate).toHaveBeenCalledWith({
    environmentId,
    input: { operation: "archive", id: "task", revision: 4, archived: false },
  });
});

it("edits a completion-based recurrence from the same sidebar form", async () => {
  await act(async () => {
    renderer = create(<TasksPanel environmentId={environmentId} compact />);
  });
  await act(async () => renderer.root.findByType("article").findByType("button").props.onClick());
  const repeat = renderer.root
    .findAllByType("select")
    .find((select) =>
      select.findAllByType("option").some((option) => option.props.value === "after_completion"),
    )!;
  await act(async () => repeat.props.onChange({ target: { value: "after_completion" } }));
  await act(async () =>
    renderer.root
      .findByProps({ "aria-label": "Recurrence interval" })
      .props.onChange({ target: { value: "2" } }),
  );
  await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(state.mutate).toHaveBeenCalledWith({
    environmentId,
    input: expect.objectContaining({
      operation: "update",
      recurrence: { mode: "after_completion", frequency: "weekly", interval: 2 },
    }),
  });
});

it("opens captured context as an editable draft before persisting it", async () => {
  const handled = vi.fn();
  const source = {
    url: "/workspace?space=office&officeView=communications",
    excerpt: "Please draft the launch email.\nKeep it short.",
  };
  await act(async () => {
    renderer = create(
      <TasksPanel
        environmentId={environmentId}
        projectId={projectId}
        compact
        draft={{ key: "capture-1", source }}
        onDraftHandled={handled}
      />,
    );
  });
  expect(state.mutate).not.toHaveBeenCalled();
  expect(handled).not.toHaveBeenCalled();
  expect(
    renderer.root.findAllByType("input").find((input) => input.props.maxLength === 240)!.props
      .value,
  ).toBe("Please draft the launch email.");
  await act(async () =>
    renderer.root
      .findByProps({ placeholder: "Keep the relevant message or email context." })
      .props.onChange({ target: { value: "Approved excerpt only" } }),
  );
  await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(state.mutate).toHaveBeenCalledWith({
    environmentId,
    input: expect.objectContaining({
      source: { ...source, excerpt: "Approved excerpt only" },
      projectId,
    }),
  });
  expect(handled).toHaveBeenCalledTimes(1);
});

it("retains a captured draft after failure and clears it only when cancelled", async () => {
  const handled = vi.fn();
  state.mutate.mockRejectedValueOnce(new Error("Disconnected"));
  await act(async () => {
    renderer = create(
      <TasksPanel
        environmentId={environmentId}
        compact
        draft={{ key: "capture", source: { url: "/workspace", excerpt: "Keep this draft" } }}
        onDraftHandled={handled}
      />,
    );
  });
  await act(async () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  expect(handled).not.toHaveBeenCalled();
  expect(renderer.root.findByType("form")).toBeDefined();
  await act(async () => button("Close").props.onClick());
  expect(handled).toHaveBeenCalledTimes(1);
});

it("maps project columns to shared status and uses fallback status after removal", async () => {
  state.columns = [{ id: "copy-review", name: "Copy review", status: "review" }];
  state.records = [{ ...record, status: "review", columnId: "copy-review" }];
  await act(async () => {
    renderer = create(<TasksPanel environmentId={environmentId} projectId={projectId} />);
  });
  await act(async () => button("Board").props.onClick());
  expect(
    renderer.root.findByProps({ "aria-label": "Copy review" }).findAllByType("article"),
  ).toHaveLength(1);
  state.columns = [];
  await act(async () =>
    renderer.update(<TasksPanel environmentId={environmentId} projectId={projectId} />),
  );
  expect(
    renderer.root.findByProps({ "aria-label": "Review" }).findAllByType("article"),
  ).toHaveLength(1);
});
