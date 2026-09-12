/**
 * AssistantReactor - runs the assistant's side of `assistant.message`.
 *
 * On `assistant.message-requested` it ensures the environment's system
 * project, lazily creates and binds the assistant's thread under the
 * `assistant:<id>` origin with a read-only tool allow-list, then starts one
 * turn authored by "user". Subsequent messages reuse the bound thread, so the
 * assistant panel is one long conversation until the user resets it.
 *
 * See docs/plans/2026-09-11-agent-roles-design.md, section 1 (Assistant).
 *
 * @module AssistantReactor
 */
import {
  ASSISTANT_THREAD_ALLOWED_TOOLS,
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  MessageId,
  ThreadId,
  assistantThreadOrigin,
  type ModelSelection,
  type OrchestrationAssistant,
  type OrchestrationEvent,
  type OrchestrationReadModel,
  type OrchestrationThread,
} from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { ServerConfig } from "../../config.ts";
import { forkParked } from "../../serverActivation.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { systemProject } from "../projector.ts";
import { AssistantReactor, type AssistantReactorShape } from "../Services/AssistantReactor.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { RuntimeReceiptBus } from "../Services/RuntimeReceiptBus.ts";
import { SYSTEM_PROJECT_ID, SYSTEM_PROJECT_TITLE } from "./ManagerReactor.ts";

type AssistantMessageRequestedEvent = Extract<
  OrchestrationEvent,
  { type: "assistant.message-requested" }
>;

const liveThread = (thread: OrchestrationThread | undefined) =>
  thread !== undefined && thread.deletedAt === null && thread.archivedAt === null;

/**
 * The thread this message belongs on. A bound thread that the user archived
 * (reset) or deleted does not count, so the next message opens a fresh one
 * under a timestamped id rather than colliding with the archived row.
 */
export function resolveAssistantThreadTarget(input: {
  readonly assistant: OrchestrationAssistant;
  readonly readModel: OrchestrationReadModel;
  readonly nowIso: string;
}): { readonly threadId: ThreadId; readonly existing: OrchestrationThread | undefined } {
  const bound =
    input.assistant.threadId === null
      ? undefined
      : input.readModel.threads.find((thread) => thread.id === input.assistant.threadId);
  if (bound !== undefined && liveThread(bound)) {
    return { threadId: bound.id, existing: bound };
  }
  const preferred = ThreadId.make(`assistant-thread:${input.assistant.id}`);
  const atPreferred = input.readModel.threads.find((thread) => thread.id === preferred);
  if (atPreferred === undefined) {
    return { threadId: preferred, existing: undefined };
  }
  if (liveThread(atPreferred)) {
    return { threadId: preferred, existing: atPreferred };
  }
  return {
    threadId: ThreadId.make(`assistant-thread:${input.assistant.id}:${input.nowIso}`),
    existing: undefined,
  };
}

