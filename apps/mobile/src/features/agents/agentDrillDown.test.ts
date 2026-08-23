import { describe, expect, it } from "vite-plus/test";

import type { RuntimeSubagent } from "@t3tools/client-runtime/state/subagentRuntime";

import type { AgentActivityRow } from "./agentActivityFeed";
import {
  AGENT_STEP_PREVIEW_LIMIT,
  deriveAgentNowBlock,
  deriveAgentStepWindow,
} from "./agentDrillDown";

function agent(overrides: Partial<RuntimeSubagent>): RuntimeSubagent {
  return {
    id: "agent-1",
    kind: "subagent",
    title: "review:bugs",
    role: null,
    model: null,
    effort: null,
    status: "running",
    activationCount: 1,
    usage: null,
    progress: null,
    lastToolName: null,
    result: null,
    error: null,
    outputFile: null,
    parentAgentId: null,
    agentIndex: null,
    phaseIndex: null,
    phaseTitle: null,
    attempt: null,
    workflowName: null,
    phases: [],
    runHandles: null,
    recentActivity: [],
    firstSeenAt: "2026-08-22T10:00:00.000Z",
    startedAt: "2026-08-22T10:00:00.000Z",
    completedAt: null,
    updatedAt: "2026-08-22T10:00:05.000Z",
    ...overrides,
  };
}

function row(overrides: Partial<AgentActivityRow> & { id: string }): AgentActivityRow {
  return {
    createdAt: "2026-08-22T10:00:01.000Z",
    summary: "Read src/index.ts",
    detail: null,
    kind: "tool.completed",
    isLifecycle: false,
    ...overrides,
  };
}

describe("deriveAgentNowBlock", () => {
  it("says nothing for a settled agent", () => {
    expect(deriveAgentNowBlock(agent({ status: "completed" }), [row({ id: "a" })])).toBeNull();
    expect(deriveAgentNowBlock(agent({ status: "failed" }), [row({ id: "a" })])).toBeNull();
    expect(deriveAgentNowBlock(null, [row({ id: "a" })])).toBeNull();
  });

  it("leads with the agent's own progress line", () => {
    const now = deriveAgentNowBlock(agent({ progress: "Auditing the reactor queue" }), [
      row({ id: "a", summary: "Read src/index.ts" }),
    ]);

    expect(now?.headline).toBe("Auditing the reactor queue");
    expect(now?.detail).toBe("Read src/index.ts");
    expect(now?.needsInput).toBe(false);
  });

  it("falls back to the running tool, then to the newest step", () => {
    expect(deriveAgentNowBlock(agent({ lastToolName: "Bash" }), [])?.headline).toBe("Bash");
    expect(deriveAgentNowBlock(agent({}), [row({ id: "a", summary: "Ran tests" })])?.headline).toBe(
      "Ran tests",
    );
    expect(deriveAgentNowBlock(agent({}), [])?.headline).toBe("Working");
  });

  it("shows the step's detail when the headline already is its summary", () => {
    const now = deriveAgentNowBlock(agent({ progress: "Ran tests" }), [
      row({ id: "a", summary: "Ran tests", detail: "12 passed" }),
    ]);

    expect(now?.detail).toBe("12 passed");
  });

  it("ignores the agent's own lifecycle rows when picking evidence", () => {
    const now = deriveAgentNowBlock(agent({ progress: "Auditing" }), [
      row({ id: "work", summary: "Read src/index.ts" }),
      row({ id: "lifecycle", summary: "Agent started", isLifecycle: true }),
    ]);

    expect(now?.detail).toBe("Read src/index.ts");
  });

  it("calls out a blocked agent instead of pretending it is working", () => {
    const now = deriveAgentNowBlock(
      agent({ status: "waiting", progress: "Installing dependencies" }),
      [row({ id: "a", summary: "Run npm i limiter?" })],
    );

    expect(now?.headline).toBe("Waiting on you");
    expect(now?.needsInput).toBe(true);
    expect(now?.detail).toBe("Run npm i limiter?");
  });

  it("names the phase and role it is running under", () => {
    const now = deriveAgentNowBlock(
      agent({ phaseTitle: "Review", role: "bugs", workflowName: "review-changes" }),
      [],
    );

    expect(now?.context).toBe("Review · bugs");
  });
});

describe("deriveAgentStepWindow", () => {
  const rows = Array.from({ length: 7 }, (_, index) => row({ id: `row-${index}` }));

  it("keeps the newest steps when collapsed", () => {
    const window = deriveAgentStepWindow(rows, false);

    expect(window.visible.map((entry) => entry.id)).toEqual(["row-4", "row-5", "row-6"]);
    expect(window.hiddenCount).toBe(7 - AGENT_STEP_PREVIEW_LIMIT);
  });

  it("shows everything when expanded", () => {
    const window = deriveAgentStepWindow(rows, true);

    expect(window.visible).toHaveLength(7);
    expect(window.hiddenCount).toBe(0);
  });

  it("offers no toggle for a short transcript", () => {
    const window = deriveAgentStepWindow(rows.slice(0, 3), false);

    expect(window.visible).toHaveLength(3);
    expect(window.hiddenCount).toBe(0);
  });
});
