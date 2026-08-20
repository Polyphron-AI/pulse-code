import * as Schema from "effect/Schema";

import {
  EnvironmentId,
  ForwardCompatibleArray,
  IsoDateTime,
  ProjectId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";

const IntegrationIdentifier = TrimmedNonEmptyString.check(Schema.isMaxLength(256));
const IntegrationResourceKind = TrimmedNonEmptyString.check(Schema.isMaxLength(128));
const IntegrationOperation = TrimmedNonEmptyString.check(Schema.isMaxLength(128));
const IntegrationLabel = TrimmedNonEmptyString.check(Schema.isMaxLength(200));
const IntegrationUrl = TrimmedNonEmptyString.check(Schema.isMaxLength(2_048));
const IntegrationDetail = TrimmedNonEmptyString.check(Schema.isMaxLength(4_000));
const IntegrationChangeValue = TrimmedNonEmptyString.check(Schema.isMaxLength(2_000));

export const IntegrationConnectionId = IntegrationIdentifier.pipe(
  Schema.brand("IntegrationConnectionId"),
);
export type IntegrationConnectionId = typeof IntegrationConnectionId.Type;

export const IntegrationProviderId = IntegrationIdentifier.pipe(
  Schema.brand("IntegrationProviderId"),
);
export type IntegrationProviderId = typeof IntegrationProviderId.Type;

export const IntegrationProviderWorkspaceId = IntegrationIdentifier.pipe(
  Schema.brand("IntegrationProviderWorkspaceId"),
);
export type IntegrationProviderWorkspaceId = typeof IntegrationProviderWorkspaceId.Type;

export const IntegrationProviderProjectId = IntegrationIdentifier.pipe(
  Schema.brand("IntegrationProviderProjectId"),
);
export type IntegrationProviderProjectId = typeof IntegrationProviderProjectId.Type;

export const IntegrationActionPreviewId = IntegrationIdentifier.pipe(
  Schema.brand("IntegrationActionPreviewId"),
);
export type IntegrationActionPreviewId = typeof IntegrationActionPreviewId.Type;

export const IntegrationAuditReceiptId = IntegrationIdentifier.pipe(
  Schema.brand("IntegrationAuditReceiptId"),
);
export type IntegrationAuditReceiptId = typeof IntegrationAuditReceiptId.Type;

/**
 * Provider capabilities are deliberately about behavior, not resource shapes.
 * Domain contracts continue to own Issues, pull requests, evidence, and usage.
 */
export const IntegrationCapability = Schema.Literals([
  "work.read",
  "work.write",
  "code.read",
  "evidence.read",
  "workspace.read",
  "usage.read",
  "events.receive",
]);
export type IntegrationCapability = typeof IntegrationCapability.Type;

/** Older clients drop capabilities added by newer servers instead of rejecting the connection. */
export const IntegrationCapabilities = ForwardCompatibleArray(IntegrationCapability).check(
  Schema.isMaxLength(32),
);
export type IntegrationCapabilities = typeof IntegrationCapabilities.Type;

export const IntegrationConnectionState = Schema.Literals([
  "disconnected",
  "checking",
  "connected",
  "degraded",
  "reauthorization_required",
  "error",
]);
export type IntegrationConnectionState = typeof IntegrationConnectionState.Type;

export const IntegrationHealthFailureReason = Schema.Literals([
  "authentication",
  "permission",
  "rate_limited",
  "configuration",
  "invalid_response",
  "unavailable",
  "unknown",
]);
export type IntegrationHealthFailureReason = typeof IntegrationHealthFailureReason.Type;

export const IntegrationHealthFailure = Schema.Struct({
  reason: IntegrationHealthFailureReason,
  detail: IntegrationDetail,
  retryable: Schema.Boolean,
  requiredCapabilities: Schema.optionalKey(IntegrationCapabilities),
});
export type IntegrationHealthFailure = typeof IntegrationHealthFailure.Type;

export const IntegrationConnectionHealth = Schema.Struct({
  state: IntegrationConnectionState,
  lastCheckedAt: Schema.NullOr(IsoDateTime),
  lastSuccessfulAt: Schema.NullOr(IsoDateTime),
  failure: Schema.NullOr(IntegrationHealthFailure),
});
export type IntegrationConnectionHealth = typeof IntegrationConnectionHealth.Type;

/** Explicit environment-local mapping; provider-domain workflow fields do not belong here. */
export const IntegrationProjectMapping = Schema.Struct({
  projectId: ProjectId,
  providerWorkspaceId: Schema.NullOr(IntegrationProviderWorkspaceId),
  providerProjectId: IntegrationProviderProjectId,
  providerProjectName: IntegrationLabel,
  sourceUrl: Schema.NullOr(IntegrationUrl),
  updatedAt: IsoDateTime,
});
export type IntegrationProjectMapping = typeof IntegrationProjectMapping.Type;

export const IntegrationConnectionSnapshot = Schema.Struct({
  connectionId: IntegrationConnectionId,
  environmentId: EnvironmentId,
  providerId: IntegrationProviderId,
  state: IntegrationConnectionState,
  accountHint: Schema.NullOr(IntegrationLabel),
  endpointHint: Schema.NullOr(IntegrationUrl),
  credentialConfigured: Schema.Boolean,
  capabilities: IntegrationCapabilities,
  health: IntegrationConnectionHealth,
  mappings: Schema.Array(IntegrationProjectMapping).check(Schema.isMaxLength(100)),
  updatedAt: IsoDateTime,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type IntegrationConnectionSnapshot = typeof IntegrationConnectionSnapshot.Type;

export const IntegrationContextDetailLevel = Schema.Literals(["summary", "detail"]);
export type IntegrationContextDetailLevel = typeof IntegrationContextDetailLevel.Type;

/** Provenance accompanies a domain resource; it is not a universal work-item payload. */
export const IntegrationContextProvenance = Schema.Struct({
  connectionId: IntegrationConnectionId,
  environmentId: EnvironmentId,
  projectId: ProjectId,
  providerId: IntegrationProviderId,
  providerWorkspaceId: Schema.NullOr(IntegrationProviderWorkspaceId),
  providerProjectId: IntegrationProviderProjectId,
  resourceKind: IntegrationResourceKind,
  resourceId: IntegrationIdentifier,
  sourceUrl: Schema.NullOr(IntegrationUrl),
  fetchedAt: IsoDateTime,
  detailLevel: IntegrationContextDetailLevel,
  stale: Schema.Boolean,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type IntegrationContextProvenance = typeof IntegrationContextProvenance.Type;

export const IntegrationActionChange = Schema.Struct({
  field: IntegrationLabel,
  before: Schema.NullOr(IntegrationChangeValue),
  after: Schema.NullOr(IntegrationChangeValue),
});
export type IntegrationActionChange = typeof IntegrationActionChange.Type;

/** Agent-proposed mutations cannot be represented without an explicit confirmation requirement. */
export const IntegrationActionPreview = Schema.Struct({
  previewId: IntegrationActionPreviewId,
  connectionId: IntegrationConnectionId,
  environmentId: EnvironmentId,
  projectId: ProjectId,
  providerId: IntegrationProviderId,
  capability: IntegrationCapability,
  operation: IntegrationOperation,
  resourceKind: IntegrationResourceKind,
  resourceId: IntegrationIdentifier,
  summary: IntegrationDetail,
  changes: Schema.Array(IntegrationActionChange).check(Schema.isMaxLength(50)),
  expiresAt: IsoDateTime,
  requiresConfirmation: Schema.Literal(true),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type IntegrationActionPreview = typeof IntegrationActionPreview.Type;

export const IntegrationAuditReceiptStatus = Schema.Literals(["succeeded", "failed", "rejected"]);
export type IntegrationAuditReceiptStatus = typeof IntegrationAuditReceiptStatus.Type;

export const IntegrationAuditReceipt = Schema.Struct({
  receiptId: IntegrationAuditReceiptId,
  connectionId: IntegrationConnectionId,
  environmentId: EnvironmentId,
  projectId: Schema.NullOr(ProjectId),
  providerId: IntegrationProviderId,
  actorId: IntegrationIdentifier,
  capability: IntegrationCapability,
  operation: IntegrationOperation,
  resourceKind: Schema.NullOr(IntegrationResourceKind),
  resourceId: Schema.NullOr(IntegrationIdentifier),
  status: IntegrationAuditReceiptStatus,
  reason: Schema.NullOr(IntegrationDetail),
  occurredAt: IsoDateTime,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type IntegrationAuditReceipt = typeof IntegrationAuditReceipt.Type;

export const IntegrationOperationFailureReason = Schema.Literals([
  "not_connected",
  "reauthorization_required",
  "permission_denied",
  "unmapped_project",
  "unsupported_capability",
  "rate_limited",
  "stale_version",
  "not_found",
  "invalid_response",
  "unavailable",
  "invalid_input",
  "action_expired",
  "action_not_confirmed",
]);
export type IntegrationOperationFailureReason = typeof IntegrationOperationFailureReason.Type;

/** Public integration errors intentionally omit raw causes and provider response bodies. */
export class IntegrationOperationError extends Schema.TaggedErrorClass<IntegrationOperationError>()(
  "IntegrationOperationError",
  {
    operation: IntegrationOperation,
    reason: IntegrationOperationFailureReason,
    detail: IntegrationDetail,
    retryable: Schema.Boolean,
    providerId: Schema.optionalKey(IntegrationProviderId),
    requiredCapability: Schema.optionalKey(IntegrationCapability),
    diagnosticId: Schema.optionalKey(IntegrationIdentifier),
  },
) {
  override get message(): string {
    return `Integration ${this.operation} failed (${this.reason}): ${this.detail}`;
  }
}
