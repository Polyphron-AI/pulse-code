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
}).annotate({ parseOptions: { onExcessProperty: "error" } });
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

const Uuid = Schema.String.check(
  Schema.isPattern(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?![\s\S])/,
  ),
);
const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}(?![\s\S])/));
export const WardenUseState = Schema.Literals([
  "pending_approval",
  "ready",
  "denied",
  "executing",
  "succeeded",
  "failed",
  "outcome_unknown",
  "revoked",
  "expired",
]);
export const WardenUseSnapshot = Schema.Struct({
  version: Schema.Literal("pulse-warden/read-v1"),
  useId: Uuid,
  resourceRef: Schema.String.check(
    Schema.isPattern(/^urn:pulse:[A-Za-z0-9._-]{1,64}:resource:[A-Za-z0-9._-]{1,64}(?![\s\S])/),
  ),
  requestId: Uuid,
  state: WardenUseState,
  requestDigest: Digest,
  expiresAt: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 253402300799 })),
  revoked: Schema.Boolean,
});
export type WardenUseSnapshot = typeof WardenUseSnapshot.Type;
export const WardenRequestInput = Schema.Struct({
  ...InfrastructureQueryInput.fields,
  requestId: Uuid,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type WardenRequestInput = typeof WardenRequestInput.Type;
export const WardenUseInput = Schema.Struct({
  targetId: Identifier,
  useRef: Schema.String.check(
    Schema.isPattern(/^urn:pulse:[A-Za-z0-9._-]{1,64}:use:[0-9a-f-]{36}(?![\s\S])/),
  ),
  expectedRequestDigest: Digest,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type WardenUseInput = typeof WardenUseInput.Type;
export const WardenUseResult = Schema.Struct({
  ...WardenUseSnapshot.fields,
  targetId: Identifier,
  useRef: WardenUseInput.fields.useRef,
  text: Schema.optional(Schema.String.check(Schema.isMaxLength(24000))),
  startTime: Schema.optional(Schema.String),
  endTime: Schema.optional(Schema.String),
  outputTruncated: Schema.optional(Schema.Boolean),
  resultUnavailable: Schema.optional(Schema.Boolean),
});
export type WardenUseResult = typeof WardenUseResult.Type;

export const WardenReceipt = Schema.Struct({
  receiptId: Uuid,
  useId: Uuid,
  principalId: Schema.String.check(Schema.isMaxLength(64)),
  requestDigest: Digest,
  version: Schema.Literal("pulse-warden/read-v1"),
  action: Schema.String.check(Schema.isMaxLength(32)),
  outcome: Schema.String.check(Schema.isMaxLength(32)),
  createdAt: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 253402300799 })),
});
export const WardenReceiptsInput = Schema.Struct({
  ...WardenUseInput.fields,
  cursor: Schema.optional(Uuid),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type WardenReceiptsInput = typeof WardenReceiptsInput.Type;
export const WardenReceiptsResult = Schema.Struct({
  resourceRef: WardenUseSnapshot.fields.resourceRef,
  version: Schema.Literal("pulse-warden/read-v1"),
  useId: Uuid,
  receipts: Schema.Array(WardenReceipt).check(Schema.isMaxLength(100)),
  nextCursor: Schema.Union([Schema.Literal(""), Uuid]),
});
