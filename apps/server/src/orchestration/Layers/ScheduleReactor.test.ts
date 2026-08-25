import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ScheduleId,
  ThreadId,
  TurnId,
  scheduleOccurrenceKey,
  scheduleThreadOrigin,
  type BackgroundPolicySnapshot,
  type OrchestrationCommand,
  type OrchestrationEvent,
  type OrchestrationReadModel,
  type OrchestrationSession,
  type ScheduleHandoffGitPolicy,
  type ScheduleInterval,
  type ScheduleScope,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import { BackgroundPolicy } from "../../background/BackgroundPolicy.ts";
import { decideOrchestrationCommand } from "../decider.ts";
import { createEmptyReadModel, projectEvent } from "../projector.ts";
import {
  OrchestrationEngineService,
  type OrchestrationEngineShape,
} from "../Services/OrchestrationEngine.ts";
import { ScheduleAuthProbe, type ScheduleAuthProbeResult } from "../Services/ScheduleAuthProbe.ts";
import {
  ScheduleHandoffGit,
  ScheduleHandoffGitError,
  type ScheduleHandoffGitInput,
} from "../Services/ScheduleHandoffGit.ts";
import { ScheduleProviderInstances } from "../Services/ScheduleProviderInstances.ts";
import { ScheduleReactor } from "../Services/ScheduleReactor.ts";
import { ScheduleWorkingTreeProbe } from "../Services/ScheduleWorkingTreeProbe.ts";
import { makeScheduleReactorLive } from "./ScheduleReactor.ts";

