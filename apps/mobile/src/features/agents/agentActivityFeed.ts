import type { OrchestrationThreadActivity } from "@t3tools/contracts";

export interface AgentActivityRow {
  readonly id: string;
  readonly createdAt: string;
  readonly summary: string;
  readonly detail: string | null;
  readonly kind: OrchestrationThreadActivity["kind"];
  /** Lifecycle rows are the agent's own task.*; the rest is work it did. */
  readonly isLifecycle: boolean;
}

function payloadOf(activity: OrchestrationThreadActivity): Record<string, unknown> | null {
  return typeof activity.payload === "object" && activity.payload !== null
    ? (activity.payload as Record<string, unknown>)
    : null;
}

function stringField(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/**
 * One agent's transcript, recovered from the rows the thread feed hides.
 *
 * The server stamps every activity an agent produces with `agentId`, and the
 * agent's own lifecycle rows carry `taskId` — so a per-agent view needs no new
 * wire traffic, just the two stamps. Nested agents are included: a fleet's
 * child work belongs under the parent you drilled into.
 */
export function deriveAgentActivityRows(
  activities: ReadonlyArray<OrchestrationThreadActivity>,
  agentId: string,
): ReadonlyArray<AgentActivityRow> {
  const rows: AgentActivityRow[] = [];
  for (const activity of activities) {
    const payload = payloadOf(activity);
    if (!payload) {
      continue;
    }
    const isLifecycle = stringField(payload, "taskId") === agentId;
    if (!isLifecycle && stringField(payload, "agentId") !== agentId) {
      continue;
    }
    // task.updated rows are status patches, not narrative: the fold already
    // turned them into the agent's status chip.
    if (activity.kind === "task.updated" || activity.kind === "context-window.updated") {
      continue;
    }
    // Provider tool lifecycles emit started → updated → completed for the
    // same call; the started row carries no result worth a line.
    if (activity.kind === "tool.started" || activity.kind === "tool.progress") {
      continue;
    }
    const summary = stringField(payload, "summary") ?? activity.summary;
    rows.push({
      id: activity.id,
      createdAt: activity.createdAt,
      summary,
      detail: stringField(payload, "detail"),
      kind: activity.kind,
      isLifecycle,
    });
  }
  return rows;
}
