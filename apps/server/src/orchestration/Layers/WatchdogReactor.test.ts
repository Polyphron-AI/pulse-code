// @effect-diagnostics nodeBuiltinImport:off
import {
  ApprovalRequestId,
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  EventId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TextGenerationError,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { deriveServerPaths, ServerConfig } from "../../config.ts";
import { OrchestrationEventStoreLive } from "../../persistence/Layers/OrchestrationEventStore.ts";
import { OrchestrationCommandReceiptRepositoryLive } from "../../persistence/Layers/OrchestrationCommandReceipts.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import {
  TextGeneration,
  type TextGenerationShape,
  type WatchdogDecisionGenerationResult,
} from "../../textGeneration/TextGeneration.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import * as ThreadBackgroundLiveness from "../ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "../ThreadPlanProgress.ts";
import { OrchestrationEngineLive } from "./OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "./ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./ProjectionSnapshotQuery.ts";
import { WatchdogReactorLive, WATCHDOG_MAX_INTERVENTIONS } from "./WatchdogReactor.ts";
import { RuntimeReceiptBusTest } from "./RuntimeReceiptBus.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import { WatchdogReactor } from "../Services/WatchdogReactor.ts";
import {
  RuntimeReceiptBus,
  type OrchestrationRuntimeReceipt,
} from "../Services/RuntimeReceiptBus.ts";

const asProjectId = (value: string): ProjectId => ProjectId.make(value);
const asApprovalRequestId = (value: string): ApprovalRequestId => ApprovalRequestId.make(value);
const threadId = ThreadId.make("thread-1");
const modelSelection = createModelSelection(ProviderInstanceId.make("claude"), "sonnet");
const now = "2026-01-01T00:00:00.000Z";

const deriveServerPathsSync = (baseDir: string, devUrl: URL | undefined) =>
  Effect.runSync(deriveServerPaths(baseDir, devUrl).pipe(Effect.provide(NodeServices.layer)));

