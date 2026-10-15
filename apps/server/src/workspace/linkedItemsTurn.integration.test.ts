import { assert, it } from "@effect/vitest";
import {
  CommandId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ProviderThreadId,
  ProviderTurnId,
  ThreadId,
  WorkspaceLinksError,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

import { CodexProviderCapabilitiesV2 } from "../orchestration-v2/Adapters/CodexAdapterV2.ts";
import * as EffectWorker from "../orchestration-v2/EffectWorker.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import type {
  ProviderAdapterV2Event,
  ProviderAdapterV2Shape,
  ProviderAdapterV2TurnInput,
} from "../orchestration-v2/ProviderAdapter.ts";
import * as ProviderAdapterRegistry from "../orchestration-v2/ProviderAdapterRegistry.ts";
import { makeOrchestratorV2ReplayLayerWithRegistry } from "../orchestration-v2/testkit/ProviderReplayHarness.ts";
import { checkpointWorkspace } from "../orchestration-v2/testkit/ReplayFixtureWorkspace.ts";
import { WorkspaceLinks, type WorkspaceLinkOwner } from "./WorkspaceLinks.ts";

const driver = ProviderDriverKind.make("codex");
const instanceId = ProviderInstanceId.make("codex");
const modelSelection = { instanceId, model: "test-model" };
const threadId = ThreadId.make("thread:linked-items");
const projectId = ProjectId.make("project:linked-items");
const messageId = MessageId.make("message:linked-items");

/**
 * Sends a turn and optional queued follow-up through the V2 orchestrator with a fake Codex
 * adapter and the given links store. Returns provider inputs and the stored message text.
 */
