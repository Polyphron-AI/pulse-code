import * as Schema from "effect/Schema";

const Identifier = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/));
const Label = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(240));
export const InfrastructureStage = Schema.Literals(["development", "staging", "production"]);
export const InfrastructureQueryKind = Schema.Literals(["prometheus", "loki"]);

export const InfrastructureQuerySummary = Schema.Struct({
  id: Identifier,
  label: Label,
  kind: InfrastructureQueryKind,
});

export const InfrastructureTargetSummary = Schema.Struct({
  id: Identifier,
  label: Label,
  stage: InfrastructureStage,
  service: Label,
  repository: Label,
  queries: Schema.Array(InfrastructureQuerySummary),
});

export const InfrastructureQueryInput = Schema.Struct({
  targetId: Identifier,
  queryId: Identifier,
  lookbackMinutes: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 60 })),
});
export type InfrastructureQueryInput = typeof InfrastructureQueryInput.Type;

export const InfrastructureQueryResult = Schema.Struct({
  target: InfrastructureTargetSummary,
  queryId: Identifier,
  startTime: Schema.String,
  endTime: Schema.String,
  fetchedAt: Schema.String,
  text: Schema.String,
  outputTruncated: Schema.Boolean,
});
export type InfrastructureQueryResult = typeof InfrastructureQueryResult.Type;

export class InfrastructureError extends Schema.TaggedErrorClass<InfrastructureError>()(
  "InfrastructureError",
  { code: Schema.Literals(["configuration", "unavailable", "upstream"]), message: Schema.String },
) {}
