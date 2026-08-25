import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  MessageId,
  ThreadId,
  scheduleOccurrenceKey,
  scheduleIntervalMinutes,
  scheduleSkipIfDirty,
  scheduleThreadOrigin,
  type ModelSelection,
  type OrchestrationReadModel,
  type OrchestrationSchedule,
  type OrchestrationThread,
  type ProjectId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";

import { writeFileStringAtomically } from "../../atomicWrite.ts";
import { BackgroundPolicy } from "../../background/BackgroundPolicy.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ScheduleAuthProbe } from "../Services/ScheduleAuthProbe.ts";
import { ScheduleHandoffGit } from "../Services/ScheduleHandoffGit.ts";
import { ScheduleProviderInstances } from "../Services/ScheduleProviderInstances.ts";
import { ScheduleReactor, type ScheduleReactorShape } from "../Services/ScheduleReactor.ts";
import { ScheduleWorkingTreeProbe } from "../Services/ScheduleWorkingTreeProbe.ts";

const DEFAULT_SWEEP_INTERVAL_MS = 30 * 1000;
/** Minimum spacing between fires of different schedules (see the design's
 * cross-schedule spacing rule): a due schedule whose gate is closed simply
 * stays due and a later sweep fires it once the gate opens. */
const CROSS_SCHEDULE_FIRE_SPACING_MS = 10 * 60_000;
const HANDOFF_LOOKBACK_DAYS = 14;
const MS_PER_DAY = 86_400_000;

export interface ScheduleReactorLiveOptions {
  readonly sweepIntervalMs?: number;
}

const pad = (value: number, width: number) => String(value).padStart(width, "0");

/** Calendar day arithmetic on `YYYY-MM-DD` strings via epoch-day math. */
const isoDateToEpochDay = (isoDate: string): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (match === null) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / MS_PER_DAY;
};

const epochDayToIsoDate = (epochDay: number): string =>
  DateTime.formatIsoDateUtc(DateTime.makeUnsafe(epochDay * MS_PER_DAY));

/** Extract the local date from an occurrence key (`scheduled:<sid>:<date>:<pid>`). */
const occurrenceKeyLocalDate = (occurrenceKey: string): string | null =>
  /(\d{4}-\d{2}-\d{2})/.exec(occurrenceKey)?.[1] ?? null;

const occurrenceKeyEpochMinute = (occurrenceKey: string | null): number | null => {
  const marker = occurrenceKey?.lastIndexOf("@") ?? -1;
  const value = marker < 0 ? Number.NaN : Number(occurrenceKey!.slice(marker + 1).split(":")[0]);
  return Number.isSafeInteger(value) ? value : null;
};

const localSlot = (timezone: string, epochMinute: number) => {
  const zone = Option.getOrNull(DateTime.zoneMakeNamed(timezone));
  if (zone === null) return null;
  const parts = DateTime.toParts(DateTime.setZone(DateTime.makeUnsafe(epochMinute * 60_000), zone));
  const dateLocal = `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`;
  return {
    dateLocal,
    slotLocal: `${dateLocal}T${pad(parts.hour, 2)}-${pad(parts.minute, 2)}@${epochMinute}`,
  };
};

const dueIntervalSlot = (
  schedule: OrchestrationSchedule,
  lastKey: string | null,
  nowMillis: number,
) => {
  if (schedule.interval == null) return null;
  const intervalMinutes = scheduleIntervalMinutes(schedule.interval);
  const createdMillis = Date.parse(schedule.intervalAnchorAt ?? schedule.createdAt);
  if (intervalMinutes === null || Number.isNaN(createdMillis)) return null;
  const anchorMinute = Math.floor(createdMillis / 60_000);
  const nowMinute = Math.floor(nowMillis / 60_000);
  const elapsed = nowMinute - anchorMinute;
  if (elapsed < intervalMinutes) return null;
  const dueMinute = anchorMinute + Math.floor(elapsed / intervalMinutes) * intervalMinutes;
  if (dueMinute <= (occurrenceKeyEpochMinute(lastKey) ?? anchorMinute)) return null;
  return localSlot(schedule.timezone, dueMinute);
};

