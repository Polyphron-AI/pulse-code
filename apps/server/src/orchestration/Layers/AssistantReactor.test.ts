// @effect-diagnostics nodeBuiltinImport:off
import {
  ASSISTANT_THREAD_ALLOWED_TOOLS,
  AssistantId,
  CommandId,
  ProviderInstanceId,
  ThreadId,
  assistantThreadOrigin,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import { afterEach, describe, expect, it } from "vite-plus/test";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { deriveServerPaths, ServerConfig } from "../../config.ts";
import { OrchestrationEventStoreLive } from "../../persistence/Layers/OrchestrationEventStore.ts";
import { OrchestrationCommandReceiptRepositoryLive } from "../../persistence/Layers/OrchestrationCommandReceipts.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import * as ThreadBackgroundLiveness from "../ThreadBackgroundLiveness.ts";
import * as ThreadPlanProgress from "../ThreadPlanProgress.ts";
import { OrchestrationEngineLive } from "./OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "./ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./ProjectionSnapshotQuery.ts";
import { AssistantReactorLive } from "./AssistantReactor.ts";
import { RuntimeReceiptBusTest } from "./RuntimeReceiptBus.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { AssistantReactor } from "../Services/AssistantReactor.ts";
import {
  RuntimeReceiptBus,
  type OrchestrationRuntimeReceipt,
} from "../Services/RuntimeReceiptBus.ts";

const assistantId = AssistantId.make("assistant-1");
const assistantThreadId = ThreadId.make(`assistant-thread:${assistantId}`);
const modelSelection = createModelSelection(ProviderInstanceId.make("claude"), "sonnet");
const now = "2026-01-01T00:00:00.000Z";

const deriveServerPathsSync = (baseDir: string, devUrl: URL | undefined) =>
  Effect.runSync(deriveServerPaths(baseDir, devUrl).pipe(Effect.provide(NodeServices.layer)));

describe("AssistantReactor", () => {
  let runtime: ManagedRuntime.ManagedRuntime<
    OrchestrationEngineService | AssistantReactor | RuntimeReceiptBus,
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

  async function createHarness() {
    const baseDir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3code-assistant-"));
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

    const layer = AssistantReactorLive.pipe(
      Layer.provideMerge(orchestrationLayer),
      Layer.provideMerge(RuntimeReceiptBusTest),
      Layer.provideMerge(
        ServerSettingsService.layerTest({ textGenerationModelSelection: modelSelection }),
      ),
      Layer.provideMerge(ServerConfig.layerTest(process.cwd(), baseDir)),
      Layer.provideMerge(NodeServices.layer),
    );

    runtime = ManagedRuntime.make(layer);

    const engine = await runtime.runPromise(Effect.service(OrchestrationEngineService));
    const reactor = await runtime.runPromise(Effect.service(AssistantReactor));
    const receiptBus = await runtime.runPromise(Effect.service(RuntimeReceiptBus));

    await Effect.runPromise(
      engine.dispatch({
        type: "assistant.create",
        commandId: CommandId.make("cmd-assistant-create"),
        assistantId,
        createdAt: now,
      }),
    );

    scope = await Effect.runPromise(Scope.make("sequential"));
    await runtime.runPromise(reactor.start().pipe(Scope.provide(scope)));

    // The test receipt bus only delivers to subscribers that exist at publish
    // time, and `Stream.fromPubSub` subscribes lazily, so pull once up front.
    // Waiting on `assistant.thread.ready` is the synchronization point: the
    // reactor consumes events on its own fiber, so `dispatch` returning says
    // nothing about the turn having started.
    const pullReceipts = await Effect.runPromise(
      Stream.toPull(receiptBus.streamEventsForTest).pipe(Scope.provide(scope)),
    );
    const nextReceipt = (): Promise<OrchestrationRuntimeReceipt | undefined> =>
      Effect.runPromise(pullReceipts.pipe(Effect.map((receipts) => receipts[0])));

    return {
      engine,
      message: async (text: string, commandId: string) => {
        await runtime!.runPromise(
          engine.dispatch({
            type: "assistant.message",
            commandId: CommandId.make(commandId),
            assistantId,
            text,
          }),
        );
        await nextReceipt();
        await runtime!.runPromise(reactor.drain);
      },
      readModel: () => Effect.runPromise(engine.currentReadModel),
    };
  }

  it("creates, binds, and starts a turn on the assistant thread", async () => {
    const harness = await createHarness();

    await harness.message("What changed today?", "cmd-message-1");

    const model = await harness.readModel();
    const systemProjects = model.projects.filter((project) => project.system === true);
    expect(systemProjects).toHaveLength(1);

    const thread = model.threads.find((candidate) => candidate.id === assistantThreadId);
    expect(thread?.projectId).toBe(systemProjects[0]?.id);
    expect(thread?.origin).toBe(assistantThreadOrigin(assistantId));
    expect(thread?.allowedTools).toEqual(ASSISTANT_THREAD_ALLOWED_TOOLS);
    expect(thread?.messages[0]?.text).toBe("What changed today?");
    expect(thread?.messages[0]?.authoredBy).toBe("user");

    expect(model.assistants?.[0]?.threadId).toBe(assistantThreadId);
  });

  it("keeps later messages on the same thread", async () => {
    const harness = await createHarness();

    await harness.message("First", "cmd-message-1");
    await harness.message("Second", "cmd-message-2");

    const model = await harness.readModel();
    const assistantThreads = model.threads.filter(
      (thread) => thread.origin === assistantThreadOrigin(assistantId),
    );
    expect(assistantThreads).toHaveLength(1);
    expect(
      assistantThreads[0]?.messages.filter((message) => message.role === "user").map((m) => m.text),
    ).toEqual(["First", "Second"]);
  });

  it("opens a fresh thread after a reset", async () => {
    const harness = await createHarness();

    await harness.message("First", "cmd-message-1");
    await Effect.runPromise(
      harness.engine.dispatch({
        type: "assistant.reset",
        commandId: CommandId.make("cmd-reset"),
        assistantId,
      }),
    );
    await harness.message("Second", "cmd-message-2");

    const model = await harness.readModel();
    const assistantThreads = model.threads.filter(
      (thread) => thread.origin === assistantThreadOrigin(assistantId),
    );
    expect(assistantThreads).toHaveLength(2);
    expect(model.assistants?.[0]?.threadId).not.toBe(assistantThreadId);
    expect(
      model.threads.find((thread) => thread.id === assistantThreadId)?.archivedAt,
    ).not.toBeNull();
  });
});
