import {
  CommandId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationReadModel,
  ThreadMessageSentPayload,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function makeReadModel(): OrchestrationReadModel {
  return {
    snapshotSequence: 0,
    projects: [],
    threads: [
      {
        id: ThreadId.make("thread-1"),
        projectId: ProjectId.make("project-1"),
        title: "Thread",
        modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
        runtimeMode: "full-access",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        latestTurn: null,
        createdAt: NOW,
        updatedAt: NOW,
        archivedAt: null,
        pinnedAt: null,
        pinOrderKey: null,
        settledOverride: null,
        settledAt: null,
        snoozedUntil: null,
        snoozedAt: null,
        session: null,
        activeTurnId: null,
        latestUserMessageAt: null,
        hasPendingApprovals: false,
        hasPendingUserInput: false,
        hasActionableProposedPlan: false,
        backgroundLiveness: null,
        messages: [],
        activities: [],
        proposedPlans: [],
        checkpoints: [],
        deletedAt: null,
      },
    ],
    schedules: [],
  } as unknown as OrchestrationReadModel;
}

function turnStart(authoredBy?: "schedule" | "handoff") {
  return {
    type: "thread.turn.start" as const,
    commandId: CommandId.make("cmd-turn-start"),
    threadId: ThreadId.make("thread-1"),
    message: {
      messageId: MessageId.make("message-1"),
      role: "user" as const,
      text: "Continue",
      attachments: [],
    },
    runtimeMode: "full-access" as const,
    interactionMode: "default" as const,
    ...(authoredBy !== undefined ? { authoredBy } : {}),
    createdAt: NOW,
  };
}

function messageSentPayload(result: unknown): typeof ThreadMessageSentPayload.Type {
  const events = Array.isArray(result) ? result : [result];
  const event = events.find((entry) => entry.type === "thread.message-sent");
  expect(event).toBeDefined();
  return event.payload as typeof ThreadMessageSentPayload.Type;
}

it.layer(NodeServices.layer)("message provenance", (it) => {
  it.effect("omits authoredBy on a plain user turn so older readers see a user message", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command: turnStart(),
        readModel: makeReadModel(),
      });
      expect(messageSentPayload(result)).not.toHaveProperty("authoredBy");
    }),
  );

  it.effect("copies a server-set authoredBy onto the persisted user message", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command: turnStart("schedule"),
        readModel: makeReadModel(),
      });
      expect(messageSentPayload(result).authoredBy).toBe("schedule");
    }),
  );
});
