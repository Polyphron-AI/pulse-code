/**
 * RuntimeReceiptBus - Internal checkpoint-reactor synchronization receipts.
 *
 * This service exists to expose short-lived orchestration milestones that are
 * useful in tests and harnesses but are not part of the production runtime
 * event model. `CheckpointReactor` publishes receipts such as baseline capture,
 * diff finalization, and turn-processing quiescence so integration tests can
 * wait for those exact points without inferring them indirectly from persisted
 * state.
 *
 * Production code should only call `publish`. Test code may subscribe via
 * `streamEventsForTest`, which is intentionally named to make the intended
 * usage explicit.
 *
 * @module RuntimeReceiptBus
 */
import {
  AssistantId,
  CheckpointRef,
  IsoDateTime,
  ManagerId,
  NonNegativeInt,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";

export const CheckpointBaselineCapturedReceipt = Schema.Struct({
  type: Schema.Literal("checkpoint.baseline.captured"),
  threadId: ThreadId,
  checkpointTurnCount: NonNegativeInt,
  checkpointRef: CheckpointRef,
  createdAt: IsoDateTime,
});
export type CheckpointBaselineCapturedReceipt = typeof CheckpointBaselineCapturedReceipt.Type;

export const CheckpointDiffFinalizedReceipt = Schema.Struct({
  type: Schema.Literal("checkpoint.diff.finalized"),
  threadId: ThreadId,
  turnId: TurnId,
  checkpointTurnCount: NonNegativeInt,
  checkpointRef: CheckpointRef,
  status: Schema.Literals(["ready", "missing", "error"]),
  createdAt: IsoDateTime,
});
export type CheckpointDiffFinalizedReceipt = typeof CheckpointDiffFinalizedReceipt.Type;

export const TurnProcessingQuiescedReceipt = Schema.Struct({
  type: Schema.Literal("turn.processing.quiesced"),
  threadId: ThreadId,
  turnId: TurnId,
  checkpointTurnCount: NonNegativeInt,
  createdAt: IsoDateTime,
});
export type TurnProcessingQuiescedReceipt = typeof TurnProcessingQuiescedReceipt.Type;

export const WatchdogDecisionAppliedReceipt = Schema.Struct({
  type: Schema.Literal("watchdog.decision.applied"),
  threadId: ThreadId,
  gateKind: Schema.Literals(["approval.requested", "user-input.requested"]),
  decision: Schema.Literals(["approve", "deny", "answer", "escalate"]),
  createdAt: IsoDateTime,
});
export type WatchdogDecisionAppliedReceipt = typeof WatchdogDecisionAppliedReceipt.Type;

/** One manager cycle has started its turn on the manager's own thread. */
export const ManagerCycleStartedReceipt = Schema.Struct({
  type: Schema.Literal("manager.cycle.started"),
  managerId: ManagerId,
  threadId: ThreadId,
  createdAt: IsoDateTime,
});
export type ManagerCycleStartedReceipt = typeof ManagerCycleStartedReceipt.Type;

/** The assistant's thread exists, is bound, and its turn has been started. */
export const AssistantThreadReadyReceipt = Schema.Struct({
  type: Schema.Literal("assistant.thread.ready"),
  assistantId: AssistantId,
  threadId: ThreadId,
  createdAt: IsoDateTime,
});
export type AssistantThreadReadyReceipt = typeof AssistantThreadReadyReceipt.Type;

export const OrchestrationRuntimeReceipt = Schema.Union([
  CheckpointBaselineCapturedReceipt,
  CheckpointDiffFinalizedReceipt,
  WatchdogDecisionAppliedReceipt,
  ManagerCycleStartedReceipt,
  AssistantThreadReadyReceipt,
  TurnProcessingQuiescedReceipt,
]);
export type OrchestrationRuntimeReceipt = typeof OrchestrationRuntimeReceipt.Type;

export interface RuntimeReceiptBusShape {
  readonly publish: (receipt: OrchestrationRuntimeReceipt) => Effect.Effect<void>;
  readonly streamEventsForTest: Stream.Stream<OrchestrationRuntimeReceipt>;
}

export class RuntimeReceiptBus extends Context.Service<RuntimeReceiptBus, RuntimeReceiptBusShape>()(
  "t3/orchestration/Services/RuntimeReceiptBus",
) {}
