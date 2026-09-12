import * as Schema from "effect/Schema";

/**
 * How much a thread's provider may do without asking. Lives in its own module
 * so records outside the thread aggregate (managers, assistants) can carry a
 * runtime mode without importing the orchestration contracts, which import
 * them back.
 */
export const RuntimeMode = Schema.Literals([
  "approval-required",
  "auto-accept-edits",
  "auto",
  "full-access",
]);
export type RuntimeMode = typeof RuntimeMode.Type;
export const DEFAULT_RUNTIME_MODE: RuntimeMode = "full-access";
