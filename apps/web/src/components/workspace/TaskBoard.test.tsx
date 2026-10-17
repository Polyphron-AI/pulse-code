// @vitest-environment happy-dom
import { act, useEffect, useState } from "react";
import { it as effectIt } from "@effect/vitest";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import { AsyncResult } from "effect/unstable/reactivity";
import {
  EnvironmentId,
  ProjectId,
  WorkspaceToolsError,
  type WorkspaceTaskPage,
  type WorkspaceTaskSummary,
} from "@t3tools/contracts";
import { TaskBoard, type TaskBoardProps } from "./TaskBoard";
import type { TaskTransitionHandler } from "./WorkspaceTaskRow";
const environmentId = EnvironmentId.make("remote");
const configs = [
  {
    projectId: ProjectId.make("p"),
    taskColumns: ["Backlog", "Review", "Released"],
    completedColumn: "Released",
    revision: 0,
    browserThreadId: null,
  },
  {
    projectId: ProjectId.make("q"),
    taskColumns: ["Queued", "Doing", "Done"],
    completedColumn: "Done",
    revision: 0,
    browserThreadId: null,
  },
];
const task: WorkspaceTaskSummary = {
  id: "wskt_00000000-0000-4000-8000-000000000001",
  projectId: configs[0]!.projectId,
  projectTitle: "Launch",
  title: "Review launch",
  column: "Backlog",
  revision: 3,
  done: false,
  dueOn: "2026-10-16",
  areaLabel: "Marketing",
  owner: "environment-owner",
};
const other: WorkspaceTaskSummary = {
  ...task,
  id: "wskt_00000000-0000-4000-8000-000000000002",
  projectId: configs[1]!.projectId,
  projectTitle: "Website",
  title: "Ship site",
  column: "Doing",
};
const page: WorkspaceTaskPage = {
  tasks: [task, other],
  projects: configs,
  total: 9,
  openTotal: 9,
  laneTotals: [
    { projectId: task.projectId, column: "Backlog", total: 8 },
    { projectId: other.projectId, column: "Doing", total: 1 },
  ],
  nextCursor: "next",
};
const defaults: TaskBoardProps = {
  environmentId,
  page,
  projects: [],
  ownerProfile: null,
  now: DateTime.makeUnsafe("2026-10-13T08:30:00Z"),
  timeZone: "UTC",
  canOperate: true,
  workspaceTasksV2: true,
  onOpen: vi.fn(),
  onTransition: vi.fn(),
};
let renderer: ReactTestRenderer;
afterEach(async () => {
  if (renderer) await act(() => renderer.unmount());
  vi.unstubAllGlobals();
});
const lane = (title: string) => renderer.root.findByProps({ "aria-label": title });
const move = (title: string) =>
  renderer.root.findByProps({ "aria-label": `Move ${title} to column` });

