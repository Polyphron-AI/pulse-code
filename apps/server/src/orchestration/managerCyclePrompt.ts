/**
 * managerCyclePrompt - composes the four-part prompt a manager (Argo) reads at
 * the top of every cycle: its mission, a status table of its live children,
 * the directives a user typed into the manager thread since the last cycle,
 * and the instruction block naming the manager tools.
 *
 * Pure and deterministic: every timestamp in the output comes from an input,
 * never from a clock, so the same cycle inputs always render the same prompt.
 *
 * See docs/plans/2026-09-11-agent-roles-design.md section 3 (Cycle).
 *
 * @module managerCyclePrompt
 */

/** Cycles without a status change before a child is reported as stalled. */
export const MANAGER_STALLED_CYCLES = 3;

export interface ManagerCycleChildRow {
  readonly threadId: string;
  readonly projectTitle: string;
  /** Null for a child that never got a worktree branch. */
  readonly branch: string | null;
  readonly status: string;
  readonly lastActivityAt: string;
  readonly cyclesSinceChange: number;
  /**
   * Token spend when the read model happens to carry it. Null on every row
   * drops the column rather than printing a table of dashes.
   */
  readonly tokens: number | null;
}

export interface ManagerCyclePromptInput {
  readonly managerName: string;
  /**
   * The mission after `@` mentions are resolved. The reactor computes it with
   * `expandMissionMentions`; a mission with no mentions is its own expansion.
   */
  readonly expandedMission: string;
  readonly children: ReadonlyArray<ManagerCycleChildRow>;
  readonly directives: ReadonlyArray<string>;
  readonly maxChildren: number;
}

const cell = (value: string) => value.replaceAll("|", "\|");

function renderChildTable(input: ManagerCyclePromptInput): string {
  if (input.children.length === 0) {
    return "No live children.";
  }
  const showTokens = input.children.some((child) => child.tokens !== null);
  const headers = [
    "Thread",
    "Project",
    "Branch",
    "Status",
    "Last activity",
    "Cycles since change",
    ...(showTokens ? ["Tokens"] : []),
  ];
  const rows = input.children.map((child) => {
    const stalled = child.cyclesSinceChange >= MANAGER_STALLED_CYCLES;
    return [
      cell(child.threadId),
      cell(child.projectTitle),
      cell(child.branch ?? "-"),
      cell(stalled ? `${child.status} (stalled)` : child.status),
      cell(child.lastActivityAt),
      String(child.cyclesSinceChange),
      ...(showTokens ? [child.tokens === null ? "-" : String(child.tokens)] : []),
    ];
  });
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function renderDirectives(directives: ReadonlyArray<string>): string {
  if (directives.length === 0) {
    return "No new directives since the last cycle.";
  }
  return directives.map((directive) => `- ${directive.trim()}`).join("\n");
}

function renderInstructions(input: ManagerCyclePromptInput): string {
  const remaining = Math.max(0, input.maxChildren - input.children.length);
  return [
    `You are ${input.managerName}, an Argo manager. Decide what your children should do next, then act with the manager tools.`,
    `- \`manager_list_children\` re-reads the table above.`,
    remaining > 0
      ? `- \`manager_spawn_child\` starts new work. You may spawn ${remaining} more child${remaining === 1 ? "" : "ren"} this cycle (${input.children.length} of ${input.maxChildren} live).`
      : `- \`manager_spawn_child\` is unavailable: you are at your limit of ${input.maxChildren} live children. Stop a child first.`,
    `- \`manager_message_child\` sends a directive to one of your children.`,
    `- \`manager_stop_child\` interrupts and archives a child whose work is done or stuck.`,
    `- A child marked stalled has not changed for ${MANAGER_STALLED_CYCLES} or more cycles. Message it or stop it; do not leave it alone.`,
    `Finish by calling \`manager_log\` exactly once with a one-line summary of this cycle.`,
  ].join("\n");
}

export function composeManagerCyclePrompt(input: ManagerCyclePromptInput): string {
  return [
    "## Mission",
    input.expandedMission.trim(),
    "## Children",
    renderChildTable(input),
    "## Directives since the last cycle",
    renderDirectives(input.directives),
    "## This cycle",
    renderInstructions(input),
  ].join("\n\n");
}
