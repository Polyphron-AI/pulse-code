import { ProjectId, ScheduleId, type OrchestrationSchedule } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  describeAutoPause,
  describeScheduleRuns,
  describeScheduleTarget,
  formatRelativeFutureLabel,
  formatRelativePastLabel,
  scheduleDisplayTitle,
} from "./schedulePresentation.ts";

const projectA = ProjectId.make("project-a");
const projectB = ProjectId.make("project-b");
const projectC = ProjectId.make("project-c");

const projectTitles = new Map([
  [projectA, "Pulse Code"],
  [projectB, "Marketing"],
  [projectC, "Docs"],
]);

function makeSchedule(overrides: Partial<OrchestrationSchedule> = {}): OrchestrationSchedule {
  return {
    id: ScheduleId.make("schedule-1"),
    scope: { _tag: "project", projectId: projectA },
    hourLocal: 6,
    minuteLocal: 0,
    timezone: "Europe/Amsterdam",
    prompt: "Daily check-in",
    workflowScriptRef: null,
    modelSelection: null,
    skipIfDirty: null,
    autoPausedReason: null,
    handoffPathTemplate: "handoff/{date}.md",
    maxRunMinutes: 15,
    maxTurnMinutes: 10,
    pausedAt: null,
    projectStates: [],
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  };
}

describe("scheduleDisplayTitle", () => {
  it("leads with the first line of the prompt", () => {
    expect(scheduleDisplayTitle({ prompt: "Morning check-in\nThen open PRs" })).toBe(
      "Morning check-in",
    );
  });

  it("falls back for a blank first line", () => {
    expect(scheduleDisplayTitle({ prompt: "\n\nSomething" })).toBe("Scheduled chat");
  });

  it("truncates a very long first line", () => {
    const title = scheduleDisplayTitle({ prompt: "x".repeat(200) });
    expect(title.length).toBe(90);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("describeScheduleTarget", () => {
  it("names the project", () => {
    expect(describeScheduleTarget(makeSchedule(), projectTitles)).toBe("Pulse Code");
  });

  it("says so when the project is gone", () => {
    const schedule = makeSchedule({
      scope: { _tag: "project", projectId: ProjectId.make("project-gone") },
    });
    expect(describeScheduleTarget(schedule, projectTitles)).toBe("Project no longer here");
  });

  it("describes an every-project sweep", () => {
    const schedule = makeSchedule({ scope: { _tag: "environment", projectIds: "all" } });
    expect(describeScheduleTarget(schedule, projectTitles)).toBe("Every project");
  });

  it("names two targets and counts more", () => {
    const two = makeSchedule({
      scope: { _tag: "environment", projectIds: [projectA, projectB] },
    });
    const three = makeSchedule({
      scope: { _tag: "environment", projectIds: [projectA, projectB, projectC] },
    });
    expect(describeScheduleTarget(two, projectTitles)).toBe("Pulse Code and Marketing");
    expect(describeScheduleTarget(three, projectTitles)).toBe("Pulse Code and 2 more");
  });

  it("says so when every selected project has gone", () => {
    const schedule = makeSchedule({
      scope: { _tag: "environment", projectIds: [ProjectId.make("project-gone")] },
    });
    expect(describeScheduleTarget(schedule, projectTitles)).toBe("No projects left");
  });
});

describe("describeScheduleRuns", () => {
  const nowMs = Date.parse("2026-04-03T12:00:00.000Z");
  const baseSummary = {
    lastRunAt: null,
    running: 0,
    completed: 0,
    failed: 0,
    reported: 0,
    failureReason: null,
    consecutiveFailures: 0,
  } as const;

  it("says never run, and still names the next fire", () => {
    const label = describeScheduleRuns({
      summary: baseSummary,
      nextRunAtMs: nowMs + 3 * 3_600_000,
      nowMs,
    });
    expect(label).toBe("Never run · next in 3h");
  });

  it("names the failure that is holding the schedule back", () => {
    const label = describeScheduleRuns({
      summary: {
        ...baseSummary,
        lastRunAt: "2026-04-03T06:00:00.000Z",
        failed: 1,
        reported: 1,
        failureReason: "auth",
      },
      nextRunAtMs: null,
      nowMs,
    });
    expect(label).toBe("Last run 6h ago — Provider sign-in expired");
  });

  it("makes no next-run claim when the zone could not be read", () => {
    const label = describeScheduleRuns({
      summary: { ...baseSummary, lastRunAt: "2026-04-03T06:00:00.000Z", completed: 1, reported: 1 },
      nextRunAtMs: null,
      nowMs,
    });
    expect(label).toBe("Last run 6h ago");
  });
});

describe("describeAutoPause", () => {
  it("is silent for a running schedule", () => {
    expect(describeAutoPause(makeSchedule())).toBeNull();
  });

  it("is silent for a pause the user asked for", () => {
    expect(describeAutoPause(makeSchedule({ pausedAt: "2026-04-03T00:00:00.000Z" }))).toBeNull();
  });

  it("explains a server-side auto-pause", () => {
    const schedule = makeSchedule({
      pausedAt: "2026-04-03T00:00:00.000Z",
      autoPausedReason: "paused after 3 failures: auth",
    });
    expect(describeAutoPause(schedule)).toBe(
      "Pulse Code paused after 3 failures: auth. Resume to run it again.",
    );
  });
});

describe("relative labels", () => {
  const nowMs = Date.parse("2026-04-03T12:00:00.000Z");

  it("reads recent runs as just now", () => {
    expect(formatRelativePastLabel(nowMs - 30_000, nowMs)).toBe("just now");
    expect(formatRelativePastLabel(nowMs - 14 * 60_000, nowMs)).toBe("14m ago");
    expect(formatRelativePastLabel(nowMs - 5 * 3_600_000, nowMs)).toBe("5h ago");
    expect(formatRelativePastLabel(nowMs - 3 * 86_400_000, nowMs)).toBe("3d ago");
  });

  it("degrades rather than printing NaN for an unparseable timestamp", () => {
    expect(formatRelativePastLabel(Number.NaN, nowMs)).toBe("at an unknown time");
  });

  it("counts down to the next fire", () => {
    expect(formatRelativeFutureLabel(nowMs + 40 * 60_000, nowMs)).toBe("in 40m");
    expect(formatRelativeFutureLabel(nowMs + 14 * 3_600_000, nowMs)).toBe("in 14h");
    expect(formatRelativeFutureLabel(nowMs + 2 * 86_400_000, nowMs)).toBe("in 2d");
    expect(formatRelativeFutureLabel(nowMs - 1_000, nowMs)).toBe("any moment");
  });
});
