/**
 * AssistantReactor - turns "talk to Luna" into a real thread and a real turn.
 *
 * The decider can validate an `assistant.message` but cannot carry it out: the
 * assistant's thread lives in the environment's system project, and only the
 * server knows that project's root and the environment's default model. So the
 * decider emits `assistant.message-requested` and this reactor does the rest,
 * lazily creating and binding the thread under the `assistant:<id>` origin
 * with a read-only tool allow-list before starting the turn.
 *
 * See docs/plans/2026-09-11-agent-roles-design.md, section 1 (Assistant).
 *
 * @module AssistantReactor
 */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

export interface AssistantReactorShape {
  /** Subscribe to domain events. Must run in a scope. */
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;

  /**
   * Wait for every enqueued message to finish. Tests use this instead of
   * sleeping.
   */
  readonly drain: Effect.Effect<void>;
}

export class AssistantReactor extends Context.Service<AssistantReactor, AssistantReactorShape>()(
  "t3/orchestration/Services/AssistantReactor",
) {}
