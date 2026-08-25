import {
  ProjectId,
  ScheduleId,
  type OrchestrationSchedule,
  type ScheduleProjectState,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  latestScheduleOccurrence,
  mobileOccurrenceSummary,
  mobileScheduleCanEdit,
  mobileScheduleHeadline,
  mobileScheduleScopeLabel,
  mobileScheduleStatus,
} from "./SettingsScheduledChatsRouteScreen.logic";

const PROJECT_ID = ProjectId.make("project-1");
const PROJECT_STATE: ScheduleProjectState = {
  projectId: PROJECT_ID,
  threadId: null,
  lastOccurrenceKey: null,
  lastOccurrenceStatus: null,
  lastOccurrenceAt: null,
  consecutiveFailures: 0,
  skippedRunCount: 0,
};
const SCHEDULE: OrchestrationSchedule = {
  id: ScheduleId.make("schedule-1"),
  scope: { _tag: "project", projectId: PROJECT_ID },
  hourLocal: 9,
  minuteLocal: 0,
  timezone: "Africa/Johannesburg",
  prompt: "Review the repository and leave a concise handoff.",
  handoffPathTemplate: "handoff/{date}.md",
  maxRunMinutes: 15,
  maxTurnMinutes: 10,
  pausedAt: null,
  projectStates: [PROJECT_STATE],
  createdAt: "2026-08-24T06:00:00.000Z",
  updatedAt: "2026-08-24T06:00:00.000Z",
  deletedAt: null,
};

describe("mobile scheduled chat presentation", () => {
  it("prioritizes paused, running, failed, and active states", () => {
    expect(mobileScheduleStatus(SCHEDULE)).toEqual({ kind: "active", label: "Active" });
    expect(
      mobileScheduleStatus({
        ...SCHEDULE,
        projectStates: [{ ...PROJECT_STATE, lastOccurrenceStatus: "running" }],
      }),
    ).toEqual({ kind: "running", label: "Running" });
    expect(
      mobileScheduleStatus({
        ...SCHEDULE,
        projectStates: [{ ...PROJECT_STATE, lastOccurrenceStatus: "failed" }],
      }),
    ).toEqual({ kind: "failed", label: "Needs attention" });
    expect(mobileScheduleStatus({ ...SCHEDULE, pausedAt: "2026-08-24T07:00:00.000Z" })).toEqual({
      kind: "paused",
      label: "Paused",
    });
    expect(
      mobileScheduleStatus({
        ...SCHEDULE,
        pausedAt: "2026-08-24T07:00:00.000Z",
        autoPausedReason: "paused after 3 failures: auth",
      }),
    ).toEqual({ kind: "auto-paused", label: "Auto-paused" });
  });

  it("projects scope and prompt into compact card copy", () => {
    expect(mobileScheduleScopeLabel(SCHEDULE, new Map([[PROJECT_ID, "Pulse Code"]]))).toBe(
      "Pulse Code",
    );
    expect(
      mobileScheduleScopeLabel(
        { ...SCHEDULE, scope: { _tag: "environment", projectIds: "all" } },
        new Map(),
      ),
    ).toBe("All projects");
    expect(mobileScheduleHeadline("Morning check\nDo the rest")).toBe("Morning check");
    expect(mobileScheduleCanEdit(SCHEDULE)).toBe(true);
    expect(
      mobileScheduleCanEdit({
        ...SCHEDULE,
        scope: { _tag: "environment", projectIds: [PROJECT_ID] },
      }),
    ).toBe(false);
  });

  it("finds and describes the latest occurrence", () => {
    const earlier: ScheduleProjectState = {
      ...PROJECT_STATE,
      lastOccurrenceStatus: "completed",
      lastOccurrenceAt: "2026-08-23T07:00:00.000Z",
    };
    const latest: ScheduleProjectState = {
      ...PROJECT_STATE,
      lastOccurrenceStatus: "failed",
      lastOccurrenceFailureReason: "auth",
      lastOccurrenceAt: "2026-08-24T07:00:00.000Z",
    };
    expect(latestScheduleOccurrence({ ...SCHEDULE, projectStates: [earlier, latest] })).toBe(
      latest,
    );
    expect(mobileOccurrenceSummary(latest, () => "2h")).toBe("Sign-in required · 2h");
    expect(mobileOccurrenceSummary(null, () => "2h")).toBe("No runs yet");
  });
});
