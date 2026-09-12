import {
  CommandId,
  EventId,
  ManagerId,
  ProjectId,
  ThreadId,
  type OrchestrationEvent,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { createEmptyReadModel, projectEvent, systemProject } from "./projector.ts";

const now = "2026-01-01T00:00:00.000Z";
const managerId = ManagerId.make("manager-1");
const projectId = ProjectId.make("project-1");
const threadId = ThreadId.make("thread-1");

function managerEvent(input: {
  readonly sequence: number;
  readonly type: OrchestrationEvent["type"];
  readonly payload: unknown;
  readonly aggregateKind?: OrchestrationEvent["aggregateKind"];
  readonly aggregateId?: OrchestrationEvent["aggregateId"];
}): OrchestrationEvent {
  return {
    sequence: input.sequence,
    eventId: EventId.make(`event-${input.sequence}`),
    type: input.type,
    aggregateKind: input.aggregateKind ?? "manager",
    aggregateId: input.aggregateId ?? managerId,
    occurredAt: now,
    commandId: CommandId.make(`command-${input.sequence}`),
    causationEventId: null,
    correlationId: null,
    metadata: {},
    payload: input.payload as never,
  } as OrchestrationEvent;
}

const applyAll = Effect.fn("applyAll")(function* (
  events: ReadonlyArray<OrchestrationEvent>,
  initial: OrchestrationReadModel = createEmptyReadModel(now),
) {
  let model = initial;
  for (const event of events) {
    model = yield* projectEvent(model, event);
  }
  return model;
});

const created = managerEvent({
  sequence: 1,
  type: "manager.created",
  payload: {
    managerId,
    name: "Argo",
    scope: { _tag: "project", projectId },
    mission: "Keep the build green.",
    childModelSelection: null,
    childRuntimeMode: "auto-accept-edits",
    maxChildren: 8,
    intervalMinutes: 30,
    createdAt: now,
    updatedAt: now,
  },
});

it.effect("manager.created seeds the manager row with null runtime state", () =>
  Effect.gen(function* () {
    const model = yield* applyAll([created]);
    expect(model.managers).toHaveLength(1);
    expect(model.managers?.[0]).toMatchObject({
      id: managerId,
      name: "Argo",
      mission: "Keep the build green.",
      maxChildren: 8,
      intervalMinutes: 30,
      threadId: null,
      pausedAt: null,
      lastCycleAt: null,
      cycleRequestedAt: null,
      deletedAt: null,
    });
  }),
);

it.effect("manager.updated patches only the fields the payload carries", () =>
  Effect.gen(function* () {
    const model = yield* applyAll([
      created,
      managerEvent({
        sequence: 2,
        type: "manager.updated",
        payload: {
          managerId,
          mission: "Ship the roadmap.",
          intervalMinutes: 120,
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      }),
    ]);
    expect(model.managers?.[0]).toMatchObject({
      name: "Argo",
      mission: "Ship the roadmap.",
      intervalMinutes: 120,
      maxChildren: 8,
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  }),
);

it.effect("pause, resume, bind, cycle, and delete all land on the manager row", () =>
  Effect.gen(function* () {
    const paused = yield* applyAll([
      created,
      managerEvent({
        sequence: 2,
        type: "manager.paused",
        payload: { managerId, pausedAt: now, updatedAt: now },
      }),
    ]);
    expect(paused.managers?.[0]?.pausedAt).toBe(now);

    const resumed = yield* applyAll(
      [
        managerEvent({
          sequence: 3,
          type: "manager.resumed",
          payload: { managerId, updatedAt: now },
        }),
      ],
      paused,
    );
    expect(resumed.managers?.[0]?.pausedAt).toBeNull();

    const bound = yield* applyAll(
      [
        managerEvent({
          sequence: 4,
          type: "manager.thread-bound",
          payload: { managerId, threadId, updatedAt: now },
        }),
        managerEvent({
          sequence: 5,
          type: "manager.cycle-recorded",
          payload: {
            managerId,
            occurredAt: "2026-01-03T04:05:06.000Z",
            updatedAt: "2026-01-03T04:05:06.000Z",
          },
        }),
      ],
      resumed,
    );
    expect(bound.managers?.[0]?.threadId).toBe(threadId);
    expect(bound.managers?.[0]?.lastCycleAt).toBe("2026-01-03T04:05:06.000Z");

    const requested = yield* applyAll(
      [
        managerEvent({
          sequence: 6,
          type: "manager.cycle-requested",
          payload: {
            managerId,
            requestedAt: "2026-01-03T05:00:00.000Z",
            updatedAt: "2026-01-03T05:00:00.000Z",
          },
        }),
      ],
      bound,
    );
    expect(requested.managers?.[0]?.cycleRequestedAt).toBe("2026-01-03T05:00:00.000Z");

    // Recording the next cycle clears the request.
    const recorded = yield* applyAll(
      [
        managerEvent({
          sequence: 7,
          type: "manager.cycle-recorded",
          payload: {
            managerId,
            occurredAt: "2026-01-03T05:00:30.000Z",
            updatedAt: "2026-01-03T05:00:30.000Z",
          },
        }),
      ],
      requested,
    );
    expect(recorded.managers?.[0]?.cycleRequestedAt).toBeNull();
    expect(recorded.managers?.[0]?.lastCycleAt).toBe("2026-01-03T05:00:30.000Z");

    const deleted = yield* applyAll(
      [
        managerEvent({
          sequence: 8,
          type: "manager.deleted",
          payload: { managerId, keepChildren: true, deletedAt: "2026-01-04T00:00:00.000Z" },
        }),
      ],
      recorded,
    );
    // Soft delete: the row stays so late events still resolve.
    expect(deleted.managers).toHaveLength(1);
    expect(deleted.managers?.[0]?.deletedAt).toBe("2026-01-04T00:00:00.000Z");
  }),
);

it.effect("project.created carries the system flag and systemProject finds it", () =>
  Effect.gen(function* () {
    const model = yield* applyAll([
      managerEvent({
        sequence: 1,
        type: "project.created",
        aggregateKind: "project",
        aggregateId: projectId,
        payload: {
          projectId,
          title: "Pulse",
          workspaceRoot: "/home/pulse",
          defaultModelSelection: null,
          faviconPath: null,
          scripts: [],
          system: true,
          createdAt: now,
          updatedAt: now,
        },
      }),
    ]);
    expect(model.projects[0]?.system).toBe(true);
    expect(systemProject(model)?.id).toBe(projectId);
  }),
);

it.effect("a project without the system flag is not the system project", () =>
  Effect.gen(function* () {
    const model = yield* applyAll([
      managerEvent({
        sequence: 1,
        type: "project.created",
        aggregateKind: "project",
        aggregateId: projectId,
        payload: {
          projectId,
          title: "Work",
          workspaceRoot: "/home/work",
          defaultModelSelection: null,
          faviconPath: null,
          scripts: [],
          createdAt: now,
          updatedAt: now,
        },
      }),
    ]);
    expect(model.projects[0]?.system).toBe(false);
    expect(systemProject(model)).toBeUndefined();
  }),
);
