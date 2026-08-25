import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { ThreadCreatedPayload } from "./orchestration.ts";
import {
  OrchestrationSchedule,
  ProjectScheduleUpdateCommand,
  ScheduleScope,
  ThreadOrigin,
  scheduleIdFromThreadOrigin,
  scheduleIntervalMinutes,
  scheduleOccurrenceKey,
  scheduleSkipIfDirty,
  scheduleThreadOrigin,
} from "./schedule.ts";
import { ProjectId, ScheduleId } from "./baseSchemas.ts";

const decodeSchedule = Schema.decodeUnknownSync(OrchestrationSchedule);
const decodeScope = Schema.decodeUnknownSync(ScheduleScope);
const decodeOrigin = Schema.decodeUnknownSync(ThreadOrigin);
const decodeThreadCreated = Schema.decodeUnknownSync(ThreadCreatedPayload);

const baseSchedule = {
  id: "schedule-1",
  scope: { _tag: "project", projectId: "project-1" },
  hourLocal: 9,
  minuteLocal: 0,
  timezone: "America/New_York",
  prompt: "Daily check-in",
  pausedAt: null,
  projectStates: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
};

describe("OrchestrationSchedule", () => {
  it("decodes with defaults for handoff path and limits", () => {
    const decoded = decodeSchedule(baseSchedule);
    expect(decoded.handoffPathTemplate).toBe("handoff/{date}.md");
    expect(decoded.maxRunMinutes).toBe(15);
    expect(decoded.maxTurnMinutes).toBe(10);
  });

  it("round-trips explicit fields", () => {
    const decoded = decodeSchedule({
      ...baseSchedule,
      handoffPathTemplate: "notes/{date}.md",
      maxRunMinutes: 120,
      maxTurnMinutes: 1,
      workflowScriptRef: "scripts/daily.md",
      projectStates: [
        {
          projectId: "project-1",
          threadId: "thread-1",
          lastOccurrenceKey: "scheduled:schedule-1:2026-01-01:project-1",
          lastOccurrenceStatus: "failed",
          lastOccurrenceFailureReason: "timeout:turn",
          lastOccurrenceAt: "2026-01-01T09:10:00.000Z",
        },
      ],
    });
    expect(decoded.maxRunMinutes).toBe(120);
    expect(decoded.projectStates[0]?.lastOccurrenceFailureReason).toBe("timeout:turn");
  });

  it("round-trips with and without a model selection", () => {
    const without = decodeSchedule(baseSchedule);
    expect(without.modelSelection).toBeUndefined();

    const withSelection = decodeSchedule({
      ...baseSchedule,
      modelSelection: { instanceId: "claude", model: "claude-haiku-4-5" },
    });
    expect(withSelection.modelSelection).toMatchObject({
      instanceId: "claude",
      model: "claude-haiku-4-5",
    });

    const encoded = Schema.encodeUnknownSync(OrchestrationSchedule)(withSelection);
    expect(decodeSchedule(encoded).modelSelection).toMatchObject({
      instanceId: "claude",
      model: "claude-haiku-4-5",
    });
  });

  it("update command distinguishes absent from null model selection", () => {
    const decodeUpdate = Schema.decodeUnknownSync(ProjectScheduleUpdateCommand);
    const base = {
      type: "project.schedule.update",
      commandId: "cmd-update",
      scheduleId: "schedule-1",
    };
    // Absent = leave unchanged.
    expect(decodeUpdate(base).modelSelection).toBeUndefined();
    // Null = clear back to the project's defaults.
    expect(decodeUpdate({ ...base, modelSelection: null }).modelSelection).toBeNull();
    expect(
      decodeUpdate({
        ...base,
        modelSelection: { instanceId: "codex", model: "gpt-5-codex" },
      }).modelSelection,
    ).toMatchObject({ instanceId: "codex", model: "gpt-5-codex" });
  });

  const baseProjectState = {
    projectId: "project-1",
    threadId: "thread-1",
    lastOccurrenceKey: null,
    lastOccurrenceStatus: null,
    lastOccurrenceAt: null,
  };

  it("defaults consecutiveFailures to 0 and round-trips explicit values", () => {
    const defaulted = decodeSchedule({
      ...baseSchedule,
      projectStates: [baseProjectState],
    });
    expect(defaulted.projectStates[0]?.consecutiveFailures).toBe(0);

    const explicit = decodeSchedule({
      ...baseSchedule,
      projectStates: [{ ...baseProjectState, consecutiveFailures: 2 }],
    });
    expect(explicit.projectStates[0]?.consecutiveFailures).toBe(2);
    const encoded = Schema.encodeUnknownSync(OrchestrationSchedule)(explicit);
    expect(decodeSchedule(encoded).projectStates[0]?.consecutiveFailures).toBe(2);
  });

  it("accepts 'dirty' as an occurrence failure reason", () => {
    const decoded = decodeSchedule({
      ...baseSchedule,
      projectStates: [
        {
          ...baseProjectState,
          lastOccurrenceStatus: "failed",
          lastOccurrenceFailureReason: "dirty",
        },
      ],
    });
    expect(decoded.projectStates[0]?.lastOccurrenceFailureReason).toBe("dirty");
  });

  it("round-trips skipIfDirty and autoPausedReason", () => {
    const absent = decodeSchedule(baseSchedule);
    expect(absent.skipIfDirty).toBeUndefined();
    expect(absent.autoPausedReason).toBeUndefined();

    const explicit = decodeSchedule({
      ...baseSchedule,
      skipIfDirty: false,
      autoPausedReason: "paused after 3 failures: auth",
    });
    expect(explicit.skipIfDirty).toBe(false);
    expect(explicit.autoPausedReason).toBe("paused after 3 failures: auth");
    const encoded = Schema.encodeUnknownSync(OrchestrationSchedule)(explicit);
    expect(decodeSchedule(encoded).skipIfDirty).toBe(false);
    expect(decodeSchedule(encoded).autoPausedReason).toBe("paused after 3 failures: auth");
  });

  it("update command distinguishes absent from null skipIfDirty", () => {
    const decodeUpdate = Schema.decodeUnknownSync(ProjectScheduleUpdateCommand);
    const base = {
      type: "project.schedule.update",
      commandId: "cmd-update",
      scheduleId: "schedule-1",
    };
    // Absent = leave unchanged; null = clear back to the scope default.
    expect(decodeUpdate(base).skipIfDirty).toBeUndefined();
    expect(decodeUpdate({ ...base, skipIfDirty: null }).skipIfDirty).toBeNull();
    expect(decodeUpdate({ ...base, skipIfDirty: true }).skipIfDirty).toBe(true);
  });

  it("scheduleSkipIfDirty defaults by scope and honors explicit overrides", () => {
    const projectScope = decodeSchedule(baseSchedule);
    const environmentScope = decodeSchedule({
      ...baseSchedule,
      scope: { _tag: "environment", projectIds: "all" },
    });
    expect(scheduleSkipIfDirty(projectScope)).toBe(false);
    expect(scheduleSkipIfDirty(environmentScope)).toBe(true);
    expect(scheduleSkipIfDirty({ ...projectScope, skipIfDirty: true })).toBe(true);
    expect(scheduleSkipIfDirty({ ...environmentScope, skipIfDirty: false })).toBe(false);
    // Null behaves like absent: back to the scope default.
    expect(scheduleSkipIfDirty({ ...environmentScope, skipIfDirty: null })).toBe(true);
  });

  it("rejects out-of-range times and limits", () => {
    expect(() => decodeSchedule({ ...baseSchedule, hourLocal: 24 })).toThrow();
    expect(() => decodeSchedule({ ...baseSchedule, minuteLocal: -1 })).toThrow();
    expect(() => decodeSchedule({ ...baseSchedule, maxRunMinutes: 0 })).toThrow();
    expect(() => decodeSchedule({ ...baseSchedule, maxTurnMinutes: 121 })).toThrow();
    expect(() => decodeSchedule({ ...baseSchedule, prompt: "  " })).toThrow();
  });
});