describe("WatchdogReactor", () => {
  let runtime: ManagedRuntime.ManagedRuntime<
    OrchestrationEngineService | ProjectionSnapshotQuery | WatchdogReactor | RuntimeReceiptBus,
    unknown
  > | null = null;
  let scope: Scope.Closeable | null = null;
  const createdBaseDirs = new Set<string>();

  afterEach(async () => {
    if (scope) {
      await Effect.runPromise(Scope.close(scope, Exit.void));
    }
    scope = null;
    if (runtime) {
      await runtime.dispose();
    }
    runtime = null;
    for (const baseDir of createdBaseDirs) {
      NodeFS.rmSync(baseDir, { recursive: true, force: true });
    }
    createdBaseDirs.clear();
  });

  async function createHarness(input: {
    readonly generateWatchdogDecision: (
      req: Parameters<TextGenerationShape["generateWatchdogDecision"]>[0],
    ) => Effect.Effect<WatchdogDecisionGenerationResult, TextGenerationError>;
    readonly interventions?: number;
  }) {
    const generateWatchdogDecision = vi.fn(input.generateWatchdogDecision);
    const baseDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-watchdog-"));
    createdBaseDirs.add(baseDir);
    deriveServerPathsSync(baseDir, undefined);

    const orchestrationLayer = OrchestrationEngineLive.pipe(
      Layer.provide(OrchestrationProjectionSnapshotQueryLive),
      Layer.provide(ThreadBackgroundLiveness.layer),
      Layer.provide(ThreadPlanProgress.layer),
      Layer.provide(OrchestrationProjectionPipelineLive),
      Layer.provide(OrchestrationEventStoreLive),
      Layer.provide(OrchestrationCommandReceiptRepositoryLive),
      Layer.provide(RepositoryIdentityResolver.layer),
      Layer.provide(SqlitePersistenceMemory),
    );
    const projectionSnapshotLayer = OrchestrationProjectionSnapshotQueryLive.pipe(
      Layer.provide(ThreadBackgroundLiveness.layer),
      Layer.provide(ThreadPlanProgress.layer),
      Layer.provide(RepositoryIdentityResolver.layer),
      Layer.provide(SqlitePersistenceMemory),
    );

    const layer = WatchdogReactorLive.pipe(
      Layer.provideMerge(orchestrationLayer),
      Layer.provideMerge(projectionSnapshotLayer),
      Layer.provideMerge(
        Layer.mock(TextGeneration, {
          generateWatchdogDecision:
            generateWatchdogDecision as TextGenerationShape["generateWatchdogDecision"],
        }),
      ),
      Layer.provideMerge(RuntimeReceiptBusTest),
      Layer.provideMerge(ServerSettingsService.layerTest()),
      Layer.provideMerge(ServerConfig.layerTest(process.cwd(), baseDir)),
      Layer.provideMerge(NodeServices.layer),
    );

    runtime = ManagedRuntime.make(layer);

    const engine = await runtime.runPromise(Effect.service(OrchestrationEngineService));
    const snapshotQuery = await runtime.runPromise(Effect.service(ProjectionSnapshotQuery));
    const receiptBus = await runtime.runPromise(Effect.service(RuntimeReceiptBus));
    const reactor = await runtime.runPromise(Effect.service(WatchdogReactor));

    await Effect.runPromise(
      engine.dispatch({
        type: "project.create",
        commandId: CommandId.make("cmd-project-create"),
        projectId: asProjectId("project-1"),
        title: "Watchdog Project",
        workspaceRoot: "/tmp/watchdog-project",
        defaultModelSelection: modelSelection,
        createdAt: now,
      }),
    );
    await Effect.runPromise(
      engine.dispatch({
        type: "thread.create",
        commandId: CommandId.make("cmd-thread-create"),
        threadId,
        projectId: asProjectId("project-1"),
        title: "Thread",
        modelSelection,
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        runtimeMode: "approval-required",
        branch: null,
        worktreePath: null,
        createdAt: now,
      }),
    );
    await Effect.runPromise(
      engine.dispatch({
        type: "thread.watchdog.set",
        commandId: CommandId.make("cmd-watchdog-set"),
        threadId,
        enabled: true,
        rules: "Approve anything safe.",
        modelSelection: null,
        createdAt: now,
      }),
    );
    for (let index = 0; index < (input.interventions ?? 0); index += 1) {
      await Effect.runPromise(
        engine.dispatch({
          type: "thread.watchdog.record-intervention",
          commandId: CommandId.make(`cmd-watchdog-intervention-${index}`),
          threadId,
          createdAt: now,
        }),
      );
    }

    scope = await Effect.runPromise(Scope.make("sequential"));
    await Effect.runPromise(reactor.start().pipe(Scope.provide(scope)));

    // The PubSub-backed test bus only delivers to subscribers that exist at
    // publish time, and `Stream.fromPubSub` subscribes lazily on first pull.
    // Acquiring the pull here subscribes once, up front, so a receipt
    // published before the test asks for it is still queued and not dropped.
    const pullReceipts = await Effect.runPromise(
      Stream.toPull(receiptBus.streamEventsForTest).pipe(Scope.provide(scope)),
    );
    const nextReceipt = (): Promise<OrchestrationRuntimeReceipt | undefined> =>
      Effect.runPromise(pullReceipts.pipe(Effect.map((receipts) => receipts[0])));

    return {
      engine,
      readModel: () => Effect.runPromise(snapshotQuery.getSnapshot()),
      nextReceipt,
      generateWatchdogDecision,
    };
  }

  async function appendApprovalGate(engine: OrchestrationEngineService["Service"]) {
    await Effect.runPromise(
      engine.dispatch({
        type: "thread.activity.append",
        commandId: CommandId.make("cmd-activity-approval"),
        threadId,
        activity: {
          id: EventId.make("event-approval-requested"),
          tone: "approval",
          kind: "approval.requested",
          summary: "Command approval requested",
          payload: { requestId: asApprovalRequestId("request-1"), requestType: "command" },
          turnId: null,
          createdAt: now,
        },
        createdAt: now,
      }),
    );
  }

  async function appendUserInputGate(engine: OrchestrationEngineService["Service"]) {
    await Effect.runPromise(
      engine.dispatch({
        type: "thread.activity.append",
        commandId: CommandId.make("cmd-activity-user-input"),
        threadId,
        activity: {
          id: EventId.make("event-user-input-requested"),
          tone: "info",
          kind: "user-input.requested",
          summary: "User input requested",
          payload: {
            requestId: asApprovalRequestId("request-2"),
            questions: [
              {
                id: "question-1",
                header: "Continue?",
                question: "Should I continue?",
                options: [],
              },
            ],
          },
          turnId: null,
          createdAt: now,
        },
        createdAt: now,
      }),
    );
  }

  it("approves an approval gate when the model decides approve", async () => {
    const harness = await createHarness({
      generateWatchdogDecision: () =>
        Effect.succeed({ decision: "approve", answer: "", reason: "" }),
    });

    await appendApprovalGate(harness.engine);
    const receipt = await harness.nextReceipt();

    expect(receipt).toEqual({
      type: "watchdog.decision.applied",
      threadId,
      gateKind: "approval.requested",
      decision: "approve",
      createdAt: now,
    });

    const snapshot = await harness.readModel();
    const thread = snapshot.threads.find((candidate) => candidate.id === threadId);
    expect(thread?.watchdog?.interventions).toBe(1);
  });

  it("answers a user-input gate when the model decides answer", async () => {
    const harness = await createHarness({
      generateWatchdogDecision: () =>
        Effect.succeed({ decision: "answer", answer: "Yes, continue.", reason: "" }),
    });

    await appendUserInputGate(harness.engine);
    const receipt = await harness.nextReceipt();

    expect(receipt).toEqual({
      type: "watchdog.decision.applied",
      threadId,
      gateKind: "user-input.requested",
      decision: "answer",
      createdAt: now,
    });

    const snapshot = await harness.readModel();
    const thread = snapshot.threads.find((candidate) => candidate.id === threadId);
    expect(thread?.watchdog?.interventions).toBe(1);
  });

  it("escalates when the model returns a decision that does not fit the gate", async () => {
    const harness = await createHarness({
      generateWatchdogDecision: () =>
        Effect.succeed({ decision: "garbage", answer: "", reason: "" }),
    });

    await appendApprovalGate(harness.engine);
    const receipt = await harness.nextReceipt();

    expect(receipt).toEqual({
      type: "watchdog.decision.applied",
      threadId,
      gateKind: "approval.requested",
      decision: "escalate",
      createdAt: now,
    });

    const snapshot = await harness.readModel();
    const thread = snapshot.threads.find((candidate) => candidate.id === threadId);
    // The decider stamps `escalatedAt` from the server clock, not from the
    // command's `createdAt`, so assert only that the thread is escalated.
    expect(thread?.watchdog?.escalatedAt).toEqual(expect.any(String));
    expect(thread?.activities.some((activity) => activity.kind === "watchdog.escalated")).toBe(
      true,
    );
  });

  it("escalates without calling TextGeneration once the intervention limit is reached", async () => {
    const harness = await createHarness({
      generateWatchdogDecision: () =>
        Effect.succeed({ decision: "approve", answer: "", reason: "" }),
      interventions: WATCHDOG_MAX_INTERVENTIONS,
    });

    await appendApprovalGate(harness.engine);
    const receipt = await harness.nextReceipt();

    expect(receipt).toEqual({
      type: "watchdog.decision.applied",
      threadId,
      gateKind: "approval.requested",
      decision: "escalate",
      createdAt: now,
    });
    expect(harness.generateWatchdogDecision).not.toHaveBeenCalled();

    const snapshot = await harness.readModel();
    const thread = snapshot.threads.find((candidate) => candidate.id === threadId);
    // The decider stamps `escalatedAt` from the server clock, not from the
    // command's `createdAt`, so assert only that the thread is escalated.
    expect(thread?.watchdog?.escalatedAt).toEqual(expect.any(String));
  });
  it("acts again once the user replies to a stuck watchdog", async () => {
    const harness = await createHarness({
      generateWatchdogDecision: () =>
        Effect.succeed({ decision: "approve", answer: "", reason: "" }),
      interventions: WATCHDOG_MAX_INTERVENTIONS,
    });

    await appendApprovalGate(harness.engine);
    expect(await harness.nextReceipt()).toMatchObject({ decision: "escalate" });

    // A human reply is the reverse state for a stuck watchdog. The reactor
    // reads the SQL projection, not the in-memory read model, so the reset
    // has to land in the projected row or the watchdog stays stuck forever.
    await Effect.runPromise(
      harness.engine.dispatch({
        type: "thread.turn.start",
        commandId: CommandId.make("cmd-user-reply"),
        threadId,
        message: {
          messageId: MessageId.make("message-user-reply"),
          role: "user",
          text: "I looked at it, carry on.",
          attachments: [],
        },
        modelSelection,
        runtimeMode: "approval-required",
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        createdAt: now,
      }),
    );

    const afterReply = await harness.readModel();
    const resetThread = afterReply.threads.find((candidate) => candidate.id === threadId);
    expect(resetThread?.watchdog?.interventions).toBe(0);
    expect(resetThread?.watchdog?.escalatedAt).toBeNull();

    await Effect.runPromise(
      harness.engine.dispatch({
        type: "thread.activity.append",
        commandId: CommandId.make("cmd-activity-approval-after-reply"),
        threadId,
        activity: {
          id: EventId.make("event-approval-requested-after-reply"),
          tone: "approval",
          kind: "approval.requested",
          summary: "Command approval requested",
          payload: { requestId: asApprovalRequestId("request-3"), requestType: "command" },
          turnId: null,
          createdAt: now,
        },
        createdAt: now,
      }),
    );

    expect(await harness.nextReceipt()).toMatchObject({ decision: "approve" });
    expect(harness.generateWatchdogDecision).toHaveBeenCalledTimes(1);
  });
});
