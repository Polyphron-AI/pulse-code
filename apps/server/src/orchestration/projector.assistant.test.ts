import {
  AssistantId,
  CommandId,
  EventId,
  ThreadId,
  type OrchestrationEvent,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { createEmptyReadModel, projectEvent } from "./projector.ts";

const now = "2026-01-01T00:00:00.000Z";
const later = "2026-01-01T01:00:00.000Z";
const assistantId = AssistantId.make("assistant-1");
const threadId = ThreadId.make("assistant-thread-1");

function assistantEvent(input: {
  readonly sequence: number;
  readonly type: OrchestrationEvent["type"];
  readonly payload: unknown;
}): OrchestrationEvent {
  return {
    sequence: input.sequence,
    eventId: EventId.make(`event-${input.sequence}`),
    type: input.type,
    aggregateKind: "assistant",
    aggregateId: assistantId,
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

const created = assistantEvent({
  sequence: 1,
  type: "assistant.created",
  payload: {
    assistantId,
    name: "Luna",
    avatar: null,
    modelSelection: null,
    instructions: "",
    createdAt: now,
    updatedAt: now,
  },
});

it.effect("materializes a created assistant", () =>
  Effect.gen(function* () {
    const model = yield* applyAll([created]);
    expect(model.assistants).toEqual([
      {
        id: assistantId,
        name: "Luna",
        avatar: null,
        modelSelection: null,
        instructions: "",
        threadId: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }),
);

it.effect("starts with no assistants", () =>
  Effect.gen(function* () {
    expect(createEmptyReadModel(now).assistants).toEqual([]);
  }),
);

it.effect("applies only the updated fields", () =>
  Effect.gen(function* () {
    const model = yield* applyAll([
      created,
      assistantEvent({
        sequence: 2,
        type: "assistant.updated",
        payload: { assistantId, name: "Nova", avatar: "N", updatedAt: later },
      }),
    ]);
    expect(model.assistants?.[0]).toMatchObject({
      name: "Nova",
      avatar: "N",
      instructions: "",
      updatedAt: later,
    });
  }),
);

it.effect("binds and then forgets the thread on reset", () =>
  Effect.gen(function* () {
    const bound = yield* applyAll([
      created,
      assistantEvent({
        sequence: 2,
        type: "assistant.thread-bound",
        payload: { assistantId, threadId, updatedAt: later },
      }),
    ]);
    expect(bound.assistants?.[0]?.threadId).toBe(threadId);

    const reset = yield* applyAll(
      [
        assistantEvent({
          sequence: 3,
          type: "assistant.reset",
          payload: { assistantId, previousThreadId: threadId, updatedAt: later },
        }),
      ],
      bound,
    );
    expect(reset.assistants?.[0]?.threadId).toBeNull();
  }),
);

it.effect("leaves the record alone for a message request", () =>
  Effect.gen(function* () {
    const model = yield* applyAll([
      created,
      assistantEvent({
        sequence: 2,
        type: "assistant.message-requested",
        payload: { assistantId, text: "Hello", requestedAt: later },
      }),
    ]);
    expect(model.assistants?.[0]).toMatchObject({ threadId: null, updatedAt: now });
  }),
);