const runTurn = (
  name: string,
  text: string,
  contextFor?: WorkspaceLinks["Service"]["contextFor"],
  nextText?: string,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const cwd = yield* checkpointWorkspace(name);
      const events = yield* Queue.unbounded<ProviderAdapterV2Event>();
      const started: Array<ProviderAdapterV2TurnInput> = [];
      const adapter: ProviderAdapterV2Shape = {
        instanceId,
        driver,
        getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
        planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" }),
        openSession: (input) =>
          Effect.gen(function* () {
            const now = yield* DateTime.now;
            return {
              instanceId,
              driver,
              providerSessionId: input.providerSessionId,
              providerSession: {
                id: input.providerSessionId,
                driver,
                providerInstanceId: instanceId,
                status: "ready",
                cwd,
                model: modelSelection.model,
                capabilities: CodexProviderCapabilitiesV2,
                createdAt: now,
                updatedAt: now,
                lastError: null,
              },
              events: Stream.fromQueue(events),
              ensureThread: ({ threadId: appThreadId }) =>
                Effect.succeed({
                  id: ProviderThreadId.make(`provider-thread:${appThreadId}`),
                  driver,
                  providerInstanceId: instanceId,
                  providerSessionId: input.providerSessionId,
                  appThreadId,
                  ownerNodeId: null,
                  nativeThreadRef: { driver, nativeId: "native-thread", strength: "strong" },
                  nativeConversationHeadRef: null,
                  status: "idle",
                  firstRunOrdinal: null,
                  lastRunOrdinal: null,
                  handoffIds: [],
                  forkedFrom: null,
                  createdAt: now,
                  updatedAt: now,
                }),
              resumeThread: ({ providerThread }) => Effect.succeed(providerThread),
              startTurn: (turn) =>
                Effect.gen(function* () {
                  started.push(turn);
                  yield* Queue.offer(events, {
                    type: "provider_turn.updated",
                    driver,
                    providerTurn: {
                      id: ProviderTurnId.make(`provider-turn:${turn.attemptId}`),
                      providerThreadId: turn.providerThread.id,
                      nodeId: turn.rootNodeId,
                      runAttemptId: turn.attemptId,
                      nativeTurnRef: {
                        driver,
                        nativeId: `native:${turn.attemptId}`,
                        strength: "strong",
                      },
                      ordinal: turn.providerTurnOrdinal,
                      status: "running",
                      startedAt: now,
                      completedAt: null,
                    },
                  });
                }),
              steerTurn: () => Effect.die("unused"),
              interruptTurn: () => Effect.void,
              respondToRuntimeRequest: () => Effect.void,
              readThreadSnapshot: () => Effect.die("unused"),
              rollbackThread: () => Effect.die("unused"),
              forkThread: () => Effect.die("unused"),
            };
          }),
      };
      return yield* Effect.gen(function* () {
        const orchestrator = yield* Orchestrator.OrchestratorV2;
        const worker = yield* EffectWorker.OrchestrationEffectWorkerV2;
        yield* orchestrator.dispatch({
          type: "thread.create",
          commandId: CommandId.make("create"),
          threadId,
          projectId,
          title: "Linked items",
          modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: null,
          worktreePath: cwd,
          createdBy: "user",
          creationSource: "web",
        });
        yield* orchestrator.dispatch({
          type: "message.dispatch",
          commandId: CommandId.make("send"),
          threadId,
          messageId,
          text,
          attachments: [],
          dispatchMode: { type: "start_immediately" },
          createdBy: "user",
          creationSource: "web",
        });
        const running = yield* orchestrator.streamDomainEvents.pipe(
          Stream.filter(
            (event) => event.type === "provider-turn.updated" && event.payload.status === "running",
          ),
          Stream.take(1),
          Stream.runDrain,
          Effect.forkScoped,
        );
        yield* worker.drain();
        assert.lengthOf(started, 1);
        yield* Fiber.join(running);
        if (nextText !== undefined) {
          yield* orchestrator.dispatch({
            type: "message.dispatch",
            commandId: CommandId.make("send-next"),
            threadId,
            messageId: MessageId.make("message:next"),
            text: nextText,
            attachments: [],
            dispatchMode: { type: "queue_after_active" },
            createdBy: "user",
            creationSource: "web",
          });
          yield* worker.drain();
          assert.lengthOf(started, 1);
          const settled = yield* orchestrator.streamDomainEvents.pipe(
            Stream.filter(
              (event) =>
                event.type === "run.updated" &&
                event.payload.id === started[0]!.runId &&
                event.payload.status === "waiting",
            ),
            Stream.take(1),
            Stream.runDrain,
            Effect.forkScoped,
          );
          const turn = (yield* orchestrator.getThreadProjection(threadId)).providerTurns[0]!;
          yield* Queue.offer(events, {
            type: "provider_turn.updated",
            driver,
            providerTurn: { ...turn, status: "completed", completedAt: yield* DateTime.now },
          });
          yield* Queue.offer(events, {
            type: "turn.terminal",
            driver,
            providerThreadId: turn.providerThreadId,
            providerTurnId: turn.id,
            runOrdinal: started[0]!.runOrdinal,
            status: "completed",
            failure: null,
            threadDisposition: "reusable",
          });
          yield* Fiber.join(settled);
          const nextRunning = yield* orchestrator.streamDomainEvents.pipe(
            Stream.filter(
              (event) =>
                event.type === "provider-turn.updated" &&
                event.payload.status === "running" &&
                event.payload.runAttemptId !== turn.runAttemptId,
            ),
            Stream.take(1),
            Stream.runDrain,
            Effect.forkScoped,
          );
          yield* worker.drain();
          yield* orchestrator.resumeQueuedRuns;
          yield* worker.drain();
          assert.lengthOf(started, 2);
          yield* Fiber.join(nextRunning);
        }
        const projection = yield* orchestrator.getThreadProjection(threadId);
        return {
          started,
          stored: projection.messages.find((message) => message.id === messageId)?.text,
          storedNext: projection.messages.find(
            (message) => message.id === MessageId.make("message:next"),
          )?.text,
        };
      }).pipe(
        Effect.provide(
          makeOrchestratorV2ReplayLayerWithRegistry(
            { name },
            ProviderAdapterRegistry.makeSingleLayer(adapter),
            { runEffectWorker: false },
          ).pipe(
            Layer.provide(
              contextFor === undefined ? Layer.empty : Layer.mock(WorkspaceLinks)({ contextFor }),
            ),
          ),
        ),
      );
    }),
  );

