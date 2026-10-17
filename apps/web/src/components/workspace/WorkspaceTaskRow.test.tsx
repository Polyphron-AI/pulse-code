// @vitest-environment happy-dom
import { act, useState } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { AsyncResult } from "effect/unstable/reactivity";
import * as DateTime from "effect/DateTime";
import {
  EnvironmentId,
  ProjectId,
  WorkspaceTaskId,
  type WorkspaceTaskSummary,
} from "@t3tools/contracts";
import { WorkspaceTaskRow, type TaskTransitionHandler } from "./WorkspaceTaskRow";
const task: WorkspaceTaskSummary = {
  id: WorkspaceTaskId.make("wskt_00000000-0000-0000-0000-000000000001"),
  projectId: ProjectId.make("p"),
  projectTitle: "SynKEK",
  title: "Approve homepage copy",
  column: "To do",
  revision: 3,
  done: false,
  dueOn: "2026-10-13",
  areaLabel: "Marketing",
  owner: "environment-owner",
};
const now = DateTime.makeUnsafe("2026-10-14T08:30:00Z");
let renderer: ReactTestRenderer;
afterEach(async () => {
  if (renderer) await act(() => renderer.unmount());
  vi.unstubAllGlobals();
});
it("blocks another transition until the acknowledged revision reaches the row", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const command = vi.fn<TaskTransitionHandler>(async () =>
    AsyncResult.success({ ...task, done: true, revision: 4, column: "Done" }),
  );
  const view = (current = task) => (
    <WorkspaceTaskRow
      environmentId={EnvironmentId.make("remote")}
      task={current}
      density="list"
      onOpen={() => {}}
      ownerProfile={null}
      timeZone="UTC"
      now={now}
      canOperate
      completedColumn="Done"
      workspaceTasksV2
      pending={false}
      onTransition={command}
    />
  );
  await act(() => {
    renderer = create(view());
  });
  await act(async () =>
    renderer.root.findByType("input").props.onChange({ target: { checked: true } }),
  );
  expect(renderer.root.findByType("input").props.disabled).toBe(true);
  await act(async () =>
    renderer.root.findByType("input").props.onChange({ target: { checked: true } }),
  );
  expect(command).toHaveBeenCalledTimes(1);
  await act(() => renderer.update(view({ ...task, done: true, revision: 4, column: "Done" })));
  expect(renderer.root.findByType("input").props.disabled).toBe(false);
});
it("completes the captured row without opening it", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const open = vi.fn();
  const command = vi.fn<TaskTransitionHandler>(async () =>
    AsyncResult.success({ ...task, done: true, revision: 4, column: "Done" }),
  );
  function Harness() {
    const [confirmed, setConfirmed] = useState(task);
    return (
      <WorkspaceTaskRow
        environmentId={EnvironmentId.make("remote")}
        task={confirmed}
        density="list"
        onOpen={open}
        ownerProfile={null}
        timeZone="UTC"
        now={now}
        canOperate
        completedColumn="Done"
        workspaceTasksV2
        pending={false}
        onTransition={async (input) => {
          const result = await command(input);
          if (result._tag === "Success") setConfirmed({ ...confirmed, ...result.value });
          return result;
        }}
      />
    );
  }
  await act(() => {
    renderer = create(<Harness />);
  });
  expect(renderer.root.findByType("time").props["aria-label"]).toContain("overdue");
  await act(async () =>
    renderer.root
      .findByProps({ "aria-label": "Complete Approve homepage copy" })
      .props.onChange({ target: { checked: true } }),
  );
  expect(command).toHaveBeenCalledWith({
    environmentId: "remote",
    input: { id: task.id, expectedRevision: 3, change: { type: "completion", completed: true } },
  });
  expect(open).not.toHaveBeenCalled();
  expect(
    renderer.root.findByProps({ "aria-label": "Reopen Approve homepage copy" }).props.checked,
  ).toBe(true);
  expect(renderer.root.findByType("time").props["aria-label"]).not.toContain("overdue");
  await act(() =>
    renderer.root.findByProps({ "aria-label": "Open Approve homepage copy" }).props.onClick(),
  );
  expect(open).toHaveBeenCalledWith({ type: "task", taskId: task.id });
});
it("keeps confirmed state on failure and explains unavailable completion", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const command = vi.fn<TaskTransitionHandler>(async () => AsyncResult.fail(new Error("Offline")));
  const view = (canOperate = true, completedColumn: string | null = "Done") => (
    <WorkspaceTaskRow
      environmentId={EnvironmentId.make("remote")}
      task={{ ...task, owner: null }}
      density="resource"
      onOpen={() => {}}
      ownerProfile={null}
      timeZone="No/Such_Zone"
      now={now}
      canOperate={canOperate}
      completedColumn={completedColumn}
      workspaceTasksV2
      pending={false}
      onTransition={command}
    />
  );
  await act(() => {
    renderer = create(view());
  });
  await act(async () =>
    renderer.root.findByType("input").props.onChange({ target: { checked: true } }),
  );
  expect(renderer.root.findByType("input").props.checked).toBe(false);
  expect(renderer.root.findByProps({ role: "alert" }).children.join("")).toBe("Offline");
  expect(renderer.root.findByProps({ "aria-label": "Unassigned" })).toBeDefined();
  await act(() => renderer.update(view(false)));
  expect(renderer.root.findByType("input").props.disabled).toBe(true);
  await act(() => renderer.root.findByType("input").props.onChange({ target: { checked: true } }));
  expect(command).toHaveBeenCalledTimes(1);
  await act(() => renderer.update(view(true, null)));
  expect(renderer.root.findByType("input").props.disabled).toBe(true);
  const explanation = renderer.root.findByProps({
    id: renderer.root.findByType("input").props["aria-describedby"],
  });
  expect(explanation.children.join("")).toContain("Choose a completed column");
  expect(explanation.findAllByType("a")).toHaveLength(0);
  expect(explanation.findAllByType("button")).toHaveLength(0);
});

it("keeps the checkbox confirmed and blocks duplicate writes while the captured request waits", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let finish!: (result: Awaited<ReturnType<TaskTransitionHandler>>) => void;
  const command = vi.fn<TaskTransitionHandler>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await act(() => {
    renderer = create(
      <WorkspaceTaskRow
        environmentId={EnvironmentId.make("remote")}
        task={task}
        density="list"
        onOpen={() => {}}
        ownerProfile={null}
        timeZone="UTC"
        now={now}
        canOperate
        completedColumn="Done"
        workspaceTasksV2
        pending={false}
        onTransition={command}
      />,
    );
  });
  const checkbox = () => renderer.root.findByType("input");
  let operation: Promise<void>;
  await act(() => {
    operation = checkbox().props.onChange({ target: { checked: true } });
  });
  expect(checkbox().props.disabled).toBe(true);
  expect(checkbox().props.checked).toBe(false);
  await act(async () => checkbox().props.onChange({ target: { checked: true } }));
  expect(command).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish(AsyncResult.success({ ...task, done: true, revision: 4 }));
    await operation;
  });
  expect(command.mock.calls[0]?.[0].environmentId).toBe("remote");
  expect(checkbox().props.disabled).toBe(true);
});
