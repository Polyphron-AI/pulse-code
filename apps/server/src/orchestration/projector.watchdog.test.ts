import {
  CommandId,
  EventId,
  ProjectId,
  ThreadId,
  type OrchestrationEvent,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { createEmptyReadModel, projectEvent } from "./projector.ts";

function makeEvent(input: {
  readonly sequence: number;
  readonly type: OrchestrationEvent["type"];
  readonly payload: unknown;
}): OrchestrationEvent {
  return {
    sequence: input.sequence,
    eventId: EventId.make(`event-${input.sequence}`),
    type: input.type,
    aggregateKind: "thread",
    aggregateId: ThreadId.make("thread-1"),
    occurredAt: "2026-01-01T00:00:00.000Z",
    commandId: CommandId.make(`command-${input.sequence}`),
    causationEventId: null,
    correlationId: null,
    metadata: {},
    payload: input.payload as never,
  } as OrchestrationEvent;
}

it.effect("thread.watchdog-updated sets the thread's watchdog state", () =>
  Effect.gen(function* () {
    const now = "2026-01-01T00:00:00.000Z";
    const created = yield* projectEvent(
      createEmptyReadModel(now),
      makeEvent({
        sequence: 1,
        type: "thread.created",
        payload: {
          threadId: ThreadId.make("thread-1"),
          projectId: ProjectId.make("project-1"),
          title: "Thread",
          modelSelection: { provider: "codex", model: "gpt-5.4" },
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          createdAt: now,
          updatedAt: now,
        },
      }),
    );
    expect(created.threads[0]?.watchdog ?? null).toBeNull();

    const updated = yield* projectEvent(
      created,
      makeEvent({
        sequence: 2,
        type: "thread.watchdog-updated",
        payload: {
          threadId: ThreadId.make("thread-1"),
          watchdog: {
            enabled: true,
            rules: "Approve read-only tools.",
            modelSelection: null,
            escalatedAt: null,
            interventions: 7,
          },
        },
      }),
    );
    expect(updated.threads[0]?.watchdog).toEqual({
      enabled: true,
      rules: "Approve read-only tools.",
      modelSelection: null,
      escalatedAt: null,
      interventions: 7,
    });

    const escalated = yield* projectEvent(
      updated,
      makeEvent({
        sequence: 3,
        type: "thread.watchdog-updated",
        payload: {
          threadId: ThreadId.make("thread-1"),
          watchdog: {
            enabled: true,
            rules: "Approve read-only tools.",
            modelSelection: null,
            escalatedAt: now,
            interventions: 10,
          },
        },
      }),
    );
    expect(escalated.threads[0]?.watchdog?.escalatedAt).toBe(now);

    // A human-authored message clears a stuck watchdog's escalation and
    // resets the intervention count.
    const humanReplied = yield* projectEvent(
      escalated,
      makeEvent({
        sequence: 4,
        type: "thread.message-sent",
        payload: {
          threadId: ThreadId.make("thread-1"),
          messageId: "message-1",
          role: "user",
          text: "I'm back, keep going",
          turnId: null,
          streaming: false,
          createdAt: now,
          updatedAt: now,
        },
      }),
    );
    expect(humanReplied.threads[0]?.watchdog?.escalatedAt).toBeNull();
    expect(humanReplied.threads[0]?.watchdog?.interventions).toBe(0);
    // enabled/rules/modelSelection are untouched by the reset.
    expect(humanReplied.threads[0]?.watchdog?.enabled).toBe(true);
    expect(humanReplied.threads[0]?.watchdog?.rules).toBe("Approve read-only tools.");
  }),
);

it.effect("a watchdog-authored message does not reset the watchdog", () =>
  Effect.gen(function* () {
    const now = "2026-01-01T00:00:00.000Z";
    const created = yield* projectEvent(
      createEmptyReadModel(now),
      makeEvent({
        sequence: 1,
        type: "thread.created",
        payload: {
          threadId: ThreadId.make("thread-1"),
          projectId: ProjectId.make("project-1"),
          title: "Thread",
          modelSelection: { provider: "codex", model: "gpt-5.4" },
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          createdAt: now,
          updatedAt: now,
        },
      }),
    );
    const withWatchdog = yield* projectEvent(
      created,
      makeEvent({
        sequence: 2,
        type: "thread.watchdog-updated",
        payload: {
          threadId: ThreadId.make("thread-1"),
          watchdog: {
            enabled: true,
            rules: "Approve read-only tools.",
            modelSelection: null,
            escalatedAt: now,
            interventions: 3,
          },
        },
      }),
    );

    const stillEscalated = yield* projectEvent(
      withWatchdog,
      makeEvent({
        sequence: 3,
        type: "thread.message-sent",
        payload: {
          threadId: ThreadId.make("thread-1"),
          messageId: "message-1",
          role: "assistant",
          text: "Working on it",
          turnId: null,
          streaming: false,
          createdAt: now,
          updatedAt: now,
        },
      }),
    );
    expect(stillEscalated.threads[0]?.watchdog?.escalatedAt).toBe(now);
    expect(stillEscalated.threads[0]?.watchdog?.interventions).toBe(3);
  }),
);