it.effect("sends the thread's linked items to the provider and stores the message as typed", () =>
  Effect.gen(function* () {
    const asked: Array<WorkspaceLinkOwner> = [];
    const { started, stored } = yield* runTurn("linked-items", "Summarise the brief", (owner) => {
      asked.push(owner);
      return Effect.succeed({
        items: [
          {
            key: "mail:acct_1:%3Cbrief%40example.com%3E",
            item: {
              ref: { type: "mail", accountId: "acct_1", messageId: "<brief@example.com>" },
              title: "Q3 brief",
            },
          },
        ],
        truncated: false,
      });
    });
    assert.deepEqual(asked, [{ threadId, projectId }]);
    assert.equal(started.length, 1);
    assert.match(started[0]!.message.text, /^Summarise the brief\n\n<linked_items>\n/);
    assert.include(
      started[0]!.message.text,
      '- mail "Q3 brief" (key: mail:acct_1:%3Cbrief%40example.com%3E)',
    );
    assert.equal(stored, "Summarise the brief");
  }),
);

it.effect("starts the turn without linked items when the links store fails", () =>
  Effect.gen(function* () {
    const { started, stored } = yield* runTurn("linked-items-fail", "Plan the launch", () =>
      Effect.fail(
        new WorkspaceLinksError({
          kind: "unavailable",
          message: "Linked items could not be loaded.",
        }),
      ),
    );
    assert.equal(started[0]?.message.text, "Plan the launch");
    assert.equal(stored, "Plan the launch");
  }),
);

it.effect("starts the turn without linked items when the links store dies", () =>
  Effect.gen(function* () {
    const { started, stored } = yield* runTurn("linked-items-defect", "Continue", () =>
      Effect.die(new Error("links store crashed")),
    );
    assert.equal(started.length, 1);
    assert.equal(started[0]?.message.text, "Continue");
    assert.equal(stored, "Continue");
  }),
);

it.effect("starts the turn when contextFor throws before returning an effect", () =>
  Effect.gen(function* () {
    const { started, stored } = yield* runTurn("linked-items-sync", "Continue exactly", () => {
      throw new Error("synchronous links failure");
    });
    assert.equal(started.length, 1);
    assert.equal(started[0]?.message.text, "Continue exactly");
    assert.equal(stored, "Continue exactly");
  }),
);

it.effect("starts a turn without an optional WorkspaceLinks service", () =>
  Effect.gen(function* () {
    const { started, stored } = yield* runTurn("linked-items-absent", "No links service");
    assert.equal(started[0]?.message.text, "No links service");
    assert.equal(stored, "No links service");
  }),
);

it.effect("starts a turn without a block when nothing is linked", () =>
  Effect.gen(function* () {
    const { started, stored } = yield* runTurn("linked-items-empty", "No linked items", () =>
      Effect.succeed({ items: [], truncated: false }),
    );
    assert.equal(started[0]?.message.text, "No linked items");
    assert.equal(stored, "No linked items");
  }),
);

it.effect("passes slash commands through without linked-item arguments", () =>
  Effect.gen(function* () {
    const text = "  /review 12";
    const { started, stored } = yield* runTurn("linked-items-slash", text, () =>
      Effect.succeed({
        items: [
          {
            key: "url:https%3A%2F%2Fa.test%2F",
            item: { ref: { type: "url", url: "https://a.test/" }, title: "Review brief" },
          },
        ],
        truncated: false,
      }),
    );
    assert.equal(started[0]?.message.text, text);
    assert.equal(stored, text);
  }),
);

it.effect("loads current linked items again when a queued normal turn starts", () =>
  Effect.gen(function* () {
    let reads = 0;
    const { started, stored, storedNext } = yield* runTurn(
      "linked-items-queued",
      "First message",
      () => {
        reads += 1;
        return Effect.succeed({
          items: [
            {
              key: "url:https%3A%2F%2Fa.test%2F",
              item: { ref: { type: "url", url: "https://a.test/" }, title: `Brief ${reads}` },
            },
          ],
          truncated: false,
        });
      },
      "Second message",
    );
    assert.equal(reads, 2);
    assert.match(started[0]!.message.text, /^First message\n\n<linked_items>\n/);
    assert.include(started[0]!.message.text, '"Brief 1"');
    assert.match(started[1]!.message.text, /^Second message\n\n<linked_items>\n/);
    assert.include(started[1]!.message.text, '"Brief 2"');
    assert.notInclude(started[1]!.message.text, '"Brief 1"');
    assert.equal(stored, "First message");
    assert.equal(storedNext, "Second message");
  }),
);