describe("ScheduleScope", () => {
  it("decodes project, environment list, and environment all", () => {
    expect(decodeScope({ _tag: "project", projectId: "p1" })._tag).toBe("project");
    expect(decodeScope({ _tag: "environment", projectIds: ["p1", "p2"] })._tag).toBe("environment");
    const all = decodeScope({ _tag: "environment", projectIds: "all" });
    expect(all._tag === "environment" && all.projectIds).toBe("all");
  });

  it("rejects unknown tags", () => {
    expect(() => decodeScope({ _tag: "global" })).toThrow();
  });
});

describe("ThreadOrigin", () => {
  it("accepts user and schedule-prefixed origins", () => {
    expect(decodeOrigin("user")).toBe("user");
    expect(decodeOrigin("schedule:schedule-1")).toBe("schedule:schedule-1");
  });

  it("rejects other strings", () => {
    expect(() => decodeOrigin("cron")).toThrow();
    expect(() => decodeOrigin("schedule:")).toThrow();
  });

  it("round-trips through the helpers", () => {
    const scheduleId = ScheduleId.make("schedule-1");
    const origin = scheduleThreadOrigin(scheduleId);
    expect(scheduleIdFromThreadOrigin(origin)).toBe(scheduleId);
    expect(scheduleIdFromThreadOrigin("user")).toBeNull();
  });
});

describe("occurrence keys", () => {
  it("builds deterministic per-project keys", () => {
    const key = scheduleOccurrenceKey({
      scheduleId: ScheduleId.make("schedule-1"),
      dateLocal: "2026-01-01",
      projectId: ProjectId.make("project-1"),
    });
    expect(key).toBe("scheduled:schedule-1:2026-01-01:project-1");
  });
});

describe("schedule intervals", () => {
  it("accepts fractional units that resolve to whole minutes", () => {
    expect(scheduleIntervalMinutes({ value: 1.5, unit: "hours" })).toBe(90);
    expect(scheduleIntervalMinutes({ value: 0.1, unit: "hours" })).toBe(6);
    expect(scheduleIntervalMinutes({ value: 0.5, unit: "days" })).toBe(720);
  });

  it("rejects intervals that cannot resolve to whole minutes", () => {
    expect(scheduleIntervalMinutes({ value: 1.1, unit: "minutes" })).toBeNull();
    expect(scheduleIntervalMinutes({ value: 0, unit: "weeks" })).toBeNull();
  });
});

describe("backward compatibility", () => {
  it("decodes a pre-origin thread.created payload", () => {
    const decoded = decodeThreadCreated({
      threadId: "thread-1",
      projectId: "project-1",
      title: "Thread",
      modelSelection: { instanceId: "codex", model: "gpt-5-codex" },
      runtimeMode: "approval-required",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(decoded.origin).toBeUndefined();
  });
});
