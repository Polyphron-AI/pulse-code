import * as Schema from "effect/Schema";
import { ThreadId } from "./baseSchemas.ts";
import { ModelSelection } from "./modelSelection.ts";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const PULSE_ORCHESTRATION_WS_METHODS = {
  generateThreadHandoff: "orchestration.generateThreadHandoff",
} as const;

export const OrchestrationGenerateThreadHandoffInput = Schema.Struct({
  threadId: ThreadId,
  destination: Schema.optional(ModelSelection),
});
export type OrchestrationGenerateThreadHandoffInput =
  typeof OrchestrationGenerateThreadHandoffInput.Type;

export const OrchestrationGenerateThreadHandoffResult = Schema.Struct({
  summary: TrimmedNonEmptyString,
  capabilityNotice: Schema.optional(TrimmedNonEmptyString),
  truncated: Schema.Boolean,
});
export type OrchestrationGenerateThreadHandoffResult =
  typeof OrchestrationGenerateThreadHandoffResult.Type;

export class OrchestrationGenerateThreadHandoffError extends Schema.TaggedError<OrchestrationGenerateThreadHandoffError>()(
  "OrchestrationGenerateThreadHandoffError",
  { message: TrimmedNonEmptyString, cause: Schema.optional(Schema.Defect()) },
) {}
