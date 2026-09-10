import {
  EventId,
  ProviderDriverKind,
  RuntimeItemId,
  ThreadId,
  TurnId,
  type OrchestrationEvent,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { runtimeEventToActivities } from "./ProviderRuntimeIngestion.ts";
import { coalesceLiveToolUpdatedEvents } from "../ThreadLiveEventCoalescer.ts";

function toolEvent(
  sequence: number,
  itemId?: string,
  type: "item.updated" | "item.completed" = "item.updated",
): ProviderRuntimeEvent {
  return {
    type,
    eventId: EventId.make(`runtime-${sequence}`),
    provider: ProviderDriverKind.make("codex"),
    threadId: ThreadId.make("identity-thread"),
    turnId: TurnId.make("identity-turn"),
    createdAt: "2026-01-01T00:00:00.000Z",
    ...(itemId === undefined ? {} : { itemId: RuntimeItemId.make(itemId) }),
    payload: { itemType: "command_execution", title: "Build" },
  };
}

function activityEvent(
  sequence: number,
  itemId: string,
  type: "item.updated" | "item.completed" = "item.updated",
): OrchestrationEvent {
  const event = toolEvent(sequence, itemId, type);
  const activity = runtimeEventToActivities(event)[0]!;
  return {
    sequence,
    eventId: event.eventId,
    aggregateKind: "thread",
    aggregateId: event.threadId,
    occurredAt: event.createdAt,
    commandId: null,
    causationEventId: null,
    correlationId: null,
    metadata: {},
    type: "thread.activity-appended",
    payload: { threadId: event.threadId, activity },
  };
}

describe("runtime tool lifecycle identity", () => {
  it("preserves update itemId without nested tool data", () => {
    expect(runtimeEventToActivities(toolEvent(1, "build-call"))[0]?.payload).toMatchObject({
      toolCallId: "build-call",
      itemType: "command_execution",
    });
  });

  it("does not invent identities for anonymous updates", () => {
    expect(runtimeEventToActivities(toolEvent(1))[0]?.payload).not.toHaveProperty("toolCallId");
  });

  it("coalesces projected runtime updates without merging parallel calls or completion", () => {
    const events = [
      activityEvent(1, "build-a"),
      activityEvent(2, "build-b"),
      activityEvent(3, "build-a"),
      activityEvent(4, "build-a", "item.completed"),
    ];
    expect(coalesceLiveToolUpdatedEvents(events).map((event) => event.sequence)).toEqual([2, 3, 4]);
  });
});