effectIt.effect("moves by keyboard through configured lanes and preserves filters", () =>
  Effect.gen(function* () {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const durable = {
      tasks: [
        task,
        other,
        ...Array.from({ length: 7 }, (_, index) => ({
          ...task,
          id: `wskt_00000000-0000-4000-8000-${String(index + 3).padStart(12, "0")}`,
          title: `Unloaded ${index}`,
        })),
      ],
    };
    const subscribers = new Set<(page: WorkspaceTaskPage) => void>();
    const acknowledged = Deferred.makeUnsafe<void>();
    const transition = vi.fn<TaskTransitionHandler>();
    transition.mockImplementation(async ({ environmentId: captured, input }) => {
      expect(captured).toBe(environmentId);
      const current = durable.tasks.find((candidate) => candidate.id === input.id)!;
      const config = configs.find((candidate) => candidate.projectId === current.projectId)!;
      if (current.revision !== input.expectedRevision)
        return AsyncResult.fail(
          new WorkspaceToolsError({ kind: "conflict", message: "Changed elsewhere" }),
        );
      const column =
        input.change.type === "column"
          ? input.change.column
          : input.change.completed
            ? config.completedColumn
            : config.taskColumns.find((column) => column !== config.completedColumn)!;
      const updated = {
        ...current,
        column,
        done: column === config.completedColumn,
        revision: current.revision + 1,
      };
      durable.tasks = durable.tasks.map((candidate) =>
        candidate.id === updated.id ? updated : candidate,
      );
      const confirmed: WorkspaceTaskPage = {
        ...page,
        tasks: durable.tasks.slice(0, 2),
        openTotal: durable.tasks.filter((candidate) => !candidate.done).length,
        laneTotals: configs.flatMap((config) =>
          config.taskColumns.map((column) => ({
            projectId: config.projectId,
            column,
            total: durable.tasks.filter(
              (candidate) =>
                candidate.projectId === config.projectId && candidate.column === column,
            ).length,
          })),
        ),
      };
      for (const subscriber of subscribers) subscriber(confirmed);
      Deferred.doneUnsafe(acknowledged, Effect.void);
      return AsyncResult.success(updated);
    });
    function Harness() {
      const [confirmed, setConfirmed] = useState(page);
      useEffect(() => {
        subscribers.add(setConfirmed);
        return () => {
          subscribers.delete(setConfirmed);
        };
      }, []);
      return <TaskBoard {...defaults} page={confirmed} onTransition={transition} />;
    }
    yield* Effect.promise(async () =>
      act(() => {
        renderer = create(<Harness />);
      }),
    );
    expect(
      lane("Launch board")
        .findAllByType("h3")
        .map((heading) => heading.children.join("")),
    ).toEqual(["Backlog", "Review", "Released"]);
    expect(
      lane("Launch: Backlog")
        .findAllByType("p")
        .map((p) => p.children.join(""))
        .join(" "),
    ).toContain("1 loaded of 8");
    expect(
      lane("Launch: Review").findAllByProps({ "data-workspace-task-id": task.id }),
    ).toHaveLength(0);
    yield* Effect.promise(() =>
      act(() => move(task.title).props.onChange({ target: { value: "Released" } })),
    );
    yield* Deferred.await(acknowledged);
    expect(transition).toHaveBeenCalledWith({
      environmentId,
      input: { id: task.id, expectedRevision: 3, change: { type: "column", column: "Released" } },
    });
    expect(durable.tasks[0]).toMatchObject({
      projectId: task.projectId,
      column: "Released",
      done: true,
      owner: "environment-owner",
    });
    expect(
      lane("Launch: Released").findByProps({ "data-workspace-task-id": task.id }),
    ).toBeDefined();
    expect(
      lane("Website: Doing").findByProps({ "data-workspace-task-id": other.id }),
    ).toBeDefined();
    expect(
      lane("Launch: Released")
        .findAllByType("p")
        .map((p) => p.children.join(""))
        .join(" "),
    ).toContain("1 loaded of 1");
    yield* Effect.promise(() =>
      act(() =>
        renderer.root
          .findByProps({ "aria-label": `Reopen ${task.title}` })
          .props.onChange({ target: { checked: false } }),
      ),
    );
    expect(durable.tasks[0]).toMatchObject({ column: "Backlog", done: false });
    expect(
      lane("Launch: Backlog")
        .findAllByType("p")
        .map((p) => p.children.join(""))
        .join(" "),
    ).toContain("1 loaded of 8");
    expect(
      lane("Launch: Backlog").findByProps({ "data-workspace-task-id": task.id }),
    ).toBeDefined();
  }),
);

it.each(["conflict", "unavailable"] as const)(
  "keeps the confirmed lane after a %s failure and opens the shared detail for recovery",
  async (kind) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const open = vi.fn();
    const transition = vi.fn<TaskTransitionHandler>(async () =>
      AsyncResult.fail(new WorkspaceToolsError({ kind, message: "Move rejected" })),
    );
    await act(() => {
      renderer = create(<TaskBoard {...defaults} onTransition={transition} onOpen={open} />);
    });
    await act(() => move(task.title).props.onChange({ target: { value: "Released" } }));
    expect(
      lane("Launch: Backlog").findByProps({ "data-workspace-task-id": task.id }),
    ).toBeDefined();
    expect(move(task.title).props.value).toBe("Backlog");
    expect(renderer.root.findByProps({ role: "alert" }).children.join("")).toBe("Move rejected");
    if (kind === "conflict") {
      await act(() =>
        renderer.root
          .findByProps({ "aria-label": `Review changes to ${task.title}` })
          .props.onClick(),
      );
      expect(open).toHaveBeenCalledWith({ type: "task", taskId: task.id });
    }
  },
);

it("keeps same-named lanes in their owning project and permits moves without a completion designation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const transition = vi.fn<TaskTransitionHandler>(async () =>
    AsyncResult.success({ ...other, column: "Review", revision: 4, done: false }),
  );
  const shared = {
    ...page,
    projects: [
      configs[0]!,
      { ...configs[1]!, taskColumns: ["Doing", "Review"], completedColumn: null },
    ],
  };
  await act(() => {
    renderer = create(<TaskBoard {...defaults} page={shared} onTransition={transition} />);
  });
  expect(lane("Launch: Review")).toBeDefined();
  expect(lane("Website: Review")).toBeDefined();
  expect(
    renderer.root.findByProps({ "aria-label": `Complete ${other.title}` }).props.disabled,
  ).toBe(true);
  await act(() => move(other.title).props.onChange({ target: { value: "Released" } }));
  expect(transition).not.toHaveBeenCalled();
  await act(() => move(other.title).props.onChange({ target: { value: "Review" } }));
  expect(transition).toHaveBeenCalledWith({
    environmentId,
    input: { id: other.id, expectedRevision: 3, change: { type: "column", column: "Review" } },
  });
  expect(move(other.title).props.disabled).toBe(true);
});

