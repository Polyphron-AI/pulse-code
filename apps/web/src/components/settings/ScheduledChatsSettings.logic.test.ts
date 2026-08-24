import {
  ProjectId,
  ProviderInstanceId,
  ScheduleId,
  type OrchestrationSchedule,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  emptyScheduleForm,
  scheduleCreatePayload,
  scheduleFormFromSchedule,
  scheduleFormIssue,
  scheduleUpdateHasChanges,
  scheduleUpdatePayload,
  type ScheduleFormState,
} from "./ScheduledChatsSettings.logic";

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

function makeForm(overrides: Partial<ScheduleFormState> = {}): ScheduleFormState {
  return {
    ...emptyScheduleForm({ timezone: "Europe/Amsterdam", projectId: projectA }),
    prompt: "Daily check-in",
    ...overrides,
  };
}

describe("scheduleFormIssue", () => {
  it("accepts a filled-in project schedule", () => {
    expect(scheduleFormIssue(makeForm())).toBeNull();
  });

  it("requires a project for project scope", () => {
    expect(scheduleFormIssue(makeForm({ projectId: null }))).toBe(
      "Pick the project this chat runs in.",
    );
  });

  it("requires at least one target for a selected-projects sweep", () => {
    const issue = scheduleFormIssue(
      makeForm({ scopeKind: "environment", projectId: null, environmentTargets: [] }),
    );
    expect(issue).toBe("Pick at least one project, or target every project.");
  });

  it("accepts an environment sweep with no project picked", () => {
    expect(
      scheduleFormIssue(
        makeForm({ scopeKind: "environment", projectId: null, environmentTargets: "all" }),
      ),
    ).toBeNull();
  });

  it("rejects an out-of-range wall clock", () => {
    expect(scheduleFormIssue(makeForm({ hourLocal: 24 }))).toBe("Hour must be between 0 and 23.");
    expect(scheduleFormIssue(makeForm({ minuteLocal: 60 }))).toBe(
      "Minute must be between 0 and 59.",
    );
  });

  it("rejects a fractional wall clock", () => {
    expect(scheduleFormIssue(makeForm({ hourLocal: 6.5 }))).toBe("Hour must be between 0 and 23.");
  });

  it("requires a prompt", () => {
    expect(scheduleFormIssue(makeForm({ prompt: "   \n " }))).toBe(
      "Write the prompt this chat sends every day.",
    );
  });

  it("caps the prompt length", () => {
    const issue = scheduleFormIssue(makeForm({ prompt: "x".repeat(4_001) }));
    expect(issue).toBe("Keep the prompt under 4,000 characters.");
  });

  it("rejects a handoff path that escapes the project", () => {
    const posix = scheduleFormIssue(makeForm({ handoffPathTemplate: "/tmp/handoff.md" }));
    const windows = scheduleFormIssue(makeForm({ handoffPathTemplate: "C:\\handoff.md" }));
    expect(posix).toBe(
      "The handoff path is relative to the project, so it cannot start at the filesystem root.",
    );
    expect(windows).toBe(posix);
  });

  it("accepts a handoff template without {date}", () => {
    // A single rolling file is a legitimate choice; the reactor reads the
    // previous day from the same path.
    expect(scheduleFormIssue(makeForm({ handoffPathTemplate: "handoff.md" }))).toBeNull();
  });

  it("rejects a turn limit longer than the whole run", () => {
    expect(scheduleFormIssue(makeForm({ maxRunMinutes: 5, maxTurnMinutes: 10 }))).toBe(
      "A turn cannot be allowed to run longer than the whole occurrence.",
    );
  });

  it("rejects limits outside the contract range", () => {
    expect(scheduleFormIssue(makeForm({ maxRunMinutes: 0 }))).toBe(
      "Run limit must be between 1 and 120 minutes.",
    );
    expect(scheduleFormIssue(makeForm({ maxRunMinutes: 120, maxTurnMinutes: 121 }))).toBe(
      "Turn limit must be between 1 and 120 minutes.",
    );
  });
});

