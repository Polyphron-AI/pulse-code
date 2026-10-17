// @vitest-environment happy-dom
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import * as Cause from "effect/Cause";
import {
  EnvironmentId,
  ProjectId,
  WorkspaceToolsError,
  type WorkspaceTaskSummary,
} from "@t3tools/contracts";
import { WorkspaceTaskEditor } from "./WorkspaceTaskEditor";

const boundary = vi.hoisted(() => ({
  patch: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
  latest: null as unknown,
  operate: true,
  v2: true,
}));
vi.mock("../../state/workspaceTools", () => ({
  workspaceTools: {
    patchTask: "patch",
    upsertTask: "upsert",
    deleteTask: "remove",
    task: () => "task",
  },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (name: "patch" | "upsert" | "remove") => boundary[name],
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: (query: unknown) => ({
    data: query ? boundary.latest : null,
    error: null,
    refresh: vi.fn(),
    isPending: false,
  }),
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ workspaceTasksV2: boundary.v2, ready: true }),
}));
vi.mock("./useWorkspaceCanOperate", () => ({ useWorkspaceCanOperate: () => boundary.operate }));
vi.mock("../../hooks/useSettings", () => ({
  useEnvironmentSettings: (_: unknown, select: (s: unknown) => unknown) =>
    select({ workspaceDisplayTimeZone: "UTC" }),
}));
vi.mock("./WorkspaceItemActions", () => ({ WorkspaceItemActions: () => null }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/button", () => ({ Button: "button" }));
const environmentId = EnvironmentId.make("remote");
const projectId = ProjectId.make("p");
const task: WorkspaceTaskSummary = {
  id: "wskt_00000000-0000-4000-8000-000000000001",
  projectId,
  projectTitle: "SynKEK",
  title: "Original",
  column: "To do",
  done: false,
  revision: 3,
  dueOn: "2026-10-16",
  areaLabel: "Marketing",
  owner: "environment-owner",
};
const config = {
  projectId,
  taskColumns: ["To do", "Done"],
  completedColumn: "Done",
  revision: 0,
  browserThreadId: null,
};
let renderer: ReactTestRenderer;
const onClose = vi.fn(),
  onSaved = vi.fn();
const view = (selected: WorkspaceTaskSummary | null = task, env = environmentId) => (
  <WorkspaceTaskEditor
    environmentId={env}
    task={selected}
    config={config}
    projectTitle="SynKEK"
    onClose={onClose}
    onSaved={onSaved}
  />
);
const change = (label: string, value: string) =>
  act(() =>
    renderer.root.findByProps({ "aria-label": label }).props.onChange({ target: { value } }),
  );
const submit = () => renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
const click = (label: string) =>
  renderer.root
    .findAllByType("button")
    .find((b) => b.children.join("") === label)!
    .props.onClick();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  boundary.operate = true;
  boundary.v2 = true;
  boundary.latest = null;
  boundary.patch.mockResolvedValue({
    _tag: "Failure",
    cause: Cause.fail(
      new WorkspaceToolsError({
        kind: "conflict",
        message: "This task changed on another client.",
      }),
    ),
  });
  boundary.upsert.mockResolvedValue({ _tag: "Failure", cause: Cause.fail(new Error("Offline")) });
});
afterEach(async () => {
  if (renderer) await act(() => renderer.unmount());
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("retains edits after conflict and keeps the captured environment", async () => {
  await act(() => {
    renderer = create(view());
  });
  await change("Task title", "My unsaved launch title");
  boundary.latest = { ...task, revision: 4, title: "Other client", owner: null };
  await act(submit);
  expect(boundary.patch).toHaveBeenCalledWith({
    environmentId,
    input: { id: task.id, expectedRevision: 3, title: "My unsaved launch title" },
  });
  expect(renderer.root.findByProps({ "aria-label": "Task title" }).props.value).toBe(
    "My unsaved launch title",
  );
  expect(JSON.stringify(renderer.toJSON())).toContain("changed on another client");
  expect(JSON.stringify(renderer.toJSON())).toContain("Unassigned");
  await act(() => click("Reapply my changes"));
  expect(renderer.root.findByProps({ "aria-label": "Owner" }).props.value).toBe("");
  boundary.patch.mockResolvedValue({
    _tag: "Success",
    value: { ...task, revision: 5, title: "My unsaved launch title", owner: null },
  });
  await act(submit);
  expect(boundary.patch).toHaveBeenLastCalledWith({
    environmentId,
    input: { id: task.id, expectedRevision: 4, title: "My unsaved launch title" },
  });
});
it("rebases an explicitly edited owner and requires confirmation before discarding", async () => {
  await act(() => {
    renderer = create(view({ ...task, owner: null }));
  });
  await change("Owner", "environment-owner");
  boundary.latest = { ...task, owner: null, revision: 4, title: "Latest title" };
  await act(submit);
  await act(() => click("Keep editing"));
  await act(submit);
  expect(boundary.patch.mock.calls.at(-1)?.[0].input.expectedRevision).toBe(3);
  await act(() => click("Reapply my changes"));
  expect(renderer.root.findByProps({ "aria-label": "Task title" }).props.value).toBe(
    "Latest title",
  );
  await act(submit);
  expect(boundary.patch.mock.calls.at(-1)?.[0].input).toEqual({
    id: task.id,
    expectedRevision: 4,
    owner: "environment-owner",
  });
  await act(() => click("Reload latest"));
  expect(renderer.root.findByProps({ role: "alertdialog" })).toBeDefined();
  await act(() => click("Discard changes"));
  expect(renderer.root.findByProps({ "aria-label": "Owner" }).props.value).toBe("");
});
it("creates atomically with one stable ID across failure and retry, and cancels without writing", async () => {
  await act(() => {
    renderer = create(view(null));
  });
  await act(() => click("Cancel"));
  expect(boundary.upsert).not.toHaveBeenCalled();
  await change("New task title", "  Launch  ");
  await change("New task due date", "2026-10-18");
  await change("New task area", "  Website ");
  await change("New task owner", "");
  await act(submit);
  await act(submit);
  expect(boundary.upsert.mock.calls[0]).toEqual(boundary.upsert.mock.calls[1]);
  expect(boundary.upsert.mock.calls[0]?.[0]).toEqual({
    environmentId,
    input: {
      id: expect.stringMatching(/^wskt_/),
      projectId,
      title: "Launch",
      column: "To do",
      dueOn: "2026-10-18",
      areaLabel: "Website",
      owner: null,
    },
  });
  expect(boundary.patch).not.toHaveBeenCalled();
});
it("sends explicit metadata clears in one patch and validates title and dates", async () => {
  await act(() => {
    renderer = create(view());
  });
  await change("Due date", "");
  await change("Area", "");
  await change("Owner", "");
  await act(submit);
  expect(boundary.patch).toHaveBeenCalledWith({
    environmentId,
    input: { id: task.id, expectedRevision: 3, dueOn: null, areaLabel: null, owner: null },
  });
  boundary.patch.mockClear();
  await change("Task title", "   ");
  await act(submit);
  await change("Task title", "Valid");
  await change("Due date", "2026-02-30");
  await act(submit);
  expect(boundary.patch).not.toHaveBeenCalled();
});
it("ignores an old save result after the environment changes", async () => {
  let finish!: (value: unknown) => void;
  boundary.patch.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(() => {
    renderer = create(view());
  });
  await change("Task title", "Captured");
  let saving!: Promise<void>;
  await act(() => {
    saving = submit();
  });
  await act(() => renderer.update(view(task, EnvironmentId.make("other"))));
  await act(async () => {
    finish({ _tag: "Success", value: { ...task, revision: 4, title: "Captured" } });
    await saving;
  });
  expect(onSaved).not.toHaveBeenCalled();
  expect(renderer.root.findByProps({ "aria-label": "Task title" }).props.value).toBe("Original");
  expect(boundary.patch.mock.calls[0]?.[0].environmentId).toBe("remote");
});
it("denies writes when read-only or when the live capability is lost", async () => {
  await act(() => {
    renderer = create(view());
  });
  await change("Task title", "Changed");
  boundary.operate = false;
  await act(() => renderer.update(view()));
  await act(submit);
  boundary.operate = true;
  boundary.v2 = false;
  await act(() => renderer.update(view()));
  await act(submit);
  expect(boundary.patch).not.toHaveBeenCalled();
  expect(boundary.upsert).not.toHaveBeenCalled();
});

it("retains a deleted task draft as unavailable and never retries it as creation", async () => {
  await act(() => {
    renderer = create(view());
  });
  await change("Task title", "Retained after deletion");
  boundary.patch.mockResolvedValue({
    _tag: "Failure",
    cause: Cause.fail(
      new WorkspaceToolsError({ kind: "not-found", message: "This task was deleted." }),
    ),
  });
  await act(submit);
  expect(renderer.root.findByProps({ "aria-label": "Task title" }).props.value).toBe(
    "Retained after deletion",
  );
  expect(JSON.stringify(renderer.toJSON())).toContain(
    "This task is unavailable. Its links have been kept.",
  );
  await act(submit);
  expect(boundary.patch).toHaveBeenCalledTimes(1);
  expect(boundary.upsert).not.toHaveBeenCalled();
});
