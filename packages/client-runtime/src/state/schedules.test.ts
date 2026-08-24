import { ProjectId, ScheduleId } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import type { OrchestrationSchedule } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  compareSchedulesForDisplay,
  formatScheduleLocalTime,
  nextScheduleRunAtMs,
  scheduleRowStatus,
  scheduleRunSummary,
  scheduleTargetProjectIds,
  zonedWallClockToEpochMs,
} from "./schedules.ts";

const projectA = ProjectId.make("project-a");
const projectB = ProjectId.make("project-b");

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
    handoffPathTemplate: ".t3/handoffs/{date}.md",
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

function projectState(overrides: Partial<OrchestrationSchedule["projectStates"][number]> = {}) {
  return {
    projectId: projectA,
    threadId: null,
    lastOccurrenceKey: null,
    lastOccurrenceStatus: null,
    lastOccurrenceFailureReason: null,
    lastOccurrenceAt: null,
    consecutiveFailures: 0,
    ...overrides,
  };
}

describe("zonedWallClockToEpochMs", () => {
  it("resolves a winter wall clock at the zone's standard offset", () => {
    // Amsterdam is UTC+1 in January, so 06:00 local is 05:00Z.
    const epochMs = zonedWallClockToEpochMs({
      timeZone: "Europe/Amsterdam",
      year: 2026,
      month: 1,
      day: 15,
      hour: 6,
      minute: 0,
    });
    expect(DateTime.formatIso(DateTime.makeUnsafe(epochMs ?? 0))).toBe("2026-01-15T05:00:00.000Z");
  });

  it("resolves a summer wall clock at the zone's daylight offset", () => {
    const epochMs = zonedWallClockToEpochMs({
      timeZone: "Europe/Amsterdam",
      year: 2026,
      month: 7,
      day: 15,
      hour: 6,
      minute: 0,
    });
    expect(DateTime.formatIso(DateTime.makeUnsafe(epochMs ?? 0))).toBe("2026-07-15T04:00:00.000Z");
  });

  it("lands a spring-forward gap time on the instant just after the jump", () => {
    // 2026-03-29, Amsterdam skips 02:00 -> 03:00, so 02:30 does not exist.
    const epochMs = zonedWallClockToEpochMs({
      timeZone: "Europe/Amsterdam",
      year: 2026,
      month: 3,
      day: 29,
      hour: 2,
      minute: 30,
    });
    expect(DateTime.formatIso(DateTime.makeUnsafe(epochMs ?? 0))).toBe("2026-03-29T01:30:00.000Z");
  });

  it("returns null for a zone this runtime cannot read", () => {
    expect(
      zonedWallClockToEpochMs({
        timeZone: "Mars/Olympus_Mons",
        year: 2026,
        month: 1,
        day: 1,
        hour: 6,
        minute: 0,
      }),
    ).toBeNull();
  });
});

describe("nextScheduleRunAtMs", () => {
  it("returns today's fire when it is still ahead", () => {
    const now = Date.parse("2026-01-15T03:00:00.000Z"); // 04:00 Amsterdam
    const next = nextScheduleRunAtMs(makeSchedule(), now);
    expect(DateTime.formatIso(DateTime.makeUnsafe(next ?? 0))).toBe("2026-01-15T05:00:00.000Z");
  });

  it("rolls to tomorrow once today's fire has passed", () => {
    const now = Date.parse("2026-01-15T06:00:00.000Z"); // 07:00 Amsterdam
    const next = nextScheduleRunAtMs(makeSchedule(), now);
    expect(DateTime.formatIso(DateTime.makeUnsafe(next ?? 0))).toBe("2026-01-16T05:00:00.000Z");
  });

  it("stays correct across a fall-back boundary", () => {
    // 2026-10-25 Amsterdam falls back to UTC+1, so 06:00 local becomes 05:00Z
    // where the day before it was 04:00Z.
    const now = Date.parse("2026-10-24T05:00:00.000Z");
    const next = nextScheduleRunAtMs(makeSchedule(), now);
    expect(DateTime.formatIso(DateTime.makeUnsafe(next ?? 0))).toBe("2026-10-25T05:00:00.000Z");
  });

  it("has no next run while paused", () => {
    const paused = makeSchedule({ pausedAt: "2026-01-14T00:00:00.000Z" });
    expect(nextScheduleRunAtMs(paused, Date.parse("2026-01-15T03:00:00.000Z"))).toBeNull();
  });

  it("returns null rather than guessing for an unreadable zone", () => {
    const schedule = makeSchedule({ timezone: "Mars/Olympus_Mons" });
    expect(nextScheduleRunAtMs(schedule, Date.parse("2026-01-15T03:00:00.000Z"))).toBeNull();
  });
});

describe("formatScheduleLocalTime", () => {
  it("zero-pads to the schedule's own wall clock", () => {
    expect(formatScheduleLocalTime({ hourLocal: 6, minuteLocal: 0 })).toBe("06:00");
    expect(formatScheduleLocalTime({ hourLocal: 23, minuteLocal: 5 })).toBe("23:05");
  });
});

