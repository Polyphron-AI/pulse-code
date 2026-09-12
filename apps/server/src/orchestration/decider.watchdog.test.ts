import {
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  ThreadWatchdogUpdatedPayload,
  type OrchestrationReadModel,
  type OrchestrationThread,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function makeThread(overrides: Partial<OrchestrationThread> = {}): OrchestrationThread {
  return {
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
    ...overrides,
  } as unknown as OrchestrationThread;
}

function makeReadModel(thread: OrchestrationThread): OrchestrationReadModel {
  return {
    snapshotSequence: 0,
    projects: [],
    threads: [thread],
    schedules: [],
  } as unknown as OrchestrationReadModel;
}

function watchdogPayload(result: unknown): typeof ThreadWatchdogUpdatedPayload.Type {
  const events = Array.isArray(result) ? result : [result];
  const event = events.find((entry: { type: string }) => entry.type === "thread.watchdog-updated");
  expect(event).toBeDefined();
  return event.payload as typeof ThreadWatchdogUpdatedPayload.Type;
}

it.layer(NodeServices.layer)("watchdog commands", (it) => {
  it.effect("thread.watchdog.set enables the watchdog and resets counters", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command: {
          type: "thread.watchdog.set" as const,
          commandId: CommandId.make("cmd-watchdog-set"),
          threadId: ThreadId.make("thread-1"),
          enabled: true,
          rules: "Approve read-only commands. Escalate anything destructive.",
          modelSelection: null,
          createdAt: NOW,
        },
        readModel: makeReadModel(makeThread()),
      });
      const watchdog = watchdogPayload(result).watchdog;
      expect(watchdog).toEqual({
        enabled: true,
        rules: "Approve read-only commands. Escalate anything destructive.",
        modelSelection: null,
        escalatedAt: null,
        interventions: 0,
      });
    }),
  );

  it.effect("thread.watchdog.record-intervention increments interventions", () =>
    Effect.gen(function* () {
      const thread = makeThread({
        watchdog: {
          enabled: true,
          rules: "Approve everything read-only.",
          modelSelection: null,
          escalatedAt: null,
          interventions: 3,
        },
      });
      const result = yield* decideOrchestrationCommand({
        command: {
          type: "thread.watchdog.record-intervention" as const,
          commandId: CommandId.make("cmd-watchdog-intervene"),
          threadId: ThreadId.make("thread-1"),
          createdAt: NOW,
        },
        readModel: makeReadModel(thread),
      });
      const watchdog = watchdogPayload(result).watchdog;
      expect(watchdog.interventions).toBe(4);
      expect(watchdog.enabled).toBe(true);
      expect(watchdog.rules).toBe("Approve everything read-only.");
      expect(watchdog.escalatedAt).toBeNull();
    }),
  );

  it.effect("thread.watchdog.escalate sets escalatedAt and leaves interventions untouched", () =>
    Effect.gen(function* () {
      const thread = makeThread({
        watchdog: {
          enabled: true,
          rules: "Approve everything read-only.",
          modelSelection: null,
          escalatedAt: null,
          interventions: 10,
        },
      });
      const result = yield* decideOrchestrationCommand({
        command: {
          type: "thread.watchdog.escalate" as const,
          commandId: CommandId.make("cmd-watchdog-escalate"),
          threadId: ThreadId.make("thread-1"),
          reason: "Watchdog stuck after 10 interventions",
          createdAt: NOW,
        },
        readModel: makeReadModel(thread),
      });
      const watchdog = watchdogPayload(result).watchdog;
      expect(watchdog.interventions).toBe(10);
      expect(watchdog.escalatedAt).not.toBeNull();
    }),
  );
});
