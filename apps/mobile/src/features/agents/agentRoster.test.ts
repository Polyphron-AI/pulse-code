import { describe, expect, it } from "vite-plus/test";

import { classifyTaskAgentKind, type OrchestrationThreadActivity } from "@t3tools/contracts";
import {
  deriveAgentPanelModel,
  foldSubagentActivities,
} from "@t3tools/client-runtime/state/subagentRuntime";

import { agentRosterSummaryLabel, deriveAgentRoster } from "./agentRoster";

let sequence = 0;
/** Post-ingestion rows: ingestion stamps agentKind on every task payload. */
function activity(kind: string, payload: Record<string, unknown>): OrchestrationThreadActivity {
  sequence += 1;
  return {
    id: `activity-${sequence}`,
    tone: "info",
    kind,
    summary: kind,
    payload: {
      agentKind: classifyTaskAgentKind({
        taskType: typeof payload.taskType === "string" ? payload.taskType : undefined,
        agentId: typeof payload.agentId === "string" ? payload.agentId : undefined,
      }),
      ...payload,
    },
    turnId: null,
    createdAt: `2026-08-01T10:00:${String(sequence).padStart(2, "0")}.000Z`,
  } as unknown as OrchestrationThreadActivity;
}

function roster(
  rows: ReadonlyArray<OrchestrationThreadActivity>,
  expandedSections?: ReadonlySet<"needsInput" | "working" | "done">,
) {
  const model = deriveAgentPanelModel({ agents: foldSubagentActivities(rows) });
  return deriveAgentRoster(model, expandedSections ? { expandedSections } : undefined);
}

describe("deriveAgentRoster", () => {
  it("puts agents that need input first, then working, then completed", () => {
    const result = roster([
      activity("task.started", { taskId: "a", title: "Asks" }),
      activity("task.updated", { taskId: "a", status: "waiting" }),
      activity("task.started", { taskId: "b", title: "Works" }),
      activity("task.started", { taskId: "c", title: "Finished" }),
      activity("task.completed", { taskId: "c", status: "completed" }),
    ]);
    expect(result.sections.map((section) => section.id)).toEqual(["needsInput", "working", "done"]);
    expect(result.needsInputCount).toBe(1);
    expect(result.workingCount).toBe(1);
    expect(result.doneCount).toBe(1);
    expect(result.total).toBe(3);
  });

  it("omits sections with no agents", () => {
    const result = roster([activity("task.started", { taskId: "a", title: "Works" })]);
    expect(result.sections.map((section) => section.id)).toEqual(["working"]);
  });

  it("counts idle agents as working, not done", () => {
    // Idle is deliberate: the agent is parked mid-run, not finished.
    const result = roster([
      activity("task.started", { taskId: "a", title: "Parked" }),
      activity("task.updated", { taskId: "a", status: "idle" }),
    ]);
    expect(result.workingCount).toBe(1);
    expect(result.doneCount).toBe(0);
  });

  it("never truncates live sections, however many agents are running", () => {
    const rows = Array.from({ length: 9 }, (_, index) =>
      activity("task.started", { taskId: `live-${index}`, title: `Live ${index}` }),
    );
    const working = roster(rows).sections.find((section) => section.id === "working")!;
    expect(working.entries).toHaveLength(9);
    expect(working.hiddenCount).toBe(0);
  });

  it("previews a large settled section and reports the rest as hidden", () => {
    const rows = Array.from({ length: 7 }, (_, index) => [
      activity("task.started", { taskId: `done-${index}`, title: `Done ${index}` }),
      activity("task.completed", { taskId: `done-${index}`, status: "completed" }),
    ]).flat();
    const collapsed = roster(rows).sections.find((section) => section.id === "done")!;
    expect(collapsed.entries).toHaveLength(4);
    expect(collapsed.hiddenCount).toBe(3);
    expect(collapsed.canCollapse).toBe(false);

    const expanded = roster(rows, new Set(["done" as const])).sections.find(
      (section) => section.id === "done",
    )!;
    expect(expanded.entries).toHaveLength(7);
    expect(expanded.hiddenCount).toBe(0);
    // Expanding must leave a way back, or the section is a one-way door.
    expect(expanded.canCollapse).toBe(true);
  });

  it("labels workflow members with their phase and keeps the coordinator as a row", () => {
    const result = roster([
      activity("task.started", {
        taskId: "wf-1",
        taskType: "local_workflow",
        workflowName: "audit",
        phases: [{ index: 0, title: "Find" }],
      }),
      activity("task.progress", {
        taskId: "wf-1:wf:0",
        parentAgentId: "wf-1",
        title: "finder",
        status: "running",
        phaseIndex: 0,
      }),
    ]);
    const entries = result.sections.flatMap((section) => section.entries);
    expect(entries.map((entry) => entry.agent.id)).toEqual(["wf-1", "wf-1:wf:0"]);
    expect(entries[1]!.phaseTitle).toBe("Find");
    expect(entries[1]!.workflowName).toBe("audit");
  });
});

describe("agentRosterSummaryLabel", () => {
  it("leads with the agents that are blocked on the user", () => {
    const result = roster([
      activity("task.started", { taskId: "a", title: "Asks" }),
      activity("task.updated", { taskId: "a", status: "waiting" }),
      activity("task.started", { taskId: "b", title: "Works" }),
    ]);
    expect(agentRosterSummaryLabel(result)).toBe("1 needs input");
  });

  it("falls back to working, then to the finished total", () => {
    expect(
      agentRosterSummaryLabel(roster([activity("task.started", { taskId: "b", title: "Works" })])),
    ).toBe("1 working");
    expect(
      agentRosterSummaryLabel(
        roster([
          activity("task.started", { taskId: "c", title: "Done" }),
          activity("task.completed", { taskId: "c", status: "completed" }),
        ]),
      ),
    ).toBe("1 done");
  });

  it("says nothing when the thread has no agents", () => {
    expect(agentRosterSummaryLabel(roster([]))).toBeNull();
  });
});