describe("scheduleTargetProjectIds", () => {
  it("returns the single project for project scope", () => {
    expect(scheduleTargetProjectIds(makeSchedule(), [projectA, projectB])).toEqual([projectA]);
  });

  it("resolves 'all' against the environment's current projects", () => {
    const schedule = makeSchedule({ scope: { _tag: "environment", projectIds: "all" } });
    expect(scheduleTargetProjectIds(schedule, [projectA, projectB])).toEqual([projectA, projectB]);
  });

  it("drops selected projects that no longer exist", () => {
    const schedule = makeSchedule({
      scope: { _tag: "environment", projectIds: [projectA, ProjectId.make("project-gone")] },
    });
    expect(scheduleTargetProjectIds(schedule, [projectA, projectB])).toEqual([projectA]);
  });
});

describe("scheduleRunSummary", () => {
  it("reports a never-run schedule as unreported rather than complete", () => {
    const summary = scheduleRunSummary(makeSchedule({ projectStates: [projectState()] }));
    expect(summary.reported).toBe(0);
    expect(summary.lastRunAt).toBeNull();
    expect(scheduleRowStatus(makeSchedule({ projectStates: [projectState()] }), summary)).toBe(
      "never-run",
    );
  });

  it("aggregates a partially failed environment fan-out", () => {
    const schedule = makeSchedule({
      scope: { _tag: "environment", projectIds: [projectA, projectB] },
      projectStates: [
        projectState({
          lastOccurrenceStatus: "completed",
          lastOccurrenceAt: "2026-04-02T06:01:00.000Z",
        }),
        projectState({
          projectId: projectB,
          lastOccurrenceStatus: "failed",
          lastOccurrenceFailureReason: "auth",
          lastOccurrenceAt: "2026-04-02T06:04:00.000Z",
          consecutiveFailures: 2,
        }),
      ],
    });

    const summary = scheduleRunSummary(schedule);
    expect(summary).toEqual({
      lastRunAt: "2026-04-02T06:04:00.000Z",
      running: 0,
      completed: 1,
      failed: 1,
      reported: 2,
      failureReason: "auth",
      consecutiveFailures: 2,
    });
    expect(scheduleRowStatus(schedule, summary)).toBe("failed");
  });

  it("names the most recent failure when several projects failed differently", () => {
    const schedule = makeSchedule({
      projectStates: [
        projectState({
          lastOccurrenceStatus: "failed",
          lastOccurrenceFailureReason: "dirty",
          lastOccurrenceAt: "2026-04-02T06:01:00.000Z",
        }),
        projectState({
          projectId: projectB,
          lastOccurrenceStatus: "failed",
          lastOccurrenceFailureReason: "timeout:run",
          lastOccurrenceAt: "2026-04-02T06:09:00.000Z",
        }),
      ],
    });
    expect(scheduleRunSummary(schedule).failureReason).toBe("timeout:run");
  });

  it("lets a running occurrence outrank a previous failure", () => {
    const schedule = makeSchedule({
      projectStates: [
        projectState({
          lastOccurrenceStatus: "running",
          lastOccurrenceAt: "2026-04-03T06:00:00.000Z",
        }),
        projectState({
          projectId: projectB,
          lastOccurrenceStatus: "failed",
          lastOccurrenceFailureReason: "error",
          lastOccurrenceAt: "2026-04-02T06:00:00.000Z",
        }),
      ],
    });
    expect(scheduleRowStatus(schedule)).toBe("running");
  });

  it("reads a missing failure reason as the generic one", () => {
    const schedule = makeSchedule({
      projectStates: [
        projectState({
          lastOccurrenceStatus: "failed",
          lastOccurrenceAt: "2026-04-02T06:00:00.000Z",
        }),
      ],
    });
    expect(scheduleRunSummary(schedule).failureReason).toBe("error");
  });

  it("treats a paused schedule as paused whatever its last run did", () => {
    const schedule = makeSchedule({
      pausedAt: "2026-04-03T00:00:00.000Z",
      projectStates: [
        projectState({
          lastOccurrenceStatus: "failed",
          lastOccurrenceAt: "2026-04-02T06:00:00.000Z",
        }),
      ],
    });
    expect(scheduleRowStatus(schedule)).toBe("paused");
  });
});

describe("compareSchedulesForDisplay", () => {
  it("sorts failing first, then paused, then by local time", () => {
    const healthy = makeSchedule({
      id: ScheduleId.make("healthy"),
      hourLocal: 6,
      projectStates: [
        projectState({
          lastOccurrenceStatus: "completed",
          lastOccurrenceAt: "2026-04-02T06:00:00.000Z",
        }),
      ],
    });
    const earlyHealthy = makeSchedule({ id: ScheduleId.make("early"), hourLocal: 5 });
    const paused = makeSchedule({
      id: ScheduleId.make("paused"),
      pausedAt: "2026-04-01T00:00:00.000Z",
    });
    const failing = makeSchedule({
      id: ScheduleId.make("failing"),
      hourLocal: 23,
      projectStates: [
        projectState({
          lastOccurrenceStatus: "failed",
          lastOccurrenceAt: "2026-04-02T23:00:00.000Z",
        }),
      ],
    });

    const sorted = [healthy, earlyHealthy, paused, failing]
      .toSorted(compareSchedulesForDisplay)
      .map((schedule) => schedule.id);
    expect(sorted).toEqual(["failing", "paused", "early", "healthy"]);
  });
});
