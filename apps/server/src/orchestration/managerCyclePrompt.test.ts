import { describe, expect, it } from "vite-plus/test";

import {
  composeManagerCyclePrompt,
  MANAGER_STALLED_CYCLES,
  type ManagerCycleChildRow,
} from "./managerCyclePrompt.ts";

const child = (overrides: Partial<ManagerCycleChildRow> = {}): ManagerCycleChildRow => ({
  threadId: "thread-1",
  projectTitle: "Pulse Code",
  branch: "argo/one",
  status: "running",
  lastActivityAt: "2026-01-01T00:00:00.000Z",
  cyclesSinceChange: 0,
  tokens: null,
  ...overrides,
});

describe("composeManagerCyclePrompt", () => {
  it("renders the expanded mission and reports an empty roster", () => {
    const prompt = composeManagerCyclePrompt({
      managerName: "Release Argo",
      expandedMission: 'Keep Project "Pulse Code" (project prj_a) green.',
      children: [],
      directives: [],
      maxChildren: 8,
    });

    expect(prompt).toContain('## Mission\n\nKeep Project "Pulse Code" (project prj_a) green.');
    expect(prompt).toContain("No live children.");
    expect(prompt).toContain("No new directives since the last cycle.");
    expect(prompt).toContain("You may spawn 8 more children this cycle (0 of 8 live).");
    expect(prompt).toContain("Finish by calling `manager_log` exactly once");
  });

  it("omits the tokens column when no child reports tokens", () => {
    const prompt = composeManagerCyclePrompt({
      managerName: "Argo",
      expandedMission: "Ship it.",
      children: [child()],
      directives: [],
      maxChildren: 4,
    });

    expect(prompt).toContain(
      "| Thread | Project | Branch | Status | Last activity | Cycles since change |",
    );
    expect(prompt).not.toContain("Tokens");
  });

  it("adds the tokens column as soon as one child reports tokens", () => {
    const prompt = composeManagerCyclePrompt({
      managerName: "Argo",
      expandedMission: "Ship it.",
      children: [child({ tokens: 1200 }), child({ threadId: "thread-2" })],
      directives: [],
      maxChildren: 4,
    });

    expect(prompt).toContain("Cycles since change | Tokens |");
    expect(prompt).toContain("| 0 | 1200 |");
    expect(prompt).toContain("| 0 | - |");
  });

  it("marks a child stalled once it has not changed for the stall threshold", () => {
    const prompt = composeManagerCyclePrompt({
      managerName: "Argo",
      expandedMission: "Ship it.",
      children: [
        child({ cyclesSinceChange: MANAGER_STALLED_CYCLES - 1 }),
        child({ threadId: "thread-2", cyclesSinceChange: MANAGER_STALLED_CYCLES }),
      ],
      directives: [],
      maxChildren: 4,
    });

    expect(prompt).toContain("| thread-1 | Pulse Code | argo/one | running |");
    expect(prompt).toContain("| thread-2 | Pulse Code | argo/one | running (stalled) |");
  });

  it("lists user directives and refuses spawning at the child limit", () => {
    const prompt = composeManagerCyclePrompt({
      managerName: "Argo",
      expandedMission: "Ship it.",
      children: [child(), child({ threadId: "thread-2" })],
      directives: ["  Focus on the release blocker.  ", "Ignore the docs backlog."],
      maxChildren: 2,
    });

    expect(prompt).toContain("- Focus on the release blocker.\n- Ignore the docs backlog.");
    expect(prompt).toContain("`manager_spawn_child` is unavailable");
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      managerName: "Argo",
      expandedMission: "Ship it.",
      children: [child({ tokens: 10 })],
      directives: ["Go"],
      maxChildren: 8,
    };
    expect(composeManagerCyclePrompt(input)).toBe(composeManagerCyclePrompt(input));
  });
});
