import {
  isActiveSubagentStatus,
  type RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";

import type { AgentActivityRow } from "./agentActivityFeed";

/**
 * The drill-in reads top-down as now → outcome → history. This module derives
 * the first and last of those; the outcome is the agent's own result/error.
 */

export interface AgentNowBlock {
  /** What the agent is doing this second. */
  readonly headline: string;
  /** The most recent line of evidence, when it says something the headline does not. */
  readonly detail: string | null;
  /** Where in the run this is happening — phase or workflow, plus role. */
  readonly context: string | null;
  /** True when the agent is blocked on the user rather than working. */
  readonly needsInput: boolean;
}

/** Collapsed step count. Three is enough to see the shape of the last minute. */
export const AGENT_STEP_PREVIEW_LIMIT = 3;

function latestWorkRow(rows: ReadonlyArray<AgentActivityRow>): AgentActivityRow | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]!;
    if (!row.isLifecycle) {
      return row;
    }
  }
  return null;
}

/**
 * Null for a settled agent: "NOW" claiming a finished agent is busy is the
 * lying-spinner failure, and the outcome below already says what happened.
 */
export function deriveAgentNowBlock(
  agent: RuntimeSubagent | null,
  rows: ReadonlyArray<AgentActivityRow>,
): AgentNowBlock | null {
  if (!agent || !isActiveSubagentStatus(agent.status)) {
    return null;
  }

  const needsInput = agent.status === "waiting";
  const latest = latestWorkRow(rows);
  const headline = needsInput
    ? "Waiting on you"
    : (agent.progress ?? agent.lastToolName ?? latest?.summary ?? "Working");
  const detail =
    latest === null ? null : latest.summary === headline ? latest.detail : latest.summary;
  const context =
    [agent.phaseTitle ?? agent.workflowName, agent.role].filter(Boolean).join(" · ") || null;

  return { headline, detail, context, needsInput };
}

export interface AgentStepWindow {
  /** Steps to render, oldest first. */
  readonly visible: ReadonlyArray<AgentActivityRow>;
  /** Steps behind the "+N earlier" row (0 when everything is shown). */
  readonly hiddenCount: number;
}

/**
 * History collapses to its tail by default. An agent that has run for ten
 * minutes has a transcript nobody scrolls, and the newest steps are the ones
 * that explain what NOW is talking about.
 */
export function deriveAgentStepWindow(
  rows: ReadonlyArray<AgentActivityRow>,
  expanded: boolean,
): AgentStepWindow {
  const hiddenCount = expanded ? 0 : Math.max(rows.length - AGENT_STEP_PREVIEW_LIMIT, 0);
  return {
    visible: hiddenCount === 0 ? rows : rows.slice(rows.length - AGENT_STEP_PREVIEW_LIMIT),
    hiddenCount,
  };
}
