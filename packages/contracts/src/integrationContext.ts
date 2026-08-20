import * as Schema from "effect/Schema";

import {
  IntegrationActionPreview,
  IntegrationActionPreviewId,
  IntegrationConnectionId,
  IntegrationContextDetailLevel,
  IntegrationContextProvenance,
} from "./integrations.ts";
import { IssueId, IssueSeverity, IssueStatus } from "./issues.ts";
import { IsoDateTime, NonNegativeInt, ProjectId, TrimmedNonEmptyString } from "./baseSchemas.ts";

const ContextIdentifier = TrimmedNonEmptyString.check(Schema.isMaxLength(256));
const ContextLabel = TrimmedNonEmptyString.check(Schema.isMaxLength(200));
const ContextTitle = TrimmedNonEmptyString.check(Schema.isMaxLength(500));
const ContextSummary = Schema.String.check(Schema.isMaxLength(2_000));
const ContextDescription = Schema.String.check(Schema.isMaxLength(20_000));

export const IntegrationActionConfirmationToken = TrimmedNonEmptyString.check(
  Schema.isMaxLength(512),
).pipe(Schema.brand("IntegrationActionConfirmationToken"));
export type IntegrationActionConfirmationToken = typeof IntegrationActionConfirmationToken.Type;

export const IntegrationActionActorId = ContextIdentifier.pipe(
  Schema.brand("IntegrationActionActorId"),
);
export type IntegrationActionActorId = typeof IntegrationActionActorId.Type;

/** Bounded provider-domain detail. Report evidence remains behind native lazy endpoints. */
export const IntegrationIssueContextDetail = Schema.Struct({
  description: ContextDescription,
  labels: Schema.Array(ContextLabel).check(Schema.isMaxLength(50)),
  assignedToId: Schema.NullOr(ContextIdentifier),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type IntegrationIssueContextDetail = typeof IntegrationIssueContextDetail.Type;

export const IntegrationIssueContextResource = Schema.Struct({
  kind: Schema.Literal("issue"),
  id: IssueId,
  ref: ContextLabel,
  title: ContextTitle,
  descriptionExcerpt: ContextSummary,
  status: IssueStatus,
  severity: Schema.Union([IssueSeverity, Schema.Literal("")]),
  version: NonNegativeInt,
  updatedAt: IsoDateTime,
  truncated: Schema.Boolean,
  detail: Schema.NullOr(IntegrationIssueContextDetail),
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type IntegrationIssueContextResource = typeof IntegrationIssueContextResource.Type;

export const IntegrationIssueContext = Schema.Struct({
  provenance: IntegrationContextProvenance,
  resource: IntegrationIssueContextResource,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type IntegrationIssueContext = typeof IntegrationIssueContext.Type;

export const IntegrationIssueContextReadInput = Schema.Struct({
  connectionId: IntegrationConnectionId,
  projectId: ProjectId,
  issueId: IssueId,
  detailLevel: IntegrationContextDetailLevel,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type IntegrationIssueContextReadInput = typeof IntegrationIssueContextReadInput.Type;

export const IntegrationIssueStatusPreviewInput = Schema.Struct({
  connectionId: IntegrationConnectionId,
  projectId: ProjectId,
  issueId: IssueId,
  expectedVersion: NonNegativeInt,
  status: IssueStatus,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type IntegrationIssueStatusPreviewInput = typeof IntegrationIssueStatusPreviewInput.Type;

export const IntegrationIssueStatusActionPreview = Schema.Struct({
  preview: IntegrationActionPreview,
  confirmationToken: IntegrationActionConfirmationToken,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type IntegrationIssueStatusActionPreview = typeof IntegrationIssueStatusActionPreview.Type;

export const IntegrationIssueStatusConfirmInput = Schema.Struct({
  previewId: IntegrationActionPreviewId,
  confirmationToken: IntegrationActionConfirmationToken,
  actorId: IntegrationActionActorId,
}).annotate({ parseOptions: { onExcessProperty: "error" } });
export type IntegrationIssueStatusConfirmInput = typeof IntegrationIssueStatusConfirmInput.Type;
