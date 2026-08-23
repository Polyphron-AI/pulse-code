import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  ProjectId,
  ProviderInstanceId,
  ScheduleId,
  ThreadId,
  scheduleOccurrenceKey,
  scheduleThreadOrigin,
  type OrchestrationCommand,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as NodeServices from "@effect/platform-node/NodeServices";

import { decideOrchestrationCommand } from "./decider.ts";
import { createEmptyReadModel, projectEvent } from "./projector.ts";

const now = "2026-01-01T00:00:00.000Z";
const projectA = ProjectId.make("project-a");
const projectB = ProjectId.make("project-b");
const scheduleId = ScheduleId.make("schedule-1");
const threadA = ThreadId.make("thread-sched-a");
const threadB = ThreadId.make("thread-sched-b");

const cmd = (value: string) => CommandId.make(value);

/** Decide a command and fold its events into the read model. */
const decideAndApply = Effect.fn("decideAndApply")(function* (
  readModel: OrchestrationReadModel,
  command: OrchestrationCommand,
) {
  const decided = yield* decideOrchestrationCommand({ command, readModel });
  const events = Array.isArray(decided) ? decided : [decided];
  let model = readModel;
  let sequence = readModel.snapshotSequence;
  for (const event of events) {
    sequence += 1;
    model = yield* projectEvent(model, { ...event, sequence });
  }
  return model;
});

const seedProjects = Effect.fn("seedProjects")(function* () {
  let model = createEmptyReadModel(now);
  for (const projectId of [projectA, projectB]) {
    model = yield* decideAndApply(model, {
      type: "project.create",
      commandId: cmd(`cmd-create-${projectId}`),
      projectId,
      title: `Project ${projectId}`,
      workspaceRoot: `/tmp/${projectId}`,
      createdAt: now,
    });
  }
  return model;
});

const createScheduleCommand = {
  type: "project.schedule.create",
  commandId: cmd("cmd-schedule-create"),
  scheduleId,
  scope: { _tag: "project", projectId: projectA },
  hourLocal: 9,
  minuteLocal: 30,
  timezone: "America/New_York",
  prompt: "Daily check-in: triage and continue.",
  createdAt: now,
} satisfies OrchestrationCommand;

const seedSchedule = Effect.fn("seedSchedule")(function* (
  overrides?: Partial<Extract<OrchestrationCommand, { type: "project.schedule.create" }>>,
) {
  const model = yield* seedProjects();
  return yield* decideAndApply(model, { ...createScheduleCommand, ...overrides });
});

const startOccurrence = (input: {
  readonly projectId: ProjectId;
  readonly threadId: ThreadId;
  readonly dateLocal: string;
  readonly commandSuffix?: string;
}) =>
  ({
    type: "schedule.occurrence.start",
    commandId: cmd(
      `scheduled:${scheduleId}:${scheduleOccurrenceKey({
        scheduleId,
        dateLocal: input.dateLocal,
        projectId: input.projectId,
      })}${input.commandSuffix ?? ""}`,
    ),
    scheduleId,
    occurrenceKey: scheduleOccurrenceKey({
      scheduleId,
      dateLocal: input.dateLocal,
      projectId: input.projectId,
    }),
    projectId: input.projectId,
    threadId: input.threadId,
    startedAt: now,
  }) satisfies OrchestrationCommand;