export interface ComputeDueLocalDatesInput {
  readonly hourLocal: number;
  readonly minuteLocal: number;
  readonly timezone: string;
  /** Schedule creation instant (ISO); a first fire never predates it. */
  readonly createdAt: string;
  readonly lastOccurrenceKey: string | null;
  readonly nowMillis: number;
}

/**
 * All local dates whose daily boundary has passed and has not fired yet, in
 * ascending order. With a recorded last occurrence this enumerates every
 * missed day (catch-up); on first fire it yields only the most recent due day,
 * and only when that day's fire instant is at or after schedule creation.
 */
export const computeDueLocalDates = (input: ComputeDueLocalDatesInput): ReadonlyArray<string> => {
  const zone = Option.getOrNull(DateTime.zoneMakeNamed(input.timezone));
  if (zone === null) return [];
  const nowLocal = DateTime.setZone(DateTime.makeUnsafe(input.nowMillis), zone);
  const parts = DateTime.toParts(nowLocal);
  const todayLocal = `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`;
  const boundaryReachedToday =
    parts.hour > input.hourLocal ||
    (parts.hour === input.hourLocal && parts.minute >= input.minuteLocal);
  const todayEpochDay = isoDateToEpochDay(todayLocal);
  if (todayEpochDay === null) return [];
  const dueThroughEpochDay = boundaryReachedToday ? todayEpochDay : todayEpochDay - 1;

  const lastFiredDate =
    input.lastOccurrenceKey === null ? null : occurrenceKeyLocalDate(input.lastOccurrenceKey);
  if (lastFiredDate !== null) {
    const lastEpochDay = isoDateToEpochDay(lastFiredDate);
    if (lastEpochDay === null) return [];
    const days: Array<string> = [];
    for (let day = lastEpochDay + 1; day <= dueThroughEpochDay; day += 1) {
      days.push(epochDayToIsoDate(day));
    }
    return days;
  }

  // First fire: only the most recent due boundary, and never one that lands
  // before the schedule existed.
  const dueDate = epochDayToIsoDate(dueThroughEpochDay);
  const dueParts = isoDateToEpochDay(dueDate);
  if (dueParts === null) return [];
  const fireInstant = DateTime.makeZoned(
    {
      year: Number(dueDate.slice(0, 4)),
      month: Number(dueDate.slice(5, 7)),
      day: Number(dueDate.slice(8, 10)),
      hour: input.hourLocal,
      minute: input.minuteLocal,
      second: 0,
      millisecond: 0,
    },
    { timeZone: zone, adjustForTimeZone: true },
  );
  if (Option.isNone(fireInstant)) return [];
  const fireMillis = DateTime.toEpochMillis(fireInstant.value);
  const createdAtMillis = Date.parse(input.createdAt);
  if (Number.isNaN(createdAtMillis) || fireMillis < createdAtMillis) return [];
  if (fireMillis > input.nowMillis) return [];
  return [dueDate];
};

const targetProjectIds = (
  schedule: OrchestrationSchedule,
  model: OrchestrationReadModel,
): ReadonlyArray<ProjectId> => {
  const alive = model.projects.filter((project) => project.deletedAt === null);
  if (schedule.scope._tag === "project") {
    const projectId = schedule.scope.projectId;
    return alive.some((project) => project.id === projectId) ? [projectId] : [];
  }
  if (schedule.scope.projectIds === "all") {
    return alive.map((project) => project.id);
  }
  const selected = schedule.scope.projectIds;
  return selected.filter((id) => alive.some((project) => project.id === id));
};

