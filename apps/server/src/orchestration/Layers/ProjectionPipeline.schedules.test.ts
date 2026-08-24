import {
  CommandId,
  EventId,
  ProjectId,
  ProviderInstanceId,
  ScheduleId,
  scheduleThreadOrigin,
  ThreadId,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { OrchestrationEventStoreLive } from "../../persistence/Layers/OrchestrationEventStore.ts";
import { makeSqlitePersistenceLive } from "../../persistence/Layers/Sqlite.ts";
import { OrchestrationEventStore } from "../../persistence/Services/OrchestrationEventStore.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";
import { OrchestrationProjectionPipelineLive } from "./ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./ProjectionSnapshotQuery.ts";
import * as ThreadBackgroundLiveness from "../ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "../ThreadPlanProgress.ts";
import { OrchestrationProjectionPipeline } from "../Services/ProjectionPipeline.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import { createEmptyReadModel, projectEvent } from "../projector.ts";
import { ServerConfig } from "../../config.ts";

const projectId = ProjectId.make("project-schedule");
const scheduleId = ScheduleId.make("schedule-1");
const threadId = ThreadId.make("thread-schedule-1");
const createdAt = "2026-02-01T08:30:00.000Z";
const modelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-5-codex",
};

const createdEvent = {
  type: "project.schedule.created",
  eventId: EventId.make("evt-schedule-created"),
  aggregateKind: "schedule",
  aggregateId: scheduleId,
  occurredAt: createdAt,
  commandId: CommandId.make("cmd-schedule-create"),
  causationEventId: null,
  correlationId: CommandId.make("cmd-schedule-create"),
  metadata: {},
  payload: {
    scheduleId,
    scope: { _tag: "project", projectId },
    hourLocal: 8,
    minuteLocal: 30,
    timezone: "America/New_York",
    prompt: "Daily check-in: triage and continue.",
    workflowScriptRef: null,
    modelSelection,
    skipIfDirty: true,
    handoffPathTemplate: "handoff/{date}.md",
    maxRunMinutes: 15,
    maxTurnMinutes: 10,
    createdAt,
    updatedAt: createdAt,
  },
} as const;

const snapshotQueryLayer = (dbPath: string) =>
  OrchestrationProjectionSnapshotQueryLive.pipe(
    Layer.provide(ThreadBackgroundLiveness.layer),
    Layer.provide(ThreadPlanProgress.layer),
    Layer.provide(RepositoryIdentityResolver.layer),
    Layer.provideMerge(OrchestrationProjectionPipelineLive),
    Layer.provideMerge(OrchestrationEventStoreLive),
    Layer.provideMerge(makeSqlitePersistenceLive(dbPath)),
  );

/**
 * The engine hydrates its command read model from projection tables only, so a
 * schedule that is not projected stops firing after a restart. These tests read
 * schedules back through a second pipeline instance over the same database, and
 * compare them against the in-memory projector's fold of the same events.
 */
