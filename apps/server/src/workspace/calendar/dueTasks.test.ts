import { expect, it } from "vite-plus/test";
import { ProjectId } from "@t3tools/contracts";
import { dueTaskItem, dueTaskQuery, hasDueOn } from "./dueTasks.ts";

it("keeps a task due date untimed and preserves its task identity", () => {
  expect(
    dueTaskItem({
      id: "wskt_00000000-0000-0000-0000-000000000001",
      projectId: ProjectId.make("project-one"),
      title: "Review",
      dueOn: "2026-10-13",
      done: false,
      revision: 2,
    }),
  ).toEqual({
    ref: { type: "task", taskId: "wskt_00000000-0000-0000-0000-000000000001" },
    projectId: "project-one",
    title: "Review",
    dueOn: "2026-10-13",
    done: false,
    revision: 2,
  });
});
it.each([
  ["2026-10-13", "2026-10-14", "2026-10-13"],
  ["2026-10-31", "2026-11-01", "2026-10-31"],
  ["2026-12-31", "2027-01-01", "2026-12-31"],
  ["2028-02-29", "2028-03-01", "2028-02-29"],
])("translates exclusive %s..%s to inclusive task bounds", (startOn, endBefore, dueTo) => {
  expect(dueTaskQuery(startOn, endBefore)).toEqual({
    state: "all",
    dueFrom: startOn,
    dueTo,
    limit: 100,
  });
});
it("filters null due dates before projecting summaries", () => {
  expect(hasDueOn({ dueOn: null } as Parameters<typeof hasDueOn>[0])).toBe(false);
  expect(hasDueOn({ dueOn: "2026-10-13" } as Parameters<typeof hasDueOn>[0])).toBe(true);
});
