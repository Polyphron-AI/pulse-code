import type {
  AgentPanelModel,
  RuntimeSubagent,
} from "@t3tools/client-runtime/state/subagentRuntime";

export type AgentRosterSectionId = "needsInput" | "working" | "done";

export interface AgentRosterEntry {
  readonly agent: RuntimeSubagent;
  /** Workflow this agent belongs to, for the row's secondary line. */
  readonly workflowName: string | null;
  readonly phaseTitle: string | null;
}

export interface AgentRosterSection {
  readonly id: AgentRosterSectionId;
  readonly title: string;
  /** Entries to render now. */
  readonly entries: ReadonlyArray<AgentRosterEntry>;
  /** Entries behind the section's "… N more" row (0 when fully shown). */
  readonly hiddenCount: number;
  /** True once the section is showing entries it could hide again. */
  readonly canCollapse: boolean;
}

export interface AgentRoster {
  readonly sections: ReadonlyArray<AgentRosterSection>;
  readonly needsInputCount: number;
  readonly workingCount: number;
  readonly doneCount: number;
  readonly total: number;
}

/**
 * Settled sections collapse by default: a finished fleet of 30 must not push
 * the one agent that needs you off the screen. Live sections are never
 * truncated — a working agent you cannot see is the bug this screen exists to
 * fix.
 */
const DONE_PREVIEW_LIMIT = 4;

function sectionFor(agent: RuntimeSubagent): AgentRosterSectionId {
  if (agent.status === "waiting") {
    return "needsInput";
  }
  if (agent.status === "pending" || agent.status === "running" || agent.status === "idle") {
    return "working";
  }
  return "done";
}

/**
 * State first, spawn order second (Claude Code's `agent view` rule): the
 * question "who needs me / who is still working" is what a phone screen is
 * for. Within a section, order is stable spawn order so rows do not shuffle
 * under your thumb as tokens tick.
 */
export function deriveAgentRoster(
  model: AgentPanelModel,
  options?: { readonly expandedSections?: ReadonlySet<AgentRosterSectionId> },
): AgentRoster {
  const expanded = options?.expandedSections ?? new Set<AgentRosterSectionId>();
  const buckets: Record<AgentRosterSectionId, AgentRosterEntry[]> = {
    needsInput: [],
    working: [],
    done: [],
  };

  const push = (agent: RuntimeSubagent, workflowName: string | null, phaseTitle: string | null) => {
    buckets[sectionFor(agent)].push({ agent, workflowName, phaseTitle });
  };

  for (const group of model.workflows) {
    const workflowName = group.workflow.workflowName ?? group.workflow.title;
    // The coordinator is a row too: it carries the run's own status, which is
    // authoritative while members are still spawning.
    push(group.workflow, workflowName, null);
    for (const phase of group.phases) {
      for (const member of phase.members) {
        push(member, workflowName, phase.title);
      }
    }
    for (const member of group.unphasedMembers) {
      push(member, workflowName, null);
    }
  }
  for (const agent of model.directAgents) {
    push(agent, null, null);
  }

  const sections: AgentRosterSection[] = [];
  const appendSection = (id: AgentRosterSectionId, title: string, truncate: boolean) => {
    const entries = buckets[id];
    if (entries.length === 0) {
      return;
    }
    const truncatable = truncate && entries.length > DONE_PREVIEW_LIMIT;
    const limited = truncatable && !expanded.has(id);
    sections.push({
      id,
      title,
      entries: limited ? entries.slice(0, DONE_PREVIEW_LIMIT) : entries,
      hiddenCount: limited ? entries.length - DONE_PREVIEW_LIMIT : 0,
      canCollapse: truncatable && !limited,
    });
  };

  appendSection("needsInput", "Needs input", false);
  appendSection("working", "Working", false);
  appendSection("done", "Completed", true);

  return {
    sections,
    needsInputCount: buckets.needsInput.length,
    workingCount: buckets.working.length,
    doneCount: buckets.done.length,
    total: buckets.needsInput.length + buckets.working.length + buckets.done.length,
  };
}

/** Header/tab label: what the user needs to know without opening anything. */
export function agentRosterSummaryLabel(roster: AgentRoster): string | null {
  if (roster.total === 0) {
    return null;
  }
  if (roster.needsInputCount > 0) {
    return `${roster.needsInputCount} needs input`;
  }
  if (roster.workingCount > 0) {
    return `${roster.workingCount} working`;
  }
  return `${roster.total} done`;
}