const baseNow = "2026-01-02T00:00:00.000Z";
const projectA = ProjectId.make("project-a");
const projectB = ProjectId.make("project-b");
const scheduleId = ScheduleId.make("schedule-1");
const modelSelection = { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5-codex" };

const cmd = (value: string) => CommandId.make(value);
const at = (iso: string) => TestClock.setTime(Date.parse(iso));

const zeroUtc = DateTime.makeUnsafe(0);
const idlePolicySnapshot: BackgroundPolicySnapshot = {
  hostPower: {
    source: "unknown",
    idle: "unknown",
    idleSeconds: null,
    locked: "unknown",
    suspended: false,
    onBattery: "unknown",
    lowPowerMode: "unknown",
    thermalState: "unknown",
    stale: false,
    updatedAt: zeroUtc,
  },
  leases: [],
  activeForegroundLeaseCount: 0,
  activeScopeKeys: [],
  shouldRunOpportunisticWork: false,
  updatedAt: zeroUtc,
};

type DispatchedCommand = OrchestrationCommand;
const ofType = <Type extends OrchestrationCommand["type"]>(
  commands: ReadonlyArray<DispatchedCommand>,
  type: Type,
) =>
  commands.filter(
    (command): command is Extract<OrchestrationCommand, { type: Type }> => command.type === type,
  );

/**
 * A miniature in-memory engine over the real decider and projector: dispatch
 * decides, projects, and records receipts, so exactly-once and read-model
 * behavior in these tests is the production logic, not a simulation.
 */
const makeTestBed = Effect.fn("makeTestBed")(function* (options?: {
  readonly authResult?: ScheduleAuthProbeResult;
  /** Workspace roots the stubbed working-tree probe reports as dirty. */
  readonly dirtyRoots?: ReadonlyArray<string>;
  /** Configured provider instance ids; defaults to the seed selections. */
  readonly configuredInstanceIds?: ReadonlyArray<ProviderInstanceId>;
  readonly handoffGitFailure?: string;
}) {
  const crypto = yield* Crypto.Crypto;
  const modelRef = yield* Ref.make(createEmptyReadModel(baseNow));
  const authRef = yield* Ref.make<ScheduleAuthProbeResult>(
    options?.authResult ?? { _tag: "unknown" },
  );
  const receipts = new Set<string>();
  const dispatched: Array<DispatchedCommand> = [];
  const handoffGitCalls: Array<ScheduleHandoffGitInput> = [];

  const dispatch: OrchestrationEngineShape["dispatch"] = (command) =>
    Effect.gen(function* () {
      const model = yield* Ref.get(modelRef);
      if (receipts.has(command.commandId)) {
        return { sequence: model.snapshotSequence };
      }
      const decided = yield* decideOrchestrationCommand({ command, readModel: model }).pipe(
        Effect.provideService(Crypto.Crypto, crypto),
        Effect.catch((error) =>
          error._tag === "OrchestrationCommandInvariantError"
            ? Effect.fail(error)
            : Effect.die(error),
        ),
      );
      const events: ReadonlyArray<Omit<OrchestrationEvent, "sequence">> = Array.isArray(decided)
        ? decided
        : [decided];
      let next = model;
      let sequence = model.snapshotSequence;
      for (const event of events) {
        sequence += 1;
        next = yield* projectEvent(next, { ...event, sequence } as OrchestrationEvent);
      }
      yield* Ref.set(modelRef, next);
      receipts.add(command.commandId);
      dispatched.push(command);
      return { sequence };
    });

  const engine: OrchestrationEngineShape = {
    dispatch,
    readEvents: () => Stream.empty,
    streamDomainEvents: Stream.empty as Stream.Stream<OrchestrationEvent>,
    latestSequence: Ref.get(modelRef).pipe(Effect.map((model) => model.snapshotSequence)),
    currentReadModel: Ref.get(modelRef),
  };

  const dirtyRoots = new Set(options?.dirtyRoots ?? []);
  const configuredInstanceIds = options?.configuredInstanceIds ?? [
    ProviderInstanceId.make("codex"),
    ProviderInstanceId.make("claude"),
  ];

  const reactorLayer = makeScheduleReactorLive().pipe(
    Layer.provide(Layer.succeed(OrchestrationEngineService, engine)),
    Layer.provide(Layer.succeed(ScheduleAuthProbe, { probe: () => Ref.get(authRef) })),
    Layer.provide(
      Layer.succeed(ScheduleHandoffGit, {
        apply: (input) =>
          Effect.sync(() => {
            handoffGitCalls.push(input);
          }).pipe(
            Effect.flatMap(() =>
              options?.handoffGitFailure === undefined
                ? Effect.void
                : Effect.fail(
                    new ScheduleHandoffGitError({
                      workspaceRoot: input.workspaceRoot,
                      detail: options.handoffGitFailure,
                    }),
                  ),
            ),
          ),
      }),
    ),
    Layer.provide(
      Layer.succeed(ScheduleWorkingTreeProbe, {
        isDirty: (workspaceRoot: string) => Effect.succeed(dirtyRoots.has(workspaceRoot)),
      }),
    ),
    Layer.provide(
      Layer.succeed(ScheduleProviderInstances, {
        configuredInstanceIds: Effect.succeed(configuredInstanceIds),
      }),
    ),
    Layer.provide(Layer.mock(BackgroundPolicy)({ snapshot: Effect.succeed(idlePolicySnapshot) })),
    Layer.provide(NodeServices.layer),
  );
  const reactor = yield* Effect.service(ScheduleReactor).pipe(Effect.provide(reactorLayer));

  const readModel = Ref.get(modelRef);
  const projectState = (projectId: ProjectId) =>
    readModel.pipe(
      Effect.map(
        (model: OrchestrationReadModel) =>
          model.schedules
            ?.find((entry) => entry.id === scheduleId)
            ?.projectStates.find((entry) => entry.projectId === projectId) ?? null,
      ),
    );

  const seedProject = (projectId: ProjectId, workspaceRoot?: string) =>
    Effect.gen(function* () {
      yield* dispatch({
        type: "project.create",
        commandId: cmd(`seed-project-${projectId}`),
        projectId,
        title: `Project ${projectId}`,
        workspaceRoot: workspaceRoot ?? `/tmp/${projectId}`,
        createdAt: baseNow,
      });
      // A prior thread gives the reactor a model selection to borrow for the
      // schedule's persistent thread.
      yield* dispatch({
        type: "thread.create",
        commandId: cmd(`seed-thread-${projectId}`),
        threadId: ThreadId.make(`seed-thread-${projectId}`),
        projectId,
        title: "Seed thread",
        modelSelection,
        runtimeMode: "approval-required",
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        branch: null,
        worktreePath: null,
        createdAt: baseNow,
      });
    });

  const seedSchedule = (input?: {
    readonly id?: ScheduleId;
    readonly scope?: ScheduleScope;
    readonly hourLocal?: number;
    readonly minuteLocal?: number;
    readonly timezone?: string;
    readonly interval?: ScheduleInterval;
    readonly handoffGitPolicy?: ScheduleHandoffGitPolicy;
    readonly modelSelection?: typeof modelSelection;
  }) =>
    dispatch({
      type: "project.schedule.create",
      commandId: cmd(`seed-schedule-${input?.id ?? scheduleId}`),
      scheduleId: input?.id ?? scheduleId,
      scope: input?.scope ?? { _tag: "project", projectId: projectA },
      hourLocal: input?.hourLocal ?? 9,
      minuteLocal: input?.minuteLocal ?? 0,
      timezone: input?.timezone ?? "UTC",
      ...(input?.interval !== undefined ? { interval: input.interval } : {}),
      ...(input?.handoffGitPolicy !== undefined
        ? { handoffGitPolicy: input.handoffGitPolicy }
        : {}),
      prompt: "Daily check-in: read the handoff and continue.",
      ...(input?.modelSelection !== undefined ? { modelSelection: input.modelSelection } : {}),
      createdAt: baseNow,
    });

  const sessionAt = (
    threadId: ThreadId,
    status: OrchestrationSession["status"],
    activeTurnId: TurnId | null,
    updatedAt: string,
  ): OrchestrationSession => ({
    threadId,
    status,
    providerName: "codex",
    runtimeMode: "approval-required",
    activeTurnId,
    lastError: null,
    updatedAt,
  });

  /**
   * Drive one provider turn to a settled state through real commands: session
   * running, optional assistant output, then the settling session status —
   * the same `settledTurnStateForSessionStatus` path production follows.
   */
  const settleTurn = (input: {
    readonly threadId: ThreadId;
    readonly turnId: string;
    readonly text: string | null;
    readonly startAt: string;
    readonly endAt: string;
    readonly endStatus?: "idle" | "error" | "interrupted";
  }) =>
    Effect.gen(function* () {
      const turnId = TurnId.make(input.turnId);
      yield* dispatch({
        type: "thread.session.set",
        commandId: cmd(`${input.turnId}-running`),
        threadId: input.threadId,
        session: sessionAt(input.threadId, "running", turnId, input.startAt),
        createdAt: input.startAt,
      });
      if (input.text !== null) {
        yield* dispatch({
          type: "thread.message.assistant.delta",
          commandId: cmd(`${input.turnId}-delta`),
          threadId: input.threadId,
          messageId: MessageId.make(`${input.turnId}-assistant`),
          delta: input.text,
          turnId,
          createdAt: input.startAt,
        });
        yield* dispatch({
          type: "thread.message.assistant.complete",
          commandId: cmd(`${input.turnId}-done`),
          threadId: input.threadId,
          messageId: MessageId.make(`${input.turnId}-assistant`),
          turnId,
          createdAt: input.endAt,
        });
      }
      yield* dispatch({
        type: "thread.session.set",
        commandId: cmd(`${input.turnId}-settled`),
        threadId: input.threadId,
        session: sessionAt(input.threadId, input.endStatus ?? "idle", null, input.endAt),
        createdAt: input.endAt,
      });
    });

  return {
    reactor,
    dispatch,
    dispatched,
    handoffGitCalls,
    readModel,
    projectState,
    seedProject,
    seedSchedule,
    settleTurn,
  };
});

const keyFor = (dateLocal: string, projectId: ProjectId = projectA) =>
  scheduleOccurrenceKey({ scheduleId, dateLocal, projectId });

it.layer(NodeServices.layer)("ScheduleReactor", (it) => {
  it.effect("fires exactly at the boundary with a fresh session in the schedule's thread", () =>
    Effect.gen(function* () {
      const bed = yield* makeTestBed();
      yield* bed.seedProject(projectA);
      yield* bed.seedSchedule();

      yield* at("2026-01-02T08:59:00.000Z");
      yield* bed.reactor.sweepNow;
      expect(ofType(bed.dispatched, "schedule.occurrence.start")).toHaveLength(0);

      yield* at("2026-01-02T09:00:00.000Z");
      yield* bed.reactor.sweepNow;

      const starts = ofType(bed.dispatched, "schedule.occurrence.start");
      expect(starts).toHaveLength(1);
      expect(starts[0]).toMatchObject({
        occurrenceKey: keyFor("2026-01-02"),
        commandId: `scheduled:${scheduleId}:${keyFor("2026-01-02")}`,
        projectId: projectA,
      });

      const creates = ofType(bed.dispatched, "thread.create").filter(
        (command) => command.origin === scheduleThreadOrigin(scheduleId),
      );
      expect(creates).toHaveLength(1);

      const turns = ofType(bed.dispatched, "thread.turn.start");
      expect(turns).toHaveLength(1);
      expect(turns[0]).toMatchObject({
        threadId: creates[0]!.threadId,
        sessionMode: "fresh",
        commandId: `scheduled:${scheduleId}:${keyFor("2026-01-02")}:turn`,
      });
      expect(turns[0]!.message.text).toContain("Daily check-in");

      const state = yield* bed.projectState(projectA);
      expect(state).toMatchObject({
        threadId: creates[0]!.threadId,
        lastOccurrenceKey: keyFor("2026-01-02"),
        lastOccurrenceStatus: "running",
      });
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("respects the schedule's timezone for the boundary", () =>
    Effect.gen(function* () {
      const bed = yield* makeTestBed();
      yield* bed.seedProject(projectA);
      // 09:00 in New York is 14:00 UTC in January (EST).
      yield* bed.seedSchedule({ timezone: "America/New_York" });

      yield* at("2026-01-02T13:59:00.000Z");
      yield* bed.reactor.sweepNow;
      expect(ofType(bed.dispatched, "schedule.occurrence.start")).toHaveLength(0);

      yield* at("2026-01-02T14:00:00.000Z");
      yield* bed.reactor.sweepNow;
      const starts = ofType(bed.dispatched, "schedule.occurrence.start");
      expect(starts).toHaveLength(1);
      expect(starts[0]!.occurrenceKey).toBe(keyFor("2026-01-02"));
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("does not double-fire across repeated sweeps", () =>
    Effect.gen(function* () {
      const bed = yield* makeTestBed();
      yield* bed.seedProject(projectA);
      yield* bed.seedSchedule();

      yield* at("2026-01-02T09:00:00.000Z");
      yield* bed.reactor.sweepNow;
      yield* bed.reactor.sweepNow;
      yield* TestClock.adjust(Duration.minutes(5));
      yield* bed.reactor.sweepNow;
      expect(ofType(bed.dispatched, "schedule.occurrence.start")).toHaveLength(1);

      // Even after the occurrence settles, the same local day never re-fires.
      yield* bed.dispatch({
        type: "schedule.occurrence.complete",
        commandId: cmd("complete-jan-2"),
        scheduleId,
        occurrenceKey: keyFor("2026-01-02"),
        projectId: projectA,
        completedAt: "2026-01-02T09:05:00.000Z",
      });
      yield* TestClock.adjust(Duration.hours(2));
      yield* bed.reactor.sweepNow;
      expect(ofType(bed.dispatched, "schedule.occurrence.start")).toHaveLength(1);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("catches up one occurrence per missed day after a clock jump", () =>
    Effect.gen(function* () {
      const bed = yield* makeTestBed();
      yield* bed.seedProject(projectA);
      yield* bed.seedSchedule();

      yield* at("2026-01-02T09:00:00.000Z");
      yield* bed.reactor.sweepNow;
      yield* bed.dispatch({
        type: "schedule.occurrence.complete",
        commandId: cmd("complete-jan-2"),
        scheduleId,
        occurrenceKey: keyFor("2026-01-02"),
        projectId: projectA,
        completedAt: "2026-01-02T09:05:00.000Z",
      });

      // Host slept through Jan 3 and 4; wakes mid-morning Jan 5.
      yield* at("2026-01-05T09:30:00.000Z");
      yield* bed.reactor.sweepNow;
      expect(
        ofType(bed.dispatched, "schedule.occurrence.start").map((command) => command.occurrenceKey),
      ).toEqual([keyFor("2026-01-02"), keyFor("2026-01-03")]);

      yield* bed.dispatch({
        type: "schedule.occurrence.complete",
        commandId: cmd("complete-jan-3"),
        scheduleId,
        occurrenceKey: keyFor("2026-01-03"),
        projectId: projectA,
        completedAt: "2026-01-05T09:31:00.000Z",
      });
      yield* bed.reactor.sweepNow;
      expect(ofType(bed.dispatched, "schedule.occurrence.start").at(-1)?.occurrenceKey).toBe(
        keyFor("2026-01-04"),
      );

      yield* bed.dispatch({
        type: "schedule.occurrence.complete",
        commandId: cmd("complete-jan-4"),
        scheduleId,
        occurrenceKey: keyFor("2026-01-04"),
        projectId: projectA,
        completedAt: "2026-01-05T09:32:00.000Z",
      });
      yield* bed.reactor.sweepNow;

      const starts = ofType(bed.dispatched, "schedule.occurrence.start");
      expect(starts.map((command) => command.occurrenceKey)).toEqual([
        keyFor("2026-01-02"),
        keyFor("2026-01-03"),
        keyFor("2026-01-04"),
        keyFor("2026-01-05"),
      ]);
      const threadIds = new Set(starts.map((command) => command.threadId));
      expect(threadIds.size).toBe(1);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("paused schedules never fire", () =>
    Effect.gen(function* () {
      const bed = yield* makeTestBed();
      yield* bed.seedProject(projectA);
      yield* bed.seedSchedule();
      yield* bed.dispatch({
        type: "project.schedule.pause",
        commandId: cmd("pause"),
        scheduleId,
      });

      yield* at("2026-01-02T09:00:00.000Z");
      yield* bed.reactor.sweepNow;
      yield* at("2026-01-04T12:00:00.000Z");
      yield* bed.reactor.sweepNow;

      expect(ofType(bed.dispatched, "schedule.occurrence.start")).toHaveLength(0);
      expect(ofType(bed.dispatched, "thread.turn.start")).toHaveLength(0);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("auth-probe failure fails the occurrence with reason 'auth' and starts no turn", () =>
    Effect.gen(function* () {
      const bed = yield* makeTestBed({
        authResult: { _tag: "failed", message: "Claude credentials expired" },
      });
      yield* bed.seedProject(projectA);
      yield* bed.seedSchedule();

      yield* at("2026-01-02T09:00:00.000Z");
      yield* bed.reactor.sweepNow;

      const fails = ofType(bed.dispatched, "schedule.occurrence.fail");
      expect(fails).toHaveLength(1);
      expect(fails[0]).toMatchObject({
        occurrenceKey: keyFor("2026-01-02"),
        reason: "auth",
        message: "Claude credentials expired",
      });
      expect(ofType(bed.dispatched, "thread.turn.start")).toHaveLength(0);
      expect(ofType(bed.dispatched, "thread.create")).toHaveLength(1); // only the seed thread

      const state = yield* bed.projectState(projectA);
      expect(state).toMatchObject({
        lastOccurrenceStatus: "failed",
        lastOccurrenceFailureReason: "auth",
      });
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("run-timeout interrupts the turn and fails the occurrence with 'timeout:run'", () =>
    Effect.gen(function* () {
      const bed = yield* makeTestBed();
      yield* bed.seedProject(projectA);
      yield* bed.seedSchedule();

      yield* at("2026-01-02T09:00:00.000Z");
      yield* bed.reactor.sweepNow;

      // Past maxRunMinutes (default 15).
      yield* TestClock.adjust(Duration.minutes(16));
      yield* bed.reactor.sweepNow;

      const interrupts = ofType(bed.dispatched, "thread.turn.interrupt");
      expect(interrupts).toHaveLength(1);
      const fails = ofType(bed.dispatched, "schedule.occurrence.fail");
      expect(fails).toHaveLength(1);
      expect(fails[0]).toMatchObject({
        occurrenceKey: keyFor("2026-01-02"),
        reason: "timeout:run",
      });

      const state = yield* bed.projectState(projectA);
      expect(state?.lastOccurrenceFailureReason).toBe("timeout:run");
      expect(interrupts[0]!.threadId).toBe(state?.threadId);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("turn-timeout inside the run budget fails with 'timeout:turn'", () =>
    Effect.gen(function* () {
      const bed = yield* makeTestBed();
      yield* bed.seedProject(projectA);
      yield* bed.seedSchedule();

      yield* at("2026-01-02T09:00:00.000Z");
      yield* bed.reactor.sweepNow;

      // Past maxTurnMinutes (default 10) but inside maxRunMinutes (15).
      yield* TestClock.adjust(Duration.minutes(11));
      yield* bed.reactor.sweepNow;

      const fails = ofType(bed.dispatched, "schedule.occurrence.fail");
      expect(fails).toHaveLength(1);
      expect(fails[0]!.reason).toBe("timeout:turn");
      expect(ofType(bed.dispatched, "thread.turn.interrupt")).toHaveLength(1);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("environment scope fans out one project at a time", () =>
    Effect.gen(function* () {
      const bed = yield* makeTestBed();
      yield* bed.seedProject(projectA);
      yield* bed.seedProject(projectB);
      yield* bed.seedSchedule({
        scope: { _tag: "environment", projectIds: [projectA, projectB] },
      });

      yield* at("2026-01-02T09:00:00.000Z");
      yield* bed.reactor.sweepNow;

      const firstStarts = ofType(bed.dispatched, "schedule.occurrence.start");
      expect(firstStarts.map((command) => command.occurrenceKey)).toEqual([
        keyFor("2026-01-02", projectA),
      ]);

      // A second sweep cannot start project B while project A is running.
      yield* bed.reactor.sweepNow;
      expect(ofType(bed.dispatched, "schedule.occurrence.start")).toHaveLength(1);

      yield* bed.dispatch({
        type: "schedule.occurrence.complete",
        commandId: cmd("complete-a-jan-2"),
        scheduleId,
        occurrenceKey: keyFor("2026-01-02", projectA),
        projectId: projectA,
        completedAt: "2026-01-02T09:05:00.000Z",
      });
      yield* bed.reactor.sweepNow;

      const starts = ofType(bed.dispatched, "schedule.occurrence.start");
      expect(starts.map((command) => command.occurrenceKey)).toEqual([
        keyFor("2026-01-02", projectA),
        keyFor("2026-01-02", projectB),
      ]);
      expect(new Set(starts.map((command) => command.threadId)).size).toBe(2);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("clean settle writes the handoff atomically and completes the occurrence", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "sched-handoff-" });
        const bed = yield* makeTestBed();
        yield* bed.seedProject(projectA, root);
        yield* bed.seedSchedule({ handoffGitPolicy: "commit" });

        yield* at("2026-01-02T09:00:00.000Z");
        yield* bed.reactor.sweepNow;
        const running = yield* bed.projectState(projectA);
        yield* bed.settleTurn({
          threadId: running!.threadId!,
          turnId: "turn-jan-2",
          text: "Morning summary for Jan 2.",
          startAt: "2026-01-02T09:00:30.000Z",
          endAt: "2026-01-02T09:05:00.000Z",
        });

        yield* TestClock.adjust(Duration.minutes(6));
        yield* bed.reactor.sweepNow;

        const completes = ofType(bed.dispatched, "schedule.occurrence.complete");
        expect(completes).toHaveLength(1);
        expect(completes[0]).toMatchObject({
          occurrenceKey: keyFor("2026-01-02"),
          commandId: `scheduled:${scheduleId}:${keyFor("2026-01-02")}:complete`,
          projectId: projectA,
        });
        expect(ofType(bed.dispatched, "schedule.occurrence.fail")).toHaveLength(0);

        const state = yield* bed.projectState(projectA);
        expect(state?.lastOccurrenceStatus).toBe("completed");

        const contents = yield* fs.readFileString(path.join(root, "handoff", "2026-01-02.md"));
        expect(contents).toBe("Morning summary for Jan 2.");
        expect(bed.handoffGitCalls).toEqual([
          {
            workspaceRoot: root,
            handoffRelativePath: "handoff/2026-01-02.md",
            handoffPathTemplate: "handoff/{date}.md",
            policy: "commit",
          },
        ]);
      }),
    ).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("errored settle fails the occurrence with 'error' and writes no handoff", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "sched-handoff-" });
        const bed = yield* makeTestBed();
        yield* bed.seedProject(projectA, root);
        yield* bed.seedSchedule();

        yield* at("2026-01-02T09:00:00.000Z");
        yield* bed.reactor.sweepNow;
        const running = yield* bed.projectState(projectA);
        yield* bed.settleTurn({
          threadId: running!.threadId!,
          turnId: "turn-jan-2",
          text: "Partial output before the provider crashed.",
          startAt: "2026-01-02T09:00:30.000Z",
          endAt: "2026-01-02T09:04:00.000Z",
          endStatus: "error",
        });

        yield* TestClock.adjust(Duration.minutes(5));
        yield* bed.reactor.sweepNow;

        const fails = ofType(bed.dispatched, "schedule.occurrence.fail");
        expect(fails).toHaveLength(1);
        expect(fails[0]).toMatchObject({
          occurrenceKey: keyFor("2026-01-02"),
          commandId: `scheduled:${scheduleId}:${keyFor("2026-01-02")}:fail-error`,
          reason: "error",
        });
        expect(ofType(bed.dispatched, "schedule.occurrence.complete")).toHaveLength(0);
        expect(yield* fs.exists(path.join(root, "handoff", "2026-01-02.md"))).toBe(false);

        const state = yield* bed.projectState(projectA);
        expect(state).toMatchObject({
          lastOccurrenceStatus: "failed",
          lastOccurrenceFailureReason: "error",
        });
      }),
    ).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("a handoff Git policy failure is visible on the failed occurrence", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "sched-handoff-git-fail-" });
        const bed = yield* makeTestBed({ handoffGitFailure: "Git hook rejected the commit." });
        yield* bed.seedProject(projectA, root);
        yield* bed.seedSchedule({ handoffGitPolicy: "commit" });

        yield* at("2026-01-02T09:00:00.000Z");
        yield* bed.reactor.sweepNow;
        const running = yield* bed.projectState(projectA);
        yield* bed.settleTurn({
          threadId: running!.threadId!,
          turnId: "turn-git-failure",
          text: "Handoff written but not committed.",
          startAt: "2026-01-02T09:00:30.000Z",
          endAt: "2026-01-02T09:05:00.000Z",
        });
        yield* TestClock.adjust(Duration.minutes(6));
        yield* bed.reactor.sweepNow;

        expect(ofType(bed.dispatched, "schedule.occurrence.complete")).toHaveLength(0);
        expect(ofType(bed.dispatched, "schedule.occurrence.fail").at(-1)?.message).toContain(
          "Git hook rejected the commit.",
        );
        expect(yield* bed.projectState(projectA)).toMatchObject({
          lastOccurrenceStatus: "failed",
          lastOccurrenceFailureReason: "error",
          lastOccurrenceFailureMessage:
            "Scheduled handoff Git policy failed in '" + root + "': Git hook rejected the commit.",
        });
      }),
    ).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("after a watchdog timeout the writer neither double-fires nor writes a file", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "sched-handoff-" });
        const bed = yield* makeTestBed();
        yield* bed.seedProject(projectA, root);
        yield* bed.seedSchedule();

        yield* at("2026-01-02T09:00:00.000Z");
        yield* bed.reactor.sweepNow;
        const running = yield* bed.projectState(projectA);
        const threadId = running!.threadId!;
        // The session comes up but the turn hangs past maxRunMinutes.
        yield* bed.dispatch({
          type: "thread.session.set",
          commandId: cmd("hang-running"),
          threadId,
          session: {
            threadId,
            status: "running",
            providerName: "codex",
            runtimeMode: "approval-required",
            activeTurnId: TurnId.make("turn-hung"),
            lastError: null,
            updatedAt: "2026-01-02T09:00:30.000Z",
          },
          createdAt: "2026-01-02T09:00:30.000Z",
        });
        yield* TestClock.adjust(Duration.minutes(16));
        yield* bed.reactor.sweepNow;
        expect(ofType(bed.dispatched, "schedule.occurrence.fail")).toHaveLength(1);

        // The interrupt lands and the session settles as interrupted — the
        // writer must not complete, fail again, or write the handoff.
        yield* bed.settleTurn({
          threadId,
          turnId: "turn-hung",
          text: null,
          startAt: "2026-01-02T09:17:00.000Z",
          endAt: "2026-01-02T09:17:30.000Z",
          endStatus: "interrupted",
        });
        yield* TestClock.adjust(Duration.minutes(2));
        yield* bed.reactor.sweepNow;

        expect(ofType(bed.dispatched, "schedule.occurrence.fail")).toHaveLength(1);
        expect(ofType(bed.dispatched, "schedule.occurrence.complete")).toHaveLength(0);
        expect(yield* fs.exists(path.join(root, "handoff", "2026-01-02.md"))).toBe(false);
      }),
    ).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("the next day's run reads the handoff the previous run wrote", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const bed = yield* makeTestBed();
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "sched-handoff-" });
        yield* bed.seedProject(projectA, root);
        yield* bed.seedSchedule();

        yield* at("2026-01-02T09:00:00.000Z");
        yield* bed.reactor.sweepNow;
        const running = yield* bed.projectState(projectA);
        yield* bed.settleTurn({
          threadId: running!.threadId!,
          turnId: "turn-jan-2",
          text: "Handoff: shipped the widget; tests for the gadget remain.",
          startAt: "2026-01-02T09:00:30.000Z",
          endAt: "2026-01-02T09:05:00.000Z",
        });
        yield* TestClock.adjust(Duration.minutes(6));
        yield* bed.reactor.sweepNow;
        expect(ofType(bed.dispatched, "schedule.occurrence.complete")).toHaveLength(1);

        // Day N+1 fires with day N's handoff prepended to the prompt.
        yield* at("2026-01-03T09:00:00.000Z");
        yield* bed.reactor.sweepNow;
        const turns = ofType(bed.dispatched, "thread.turn.start");
        expect(turns).toHaveLength(2);
        expect(turns[1]!.message.text).toContain(
          "Handoff: shipped the widget; tests for the gadget remain.",
        );
        expect(turns[1]!.message.text).toContain("Daily check-in");
      }),
    ).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("environment scope writes each project's handoff independently", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const rootA = yield* fs.makeTempDirectoryScoped({ prefix: "sched-handoff-a-" });
        const rootB = yield* fs.makeTempDirectoryScoped({ prefix: "sched-handoff-b-" });
        const bed = yield* makeTestBed();
        yield* bed.seedProject(projectA, rootA);
        yield* bed.seedProject(projectB, rootB);
        yield* bed.seedSchedule({
          scope: { _tag: "environment", projectIds: [projectA, projectB] },
        });

        yield* at("2026-01-02T09:00:00.000Z");
        yield* bed.reactor.sweepNow;
        const stateA = yield* bed.projectState(projectA);
        yield* bed.settleTurn({
          threadId: stateA!.threadId!,
          turnId: "turn-a-jan-2",
          text: "Project A summary.",
          startAt: "2026-01-02T09:00:30.000Z",
          endAt: "2026-01-02T09:04:00.000Z",
        });

        yield* TestClock.adjust(Duration.minutes(6));
        yield* bed.reactor.sweepNow;
        const stateB = yield* bed.projectState(projectB);
        yield* bed.settleTurn({
          threadId: stateB!.threadId!,
          turnId: "turn-b-jan-2",
          text: "Project B summary.",
          startAt: "2026-01-02T09:06:30.000Z",
          endAt: "2026-01-02T09:07:00.000Z",
        });
        yield* TestClock.adjust(Duration.minutes(1));
        yield* bed.reactor.sweepNow;

        const completes = ofType(bed.dispatched, "schedule.occurrence.complete");
        expect(completes.map((command) => command.occurrenceKey).toSorted()).toEqual([
          keyFor("2026-01-02", projectA),
          keyFor("2026-01-02", projectB),
        ]);
        expect(yield* fs.readFileString(path.join(rootA, "handoff", "2026-01-02.md"))).toBe(
          "Project A summary.",
        );
        expect(yield* fs.readFileString(path.join(rootB, "handoff", "2026-01-02.md"))).toBe(
          "Project B summary.",
        );
      }),
    ).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("a schedule's own model selection wins on thread create and turn start", () =>
    Effect.gen(function* () {
      const scheduleSelection = {
        instanceId: ProviderInstanceId.make("claude"),
        model: "claude-haiku-4-5",
      };
      const bed = yield* makeTestBed();
      // Seed thread carries the codex selection; the schedule must override it.
      yield* bed.seedProject(projectA);
      yield* bed.seedSchedule({ modelSelection: scheduleSelection });

      yield* at("2026-01-02T09:00:00.000Z");
      yield* bed.reactor.sweepNow;

      const creates = ofType(bed.dispatched, "thread.create").filter(
        (command) => command.origin === scheduleThreadOrigin(scheduleId),
      );
      expect(creates).toHaveLength(1);
      expect(creates[0]!.modelSelection).toMatchObject(scheduleSelection);

      const turns = ofType(bed.dispatched, "thread.turn.start");
      expect(turns).toHaveLength(1);
      expect(turns[0]!.modelSelection).toMatchObject(scheduleSelection);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("two schedules due together fire at least ten minutes apart", () =>
    Effect.gen(function* () {
      const otherScheduleId = ScheduleId.make("schedule-2");
      const bed = yield* makeTestBed();
      yield* bed.seedProject(projectA);
      yield* bed.seedSchedule();
      yield* bed.seedSchedule({ id: otherScheduleId });

      yield* at("2026-01-02T09:00:00.000Z");
      yield* bed.reactor.sweepNow;

      // Only the first schedule fires this sweep; the second stays due
      // behind the cross-schedule spacing gate.
      const firstStarts = ofType(bed.dispatched, "schedule.occurrence.start");
      expect(firstStarts).toHaveLength(1);
      expect(firstStarts[0]!.scheduleId).toBe(scheduleId);

      // Sweeps inside the gate window never fire the second schedule.
      yield* TestClock.adjust(Duration.minutes(5));
      yield* bed.reactor.sweepNow;
      expect(ofType(bed.dispatched, "schedule.occurrence.start")).toHaveLength(1);

      // Once the gate opens, the second schedule fires — and exactly once.
      yield* TestClock.adjust(Duration.minutes(5));
      yield* bed.reactor.sweepNow;
      const starts = ofType(bed.dispatched, "schedule.occurrence.start");
      expect(starts).toHaveLength(2);
      expect(starts[1]).toMatchObject({
        scheduleId: otherScheduleId,
        occurrenceKey: scheduleOccurrenceKey({
          scheduleId: otherScheduleId,
          dateLocal: "2026-01-02",
          projectId: projectA,
        }),
      });

      yield* bed.reactor.sweepNow;
      expect(ofType(bed.dispatched, "schedule.occurrence.start")).toHaveLength(2);
      expect(new Set(starts.map((command) => command.occurrenceKey)).size).toBe(2);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect(
    "skip-if-dirty fails the dirty project's occurrence visibly without a turn or streak",
    () =>
      Effect.gen(function* () {
        // Environment scope defaults skipIfDirty on; project A's tree is dirty.
        const bed = yield* makeTestBed({ dirtyRoots: [`/tmp/${projectA}`] });
        yield* bed.seedProject(projectA);
        yield* bed.seedProject(projectB);
        yield* bed.seedSchedule({
          scope: { _tag: "environment", projectIds: [projectA, projectB] },
        });

        yield* at("2026-01-02T09:00:00.000Z");
        yield* bed.reactor.sweepNow;

        const fails = ofType(bed.dispatched, "schedule.occurrence.fail");
        expect(fails).toHaveLength(1);
        expect(fails[0]).toMatchObject({
          occurrenceKey: keyFor("2026-01-02", projectA),
          reason: "dirty",
        });
        // The failed dirty occurrence settles immediately; the next sweep
        // advances the same environment schedule to its clean project.
        yield* bed.reactor.sweepNow;

        // The clean project fires normally; the dirty one starts no turn.
        const turns = ofType(bed.dispatched, "thread.turn.start");
        expect(turns).toHaveLength(1);
        const stateB = yield* bed.projectState(projectB);
        expect(turns[0]!.threadId).toBe(stateB?.threadId);

        const stateA = yield* bed.projectState(projectA);
        expect(stateA).toMatchObject({
          lastOccurrenceStatus: "failed",
          lastOccurrenceFailureReason: "dirty",
          // A busy tree is not a broken schedule: no auto-pause streak.
          consecutiveFailures: 0,
        });
      }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("project scope defaults skip-if-dirty off and fires on a dirty tree", () =>
    Effect.gen(function* () {
      const bed = yield* makeTestBed({ dirtyRoots: [`/tmp/${projectA}`] });
      yield* bed.seedProject(projectA);
      yield* bed.seedSchedule();

      yield* at("2026-01-02T09:00:00.000Z");
      yield* bed.reactor.sweepNow;

      expect(ofType(bed.dispatched, "schedule.occurrence.fail")).toHaveLength(0);
      expect(ofType(bed.dispatched, "thread.turn.start")).toHaveLength(1);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("a stale model selection fails loudly with reason 'provider' and no turn", () =>
    Effect.gen(function* () {
      const bed = yield* makeTestBed();
      yield* bed.seedProject(projectA);
      yield* bed.seedSchedule({
        modelSelection: { instanceId: ProviderInstanceId.make("ghost"), model: "gpt-5-codex" },
      });

      yield* at("2026-01-02T09:00:00.000Z");
      yield* bed.reactor.sweepNow;

      const fails = ofType(bed.dispatched, "schedule.occurrence.fail");
      expect(fails).toHaveLength(1);
      expect(fails[0]).toMatchObject({
        occurrenceKey: keyFor("2026-01-02"),
        reason: "provider",
      });
      expect(fails[0]!.message).toContain("ghost");
      expect(ofType(bed.dispatched, "thread.turn.start")).toHaveLength(0);
      expect(ofType(bed.dispatched, "thread.create")).toHaveLength(1); // only the seed thread

      const state = yield* bed.projectState(projectA);
      expect(state).toMatchObject({
        lastOccurrenceStatus: "failed",
        lastOccurrenceFailureReason: "provider",
        consecutiveFailures: 1,
      });
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("the dispatched turn carries the server-owned budget and handoff contract", () =>
    Effect.gen(function* () {
      const bed = yield* makeTestBed();
      yield* bed.seedProject(projectA);
      yield* bed.seedSchedule();

      yield* at("2026-01-02T09:00:00.000Z");
      yield* bed.reactor.sweepNow;

      const turns = ofType(bed.dispatched, "thread.turn.start");
      expect(turns).toHaveLength(1);
      const text = turns[0]!.message.text;
      expect(text).toContain("You have 10 minutes for this turn");
      expect(text).toContain("15 minutes for the whole run");
      expect(text).toContain("End your reply with a handoff summary");
      expect(text).toContain("- What was done");
      expect(text).toContain("- What is blocked");
      expect(text).toContain("- What tomorrow should check first");
      // The user's prompt still closes the message.
      expect(text).toContain("Daily check-in");
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("spring-forward: a 02:30 schedule still fires on the day 02:30 does not exist", () =>
    Effect.gen(function* () {
      const bed = yield* makeTestBed();
      yield* bed.seedProject(projectA);
      // US DST starts 2026-03-08; 02:30 America/New_York does not exist that day.
      yield* bed.seedSchedule({ hourLocal: 2, minuteLocal: 30, timezone: "America/New_York" });

      // Ordinary prior day fires at 07:30Z (02:30 EST) and completes.
      yield* at("2026-03-07T07:30:00.000Z");
      yield* bed.reactor.sweepNow;
      expect(ofType(bed.dispatched, "schedule.occurrence.start")).toHaveLength(1);
      yield* bed.dispatch({
        type: "schedule.occurrence.complete",
        commandId: cmd("complete-mar-7"),
        scheduleId,
        occurrenceKey: keyFor("2026-03-07"),
        projectId: projectA,
        completedAt: "2026-03-07T07:35:00.000Z",
      });

      // 06:30Z is 01:30 EST — before the (nonexistent) boundary.
      yield* at("2026-03-08T06:30:00.000Z");
      yield* bed.reactor.sweepNow;
      expect(ofType(bed.dispatched, "schedule.occurrence.start")).toHaveLength(1);

      // 07:30Z is 03:30 EDT — the clock jumped over 02:30, and the day must
      // still become due rather than be skipped.
      yield* at("2026-03-08T07:30:00.000Z");
      yield* bed.reactor.sweepNow;
      const starts = ofType(bed.dispatched, "schedule.occurrence.start");
      expect(starts.map((command) => command.occurrenceKey)).toEqual([
        keyFor("2026-03-07"),
        keyFor("2026-03-08"),
      ]);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("fall-back: a 01:30 schedule fires exactly once on the day 01:30 happens twice", () =>
    Effect.gen(function* () {
      const bed = yield* makeTestBed();
      yield* bed.seedProject(projectA);
      // US DST ends 2026-11-01; 01:30 America/New_York occurs at 05:30Z (EDT)
      // and again at 06:30Z (EST).
      yield* bed.seedSchedule({ hourLocal: 1, minuteLocal: 30, timezone: "America/New_York" });

      // Ordinary prior day fires and completes.
      yield* at("2026-10-31T05:30:00.000Z");
      yield* bed.reactor.sweepNow;
      expect(ofType(bed.dispatched, "schedule.occurrence.start")).toHaveLength(1);
      yield* bed.dispatch({
        type: "schedule.occurrence.complete",
        commandId: cmd("complete-oct-31"),
        scheduleId,
        occurrenceKey: keyFor("2026-10-31"),
        projectId: projectA,
        completedAt: "2026-10-31T05:35:00.000Z",
      });

      // First 01:30 (EDT) fires the day once.
      yield* at("2026-11-01T05:30:00.000Z");
      yield* bed.reactor.sweepNow;
      expect(ofType(bed.dispatched, "schedule.occurrence.start")).toHaveLength(2);
      yield* bed.dispatch({
        type: "schedule.occurrence.complete",
        commandId: cmd("complete-nov-1"),
        scheduleId,
        occurrenceKey: keyFor("2026-11-01"),
        projectId: projectA,
        completedAt: "2026-11-01T05:35:00.000Z",
      });

      // The repeated 01:30 (EST) must not double-fire: the local-date
      // occurrence key already covers 2026-11-01.
      yield* at("2026-11-01T06:30:00.000Z");
      yield* bed.reactor.sweepNow;
      yield* at("2026-11-01T06:35:00.000Z");
      yield* bed.reactor.sweepNow;
      const starts = ofType(bed.dispatched, "schedule.occurrence.start");
      expect(starts.map((command) => command.occurrenceKey)).toEqual([
        keyFor("2026-10-31"),
        keyFor("2026-11-01"),
      ]);
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("fractional-compatible intervals fire on elapsed boundaries and skip overlap", () =>
    Effect.gen(function* () {
      const bed = yield* makeTestBed();
      yield* bed.seedProject(projectA);
      yield* bed.seedSchedule({ interval: { value: 0.08333333333333333, unit: "hours" } });

      yield* at("2026-01-02T00:04:00.000Z");
      yield* bed.reactor.sweepNow;
      expect(ofType(bed.dispatched, "schedule.occurrence.start")).toHaveLength(0);

      yield* at("2026-01-02T00:05:00.000Z");
      yield* bed.reactor.sweepNow;
      expect(ofType(bed.dispatched, "schedule.occurrence.start")).toHaveLength(1);

      yield* at("2026-01-02T00:10:00.000Z");
      yield* bed.reactor.sweepNow;
      const skips = ofType(bed.dispatched, "schedule.occurrence.skip");
      expect(skips).toHaveLength(1);
      expect(skips[0]).toMatchObject({
        projectId: projectA,
        reason: "thread-running",
        trigger: "scheduled",
      });
      const state = yield* bed.projectState(projectA);
      expect(state).toMatchObject({
        lastOccurrenceStatus: "running",
        skippedRunCount: 1,
        lastSkipReason: "thread-running",
        lastSkippedAt: "2026-01-02T00:10:00.000Z",
      });
    }).pipe(Effect.provide(TestClock.layer())),
  );

  it.effect("Run now starts immediately and a second request skips a busy thread", () =>
    Effect.gen(function* () {
      const bed = yield* makeTestBed();
      yield* bed.seedProject(projectA);
      yield* bed.seedSchedule();

      yield* bed.dispatch({
        type: "project.schedule.run",
        commandId: cmd("manual-run-1"),
        scheduleId,
        createdAt: "2026-01-02T00:01:00.000Z",
      });
      yield* at("2026-01-02T00:01:00.000Z");
      yield* bed.reactor.sweepNow;
      expect(ofType(bed.dispatched, "schedule.occurrence.start").at(-1)).toMatchObject({
        trigger: "manual",
      });

      yield* bed.dispatch({
        type: "project.schedule.run",
        commandId: cmd("manual-run-2"),
        scheduleId,
        createdAt: "2026-01-02T00:02:00.000Z",
      });
      yield* at("2026-01-02T00:02:00.000Z");
      yield* bed.reactor.sweepNow;

      expect(ofType(bed.dispatched, "thread.turn.start")).toHaveLength(1);
      expect(ofType(bed.dispatched, "schedule.occurrence.skip").at(-1)).toMatchObject({
        occurrenceKey: `manual:manual-run-2:${projectA}`,
        reason: "thread-running",
        trigger: "manual",
      });
      const state = yield* bed.projectState(projectA);
      expect(state).toMatchObject({
        lastOccurrenceStatus: "running",
        skippedRunCount: 1,
        manualRunRequestKey: null,
      });
    }).pipe(Effect.provide(TestClock.layer())),
  );
});
