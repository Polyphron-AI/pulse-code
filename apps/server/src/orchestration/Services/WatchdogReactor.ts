/**
 * WatchdogReactor - Watchdog gate-response reactor service interface.
 *
 * Owns the background worker that reacts to pending approval and user-input
 * gates on threads with an enabled watchdog: it asks TextGeneration to decide
 * the gate under the thread's rules, dispatches the corresponding response
 * command, and escalates when the model is unsure or the thread is stuck.
 *
 * See docs/plans/2026-09-11-agent-roles-design.md, section 2 (Watchdog).
 *
 * @module WatchdogReactor
 */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

/**
 * WatchdogReactorShape - Service API for the watchdog gate reactor.
 */
export interface WatchdogReactorShape {
  /**
   * Start reacting to thread-activity orchestration domain events that open
   * approval or user-input gates.
   *
   * The returned effect must be run in a scope so the worker fiber can be
   * finalized on shutdown.
   */
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;

  /**
   * Resolves when the internal processing queue is empty and idle.
   * Intended for test use to replace timing-sensitive sleeps.
   */
  readonly drain: Effect.Effect<void>;
}

/**
 * WatchdogReactor - Service tag for the watchdog gate-response reactor.
 */
export class WatchdogReactor extends Context.Service<WatchdogReactor, WatchdogReactorShape>()(
  "t3/orchestration/Services/WatchdogReactor",
) {}