it.effect("keeps a schedule and its occurrence state across a projection restart", () =>
  Effect.gen(function* () {
    const { dbPath } = yield* ServerConfig;
    const writeLayer = OrchestrationProjectionPipelineLive.pipe(
      Layer.provideMerge(OrchestrationEventStoreLive),
      Layer.provideMerge(makeSqlitePersistenceLive(dbPath)),
    );

    const foldedSchedules = yield* Effect.gen(function* () {
      const eventStore = yield* OrchestrationEventStore;
      const projectionPipeline = yield* OrchestrationProjectionPipeline;
      let readModel = createEmptyReadModel(createdAt);

      const append = Effect.fn("append")(function* (
        event: Parameters<typeof eventStore.append>[0],
      ) {
        const stored = yield* eventStore.append(event);
        readModel = yield* projectEvent(readModel, stored);
      });

      yield* append(createdEvent);

      yield* append({
        type: "schedule.occurrence.started",
        eventId: EventId.make("evt-occurrence-started"),
        aggregateKind: "schedule",
        aggregateId: scheduleId,
        occurredAt: "2026-02-02T13:30:00.000Z",
        commandId: CommandId.make("cmd-occurrence-start"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-occurrence-start"),
        metadata: {},
        payload: {
          scheduleId,
          occurrenceKey: `scheduled:${scheduleId}:2026-02-02:${projectId}`,
          projectId,
          threadId,
          startedAt: "2026-02-02T13:30:00.000Z",
        },
      });

      yield* append({
        type: "schedule.occurrence.failed",
        eventId: EventId.make("evt-occurrence-failed-auth"),
        aggregateKind: "schedule",
        aggregateId: scheduleId,
        occurredAt: "2026-02-02T13:31:00.000Z",
        commandId: CommandId.make("cmd-occurrence-fail-auth"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-occurrence-fail-auth"),
        metadata: {},
        payload: {
          scheduleId,
          occurrenceKey: `scheduled:${scheduleId}:2026-02-02:${projectId}`,
          projectId,
          reason: "auth",
          failedAt: "2026-02-02T13:31:00.000Z",
        },
      });

      // Every skip still records its occurrence, so the day counts as
      // attempted and the sweep cannot retry it.
      yield* append({
        type: "schedule.occurrence.started",
        eventId: EventId.make("evt-occurrence-started-dirty"),
        aggregateKind: "schedule",
        aggregateId: scheduleId,
        occurredAt: "2026-02-03T13:30:00.000Z",
        commandId: CommandId.make("cmd-occurrence-start-dirty"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-occurrence-start-dirty"),
        metadata: {},
        payload: {
          scheduleId,
          occurrenceKey: `scheduled:${scheduleId}:2026-02-03:${projectId}`,
          projectId,
          threadId,
          startedAt: "2026-02-03T13:30:00.000Z",
        },
      });

      // A dirty skip is not a broken schedule: the streak must stay at 1.
      yield* append({
        type: "schedule.occurrence.failed",
        eventId: EventId.make("evt-occurrence-failed-dirty"),
        aggregateKind: "schedule",
        aggregateId: scheduleId,
        occurredAt: "2026-02-03T13:30:00.000Z",
        commandId: CommandId.make("cmd-occurrence-fail-dirty"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-occurrence-fail-dirty"),
        metadata: {},
        payload: {
          scheduleId,
          occurrenceKey: `scheduled:${scheduleId}:2026-02-03:${projectId}`,
          projectId,
          reason: "dirty",
          failedAt: "2026-02-03T13:30:00.000Z",
        },
      });

      yield* append({
        type: "project.schedule.updated",
        eventId: EventId.make("evt-schedule-updated"),
        aggregateKind: "schedule",
        aggregateId: scheduleId,
        occurredAt: "2026-02-04T09:00:00.000Z",
        commandId: CommandId.make("cmd-schedule-update"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-schedule-update"),
        metadata: {},
        payload: {
          scheduleId,
          hourLocal: 9,
          prompt: "Daily check-in: triage, then continue the top item.",
          updatedAt: "2026-02-04T09:00:00.000Z",
        },
      });

      yield* append({
        type: "project.schedule.paused",
        eventId: EventId.make("evt-schedule-paused"),
        aggregateKind: "schedule",
        aggregateId: scheduleId,
        occurredAt: "2026-02-04T13:31:00.000Z",
        commandId: CommandId.make("cmd-schedule-pause"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-schedule-pause"),
        metadata: {},
        payload: {
          scheduleId,
          pausedAt: "2026-02-04T13:31:00.000Z",
          updatedAt: "2026-02-04T13:31:00.000Z",
          autoPausedReason: "paused after 3 failures: auth",
        },
      });

      yield* projectionPipeline.bootstrap;
      return readModel.schedules ?? [];
    }).pipe(Effect.provide(writeLayer));

    // Fresh pipeline and snapshot query over the same database: nothing carries
    // over in memory.
    const restoredSchedules = yield* Effect.gen(function* () {
      const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
      const readModel = yield* projectionSnapshotQuery.getCommandReadModel();
      return readModel.schedules ?? [];
    }).pipe(Effect.provide(snapshotQueryLayer(dbPath)));

    assert.deepEqual(restoredSchedules, [
      {
        id: scheduleId,
        scope: { _tag: "project", projectId },
        hourLocal: 9,
        minuteLocal: 30,
        timezone: "America/New_York",
        prompt: "Daily check-in: triage, then continue the top item.",
        workflowScriptRef: null,
        modelSelection,
        skipIfDirty: true,
        autoPausedReason: "paused after 3 failures: auth",
        handoffPathTemplate: "handoff/{date}.md",
        maxRunMinutes: 15,
        maxTurnMinutes: 10,
        pausedAt: "2026-02-04T13:31:00.000Z",
        projectStates: [
          {
            projectId,
            threadId,
            lastOccurrenceKey: `scheduled:${scheduleId}:2026-02-03:${projectId}`,
            lastOccurrenceStatus: "failed",
            lastOccurrenceFailureReason: "dirty",
            lastOccurrenceAt: "2026-02-03T13:30:00.000Z",
            consecutiveFailures: 1,
          },
        ],
        createdAt,
        updatedAt: "2026-02-04T13:31:00.000Z",
        deletedAt: null,
      },
    ]);
    // Guards against the SQL projector and the in-memory projector drifting.
    assert.deepEqual(restoredSchedules, foldedSchedules);
  }).pipe(
    Effect.provide(
      Layer.provideMerge(
        ServerConfig.layerTest(process.cwd(), {
          prefix: "t3-projection-schedules-restart-",
        }),
        NodeServices.layer,
      ),
    ),
  ),
);

it.effect("resume clears the auto-pause reason and every failure streak", () =>
  Effect.gen(function* () {
    const { dbPath } = yield* ServerConfig;

    const schedules = yield* Effect.gen(function* () {
      const eventStore = yield* OrchestrationEventStore;
      const projectionPipeline = yield* OrchestrationProjectionPipeline;
      const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;

      yield* eventStore.append(createdEvent);
      yield* eventStore.append({
        type: "schedule.occurrence.failed",
        eventId: EventId.make("evt-resume-failed"),
        aggregateKind: "schedule",
        aggregateId: scheduleId,
        occurredAt: "2026-02-02T13:31:00.000Z",
        commandId: CommandId.make("cmd-resume-fail"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-resume-fail"),
        metadata: {},
        payload: {
          scheduleId,
          occurrenceKey: `scheduled:${scheduleId}:2026-02-02:${projectId}`,
          projectId,
          reason: "provider",
          failedAt: "2026-02-02T13:31:00.000Z",
        },
      });
      yield* eventStore.append({
        type: "project.schedule.paused",
        eventId: EventId.make("evt-resume-paused"),
        aggregateKind: "schedule",
        aggregateId: scheduleId,
        occurredAt: "2026-02-02T13:32:00.000Z",
        commandId: CommandId.make("cmd-resume-pause"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-resume-pause"),
        metadata: {},
        payload: {
          scheduleId,
          pausedAt: "2026-02-02T13:32:00.000Z",
          updatedAt: "2026-02-02T13:32:00.000Z",
          autoPausedReason: "paused after 3 failures: provider",
        },
      });
      yield* eventStore.append({
        type: "project.schedule.resumed",
        eventId: EventId.make("evt-resume-resumed"),
        aggregateKind: "schedule",
        aggregateId: scheduleId,
        occurredAt: "2026-02-05T09:00:00.000Z",
        commandId: CommandId.make("cmd-resume-resume"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-resume-resume"),
        metadata: {},
        payload: {
          scheduleId,
          updatedAt: "2026-02-05T09:00:00.000Z",
        },
      });

      yield* projectionPipeline.bootstrap;
      const readModel = yield* projectionSnapshotQuery.getCommandReadModel();
      return readModel.schedules ?? [];
    }).pipe(Effect.provide(snapshotQueryLayer(dbPath)));

    assert.deepEqual(
      schedules.map((schedule) => ({
        pausedAt: schedule.pausedAt,
        autoPausedReason: schedule.autoPausedReason,
        streaks: schedule.projectStates.map((state) => state.consecutiveFailures),
      })),
      [{ pausedAt: null, autoPausedReason: null, streaks: [0] }],
    );
  }).pipe(
    Effect.provide(
      Layer.provideMerge(
        ServerConfig.layerTest(process.cwd(), {
          prefix: "t3-projection-schedules-resume-",
        }),
        NodeServices.layer,
      ),
    ),
  ),
);

it.effect("round-trips skip-if-dirty as a tri-state", () =>
  Effect.gen(function* () {
    const { dbPath } = yield* ServerConfig;

    const result = yield* Effect.gen(function* () {
      const eventStore = yield* OrchestrationEventStore;
      const projectionPipeline = yield* OrchestrationProjectionPipeline;
      const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
      const sql = yield* SqlClient.SqlClient;

      yield* eventStore.append(createdEvent);
      yield* eventStore.append({
        ...createdEvent,
        eventId: EventId.make("evt-schedule-created-off"),
        aggregateId: ScheduleId.make("schedule-off"),
        payload: {
          ...createdEvent.payload,
          scheduleId: ScheduleId.make("schedule-off"),
          skipIfDirty: false,
        },
      });
      yield* eventStore.append({
        ...createdEvent,
        eventId: EventId.make("evt-schedule-created-default"),
        aggregateId: ScheduleId.make("schedule-default"),
        payload: {
          ...createdEvent.payload,
          scheduleId: ScheduleId.make("schedule-default"),
          skipIfDirty: null,
        },
      });

      yield* projectionPipeline.bootstrap;

      const rows = yield* sql<{
        readonly scheduleId: string;
        readonly skipIfDirty: number | null;
      }>`
        SELECT
          schedule_id AS "scheduleId",
          skip_if_dirty AS "skipIfDirty"
        FROM projection_schedules
        ORDER BY schedule_id ASC
      `;
      const readModel = yield* projectionSnapshotQuery.getCommandReadModel();
      return {
        rows,
        projected: (readModel.schedules ?? [])
          .map((schedule) => ({ id: schedule.id, skipIfDirty: schedule.skipIfDirty }))
          .toSorted((left, right) => left.id.localeCompare(right.id)),
      };
    }).pipe(Effect.provide(snapshotQueryLayer(dbPath)));

    assert.deepEqual(result.rows, [
      { scheduleId: "schedule-1", skipIfDirty: 1 },
      { scheduleId: "schedule-default", skipIfDirty: null },
      { scheduleId: "schedule-off", skipIfDirty: 0 },
    ]);
    assert.deepEqual(result.projected, [
      { id: scheduleId, skipIfDirty: true },
      { id: ScheduleId.make("schedule-default"), skipIfDirty: null },
      { id: ScheduleId.make("schedule-off"), skipIfDirty: false },
    ]);
  }).pipe(
    Effect.provide(
      Layer.provideMerge(
        ServerConfig.layerTest(process.cwd(), {
          prefix: "t3-projection-schedules-dirty-",
        }),
        NodeServices.layer,
      ),
    ),
  ),
);

/**
 * Thread origin is written once at thread.created and never updated, which
 * makes it easy to leave in memory only. It has to survive a restart, or the
 * scheduled badge disappears from every thread the moment the server bounces.
 */
it.effect("keeps thread origin across a projection restart", () =>
  Effect.gen(function* () {
    const { dbPath } = yield* ServerConfig;
    const writeLayer = OrchestrationProjectionPipelineLive.pipe(
      Layer.provideMerge(OrchestrationEventStoreLive),
      Layer.provideMerge(makeSqlitePersistenceLive(dbPath)),
    );

    const userThreadId = ThreadId.make("thread-user-origin");

    yield* Effect.gen(function* () {
      const eventStore = yield* OrchestrationEventStore;
      const projectionPipeline = yield* OrchestrationProjectionPipeline;

      yield* eventStore.append({
        type: "project.created",
        eventId: EventId.make("evt-origin-project-created"),
        aggregateKind: "project",
        aggregateId: projectId,
        occurredAt: createdAt,
        commandId: CommandId.make("cmd-origin-project-create"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-origin-project-create"),
        metadata: {},
        payload: {
          projectId,
          title: "Origin Project",
          workspaceRoot: "/tmp/origin-project",
          defaultModelSelection: modelSelection,
          scripts: [],
          createdAt,
          updatedAt: createdAt,
        },
      });

      const threadPayload = (id: typeof threadId, title: string) => ({
        threadId: id,
        projectId,
        title,
        modelSelection,
        branch: null,
        worktreePath: null,
        createdAt,
        updatedAt: createdAt,
      });

      yield* eventStore.append({
        type: "thread.created",
        eventId: EventId.make("evt-origin-thread-scheduled"),
        aggregateKind: "thread",
        aggregateId: threadId,
        occurredAt: createdAt,
        commandId: CommandId.make("cmd-origin-thread-scheduled"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-origin-thread-scheduled"),
        metadata: {},
        payload: {
          ...threadPayload(threadId, "Scheduled Thread"),
          origin: scheduleThreadOrigin(scheduleId),
        },
      });

      // No origin on the wire is what pre-schedule events look like; readers
      // must land on "user" rather than an empty badge.
      yield* eventStore.append({
        type: "thread.created",
        eventId: EventId.make("evt-origin-thread-user"),
        aggregateKind: "thread",
        aggregateId: userThreadId,
        occurredAt: createdAt,
        commandId: CommandId.make("cmd-origin-thread-user"),
        causationEventId: null,
        correlationId: CommandId.make("cmd-origin-thread-user"),
        metadata: {},
        payload: threadPayload(userThreadId, "User Thread"),
      });

      yield* projectionPipeline.bootstrap;
    }).pipe(Effect.provide(writeLayer));

    // Fresh pipeline over the same database: nothing carries over in memory.
    const restored = yield* Effect.gen(function* () {
      const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
      const shell = yield* projectionSnapshotQuery.getShellSnapshot();
      const readModel = yield* projectionSnapshotQuery.getCommandReadModel();
      return {
        shell: shell.threads
          .map((thread) => ({ id: thread.id, origin: thread.origin }))
          .toSorted((left, right) => left.id.localeCompare(right.id)),
        readModel: readModel.threads
          .map((thread) => ({ id: thread.id, origin: thread.origin }))
          .toSorted((left, right) => left.id.localeCompare(right.id)),
      };
    }).pipe(Effect.provide(snapshotQueryLayer(dbPath)));

    assert.deepEqual(restored.shell, [
      { id: threadId, origin: `schedule:${scheduleId}` },
      { id: userThreadId, origin: undefined },
    ]);
    assert.deepEqual(restored.readModel, [
      { id: threadId, origin: `schedule:${scheduleId}` },
      { id: userThreadId, origin: undefined },
    ]);
  }).pipe(
    Effect.provide(
      Layer.provideMerge(
        ServerConfig.layerTest(process.cwd(), {
          prefix: "t3-projection-thread-origin-",
        }),
        NodeServices.layer,
      ),
    ),
  ),
);