const makeScheduleReactor = (options?: ScheduleReactorLiveOptions) =>
  Effect.gen(function* () {
    const engine = yield* OrchestrationEngineService;
    const authProbe = yield* ScheduleAuthProbe;
    const handoffGit = yield* ScheduleHandoffGit;
    const workingTreeProbe = yield* ScheduleWorkingTreeProbe;
    const providerInstances = yield* ScheduleProviderInstances;
    const backgroundPolicy = yield* BackgroundPolicy;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const sweepIntervalMs = Math.max(1, options?.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS);

    // Cross-schedule spacing gate: the schedule that last started a fire and
    // when (Effect clock millis). In-memory on purpose — a restart reopens the
    // gate, and the date-based occurrence keys still guarantee exactly-once.
    const lastFireStartRef = yield* Ref.make<{
      readonly scheduleId: OrchestrationSchedule["id"];
      readonly atMillis: number;
    } | null>(null);

    /**
     * Most recent handoff written by a previous occurrence: substitute
     * `{date}` for each of the previous HANDOFF_LOOKBACK_DAYS local dates and
     * take the first file that exists under the project workspace. Any
     * filesystem trouble degrades to "no handoff".
     */
    const readLatestHandoff = (input: {
      readonly workspaceRoot: string;
      readonly handoffPathTemplate: string;
      readonly dateLocal: string;
      readonly includeCurrentDate: boolean;
    }) =>
      Effect.gen(function* () {
        if (path.isAbsolute(input.handoffPathTemplate)) return null;
        const startEpochDay = isoDateToEpochDay(input.dateLocal);
        if (startEpochDay === null) return null;
        const templateHasDate = input.handoffPathTemplate.includes("{date}");
        const lookback = templateHasDate ? HANDOFF_LOOKBACK_DAYS : 1;
        const firstOffset = input.includeCurrentDate ? 0 : 1;
        for (let offset = firstOffset; offset <= lookback; offset += 1) {
          const date = epochDayToIsoDate(startEpochDay - offset);
          const relative = input.handoffPathTemplate.replaceAll("{date}", date);
          const filePath = path.join(input.workspaceRoot, relative);
          const contents = yield* fs
            .readFileString(filePath)
            .pipe(Effect.catch(() => Effect.succeed(null)));
          if (contents !== null) return contents;
        }
        return null;
      });

    /**
     * The turn's final assistant output: the checkpoint-recorded assistant
     * message when present, else the newest non-empty assistant message
     * belonging to the settled turn (or created after the occurrence began,
     * for providers that do not stamp turn ids on messages).
     */
    const finalAssistantText = (
      thread: OrchestrationThread,
      latestTurn: NonNullable<OrchestrationThread["latestTurn"]>,
      startedMillis: number,
    ): string | null => {
      const byId =
        latestTurn.assistantMessageId === null
          ? undefined
          : thread.messages.find((message) => message.id === latestTurn.assistantMessageId);
      if (byId !== undefined && byId.text.trim().length > 0) return byId.text;
      const candidates = thread.messages.filter(
        (message) =>
          message.role === "assistant" &&
          message.text.trim().length > 0 &&
          (message.turnId === latestTurn.turnId || Date.parse(message.createdAt) >= startedMillis),
      );
      return candidates.at(-1)?.text ?? null;
    };

    /**
     * Complete or fail running occurrences whose turn has settled. The signal
     * mirrors `settledTurnStateForSessionStatus`: the projector settles
     * `latestTurn` when the session leaves "running", so a settled latestTurn
     * newer than the occurrence start is the authoritative turn end. A clean
     * settle writes the handoff file atomically before the occurrence
     * completes; any other settle fails the occurrence and writes nothing, so
     * the next fire's lookback reads the last successful handoff.
     */
    const settleOccurrences = (
      schedule: OrchestrationSchedule,
      model: OrchestrationReadModel,
      nowIso: string,
    ) =>
      Effect.gen(function* () {
        for (const state of schedule.projectStates) {
          if (
            state.lastOccurrenceStatus !== "running" ||
            state.lastOccurrenceKey === null ||
            state.lastOccurrenceAt === null ||
            state.threadId === null
          ) {
            continue;
          }
          const startedMillis = Date.parse(state.lastOccurrenceAt);
          if (Number.isNaN(startedMillis)) continue;
          const thread = model.threads.find(
            (entry) => entry.id === state.threadId && entry.deletedAt === null,
          );
          const latestTurn = thread?.latestTurn ?? null;
          // No thread or no settled turn: still running (or gone); the
          // watchdog leash resolves a turn that never settles.
          if (thread === undefined || latestTurn === null || latestTurn.state === "running") {
            continue;
          }
          // Guard against the previous occurrence's settled turn: the
          // projector only marks latestTurn running once the provider session
          // starts, so a just-fired occurrence briefly still shows the prior
          // settle.
          const settledMillis =
            latestTurn.completedAt === null ? Number.NaN : Date.parse(latestTurn.completedAt);
          if (!(settledMillis >= startedMillis)) continue;

          const occurrenceKey = state.lastOccurrenceKey;
          const base = `scheduled:${schedule.id}:${occurrenceKey}`;
          const shared = {
            scheduleId: schedule.id,
            occurrenceKey,
            projectId: state.projectId,
          } as const;
          const failOccurrence = (message?: string) =>
            engine
              .dispatch({
                type: "schedule.occurrence.fail",
                commandId: CommandId.make(`${base}:fail-error`),
                ...shared,
                reason: "error",
                ...(message !== undefined ? { message } : {}),
                failedAt: nowIso,
              })
              .pipe(
                Effect.catch((error) =>
                  Effect.logWarning("schedule.reactor.settle-fail-rejected", {
                    scheduleId: schedule.id,
                    occurrenceKey,
                    error,
                  }),
                ),
              );

          if (latestTurn.state !== "completed") {
            // Interrupted or errored: never write the handoff — tomorrow must
            // read the last successful one.
            yield* failOccurrence();
            continue;
          }

          const project = model.projects.find(
            (entry) => entry.id === state.projectId && entry.deletedAt === null,
          );
          const content = finalAssistantText(thread, latestTurn, startedMillis);
          const dateLocal = occurrenceKeyLocalDate(occurrenceKey);
          if (
            project !== undefined &&
            content !== null &&
            dateLocal !== null &&
            !path.isAbsolute(schedule.handoffPathTemplate)
          ) {
            const handoffRelativePath = schedule.handoffPathTemplate.replaceAll(
              "{date}",
              dateLocal,
            );
            const filePath = path.join(project.workspaceRoot, handoffRelativePath);
            const written = yield* writeFileStringAtomically({ filePath, contents: content }).pipe(
              Effect.provideService(FileSystem.FileSystem, fs),
              Effect.provideService(Path.Path, path),
              Effect.map(() => true),
              Effect.catch((error) =>
                Effect.logWarning("schedule.reactor.handoff-write-failed", {
                  scheduleId: schedule.id,
                  occurrenceKey,
                  filePath,
                  error,
                }).pipe(Effect.map(() => false)),
              ),
            );
            if (!written) {
              yield* failOccurrence("Failed to write the handoff file.");
              continue;
            }
            if (schedule.handoffGitPolicy != null) {
              const gitResult = yield* handoffGit
                .apply({
                  workspaceRoot: project.workspaceRoot,
                  handoffRelativePath,
                  handoffPathTemplate: schedule.handoffPathTemplate,
                  policy: schedule.handoffGitPolicy,
                })
                .pipe(
                  Effect.as({ _tag: "ok" as const }),
                  Effect.catch((error) =>
                    Effect.logWarning("schedule.reactor.handoff-git-policy-failed", {
                      scheduleId: schedule.id,
                      occurrenceKey,
                      filePath,
                      policy: schedule.handoffGitPolicy,
                      error,
                    }).pipe(
                      Effect.as({
                        _tag: "error" as const,
                        message: error.message,
                      }),
                    ),
                  ),
                );
              if (gitResult._tag === "error") {
                yield* failOccurrence(gitResult.message);
                continue;
              }
            }
          } else {
            // A clean turn with nothing to hand off still completes; the next
            // fire's lookback simply reaches further back.
            yield* Effect.logDebug("schedule.reactor.handoff-not-written", {
              scheduleId: schedule.id,
              occurrenceKey,
            });
          }

          yield* engine
            .dispatch({
              type: "schedule.occurrence.complete",
              commandId: CommandId.make(`${base}:complete`),
              ...shared,
              completedAt: nowIso,
            })
            .pipe(
              Effect.catch((error) =>
                Effect.logWarning("schedule.reactor.settle-complete-rejected", {
                  scheduleId: schedule.id,
                  occurrenceKey,
                  error,
                }),
              ),
            );
        }
      });

    /** Interrupt and fail occurrences that outran their watchdog leashes. */
    const enforceWatchdogs = (schedule: OrchestrationSchedule, nowMillis: number, nowIso: string) =>
      Effect.gen(function* () {
        for (const state of schedule.projectStates) {
          if (
            state.lastOccurrenceStatus !== "running" ||
            state.lastOccurrenceKey === null ||
            state.lastOccurrenceAt === null ||
            state.threadId === null
          ) {
            continue;
          }
          const startedMillis = Date.parse(state.lastOccurrenceAt);
          if (Number.isNaN(startedMillis)) continue;
          // The v1 occurrence is a single turn started at occurrence start, so
          // both leashes anchor there; the tighter one fires first.
          const reason =
            nowMillis >= startedMillis + schedule.maxRunMinutes * 60_000
              ? ("timeout:run" as const)
              : nowMillis >= startedMillis + schedule.maxTurnMinutes * 60_000
                ? ("timeout:turn" as const)
                : null;
          if (reason === null) continue;
          const base = `scheduled:${schedule.id}:${state.lastOccurrenceKey}`;
          // Normal user-stop path; tolerate a turn that already settled.
          yield* engine
            .dispatch({
              type: "thread.turn.interrupt",
              commandId: CommandId.make(`${base}:interrupt`),
              threadId: state.threadId,
              createdAt: nowIso,
            })
            .pipe(
              Effect.catch((error) =>
                Effect.logDebug("schedule.reactor.watchdog-interrupt-skipped", {
                  scheduleId: schedule.id,
                  occurrenceKey: state.lastOccurrenceKey,
                  error,
                }),
              ),
            );
          yield* engine
            .dispatch({
              type: "schedule.occurrence.fail",
              commandId: CommandId.make(`${base}:fail-${reason.replace(":", "-")}`),
              scheduleId: schedule.id,
              occurrenceKey: state.lastOccurrenceKey,
              projectId: state.projectId,
              reason,
              failedAt: nowIso,
            })
            .pipe(
              Effect.catch((error) =>
                Effect.logWarning("schedule.reactor.watchdog-fail-rejected", {
                  scheduleId: schedule.id,
                  occurrenceKey: state.lastOccurrenceKey,
                  reason,
                  error,
                }),
              ),
            );
        }
      });

    const fireOccurrence = (input: {
      readonly schedule: OrchestrationSchedule;
      readonly projectId: ProjectId;
      readonly dateLocal: string;
      readonly model: OrchestrationReadModel;
      readonly nowIso: string;
      readonly occurrenceKey?: string;
      readonly trigger?: "scheduled" | "manual";
    }) =>
      Effect.gen(function* () {
        const { schedule, projectId, dateLocal, model } = input;
        const occurrenceKey =
          input.occurrenceKey ??
          scheduleOccurrenceKey({ scheduleId: schedule.id, dateLocal, projectId });
        const trigger = input.trigger ?? "scheduled";
        const base = `scheduled:${schedule.id}:${occurrenceKey}`;
        const projectState = schedule.projectStates.find((state) => state.projectId === projectId);
        const existingThread =
          projectState?.threadId != null
            ? (model.threads.find(
                (thread) => thread.id === projectState.threadId && thread.deletedAt === null,
              ) ?? null)
            : null;

        if (
          projectState?.lastOccurrenceStatus === "running" ||
          existingThread?.latestTurn?.state === "running" ||
          existingThread?.session?.status === "running"
        ) {
          yield* engine.dispatch({
            type: "schedule.occurrence.skip",
            commandId: CommandId.make(`${base}:skip-thread-running`),
            scheduleId: schedule.id,
            occurrenceKey,
            projectId,
            reason: "thread-running",
            skippedAt: input.nowIso,
            trigger,
          });
          yield* Effect.logInfo("schedule.reactor.occurrence-skipped", {
            scheduleId: schedule.id,
            projectId,
            occurrenceKey,
            reason: "thread-running",
          });
          return;
        }

        // Prefer the schedule's own model selection; otherwise borrow the
        // persistent thread's, falling back to the project's most recent
        // thread. With neither we cannot create the thread and skip this fire.
        const modelSelection: ModelSelection | null =
          schedule.modelSelection ??
          existingThread?.modelSelection ??
          model.threads
            .filter((thread) => thread.projectId === projectId && thread.deletedAt === null)
            .toSorted((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0]?.modelSelection ??
          null;

        const threadId =
          existingThread?.id ??
          ThreadId.make(`schedule-thread:${schedule.id}:${projectId}:${dateLocal}`);

        // Fail fast without burning a turn; the occurrence still records so
        // the day counts as attempted and the failure is visible.
        const startAndFail = Effect.fn("scheduleStartAndFail")(function* (failure: {
          readonly reason: "auth" | "provider" | "dirty";
          readonly message?: string;
        }) {
          yield* engine.dispatch({
            type: "schedule.occurrence.start",
            commandId: CommandId.make(base),
            scheduleId: schedule.id,
            occurrenceKey,
            projectId,
            threadId,
            startedAt: input.nowIso,
            trigger,
          });
          yield* engine.dispatch({
            type: "schedule.occurrence.fail",
            commandId: CommandId.make(`${base}:fail-${failure.reason}`),
            scheduleId: schedule.id,
            occurrenceKey,
            projectId,
            reason: failure.reason,
            ...(failure.message !== undefined ? { message: failure.message } : {}),
            failedAt: input.nowIso,
          });
        });

        // A stale model selection fails loudly: silently falling back to the
        // project default could quietly land on a far more expensive model.
        if (schedule.modelSelection != null) {
          const configured = yield* providerInstances.configuredInstanceIds;
          if (!configured.includes(schedule.modelSelection.instanceId)) {
            yield* startAndFail({
              reason: "provider",
              message: `Model selection references provider instance '${schedule.modelSelection.instanceId}', which is no longer configured.`,
            });
            return;
          }
        }

        const project = model.projects.find((entry) => entry.id === projectId);

        // Skip-if-dirty: an unattended run must never sweep up half-done work
        // a human left behind. Always a visible failure, never a silent skip.
        if (project !== undefined && scheduleSkipIfDirty(schedule)) {
          const dirty = yield* workingTreeProbe.isDirty(project.workspaceRoot);
          if (dirty) {
            yield* startAndFail({
              reason: "dirty",
              message: "Working tree has uncommitted changes; this run was skipped.",
            });
            return;
          }
        }

        const probe = yield* authProbe.probe({
          scheduleId: schedule.id,
          projectId,
          modelSelection,
        });
        if (probe._tag === "failed") {
          yield* startAndFail({
            reason: "auth",
            ...(probe.message !== undefined ? { message: probe.message } : {}),
          });
          return;
        }

        if (existingThread === null && modelSelection === null) {
          yield* startAndFail({
            reason: "provider",
            message: "No model selection is available for this project.",
          });
          return;
        }

        if (existingThread === null && modelSelection !== null) {
          yield* engine.dispatch({
            type: "thread.create",
            commandId: CommandId.make(`${base}:thread-create`),
            threadId,
            projectId,
            title: "Scheduled chat",
            modelSelection,
            runtimeMode: DEFAULT_RUNTIME_MODE,
            interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
            branch: null,
            worktreePath: null,
            origin: scheduleThreadOrigin(schedule.id),
            createdAt: input.nowIso,
          });
        }

        yield* engine.dispatch({
          type: "schedule.occurrence.start",
          commandId: CommandId.make(base),
          scheduleId: schedule.id,
          occurrenceKey,
          projectId,
          threadId,
          startedAt: input.nowIso,
          trigger,
        });

        const handoff =
          project === undefined
            ? null
            : yield* readLatestHandoff({
                workspaceRoot: project.workspaceRoot,
                handoffPathTemplate: schedule.handoffPathTemplate,
                dateLocal,
                includeCurrentDate: schedule.interval != null,
              });
        // Server-owned prefix: the agent that knows its leash budgets its own
        // work, and a fixed handoff shape is what lets day-15's run use
        // day-14's file.
        const serverPrefix = [
          `[Scheduled run] You have ${schedule.maxTurnMinutes} minutes for this turn (${schedule.maxRunMinutes} minutes for the whole run); scope your work to finish within it.`,
          "End your reply with a handoff summary covering:",
          "- What was done",
          "- What is blocked",
          "- What tomorrow should check first",
        ].join("\n");
        const text = [serverPrefix, ...(handoff === null ? [] : [handoff]), schedule.prompt].join(
          "\n\n",
        );

        yield* engine.dispatch({
          type: "thread.turn.start",
          commandId: CommandId.make(`${base}:turn`),
          threadId,
          message: {
            messageId: MessageId.make(`${base}:message`),
            role: "user",
            text,
            attachments: [],
          },
          // Only override the thread's model when the schedule carries its
          // own selection; otherwise the turn keeps the thread's default.
          ...(schedule.modelSelection != null ? { modelSelection: schedule.modelSelection } : {}),
          runtimeMode: existingThread?.runtimeMode ?? DEFAULT_RUNTIME_MODE,
          interactionMode: existingThread?.interactionMode ?? DEFAULT_PROVIDER_INTERACTION_MODE,
          sessionMode: "fresh",
          createdAt: input.nowIso,
        });
      });

    const sweep = Effect.gen(function* () {
      // A suspending host gets no fires; catch-up covers the gap on wake.
      const policy = yield* backgroundPolicy.snapshot;
      if (policy.hostPower.suspended) return;

      const nowUtc = yield* DateTime.now;
      const nowMillis = DateTime.toEpochMillis(nowUtc);
      const nowIso = DateTime.formatIso(nowUtc);
      const preSettle = yield* engine.currentReadModel;

      // Settle first (even while paused: a running occurrence must land), and
      // re-read the model so the watchdog and fire phases below never act on
      // an occurrence this sweep just completed or failed.
      for (const schedule of preSettle.schedules ?? []) {
        if (schedule.deletedAt !== null) continue;
        yield* settleOccurrences(schedule, preSettle, nowIso);
      }
      const model = yield* engine.currentReadModel;

      for (const schedule of model.schedules ?? []) {
        if (schedule.deletedAt !== null) continue;
        // Leashes apply even while paused: pausing must not orphan a running
        // occurrence past its budget.
        yield* enforceWatchdogs(schedule, nowMillis, nowIso);
        if (schedule.pausedAt !== null) continue;
        const runningState = schedule.projectStates.find(
          (state) => state.lastOccurrenceStatus === "running",
        );
        const pendingManual = schedule.projectStates.find(
          (state) => state.manualRunRequestKey != null,
        );
        if (pendingManual?.manualRunRequestKey != null) {
          if (runningState != null && runningState.projectId !== pendingManual.projectId) {
            continue;
          }
          const slot = localSlot(schedule.timezone, Math.floor(nowMillis / 60_000));
          yield* fireOccurrence({
            schedule,
            projectId: pendingManual.projectId,
            dateLocal: slot?.dateLocal ?? DateTime.formatIsoDateUtc(nowUtc),
            occurrenceKey: pendingManual.manualRunRequestKey,
            trigger: "manual",
            model,
            nowIso,
          }).pipe(
            Effect.catch((error) =>
              Effect.logWarning("schedule.reactor.manual-fire-failed", {
                scheduleId: schedule.id,
                projectId: pendingManual.projectId,
                error,
              }),
            ),
          );
          continue;
        }
        // One running occurrence per schedule keeps catch-up and environment
        // fan-out sequential instead of bursting provider sessions.
        if (runningState != null) {
          const cursor =
            runningState.lastScheduledOccurrenceKey ?? runningState.lastOccurrenceKey ?? null;
          const intervalSlot = dueIntervalSlot(schedule, cursor, nowMillis);
          if (intervalSlot != null) {
            const occurrenceKey = scheduleOccurrenceKey({
              scheduleId: schedule.id,
              dateLocal: intervalSlot.slotLocal,
              projectId: runningState.projectId,
            });
            yield* fireOccurrence({
              schedule,
              projectId: runningState.projectId,
              dateLocal: intervalSlot.dateLocal,
              occurrenceKey,
              model,
              nowIso,
            }).pipe(
              Effect.catch((error) =>
                Effect.logWarning("schedule.reactor.skip-overlap-failed", {
                  scheduleId: schedule.id,
                  projectId: runningState.projectId,
                  occurrenceKey,
                  error,
                }),
              ),
            );
          }
          continue;
        }

        const dueFires: Array<{
          readonly projectId: ProjectId;
          readonly dueDates: ReadonlyArray<string>;
        }> = [];
        for (const projectId of targetProjectIds(schedule, model)) {
          const projectState = schedule.projectStates.find(
            (state) => state.projectId === projectId,
          );
          if (projectState?.lastOccurrenceStatus === "running") continue;
          const cursor =
            projectState?.lastScheduledOccurrenceKey ?? projectState?.lastOccurrenceKey ?? null;
          const intervalSlot = dueIntervalSlot(schedule, cursor, nowMillis);
          const dueDates =
            schedule.interval == null
              ? computeDueLocalDates({
                  hourLocal: schedule.hourLocal,
                  minuteLocal: schedule.minuteLocal,
                  timezone: schedule.timezone,
                  createdAt: schedule.createdAt,
                  lastOccurrenceKey: cursor,
                  nowMillis,
                })
              : intervalSlot === null
                ? []
                : [intervalSlot.slotLocal];
          if (dueDates.length > 0) dueFires.push({ projectId, dueDates });
        }
        if (dueFires.length === 0) continue;

        // Cross-schedule spacing: another schedule fired less than the gate
        // ago, so this one stays due and a later sweep picks it up. Fan-out
        // (and catch-up) within one schedule's fire is deliberately not gated.
        const lastFireStart = yield* Ref.get(lastFireStartRef);
        if (
          lastFireStart !== null &&
          lastFireStart.scheduleId !== schedule.id &&
          nowMillis - lastFireStart.atMillis < CROSS_SCHEDULE_FIRE_SPACING_MS
        ) {
          yield* Effect.logDebug("schedule.reactor.fire-spaced", {
            scheduleId: schedule.id,
            sinceLastFireMs: nowMillis - lastFireStart.atMillis,
          });
          continue;
        }
        yield* Ref.set(lastFireStartRef, { scheduleId: schedule.id, atMillis: nowMillis });

        const nextFire = dueFires[0]!;
        const slotLocal = nextFire.dueDates[0]!;
        const dateLocal = occurrenceKeyLocalDate(slotLocal) ?? slotLocal;
        yield* fireOccurrence({
          schedule,
          projectId: nextFire.projectId,
          dateLocal,
          ...(schedule.interval == null
            ? {}
            : {
                occurrenceKey: scheduleOccurrenceKey({
                  scheduleId: schedule.id,
                  dateLocal: slotLocal,
                  projectId: nextFire.projectId,
                }),
              }),
          model,
          nowIso,
        }).pipe(
          Effect.catch((error) =>
            Effect.logWarning("schedule.reactor.fire-failed", {
              scheduleId: schedule.id,
              projectId: nextFire.projectId,
              dateLocal,
              error,
            }),
          ),
        );
      }
    });

    const sweepNow: ScheduleReactorShape["sweepNow"] = sweep.pipe(
      Effect.catch((error: unknown) =>
        Effect.logWarning("schedule.reactor.sweep-failed", { error }),
      ),
      Effect.catchDefect((defect: unknown) =>
        Effect.logWarning("schedule.reactor.sweep-defect", { defect }),
      ),
    );

    const start: ScheduleReactorShape["start"] = () =>
      Effect.gen(function* () {
        // Deliberately a plain scoped fork (not parked): scheduled chats must
        // tick whether or not any client keeps the server active.
        yield* Effect.forkScoped(
          sweepNow.pipe(Effect.repeat(Schedule.spaced(Duration.millis(sweepIntervalMs)))),
        );
        yield* Effect.logInfo("schedule.reactor.started", { sweepIntervalMs });
      });

    return { start, sweepNow } satisfies ScheduleReactorShape;
  });

export const makeScheduleReactorLive = (options?: ScheduleReactorLiveOptions) =>
  Layer.effect(ScheduleReactor, makeScheduleReactor(options));

export const ScheduleReactorLive = makeScheduleReactorLive();