it.each(["read-only", "disconnected", "hidden", "pending", "old-server"])(
  "blocks movement when %s",
  async (state) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const transition = vi.fn();
    await act(() => {
      renderer = create(
        <TaskBoard
          {...defaults}
          canOperate={state !== "read-only" && state !== "disconnected"}
          disconnected={state === "disconnected"}
          hidden={state === "hidden"}
          pendingTaskIds={new Set(state === "pending" ? [task.id] : [])}
          workspaceTasksV2={state !== "old-server"}
          onTransition={transition}
        />,
      );
    });
    expect(move(task.title).props.disabled).toBe(true);
    await act(() => move(task.title).props.onChange({ target: { value: "Released" } }));
    expect(transition).not.toHaveBeenCalled();
    if (state === "read-only")
      expect(JSON.stringify(renderer.toJSON())).toContain(
        "Read-only session. You can browse tasks but cannot move cards.",
      );
    if (state === "disconnected")
      expect(JSON.stringify(renderer.toJSON())).toContain("Reconnect to move cards.");
  },
);

it("shows missing and capped totals without presenting unknown counts as zero, and keeps unconfigured lanes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const capped = {
    ...page,
    tasks: [{ ...task, column: "Legacy" }],
    laneTotals: Array.from({ length: 1200 }, (_, i) => ({
      projectId: ProjectId.make(`other-${i}`),
      column: "Existing",
      total: 1,
    })),
  };
  await act(() => {
    renderer = create(<TaskBoard {...defaults} page={capped} />);
  });
  expect(JSON.stringify(renderer.toJSON())).toContain("Some lane totals are unavailable");
  expect(
    lane("Launch: Review")
      .findAllByType("p")
      .map((p) => p.children.join(""))
      .join(" "),
  ).toContain("0 loaded; total unavailable");
  expect(lane("Launch: Legacy").findByProps({ "data-workspace-task-id": task.id })).toBeDefined();
  expect(move(task.title).props.value).toBe("Legacy");
});

it("blocks duplicate moves until the acknowledged revision is displayed", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const transition = vi.fn<TaskTransitionHandler>(async () => {
    await gate;
    return AsyncResult.success({ ...task, column: "Released", revision: 4, done: true });
  });
  await act(() => {
    renderer = create(<TaskBoard {...defaults} onTransition={transition} />);
  });
  let saving!: Promise<void>;
  await act(() => {
    saving = move(task.title).props.onChange({ target: { value: "Released" } });
  });
  expect(move(task.title).props.disabled).toBe(true);
  await act(() => move(task.title).props.onChange({ target: { value: "Review" } }));
  expect(transition).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish();
    await saving;
  });
  expect(move(task.title).props.disabled).toBe(true);
  await act(() =>
    renderer.update(
      <TaskBoard
        {...defaults}
        page={{ ...page, tasks: [{ ...task, column: "Released", revision: 4, done: true }, other] }}
        onTransition={transition}
      />,
    ),
  );
  expect(move(task.title).props.disabled).toBe(false);
});
it("keeps keyboard focus on a card after its confirmed move reparents it into another lane", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const node = document.createElement("div");
  document.body.append(node);
  const { createRoot } = await import("react-dom/client");
  const { getByRole } = await import("@testing-library/dom");
  const root = createRoot(node);
  function Harness() {
    const [confirmed, setConfirmed] = useState(page);
    return (
      <TaskBoard
        {...defaults}
        page={confirmed}
        onTransition={async () => {
          const updated = { ...task, column: "Released", revision: 4, done: true };
          setConfirmed({ ...page, tasks: [updated, other] });
          return AsyncResult.success(updated);
        }}
      />
    );
  }
  try {
    await act(() => root.render(<Harness />));
    const select = getByRole(node, "combobox", {
      name: `Move ${task.title} to column`,
    }) as HTMLSelectElement;
    select.focus();
    await act(() => {
      select.value = "Released";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const moved = getByRole(node, "combobox", { name: `Move ${task.title} to column` });
    expect(moved).not.toBe(select);
    expect(document.activeElement).toBe(moved);
    expect(getByRole(node, "region", { name: "Launch: Released" }).contains(moved)).toBe(true);
  } finally {
    await act(() => root.unmount());
    node.remove();
  }
});
it("serializes checkbox completion and column moves for the same card", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const transition = vi.fn<TaskTransitionHandler>(async () => {
    await gate;
    return AsyncResult.success({ ...task, done: true, revision: 4, column: "Released" });
  });
  await act(() => {
    renderer = create(<TaskBoard {...defaults} onTransition={transition} />);
  });
  let completing!: Promise<void>;
  await act(() => {
    completing = renderer.root
      .findByProps({ "aria-label": `Complete ${task.title}` })
      .props.onChange({ target: { checked: true } });
  });
  expect(move(task.title).props.disabled).toBe(true);
  await act(() => move(task.title).props.onChange({ target: { value: "Review" } }));
  expect(transition).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish();
    await completing;
  });
  expect(move(task.title).props.disabled).toBe(true);
});
