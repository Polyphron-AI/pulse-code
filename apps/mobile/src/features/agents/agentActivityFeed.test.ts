import { describe, expect, it } from "vite-plus/test";

import type { OrchestrationThreadActivity } from "@t3tools/contracts";

import { deriveAgentActivityRows } from "./agentActivityFeed";

let sequence = 0;
function activity(kind: string, payload: unknown, summary = kind): OrchestrationThreadActivity {
  sequence += 1;
  return {
    id: `activity-${sequence}`,
    tone: "info",
    kind,
    summary,
    payload,
    turnId: null,
    createdAt: `2026-08-01T10:00:${String(sequence).padStart(2, "0")}.000Z`,
  } as unknown as OrchestrationThreadActivity;
}

describe("deriveAgentActivityRows", () => {
  it("keeps the agent's lifecycle rows and the work attributed to it", () => {
    const rows = deriveAgentActivityRows(
      [
        activity("task.started", { taskId: "agent-1", title: "Audit" }),
        activity("tool.completed", { agentId: "agent-1", summary: "Read src/index.ts" }),
        activity("task.completed", { taskId: "agent-1", status: "completed" }),
      ],
      "agent-1",
    );
    expect(rows.map((row) => row.kind)).toEqual([
      "task.started",
      "tool.completed",
      "task.completed",
    ]);
    expect(rows[0]!.isLifecycle).toBe(true);
    expect(rows[1]!.isLifecycle).toBe(false);
  });

  it("excludes other agents' work and the parent's own rows", () => {
    const rows = deriveAgentActivityRows(
      [
        activity("tool.completed", { agentId: "agent-2", summary: "Not mine" }),
        activity("tool.completed", { summary: "Parent tool call" }),
        activity("task.started", { taskId: "agent-2" }),
      ],
      "agent-1",
    );
    expect(rows).toHaveLength(0);
  });

  it("drops status patches and mid-flight tool noise", () => {
    // task.updated is fold input; started/progress duplicate the completed row.
    const rows = deriveAgentActivityRows(
      [
        activity("task.updated", { taskId: "agent-1", status: "running" }),
        activity("context-window.updated", { agentId: "agent-1" }),
        activity("tool.started", { agentId: "agent-1", summary: "Read" }),
        activity("tool.progress", { agentId: "agent-1", summary: "Read" }),
        activity("tool.completed", { agentId: "agent-1", summary: "Read" }),
      ],
      "agent-1",
    );
    expect(rows.map((row) => row.kind)).toEqual(["tool.completed"]);
  });

  it("prefers the payload summary over the generic activity summary", () => {
    const rows = deriveAgentActivityRows(
      [
        activity(
          "task.completed",
          { taskId: "agent-1", summary: "Found 2 issues" },
          "Task completed",
        ),
        activity("tool.completed", { agentId: "agent-1" }, "Ran a command"),
      ],
      "agent-1",
    );
    expect(rows.map((row) => row.summary)).toEqual(["Found 2 issues", "Ran a command"]);
  });

  it("carries tool detail through for the transcript body", () => {
    const rows = deriveAgentActivityRows(
      [activity("tool.completed", { agentId: "agent-1", detail: "exit 0\nok" })],
      "agent-1",
    );
    expect(rows[0]!.detail).toBe("exit 0\nok");
  });

  it("keeps nested agent work under the parent you drilled into", () => {
    // A nested agent's own lifecycle rows carry the parent's agentId, so the
    // parent transcript shows that it spawned something.
    const rows = deriveAgentActivityRows(
      [activity("task.completed", { taskId: "nested-1", agentId: "agent-1", agentKind: "agent" })],
      "agent-1",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.isLifecycle).toBe(false);
  });

  it("ignores rows with no payload at all", () => {
    expect(deriveAgentActivityRows([activity("tool.completed", null)], "agent-1")).toHaveLength(0);
  });
});
