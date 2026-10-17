import { AsyncResult } from "effect/unstable/reactivity";
import { useState } from "react";
import * as DateTime from "effect/DateTime";
import {
  WorkspaceTaskId,
  type WorkspaceTaskPage,
  type WorkspaceTaskSummary,
} from "@t3tools/contracts";
import { TasksSpaceView, type TaskFilters } from "../TasksSpaceView";
import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";
export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (session) => {
  let disposed = false;
  const pending = new Set<Promise<unknown>>();
  const tasks: WorkspaceTaskSummary[] = session.seed.tasks.map((task, index) => ({
    projectId: task.projectId,
    title: task.title,
    areaLabel: task.areaLabel,
    dueOn: task.dueOn,
    owner: task.owner,
    id: WorkspaceTaskId.make(`wskt_00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`),
    projectTitle: session.seed.projects.find((project) => project.id === task.projectId)!.title,
    column: task.completed ? "Done" : "To do",
    revision: 0,
    done: task.completed,
  }));
  const presentation = new Map(
    tasks.map((task, index) => [
      task.id,
      session.seed.people.find(
        (person) => person.id === session.seed.tasks[index]!.assigneeDisplayId,
      )!,
    ]),
  );
  const config = {
    projectId: session.resourceProjectId,
    taskColumns: ["To do", "In progress", "Done"],
    completedColumn: "Done",
    revision: 0,
    browserThreadId: null,
  };
  function Fixture() {
    const [confirmed, setConfirmed] = useState(tasks);
    const [filters, setFilters] = useState<TaskFilters>({
      text: "",
      project: session.resourceProjectId,
      owner: "all",
      dueFrom: "",
      dueTo: "",
      limit: 50,
    });
    const [layout, setLayout] = useState<"list" | "board">("list");
    const matches = confirmed.filter(
      (task) =>
        (!filters.text ||
          `${task.title} ${task.areaLabel} ${task.projectTitle}`
            .toLowerCase()
            .includes(filters.text.toLowerCase())) &&
        (!filters.project || task.projectId === filters.project) &&
        (filters.owner === "all" ||
          (filters.owner === "unassigned"
            ? task.owner === null
            : task.owner === "environment-owner")) &&
        (!filters.dueFrom || (!!task.dueOn && task.dueOn >= filters.dueFrom)) &&
        (!filters.dueTo || (!!task.dueOn && task.dueOn <= filters.dueTo)),
    );
    const page: WorkspaceTaskPage = {
      tasks: matches.slice(0, filters.limit),
      total: matches.length,
      openTotal: matches.filter((task) => !task.done).length,
      projects: [config],
      laneTotals: [],
      nextCursor: null,
    };
    return (
      <TasksSpaceView
        environmentId={session.environmentId}
        projectId={filters.project ? session.resourceProjectId : null}
        projects={session.seed.projects}
        view="all"
        taskLayout={layout}
        filters={filters}
        page={page}
        status="ready"
        error={null}
        ownerProfile={null}
        timeZone={session.timeZone}
        locale={session.locale}
        now={DateTime.makeUnsafe(session.clock.now())}
        canOperate
        workspaceTasksV2
        onOpen={(ref) => {
          void session.record("navigate", ref);
        }}
        onTransition={async (request) => {
          if (disposed) throw new Error("Fixture session is disposed.");
          const operation = (async () => {
            await session.record(
              "save",
              { type: "task", taskId: request.input.id },
              String(request.input.change.type === "completion" && request.input.change.completed),
            );
            const previous = confirmed.find((task) => task.id === request.input.id)!;
            const done =
              request.input.change.type === "completion"
                ? request.input.change.completed
                : request.input.change.column === "Done";
            const next = {
              ...previous,
              done,
              column: done ? "Done" : "To do",
              revision: previous.revision + 1,
            };
            if (!disposed)
              setConfirmed((current) => current.map((task) => (task.id === next.id ? next : task)));
            return AsyncResult.success(next);
          })();
          pending.add(operation);
          try {
            return await operation;
          } finally {
            pending.delete(operation);
          }
        }}
        onFilter={setFilters}
        onLoadMore={() => {}}
        onRetry={() => {}}
        onLayout={setLayout}
        ownerPresentation={(task) => {
          const person = presentation.get(task.id)!;
          return { displayName: person.name, initials: person.initials };
        }}
        footer={session.seed.sampleCopy.tasksFooter}
      />
    );
  }
  return {
    area: "tasks",
    readyRegions: session.id === "03" ? ["center"] : [],
    center: <Fixture />,
    settled: async () => {
      await Promise.all(pending);
      await session.settled();
    },
    dispose: () => {
      disposed = true;
      pending.clear();
    },
  };
};
