/**
 * ManagerReactor - manager (Argo) cycle sweep service interface.
 *
 * Owns the background fiber that runs manager cycles: on each sweep it finds
 * every watching manager whose interval has elapsed, ensures the system
 * project and the manager's own thread exist, composes the cycle prompt, and
 * starts one turn on that thread.
 *
 * See docs/plans/2026-09-11-agent-roles-design.md, section 3 (Manager).
 *
 * @module ManagerReactor
 */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

/**
 * ManagerReactorShape - Service API for the manager cycle sweep.
 */
export interface ManagerReactorShape {
  /**
   * Start the repeating sweep fiber. Must run in a scope so the fiber is
   * finalized on shutdown.
   */
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;

  /**
   * Run one sweep to completion. The repeating fiber calls this on its
   * interval; tests call it directly as a deterministic synchronization point
   * instead of sleeping. Never fails: per-manager errors are logged.
   */
  readonly sweepNow: Effect.Effect<void>;
}

/**
 * ManagerReactor - Service tag for the manager cycle sweep reactor.
 */
export class ManagerReactor extends Context.Service<ManagerReactor, ManagerReactorShape>()(
  "t3/orchestration/Services/ManagerReactor",
) {}
