import * as DateTime from "effect/DateTime";
import type { WorkspaceTaskQuery, WorkspaceTaskSummary } from "@t3tools/contracts";

export function dueTaskQuery(
  startOn: string,
  endBefore: string,
): typeof WorkspaceTaskQuery.Encoded {
  const previous = DateTime.subtract(DateTime.makeUnsafe(`${endBefore}T00:00:00.000Z`), {
    days: 1,
  });
  return { state: "all", dueFrom: startOn, dueTo: DateTime.formatIsoDate(previous), limit: 100 };
}
export function hasDueOn(
  task: WorkspaceTaskSummary,
): task is WorkspaceTaskSummary & { dueOn: string } {
  return task.dueOn !== null;
}
export function dueTaskItem(
  task: Pick<WorkspaceTaskSummary, "id" | "projectId" | "title" | "done" | "revision"> & {
    dueOn: string;
  },
) {
  return {
    ref: { type: "task" as const, taskId: task.id },
    title: task.title,
    projectId: task.projectId,
    dueOn: task.dueOn,
    done: task.done,
    revision: task.revision,
  };
}
