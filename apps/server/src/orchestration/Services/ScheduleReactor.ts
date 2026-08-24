/**
 * ScheduleReactor - Scheduled Chats sweep reactor service interface.
 *
 * Owns the background fiber that fires scheduled chats: it periodically reads
 * active schedules from the engine's read model, computes due occurrences
 * (including catch-up for missed days), dispatches the occurrence/turn
 * commands, enforces the run/turn watchdog leashes, and settles finished
 * occurrences — writing the handoff file atomically on a clean settle before
 * recording completion, or failing the occurrence without a write otherwise.
 *
 * See docs/plans/2026-08-21-scheduled-chats-design.md.
 *
 * @module ScheduleReactor
 */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

/**
 * ScheduleReactorShape - Service API for the scheduled-chat sweep.
 */
export interface ScheduleReactorShape {
  /**
   * Start the repeating sweep fiber. Must run in a scope so the fiber is
   * finalized on shutdown.
   */
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;

  /**
   * Run one sweep to completion. The repeating fiber calls this on its
   * interval; tests call it directly as a deterministic synchronization point
   * instead of sleeping. Never fails: per-occurrence errors are logged.
   */
  readonly sweepNow: Effect.Effect<void>;
}

/**
 * ScheduleReactor - Service tag for the scheduled-chat sweep reactor.
 */
export class ScheduleReactor extends Context.Service<ScheduleReactor, ScheduleReactorShape>()(
  "t3/orchestration/Services/ScheduleReactor",
) {}