it.layer(NodeServices.layer)("decider schedules", (it) => {
  it.effect("creates a schedule with defaults and materializes it in the read model", () =>
    Effect.gen(function* () {
      const model = yield* seedSchedule();
      const schedule = model.schedules?.find((entry) => entry.id === scheduleId);
      expect(schedule).toMatchObject({
        id: scheduleId,
        scope: { _tag: "project", projectId: projectA },
        hourLocal: 9,
        minuteLocal: 30,
        timezone: "America/New_York",
        prompt: "Daily check-in: triage and continue.",
        handoffPathTemplate: "handoff/{date}.md",
        maxRunMinutes: 15,
        maxTurnMinutes: 10,
        pausedAt: null,
        projectStates: [],
        deletedAt: null,
      });
    }),
  );

  it.effect("rejects creating the same schedule twice", () =>
    Effect.gen(function* () {
      const model = yield* seedSchedule();
      const failure = yield* Effect.flip(
        decideOrchestrationCommand({ command: createScheduleCommand, readModel: model }),
      );
      expect(failure.message).toContain("already exists");
    }),
  );

  it.effect("rejects invalid timezone, out-of-range time, and out-of-range limits", () =>
    Effect.gen(function* () {
      const model = yield* seedProjects();
      const invalidTimezone = yield* Effect.flip(
        decideOrchestrationCommand({
          command: { ...createScheduleCommand, timezone: "Not/AZone" },
          readModel: model,
        }),
      );
      expect(invalidTimezone.message).toContain("not a valid IANA time zone");

      const invalidHour = yield* Effect.flip(
        decideOrchestrationCommand({
          command: { ...createScheduleCommand, hourLocal: 24 },
          readModel: model,
        }),
      );
      expect(invalidHour.message).toContain("between 0 and 23");

      const invalidMinute = yield* Effect.flip(
        decideOrchestrationCommand({
          command: { ...createScheduleCommand, minuteLocal: 60 },
          readModel: model,
        }),
      );
      expect(invalidMinute.message).toContain("between 0 and 59");

      const invalidRunLimit = yield* Effect.flip(
        decideOrchestrationCommand({
          command: { ...createScheduleCommand, maxRunMinutes: 121 },
          readModel: model,
        }),
      );
      expect(invalidRunLimit.message).toContain("between 1 and 120");

      const invalidTurnLimit = yield* Effect.flip(
        decideOrchestrationCommand({
          command: { ...createScheduleCommand, maxTurnMinutes: 0 },
          readModel: model,
        }),
      );
      expect(invalidTurnLimit.message).toContain("between 1 and 120");
    }),
  );

  it.effect("rejects an empty environment scope and unknown scoped projects", () =>
    Effect.gen(function* () {
      const model = yield* seedProjects();
      const emptyScope = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            ...createScheduleCommand,
            scope: { _tag: "environment", projectIds: [] },
          },
          readModel: model,
        }),
      );
      expect(emptyScope.message).toContain("at least one project");

      const unknownProject = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            ...createScheduleCommand,
            scope: { _tag: "project", projectId: ProjectId.make("project-missing") },
          },
          readModel: model,
        }),
      );
      expect(unknownProject.message).toContain("does not exist");
    }),
  );

  it.effect("updates fields and projects them", () =>
    Effect.gen(function* () {
      const seeded = yield* seedSchedule();
      const model = yield* decideAndApply(seeded, {
        type: "project.schedule.update",
        commandId: cmd("cmd-schedule-update"),
        scheduleId,
        hourLocal: 7,
        prompt: "New prompt",
        maxRunMinutes: 30,
        workflowScriptRef: null,
      });
      const schedule = model.schedules?.find((entry) => entry.id === scheduleId);
      expect(schedule).toMatchObject({
        hourLocal: 7,
        minuteLocal: 30,
        prompt: "New prompt",
        maxRunMinutes: 30,
        maxTurnMinutes: 10,
        workflowScriptRef: null,
      });
    }),
  );

  it.effect("create with a model selection lands it on the read model", () =>
    Effect.gen(function* () {
      const model = yield* seedSchedule({
        modelSelection: {
          instanceId: ProviderInstanceId.make("claude"),
          model: "claude-haiku-4-5",
        },
      });
      const schedule = model.schedules?.find((entry) => entry.id === scheduleId);
      expect(schedule?.modelSelection).toMatchObject({
        instanceId: "claude",
        model: "claude-haiku-4-5",
      });
    }),
  );

  it.effect("update with null clears the model selection back to project defaults", () =>
    Effect.gen(function* () {
      const seeded = yield* seedSchedule({
        modelSelection: {
          instanceId: ProviderInstanceId.make("claude"),
          model: "claude-haiku-4-5",
        },
      });
      const cleared = yield* decideAndApply(seeded, {
        type: "project.schedule.update",
        commandId: cmd("cmd-schedule-clear-model"),
        scheduleId,
        modelSelection: null,
      });
      expect(
        cleared.schedules?.find((entry) => entry.id === scheduleId)?.modelSelection,
      ).toBeNull();

      // An update that omits the field leaves the selection untouched.
      const swapped = yield* decideAndApply(seeded, {
        type: "project.schedule.update",
        commandId: cmd("cmd-schedule-update-prompt"),
        scheduleId,
        prompt: "New prompt",
      });
      expect(
        swapped.schedules?.find((entry) => entry.id === scheduleId)?.modelSelection,
      ).toMatchObject({ instanceId: "claude", model: "claude-haiku-4-5" });
    }),
  );

  it.effect("pause then resume round-trips, and invalid transitions are rejected", () =>
    Effect.gen(function* () {
      const seeded = yield* seedSchedule();

      const notPaused = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            type: "project.schedule.resume",
            commandId: cmd("cmd-resume-early"),
            scheduleId,
          },
          readModel: seeded,
        }),
      );
      expect(notPaused.message).toContain("not paused");

      const paused = yield* decideAndApply(seeded, {
        type: "project.schedule.pause",
        commandId: cmd("cmd-pause"),
        scheduleId,
      });
      expect(paused.schedules?.find((entry) => entry.id === scheduleId)?.pausedAt).not.toBeNull();

      const doublePause = yield* Effect.flip(
        decideOrchestrationCommand({
          command: { type: "project.schedule.pause", commandId: cmd("cmd-pause-2"), scheduleId },
          readModel: paused,
        }),
      );
      expect(doublePause.message).toContain("already paused");

      const resumed = yield* decideAndApply(paused, {
        type: "project.schedule.resume",
        commandId: cmd("cmd-resume"),
        scheduleId,
      });
      expect(resumed.schedules?.find((entry) => entry.id === scheduleId)?.pausedAt).toBeNull();
    }),
  );

  it.effect(
    "delete soft-deletes the schedule, preserves its thread, and blocks later commands",
    () =>
      Effect.gen(function* () {
        const seeded = yield* seedSchedule();
        const withThread = yield* decideAndApply(seeded, {
          type: "thread.create",
          commandId: cmd("cmd-thread-create"),
          threadId: threadA,
          projectId: projectA,
          title: "Daily check-in",
          modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5-codex" },
          runtimeMode: "approval-required",
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          branch: null,
          worktreePath: null,
          origin: scheduleThreadOrigin(scheduleId),
          createdAt: now,
        });
        const deleted = yield* decideAndApply(withThread, {
          type: "project.schedule.delete",
          commandId: cmd("cmd-schedule-delete"),
          scheduleId,
        });
        const schedule = deleted.schedules?.find((entry) => entry.id === scheduleId);
        expect(schedule?.deletedAt).not.toBeNull();
        // The schedule's thread stays live and untouched.
        const thread = deleted.threads.find((entry) => entry.id === threadA);
        expect(thread?.deletedAt).toBeNull();
        expect(thread?.origin).toBe(`schedule:${scheduleId}`);

        const afterDelete = yield* Effect.flip(
          decideOrchestrationCommand({
            command: {
              type: "project.schedule.pause",
              commandId: cmd("cmd-pause-late"),
              scheduleId,
            },
            readModel: deleted,
          }),
        );
        expect(afterDelete.message).toContain("does not exist");
      }),
  );

  it.effect("occurrence start records running state, and a duplicate key is rejected", () =>
    Effect.gen(function* () {
      const seeded = yield* seedSchedule();
      const start = startOccurrence({
        projectId: projectA,
        threadId: threadA,
        dateLocal: "2026-01-01",
      });
      const started = yield* decideAndApply(seeded, start);
      const state = started.schedules
        ?.find((entry) => entry.id === scheduleId)
        ?.projectStates.find((entry) => entry.projectId === projectA);
      expect(state).toMatchObject({
        threadId: threadA,
        lastOccurrenceKey: start.occurrenceKey,
        lastOccurrenceStatus: "running",
        lastOccurrenceAt: now,
      });

      // Restart / double tick / catch-up sweep rebuild the same key.
      const duplicate = yield* Effect.flip(
        decideOrchestrationCommand({
          command: startOccurrence({
            projectId: projectA,
            threadId: threadA,
            dateLocal: "2026-01-01",
            commandSuffix: ":retry",
          }),
          readModel: started,
        }),
      );
      expect(duplicate.message).toContain("already started");

      // The next local date is a new key and fires normally.
      const nextDay = yield* decideOrchestrationCommand({
        command: startOccurrence({
          projectId: projectA,
          threadId: threadA,
          dateLocal: "2026-01-02",
        }),
        readModel: started,
      });
      const nextDayEvent = Array.isArray(nextDay) ? nextDay[0] : nextDay;
      expect(nextDayEvent?.type).toBe("schedule.occurrence.started");
    }),
  );

  it.effect("rejects occurrence start while paused or outside scope", () =>
    Effect.gen(function* () {
      const seeded = yield* seedSchedule();
      const outsideScope = yield* Effect.flip(
        decideOrchestrationCommand({
          command: startOccurrence({
            projectId: projectB,
            threadId: threadB,
            dateLocal: "2026-01-01",
          }),
          readModel: seeded,
        }),
      );
      expect(outsideScope.message).toContain("does not target project");

      const paused = yield* decideAndApply(seeded, {
        type: "project.schedule.pause",
        commandId: cmd("cmd-pause"),
        scheduleId,
      });
      const whilePaused = yield* Effect.flip(
        decideOrchestrationCommand({
          command: startOccurrence({
            projectId: projectA,
            threadId: threadA,
            dateLocal: "2026-01-01",
          }),
          readModel: paused,
        }),
      );
      expect(whilePaused.message).toContain("paused");
    }),
  );

  it.effect("environment scope tracks per-project occurrence keys independently", () =>
    Effect.gen(function* () {
      const seeded = yield* seedSchedule({
        scope: { _tag: "environment", projectIds: [projectA, projectB] },
      });
      const startedA = yield* decideAndApply(
        seeded,
        startOccurrence({ projectId: projectA, threadId: threadA, dateLocal: "2026-01-01" }),
      );
      // Project A's fired key must not block project B's same-day start.
      const startedBoth = yield* decideAndApply(
        startedA,
        startOccurrence({ projectId: projectB, threadId: threadB, dateLocal: "2026-01-01" }),
      );
      const schedule = startedBoth.schedules?.find((entry) => entry.id === scheduleId);
      expect(schedule?.projectStates).toHaveLength(2);

      // But B's own duplicate is still rejected.
      const duplicateB = yield* Effect.flip(
        decideOrchestrationCommand({
          command: startOccurrence({
            projectId: projectB,
            threadId: threadB,
            dateLocal: "2026-01-01",
            commandSuffix: ":retry",
          }),
          readModel: startedBoth,
        }),
      );
      expect(duplicateB.message).toContain("already started");
    }),
  );

  it.effect("completes and fails occurrences with stale transitions rejected", () =>
    Effect.gen(function* () {
      const seeded = yield* seedSchedule();
      const start = startOccurrence({
        projectId: projectA,
        threadId: threadA,
        dateLocal: "2026-01-01",
      });
      const started = yield* decideAndApply(seeded, start);

      const completed = yield* decideAndApply(started, {
        type: "schedule.occurrence.complete",
        commandId: cmd("cmd-occurrence-complete"),
        scheduleId,
        occurrenceKey: start.occurrenceKey,
        projectId: projectA,
        completedAt: "2026-01-01T00:10:00.000Z",
      });
      const completedState = completed.schedules
        ?.find((entry) => entry.id === scheduleId)
        ?.projectStates.find((entry) => entry.projectId === projectA);
      expect(completedState).toMatchObject({
        lastOccurrenceStatus: "completed",
        lastOccurrenceFailureReason: null,
        lastOccurrenceAt: "2026-01-01T00:10:00.000Z",
      });

      // A second completion (or a late watchdog fail) is stale: not running.
      const doubleComplete = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            type: "schedule.occurrence.fail",
            commandId: cmd("cmd-occurrence-fail-stale"),
            scheduleId,
            occurrenceKey: start.occurrenceKey,
            projectId: projectA,
            reason: "timeout:run",
            failedAt: "2026-01-01T00:20:00.000Z",
          },
          readModel: completed,
        }),
      );
      expect(doubleComplete.message).toContain("is not running");

      // A fresh occurrence can fail with a reason and message.
      const nextStart = startOccurrence({
        projectId: projectA,
        threadId: threadA,
        dateLocal: "2026-01-02",
      });
      const restarted = yield* decideAndApply(completed, nextStart);
      const failed = yield* decideAndApply(restarted, {
        type: "schedule.occurrence.fail",
        commandId: cmd("cmd-occurrence-fail"),
        scheduleId,
        occurrenceKey: nextStart.occurrenceKey,
        projectId: projectA,
        reason: "auth",
        message: "provider credentials expired",
        failedAt: "2026-01-02T00:05:00.000Z",
      });
      const failedState = failed.schedules
        ?.find((entry) => entry.id === scheduleId)
        ?.projectStates.find((entry) => entry.projectId === projectA);
      expect(failedState).toMatchObject({
        lastOccurrenceStatus: "failed",
        lastOccurrenceFailureReason: "auth",
      });

      // A mismatched key from another day is also stale.
      const wrongKey = yield* Effect.flip(
        decideOrchestrationCommand({
          command: {
            type: "schedule.occurrence.complete",
            commandId: cmd("cmd-occurrence-complete-wrong"),
            scheduleId,
            occurrenceKey: start.occurrenceKey,
            projectId: projectA,
            completedAt: "2026-01-02T00:06:00.000Z",
          },
          readModel: failed,
        }),
      );
      expect(wrongKey.message).toContain("is not running");
    }),
  );

  it.effect("thread.create without origin projects a thread readable as user-origin", () =>
    Effect.gen(function* () {
      const model = yield* seedProjects();
      const withThread = yield* decideAndApply(model, {
        type: "thread.create",
        commandId: cmd("cmd-thread-user"),
        threadId: threadB,
        projectId: projectA,
        title: "Manual thread",
        modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5-codex" },
        runtimeMode: "approval-required",
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        branch: null,
        worktreePath: null,
        createdAt: now,
      });
      const thread = withThread.threads.find((entry) => entry.id === threadB);
      expect(thread?.origin ?? "user").toBe("user");
    }),
  );

  /** Start day N's occurrence, then fail it with the given reason. */
  const startAndFail = Effect.fn("startAndFail")(function* (
    model: OrchestrationReadModel,
    input: { readonly dateLocal: string; readonly reason: "auth" | "dirty" | "error" },
  ) {
    const start = startOccurrence({
      projectId: projectA,
      threadId: threadA,
      dateLocal: input.dateLocal,
    });
    const started = yield* decideAndApply(model, start);
    return yield* decideAndApply(started, {
      type: "schedule.occurrence.fail",
      commandId: cmd(`cmd-fail-${input.dateLocal}-${input.reason}`),
      scheduleId,
      occurrenceKey: start.occurrenceKey,
      projectId: projectA,
      reason: input.reason,
      failedAt: `${input.dateLocal}T00:05:00.000Z`,
    });
  });

  const scheduleOf = (model: OrchestrationReadModel) =>
    model.schedules?.find((entry) => entry.id === scheduleId);
  const stateOf = (model: OrchestrationReadModel) =>
    scheduleOf(model)?.projectStates.find((entry) => entry.projectId === projectA);

  it.effect("three consecutive failures auto-pause the schedule with a visible reason", () =>
    Effect.gen(function* () {
      let model = yield* seedSchedule();
      model = yield* startAndFail(model, { dateLocal: "2026-01-01", reason: "auth" });
      expect(stateOf(model)?.consecutiveFailures).toBe(1);
      expect(scheduleOf(model)?.pausedAt).toBeNull();

      model = yield* startAndFail(model, { dateLocal: "2026-01-02", reason: "auth" });
      expect(stateOf(model)?.consecutiveFailures).toBe(2);
      expect(scheduleOf(model)?.pausedAt).toBeNull();

      model = yield* startAndFail(model, { dateLocal: "2026-01-03", reason: "auth" });
      expect(stateOf(model)?.consecutiveFailures).toBe(3);
      expect(scheduleOf(model)?.pausedAt).not.toBeNull();
      expect(scheduleOf(model)?.autoPausedReason).toBe("paused after 3 failures: auth");

      // The auto-pause is a real pause: the next fire is rejected.
      const blocked = yield* Effect.flip(
        decideOrchestrationCommand({
          command: startOccurrence({
            projectId: projectA,
            threadId: threadA,
            dateLocal: "2026-01-04",
          }),
          readModel: model,
        }),
      );
      expect(blocked.message).toContain("paused");
    }),
  );

  it.effect("a completed occurrence resets the failure streak", () =>
    Effect.gen(function* () {
      let model = yield* seedSchedule();
      model = yield* startAndFail(model, { dateLocal: "2026-01-01", reason: "error" });
      model = yield* startAndFail(model, { dateLocal: "2026-01-02", reason: "error" });
      expect(stateOf(model)?.consecutiveFailures).toBe(2);

      const start = startOccurrence({
        projectId: projectA,
        threadId: threadA,
        dateLocal: "2026-01-03",
      });
      model = yield* decideAndApply(model, start);
      model = yield* decideAndApply(model, {
        type: "schedule.occurrence.complete",
        commandId: cmd("cmd-complete-jan-3"),
        scheduleId,
        occurrenceKey: start.occurrenceKey,
        projectId: projectA,
        completedAt: "2026-01-03T00:10:00.000Z",
      });
      expect(stateOf(model)?.consecutiveFailures).toBe(0);

      // A later failure starts a fresh streak; no pause.
      model = yield* startAndFail(model, { dateLocal: "2026-01-04", reason: "error" });
      expect(stateOf(model)?.consecutiveFailures).toBe(1);
      expect(scheduleOf(model)?.pausedAt).toBeNull();
    }),
  );

  it.effect("'dirty' failures never count toward the auto-pause streak", () =>
    Effect.gen(function* () {
      let model = yield* seedSchedule();
      model = yield* startAndFail(model, { dateLocal: "2026-01-01", reason: "auth" });
      for (const dateLocal of ["2026-01-02", "2026-01-03", "2026-01-04"]) {
        model = yield* startAndFail(model, { dateLocal, reason: "dirty" });
      }
      expect(stateOf(model)?.consecutiveFailures).toBe(1);
      expect(stateOf(model)?.lastOccurrenceFailureReason).toBe("dirty");
      expect(scheduleOf(model)?.pausedAt).toBeNull();
      expect(scheduleOf(model)?.autoPausedReason).toBeNull();
    }),
  );

  it.effect("resume clears the auto-pause reason and the failure streak", () =>
    Effect.gen(function* () {
      let model = yield* seedSchedule();
      for (const dateLocal of ["2026-01-01", "2026-01-02", "2026-01-03"]) {
        model = yield* startAndFail(model, { dateLocal, reason: "auth" });
      }
      expect(scheduleOf(model)?.autoPausedReason).toBe("paused after 3 failures: auth");

      model = yield* decideAndApply(model, {
        type: "project.schedule.resume",
        commandId: cmd("cmd-resume-after-auto-pause"),
        scheduleId,
      });
      expect(scheduleOf(model)?.pausedAt).toBeNull();
      expect(scheduleOf(model)?.autoPausedReason).toBeNull();
      expect(stateOf(model)?.consecutiveFailures).toBe(0);
    }),
  );

  it.effect("skipIfDirty passes through create and update, and null clears it", () =>
    Effect.gen(function* () {
      let model = yield* seedSchedule({ skipIfDirty: true });
      expect(scheduleOf(model)?.skipIfDirty).toBe(true);

      model = yield* decideAndApply(model, {
        type: "project.schedule.update",
        commandId: cmd("cmd-skip-dirty-off"),
        scheduleId,
        skipIfDirty: false,
      });
      expect(scheduleOf(model)?.skipIfDirty).toBe(false);

      // Null clears back to the scope default; absent leaves it unchanged.
      model = yield* decideAndApply(model, {
        type: "project.schedule.update",
        commandId: cmd("cmd-skip-dirty-clear"),
        scheduleId,
        skipIfDirty: null,
      });
      expect(scheduleOf(model)?.skipIfDirty).toBeNull();
    }),
  );
});