describe("scheduleCreatePayload", () => {
  it("trims text and omits the optional overrides it has no value for", () => {
    const payload = scheduleCreatePayload(
      makeForm({ prompt: "  Check CI  ", timezone: " Europe/Amsterdam " }),
    );
    expect(payload).toEqual({
      scope: { _tag: "project", projectId: projectA },
      hourLocal: 6,
      minuteLocal: 0,
      timezone: "Europe/Amsterdam",
      prompt: "Check CI",
      handoffPathTemplate: "handoff/{date}.md",
      maxRunMinutes: 15,
      maxTurnMinutes: 10,
    });
  });

  it("carries an explicit skip-if-dirty and model override", () => {
    const payload = scheduleCreatePayload(
      makeForm({
        skipIfDirty: false,
        modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
      }),
    );
    expect(payload.skipIfDirty).toBe(false);
    expect(payload.modelSelection).toEqual({
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5",
    });
  });

  it("targets the environment when the scope says so", () => {
    const payload = scheduleCreatePayload(
      makeForm({ scopeKind: "environment", environmentTargets: [projectA, projectB] }),
    );
    expect(payload.scope).toEqual({ _tag: "environment", projectIds: [projectA, projectB] });
  });
});

describe("scheduleUpdatePayload", () => {
  it("sends nothing when the form still matches the schedule", () => {
    const schedule = makeSchedule();
    const payload = scheduleUpdatePayload(schedule, scheduleFormFromSchedule(schedule));
    expect(payload).toEqual({});
    expect(scheduleUpdateHasChanges(payload)).toBe(false);
  });

  it("sends only the fields that changed", () => {
    const schedule = makeSchedule();
    const form = { ...scheduleFormFromSchedule(schedule), hourLocal: 9, prompt: "New prompt" };
    expect(scheduleUpdatePayload(schedule, form)).toEqual({ hourLocal: 9, prompt: "New prompt" });
  });

  it("clears a model override with an explicit null", () => {
    const schedule = makeSchedule({
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
    });
    const form = { ...scheduleFormFromSchedule(schedule), modelSelection: null };
    expect(scheduleUpdatePayload(schedule, form)).toEqual({ modelSelection: null });
  });

  it("clears skip-if-dirty back to the scope default with an explicit null", () => {
    const schedule = makeSchedule({ skipIfDirty: true });
    const form = { ...scheduleFormFromSchedule(schedule), skipIfDirty: null };
    expect(scheduleUpdatePayload(schedule, form)).toEqual({ skipIfDirty: null });
  });

  it("treats the same project set as unchanged and a different one as a change", () => {
    const schedule = makeSchedule({
      scope: { _tag: "environment", projectIds: [projectA, projectB] },
    });
    const unchanged = scheduleUpdatePayload(schedule, scheduleFormFromSchedule(schedule));
    expect(unchanged).toEqual({});
    const changed = scheduleUpdatePayload(schedule, {
      ...scheduleFormFromSchedule(schedule),
      environmentTargets: [projectA],
    });
    expect(changed).toEqual({ scope: { _tag: "environment", projectIds: [projectA] } });
  });

  it("switching from every project to a selected set is a scope change", () => {
    const schedule = makeSchedule({ scope: { _tag: "environment", projectIds: "all" } });
    const changed = scheduleUpdatePayload(schedule, {
      ...scheduleFormFromSchedule(schedule),
      environmentTargets: [projectA],
    });
    expect(changed).toEqual({ scope: { _tag: "environment", projectIds: [projectA] } });
  });

  it("does not resend an equal model selection that is a different object", () => {
    const schedule = makeSchedule({
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
    });
    const form = {
      ...scheduleFormFromSchedule(schedule),
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
    };
    expect(scheduleUpdatePayload(schedule, form)).toEqual({});
  });
});
