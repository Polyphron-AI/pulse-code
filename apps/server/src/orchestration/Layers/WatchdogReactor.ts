/**
 * WatchdogReactor - watches for pending approval and user-input gates on
 * threads with an enabled watchdog, asks TextGeneration to decide the gate
 * under the thread's rules, and dispatches the corresponding response
 * command. Escalates when the model is unsure, replies with something other
 * than a recognized decision, or the thread has hit the intervention limit.
 *
 * Subscribes to `thread.activity-appended` events carrying an
 * `approval.requested` or `user-input.requested` activity. Those two activity
 * kinds are the actual "gate opened" signal (emitted by
 * `runtimeEventToActivities` in ProviderRuntimeIngestion.ts); the
 * `thread.approval-response-requested` / `thread.user-input-response-requested`
 * events fire only after a decision has already been dispatched, forwarding
 * it to the provider CLI, so they are not useful as a trigger here.
 *
 * See docs/plans/2026-09-11-agent-roles-design.md, section 2 (Watchdog).
 *
 * @module WatchdogReactor
 */
import {
  type ApprovalRequestId,
  CommandId,
  EventId,
  type OrchestrationEvent,
  type OrchestrationThread,
  type ThreadId,
  type UserInputQuestion,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";

import { resolveThreadWorkspaceCwd } from "../../checkpointing/Utils.ts";
import { TextGeneration } from "../../textGeneration/TextGeneration.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { forkParked } from "../../serverActivation.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import { RuntimeReceiptBus } from "../Services/RuntimeReceiptBus.ts";
import { WatchdogReactor, type WatchdogReactorShape } from "../Services/WatchdogReactor.ts";

/** Interventions since the last user message before the watchdog gives up and escalates. */
export const WATCHDOG_MAX_INTERVENTIONS = 10;

type ActivityAppendedEvent = Extract<OrchestrationEvent, { type: "thread.activity-appended" }>;

function isWatchdogGateActivity(event: OrchestrationEvent): event is ActivityAppendedEvent & {
  payload: { activity: { kind: "approval.requested" | "user-input.requested" } };
} {
  return (
    event.type === "thread.activity-appended" &&
    (event.payload.activity.kind === "approval.requested" ||
      event.payload.activity.kind === "user-input.requested")
  );
}

function describePendingRequest(activity: ActivityAppendedEvent["payload"]["activity"]): string {
  const payload = activity.payload as Record<string, unknown> | undefined;
  if (activity.kind === "user-input.requested") {
    const questions = (payload?.questions as ReadonlyArray<UserInputQuestion> | undefined) ?? [];
    return questions
      .map((question) => {
        const options = question.options.map(
          (option) => `- ${option.label}: ${option.description}`,
        );
        return [
          `${question.header}: ${question.question}`,
          ...(options.length > 0 ? options : []),
        ].join("\n");
      })
      .join("\n\n");
  }
  const detail = typeof payload?.detail === "string" ? payload.detail : undefined;
  const requestType = typeof payload?.requestType === "string" ? payload.requestType : "unknown";
  return `${activity.summary} (${requestType})${detail ? `\n${detail}` : ""}`;
}

const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const orchestrationEngine = yield* OrchestrationEngineService;
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;
  const textGeneration = yield* TextGeneration;
  const serverSettingsService = yield* ServerSettingsService;
  const receiptBus = yield* RuntimeReceiptBus;

  const serverCommandId = (tag: string) =>
    crypto.randomUUIDv4.pipe(Effect.map((uuid) => CommandId.make(`server:${tag}:${uuid}`)));
  const serverEventId = () => crypto.randomUUIDv4.pipe(Effect.map(EventId.make));

  const resolveThread = Effect.fnUntraced(function* (threadId: ThreadId) {
    return yield* projectionSnapshotQuery
      .getThreadDetailById(threadId)
      .pipe(Effect.map(Option.getOrUndefined));
  });

  const dispatchEscalate = Effect.fn("dispatchWatchdogEscalate")(function* (input: {
    readonly thread: OrchestrationThread;
    readonly reason: string;
    readonly createdAt: string;
  }) {
    yield* orchestrationEngine.dispatch({
      type: "thread.watchdog.escalate",
      commandId: yield* serverCommandId("watchdog-escalate"),
      threadId: input.thread.id,
      reason: input.reason,
      createdAt: input.createdAt,
    });
    yield* orchestrationEngine.dispatch({
      type: "thread.activity.append",
      commandId: yield* serverCommandId("watchdog-escalate-activity"),
      threadId: input.thread.id,
      activity: {
        id: yield* serverEventId(),
        tone: "approval",
        kind: "watchdog.escalated",
        summary: "Watchdog escalated",
        payload: { reason: input.reason },
        turnId: null,
        createdAt: input.createdAt,
      },
      createdAt: input.createdAt,
    });
  });

  const recordIntervention = Effect.fn("recordWatchdogIntervention")(function* (input: {
    readonly thread: OrchestrationThread;
    readonly createdAt: string;
  }) {
    yield* orchestrationEngine.dispatch({
      type: "thread.watchdog.record-intervention",
      commandId: yield* serverCommandId("watchdog-intervention"),
      threadId: input.thread.id,
      createdAt: input.createdAt,
    });
  });

  const processGateActivity = Effect.fn("processWatchdogGateActivity")(function* (
    event: ActivityAppendedEvent,
  ) {
    const activity = event.payload.activity;
    const gateKind = activity.kind as "approval.requested" | "user-input.requested";
    const thread = yield* resolveThread(event.payload.threadId);
    if (!thread) {
      return;
    }

    const watchdog = thread.watchdog;
    if (!watchdog || !watchdog.enabled || watchdog.escalatedAt !== null) {
      return;
    }
    // Watchdogs never act on manager-owned threads.
    if (thread.origin !== undefined && thread.origin.startsWith("manager:")) {
      return;
    }

    const createdAt = event.occurredAt;

    if (watchdog.interventions >= WATCHDOG_MAX_INTERVENTIONS) {
      yield* dispatchEscalate({
        thread,
        reason: `Reached the ${WATCHDOG_MAX_INTERVENTIONS}-intervention limit without a clear resolution.`,
        createdAt,
      });
      yield* receiptBus.publish({
        type: "watchdog.decision.applied",
        threadId: thread.id,
        gateKind,
        decision: "escalate",
        createdAt,
      });
      return;
    }

    const payload = activity.payload as Record<string, unknown> | undefined;
    const requestId = payload?.requestId as ApprovalRequestId | undefined;
    if (requestId === undefined) {
      return;
    }

    const settings = yield* serverSettingsService.getSettings;
    const modelSelection = watchdog.modelSelection ?? settings.textGenerationModelSelection;
    const cwd = resolveThreadWorkspaceCwd({ thread, projects: [] }) ?? process.cwd();
    const pendingRequest = describePendingRequest(activity);

    const decisionResult = yield* textGeneration
      .generateWatchdogDecision({
        cwd,
        rules: watchdog.rules,
        pendingRequest,
        modelSelection,
      })
      .pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("watchdog reactor failed to generate a decision", {
            threadId: thread.id,
            cause: Cause.pretty(cause),
          }).pipe(
            Effect.as({ decision: "escalate", answer: "", reason: "Decision generation failed." }),
          ),
        ),
      );

    const applyDecision = (decision: "approve" | "deny" | "answer" | "escalate") =>
      Effect.gen(function* () {
        if (decision === "escalate" || decisionResult.decision !== decision) {
          return;
        }
        if (decision === "approve" && gateKind === "approval.requested") {
          yield* orchestrationEngine.dispatch({
            type: "thread.approval.respond",
            commandId: yield* serverCommandId("watchdog-approval-respond"),
            threadId: thread.id,
            requestId,
            decision: "accept",
            createdAt,
          });
          return;
        }
        if (decision === "deny" && gateKind === "approval.requested") {
          yield* orchestrationEngine.dispatch({
            type: "thread.approval.respond",
            commandId: yield* serverCommandId("watchdog-approval-respond"),
            threadId: thread.id,
            requestId,
            decision: "decline",
            createdAt,
          });
          return;
        }
        if (decision === "answer" && gateKind === "user-input.requested") {
          const questions =
            (payload?.questions as ReadonlyArray<UserInputQuestion> | undefined) ?? [];
          const answers: Record<string, unknown> = {};
          for (const question of questions) {
            answers[question.id] = decisionResult.answer;
          }
          yield* orchestrationEngine.dispatch({
            type: "thread.user-input.respond",
            commandId: yield* serverCommandId("watchdog-user-input-respond"),
            threadId: thread.id,
            requestId,
            answers,
            createdAt,
          });
        }
      });

    // A decision that does not fit the gate kind (e.g. "answer" on an
    // approval gate) is treated the same as an unrecognized decision.
    const isApplicable =
      (gateKind === "approval.requested" &&
        (decisionResult.decision === "approve" || decisionResult.decision === "deny")) ||
      (gateKind === "user-input.requested" && decisionResult.decision === "answer");

    if (!isApplicable) {
      yield* dispatchEscalate({
        thread,
        reason:
          decisionResult.reason.length > 0
            ? decisionResult.reason
            : `Watchdog could not confidently decide: "${decisionResult.decision}".`,
        createdAt,
      });
      yield* receiptBus.publish({
        type: "watchdog.decision.applied",
        threadId: thread.id,
        gateKind,
        decision: "escalate",
        createdAt,
      });
      return;
    }

    yield* applyDecision(decisionResult.decision as "approve" | "deny" | "answer");
    yield* recordIntervention({ thread, createdAt });
    yield* receiptBus.publish({
      type: "watchdog.decision.applied",
      threadId: thread.id,
      gateKind,
      decision: decisionResult.decision as "approve" | "deny" | "answer",
      createdAt,
    });
  });

  const processGateActivitySafely = (event: ActivityAppendedEvent) =>
    processGateActivity(event).pipe(
      Effect.catchCause((cause) => {
        if (Cause.hasInterruptsOnly(cause)) {
          return Effect.interrupt;
        }
        return Effect.logWarning("watchdog reactor failed to process gate activity", {
          threadId: event.payload.threadId,
          cause: Cause.pretty(cause),
        });
      }),
    );

  const worker = yield* makeDrainableWorker(processGateActivitySafely);

  const start: WatchdogReactorShape["start"] = Effect.fn("start")(function* () {
    const processEvent = Effect.fn("processEvent")(function* (event: OrchestrationEvent) {
      if (isWatchdogGateActivity(event)) {
        yield* worker.enqueue(event);
      }
    });
    // `orchestrationEngine.streamDomainEvents` subscribes lazily, only once
    // the stream is pulled, so forking `Stream.runForEach` over it directly
    // risks the fork running on a later tick than the caller of `start()`,
    // silently dropping any event published in between. `subscribeDomainEvents`
    // establishes the PubSub subscription synchronously, before forking the
    // consume loop.
    const domainEvents = yield* orchestrationEngine.subscribeDomainEvents;
    yield* forkParked(Stream.runForEach(domainEvents, processEvent));
  });

  return {
    start,
    drain: worker.drain,
  } satisfies WatchdogReactorShape;
});

export const WatchdogReactorLive = Layer.effect(WatchdogReactor, make);