const make = Effect.gen(function* () {
  const engine = yield* OrchestrationEngineService;
  const serverSettings = yield* ServerSettingsService;
  const config = yield* ServerConfig;
  const receiptBus = yield* RuntimeReceiptBus;

  const ensureSystemProject = Effect.fn("assistantEnsureSystemProject")(function* (
    readModel: OrchestrationReadModel,
    nowIso: string,
  ) {
    const existing = systemProject(readModel);
    if (existing !== undefined) return existing.id;
    yield* engine.dispatch({
      type: "project.ensure-system",
      commandId: CommandId.make(`assistant:system-project:${nowIso}`),
      projectId: SYSTEM_PROJECT_ID,
      title: SYSTEM_PROJECT_TITLE,
      workspaceRoot: config.baseDir,
      createdAt: nowIso,
    });
    return SYSTEM_PROJECT_ID;
  });

  const processMessage = Effect.fn("assistantProcessMessage")(function* (
    event: AssistantMessageRequestedEvent,
  ) {
    const { assistantId, text } = event.payload;
    const nowIso = DateTime.formatIso(yield* DateTime.now);
    const readModel = yield* engine.currentReadModel;
    const assistant = (readModel.assistants ?? []).find((entry) => entry.id === assistantId);
    if (assistant === undefined) {
      yield* Effect.logWarning("assistant.reactor.message-skipped", {
        assistantId,
        reason: "no-assistant",
      });
      return;
    }

    const target = resolveAssistantThreadTarget({ assistant, readModel, nowIso });
    const { threadId } = target;
    const base = `assistant:${assistantId}:${event.eventId}`;
    const projectId = yield* ensureSystemProject(readModel, nowIso);
    // The assistant record's own model wins; otherwise the system project's
    // default, otherwise the environment's text-generation default.
    const settings = yield* serverSettings.getSettings;
    const modelSelection: ModelSelection | null =
      assistant.modelSelection ??
      target.existing?.modelSelection ??
      readModel.projects.find((project) => project.id === projectId)?.defaultModelSelection ??
      settings.textGenerationModelSelection ??
      null;
    if (modelSelection === null) {
      yield* Effect.logWarning("assistant.reactor.message-skipped", {
        assistantId,
        reason: "no-model-selection",
      });
      return;
    }

    if (target.existing === undefined) {
      yield* engine.dispatch({
        type: "thread.create",
        commandId: CommandId.make(`${base}:thread-create`),
        threadId,
        projectId,
        title: assistant.name,
        modelSelection,
        runtimeMode: DEFAULT_RUNTIME_MODE,
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        branch: null,
        worktreePath: null,
        origin: assistantThreadOrigin(assistantId),
        // Read, search, and fetch only. Adapters keep the names they know.
        allowedTools: ASSISTANT_THREAD_ALLOWED_TOOLS,
        createdAt: nowIso,
      });
    }
    if (assistant.threadId !== threadId) {
      yield* engine.dispatch({
        type: "assistant.thread.bind",
        commandId: CommandId.make(`${base}:thread-bind`),
        assistantId,
        threadId,
      });
    }

    yield* engine.dispatch({
      type: "thread.turn.start",
      commandId: CommandId.make(`${base}:turn`),
      threadId,
      message: {
        messageId: MessageId.make(`${base}:message`),
        role: "user",
        text,
        attachments: [],
      },
      modelSelection,
      runtimeMode: target.existing?.runtimeMode ?? DEFAULT_RUNTIME_MODE,
      interactionMode: target.existing?.interactionMode ?? DEFAULT_PROVIDER_INTERACTION_MODE,
      ...(target.existing === undefined ? { sessionMode: "fresh" as const } : {}),
      authoredBy: "user",
      createdAt: nowIso,
    });

    yield* receiptBus.publish({
      type: "assistant.thread.ready",
      assistantId,
      threadId,
      createdAt: nowIso,
    });
  });

  const processMessageSafely = (event: AssistantMessageRequestedEvent) =>
    processMessage(event).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) {
          return Effect.failCause(cause);
        }
        return Effect.logWarning("assistant.reactor.message-failed", {
          assistantId: event.payload.assistantId,
          cause: Cause.pretty(cause),
        });
      }),
    );

  const worker = yield* makeDrainableWorker(processMessageSafely);

  const start: AssistantReactorShape["start"] = Effect.fn("start")(function* () {
    // Subscribe before forking: `streamDomainEvents` subscribes lazily on
    // first pull, which drops anything published between `start()` and the
    // forked fiber's first tick.
    const domainEvents = yield* engine.subscribeDomainEvents;
    yield* forkParked(
      Stream.runForEach(domainEvents, (event) =>
        event.type === "assistant.message-requested" ? worker.enqueue(event) : Effect.void,
      ),
    );
  });

  return { start, drain: worker.drain } satisfies AssistantReactorShape;
});

export const AssistantReactorLive = Layer.effect(AssistantReactor, make);
