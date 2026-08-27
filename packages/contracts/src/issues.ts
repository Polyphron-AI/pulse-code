import * as Schema from "effect/Schema";

import {
  IsoDateTime,
  NonNegativeInt,
  PositiveInt,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
} from "./baseSchemas.ts";

/** Pulse calls captured evidence a bug. Pulse Code presents it as a Report. */
export const IssueReportId = TrimmedNonEmptyString.pipe(Schema.brand("IssueReportId"));
export type IssueReportId = typeof IssueReportId.Type;

/** Pulse calls the engineering work item a ticket. Pulse Code presents it as an Issue. */
export const IssueId = TrimmedNonEmptyString.pipe(Schema.brand("IssueId"));
export type IssueId = typeof IssueId.Type;

export const PulseProjectId = TrimmedNonEmptyString.pipe(Schema.brand("PulseProjectId"));
export type PulseProjectId = typeof PulseProjectId.Type;

export const IssueSeverity = Schema.Literals(["critical", "high", "medium", "low"]);
export type IssueSeverity = typeof IssueSeverity.Type;

export const IssueStatus = Schema.Literals([
  "triage",
  "todo",
  "in_progress",
  "resolved",
  "wont_fix",
]);
export type IssueStatus = typeof IssueStatus.Type;

export const IssueReportStatus = Schema.Literals([
  "received",
  "acknowledged",
  "in_progress",
  "resolved",
]);
export type IssueReportStatus = typeof IssueReportStatus.Type;

export const IssueConnectionStatus = Schema.Literals([
  "disconnected",
  "checking",
  "connected",
  "error",
]);
export type IssueConnectionStatus = typeof IssueConnectionStatus.Type;

const BoundedLabel = TrimmedNonEmptyString.check(Schema.isMaxLength(200));
const BoundedLabels = Schema.Array(BoundedLabel).check(Schema.isMaxLength(100));
const BoundedQuery = TrimmedNonEmptyString.check(Schema.isMaxLength(500));
const BoundedUrl = TrimmedNonEmptyString.check(Schema.isMaxLength(2048));
const BoundedIdentifier = TrimmedNonEmptyString.check(Schema.isMaxLength(256));
const PageLimit = PositiveInt.check(Schema.isLessThanOrEqualTo(100));
const PageCursor = TrimmedNonEmptyString.check(Schema.isMaxLength(2_048));

/** Optional additions to the Issues surface. Missing fields mean an older server. */
export const IssueCapabilities = Schema.Struct({
  listProjectReports: Schema.optionalKey(Schema.Literal(true)),
});
export type IssueCapabilities = typeof IssueCapabilities.Type;

export const PulseIssueProject = Schema.Struct({
  id: PulseProjectId,
  name: TrimmedNonEmptyString,
  slug: TrimmedNonEmptyString,
  archivedAt: Schema.NullOr(IsoDateTime),
  allowLoopbackOrigins: Schema.Boolean,
  repoUrl: Schema.optional(Schema.String),
  repoDefaultBranch: Schema.optional(Schema.String),
});
export type PulseIssueProject = typeof PulseIssueProject.Type;

export const IssueProjectMapping = Schema.Struct({
  projectId: ProjectId,
  pulseProjectId: PulseProjectId,
  pulseProjectName: TrimmedNonEmptyString,
  pulseProjectSlug: TrimmedNonEmptyString,
  updatedAt: IsoDateTime,
});
export type IssueProjectMapping = typeof IssueProjectMapping.Type;

export const IssueConnectionSnapshot = Schema.Struct({
  status: IssueConnectionStatus,
  endpoint: Schema.NullOr(BoundedUrl),
  tokenConfigured: Schema.Boolean,
  projects: Schema.Array(PulseIssueProject),
  mappings: Schema.Array(IssueProjectMapping),
  lastCheckedAt: Schema.NullOr(IsoDateTime),
  error: Schema.NullOr(Schema.String),
  capabilities: Schema.optionalKey(IssueCapabilities),
});
export type IssueConnectionSnapshot = typeof IssueConnectionSnapshot.Type;

export const IssueConnectionGetInput = Schema.Struct({});
export type IssueConnectionGetInput = typeof IssueConnectionGetInput.Type;

export const IssueConnectionUpdateInput = Schema.Struct({
  endpoint: BoundedUrl,
  token: TrimmedNonEmptyString.check(Schema.isMaxLength(4096)),
});
export type IssueConnectionUpdateInput = typeof IssueConnectionUpdateInput.Type;

export const IssueProjectMappingSetInput = Schema.Struct({
  projectId: ProjectId,
  pulseProjectId: PulseProjectId,
});
export type IssueProjectMappingSetInput = typeof IssueProjectMappingSetInput.Type;

export const IssueProjectMappingRemoveInput = Schema.Struct({
  projectId: ProjectId,
});
export type IssueProjectMappingRemoveInput = typeof IssueProjectMappingRemoveInput.Type;

export const IssueActor = Schema.Struct({
  id: TrimmedNonEmptyString,
  email: TrimmedNonEmptyString,
});
export type IssueActor = typeof IssueActor.Type;

export const IssueAssigneeCandidate = Schema.Struct({
  id: TrimmedNonEmptyString,
  email: TrimmedNonEmptyString,
  role: Schema.String,
  pending: Schema.Boolean,
  implicit: Schema.Boolean,
});
export type IssueAssigneeCandidate = typeof IssueAssigneeCandidate.Type;

export const IssueAssigneeListInput = Schema.Struct({
  projectId: ProjectId,
});
export type IssueAssigneeListInput = typeof IssueAssigneeListInput.Type;

export const IssueAssigneeListResult = Schema.Struct({
  assignees: Schema.Array(IssueAssigneeCandidate),
});
export type IssueAssigneeListResult = typeof IssueAssigneeListResult.Type;

export const Issue = Schema.Struct({
  id: IssueId,
  pulseProjectId: PulseProjectId,
  ref: TrimmedNonEmptyString,
  title: TrimmedNonEmptyString,
  description: Schema.String,
  severity: Schema.Union([IssueSeverity, Schema.Literal("")]),
  status: IssueStatus,
  assignedToId: Schema.NullOr(TrimmedNonEmptyString),
  labels: Schema.Array(Schema.String),
  resolvedAt: Schema.NullOr(IsoDateTime),
  archivedAt: Schema.NullOr(IsoDateTime),
  version: NonNegativeInt,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  assignedTo: Schema.optional(Schema.NullOr(IssueActor)),
  reportCount: Schema.optional(NonNegativeInt),
});
export type Issue = typeof Issue.Type;

export const IssueRef = Schema.Struct({
  projectId: ProjectId,
  issueId: IssueId,
});
export type IssueRef = typeof IssueRef.Type;

export const IssueReportRef = Schema.Struct({
  projectId: ProjectId,
  reportId: IssueReportId,
});
export type IssueReportRef = typeof IssueReportRef.Type;

export const IssueListInput = Schema.Struct({
  projectId: Schema.optional(ProjectId),
  status: Schema.optional(IssueStatus),
  severities: Schema.optional(Schema.Array(IssueSeverity).check(Schema.isMaxLength(4))),
  assignee: Schema.optional(BoundedIdentifier),
  search: Schema.optional(BoundedQuery),
  sort: Schema.optional(Schema.Literals(["newest", "oldest", "updated", "severity"])),
  includeArchived: Schema.optional(Schema.Boolean),
  limit: Schema.optional(PageLimit),
  offset: Schema.optional(NonNegativeInt),
});
export type IssueListInput = typeof IssueListInput.Type;

export const IssueListResult = Schema.Struct({
  issues: Schema.Array(Issue),
  total: NonNegativeInt,
  limit: PageLimit,
  offset: NonNegativeInt,
});
export type IssueListResult = typeof IssueListResult.Type;

export const IssueDetailResult = Schema.Struct({
  issue: Issue,
  mapping: IssueProjectMapping,
});
export type IssueDetailResult = typeof IssueDetailResult.Type;

/** A bounded member row. Heavy report evidence is fetched only after a report is opened. */
export const IssueReportSummary = Schema.Struct({
  id: IssueReportId,
  title: TrimmedNonEmptyString,
  severity: Schema.Union([IssueSeverity, Schema.Literal("")]),
  status: Schema.Union([IssueReportStatus, Schema.Literal("")]),
  kind: Schema.String,
  reporterEmail: Schema.optional(Schema.NullOr(Schema.String)),
  createdAt: Schema.optional(IsoDateTime),
  errorCount: Schema.optional(NonNegativeInt),
  consoleCount: Schema.optional(NonNegativeInt),
  networkCount: Schema.optional(NonNegativeInt),
});
export type IssueReportSummary = typeof IssueReportSummary.Type;

export const IssueReportsInput = Schema.Struct({
  ...IssueRef.fields,
  limit: Schema.optional(PageLimit),
  offset: Schema.optional(NonNegativeInt),
});
export type IssueReportsInput = typeof IssueReportsInput.Type;

export const IssueReportsResult = Schema.Struct({
  reports: Schema.Array(IssueReportSummary),
  total: NonNegativeInt,
  limit: PageLimit,
  offset: NonNegativeInt,
});
export type IssueReportsResult = typeof IssueReportsResult.Type;

/** A project-level report row. Evidence remains lazy and is fetched through reportDetail. */
export const ProjectReportSummary = Schema.Struct({
  ...IssueReportSummary.fields,
  issueId: Schema.NullOr(IssueId),
});
export type ProjectReportSummary = typeof ProjectReportSummary.Type;

export const ProjectReportListInput = Schema.Struct({
  projectId: ProjectId,
  limit: Schema.optional(PageLimit),
  cursor: Schema.optional(PageCursor),
});
export type ProjectReportListInput = typeof ProjectReportListInput.Type;

export const ProjectReportListResult = Schema.Struct({
  reports: Schema.Array(ProjectReportSummary).check(Schema.isMaxLength(100)),
  nextCursor: Schema.NullOr(PageCursor),
});
export type ProjectReportListResult = typeof ProjectReportListResult.Type;

export const IssueReport = Schema.Struct({
  id: IssueReportId,
  pulseProjectId: PulseProjectId,
  issueId: Schema.NullOr(IssueId),
  title: TrimmedNonEmptyString,
  description: Schema.String,
  severity: Schema.Union([IssueSeverity, Schema.Literal("")]),
  kind: Schema.String,
  status: Schema.Union([IssueReportStatus, Schema.Literal("")]),
  duplicateOfId: Schema.NullOr(IssueReportId),
  environmentLabel: Schema.String,
  reporterEmail: Schema.NullOr(Schema.String),
  version: NonNegativeInt,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  screenshotStatus: Schema.String,
  transcriptionStatus: Schema.String,
  transcriptionSource: Schema.String,
  transcriptionConfidence: Schema.NullOr(Schema.Number),
  labels: Schema.Array(Schema.String),
  reporterIdentity: Schema.NullOr(Schema.Unknown),
  environment: Schema.NullOr(Schema.Unknown),
  consoleEntries: Schema.Array(Schema.Unknown),
  networkEntries: Schema.Array(Schema.Unknown),
  errors: Schema.Array(Schema.Unknown),
  breadcrumbs: Schema.Array(Schema.Unknown),
  backendContext: Schema.NullOr(Schema.Unknown),
  pageMetadata: Schema.NullOr(Schema.Unknown),
  screenshotUrl: Schema.NullOr(Schema.String),
  annotatedScreenshotUrl: Schema.NullOr(Schema.String),
  audioUrl: Schema.NullOr(Schema.String),
  videoUrl: Schema.NullOr(Schema.String),
});
export type IssueReport = typeof IssueReport.Type;

export const IssueActivityEntry = Schema.Struct({
  id: TrimmedNonEmptyString,
  issueId: IssueId,
  actorId: Schema.NullOr(TrimmedNonEmptyString),
  action: TrimmedNonEmptyString,
  field: Schema.NullOr(Schema.String),
  payload: Schema.NullOr(Schema.Unknown),
  source: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
  actor: Schema.optional(Schema.NullOr(IssueActor)),
});
export type IssueActivityEntry = typeof IssueActivityEntry.Type;

export const IssueActivityInput = Schema.Struct({
  ...IssueRef.fields,
  limit: Schema.optional(PageLimit),
  offset: Schema.optional(NonNegativeInt),
});
export type IssueActivityInput = typeof IssueActivityInput.Type;

export const IssueActivityResult = Schema.Struct({
  activity: Schema.Array(IssueActivityEntry),
  total: NonNegativeInt,
  limit: PageLimit,
  offset: NonNegativeInt,
});
export type IssueActivityResult = typeof IssueActivityResult.Type;

export const IssueUpdateInput = Schema.Struct({
  ...IssueRef.fields,
  expectedVersion: NonNegativeInt,
  status: Schema.optional(IssueStatus),
  severity: Schema.optional(IssueSeverity),
  assignedToId: Schema.optional(Schema.NullOr(TrimmedNonEmptyString)),
  title: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(500))),
  description: Schema.optional(Schema.String.check(Schema.isMaxLength(100_000))),
  labels: Schema.optional(BoundedLabels),
});
export type IssueUpdateInput = typeof IssueUpdateInput.Type;

export const IssueReportUpdateInput = Schema.Struct({
  ...IssueReportRef.fields,
  expectedVersion: NonNegativeInt,
  severity: Schema.optional(IssueSeverity),
  labels: Schema.optional(BoundedLabels),
  duplicateOfId: Schema.optional(Schema.NullOr(IssueReportId)),
});
export type IssueReportUpdateInput = typeof IssueReportUpdateInput.Type;

export const IssueCreateFromReportInput = Schema.Struct({
  ...IssueReportRef.fields,
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(500)),
  description: Schema.optional(Schema.String.check(Schema.isMaxLength(100_000))),
  severity: Schema.optional(IssueSeverity),
  labels: Schema.optional(BoundedLabels),
});
export type IssueCreateFromReportInput = typeof IssueCreateFromReportInput.Type;

export const IssueCaptureInlineMedia = Schema.Struct({
  source: Schema.Literal("data-url"),
  kind: Schema.Literals(["screenshot", "audio", "video"]),
  fileName: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  mimeType: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  dataUrl: Schema.String.check(Schema.isMaxLength(25_000_000)),
});
export type IssueCaptureInlineMedia = typeof IssueCaptureInlineMedia.Type;

export const IssueCaptureArtifactMedia = Schema.Struct({
  source: Schema.Literal("preview-artifact"),
  kind: Schema.Literals(["screenshot", "audio", "video"]),
  fileName: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  mimeType: TrimmedNonEmptyString.check(Schema.isMaxLength(255)),
  artifactPath: TrimmedNonEmptyString.check(Schema.isMaxLength(4096)),
});
export type IssueCaptureArtifactMedia = typeof IssueCaptureArtifactMedia.Type;

export const IssueCaptureMedia = Schema.Union([IssueCaptureInlineMedia, IssueCaptureArtifactMedia]);
export type IssueCaptureMedia = typeof IssueCaptureMedia.Type;

export const IssueCaptureInput = Schema.Struct({
  projectId: ProjectId,
  origin: BoundedUrl,
  title: TrimmedNonEmptyString.check(Schema.isMaxLength(500)),
  description: Schema.String.check(Schema.isMaxLength(100_000)),
  severity: IssueSeverity,
  kind: Schema.optional(TrimmedNonEmptyString.check(Schema.isMaxLength(100))),
  featureArea: Schema.optional(Schema.String.check(Schema.isMaxLength(500))),
  pageUrl: Schema.optional(BoundedUrl),
  pageTitle: Schema.optional(Schema.String.check(Schema.isMaxLength(500))),
  environment: Schema.optional(Schema.Unknown),
  consoleEntries: Schema.optional(Schema.Array(Schema.Unknown).check(Schema.isMaxLength(1_000))),
  networkEntries: Schema.optional(Schema.Array(Schema.Unknown).check(Schema.isMaxLength(1_000))),
  errors: Schema.optional(Schema.Array(Schema.Unknown).check(Schema.isMaxLength(1_000))),
  breadcrumbs: Schema.optional(Schema.Array(Schema.Unknown).check(Schema.isMaxLength(1_000))),
  pageMetadata: Schema.optional(Schema.Unknown),
  backendContext: Schema.optional(Schema.Unknown),
  media: Schema.optional(Schema.Array(IssueCaptureMedia).check(Schema.isMaxLength(3))),
  labels: Schema.optional(BoundedLabels),
});
export type IssueCaptureInput = typeof IssueCaptureInput.Type;

export const IssueCaptureResult = Schema.Struct({
  reportId: IssueReportId,
  issue: Issue,
});
export type IssueCaptureResult = typeof IssueCaptureResult.Type;

export const IssueThreadLink = Schema.Struct({
  projectId: ProjectId,
  issueId: IssueId,
  threadId: ThreadId,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type IssueThreadLink = typeof IssueThreadLink.Type;

export const IssueThreadLinkGetInput = Schema.Struct({
  ...IssueRef.fields,
});
export type IssueThreadLinkGetInput = typeof IssueThreadLinkGetInput.Type;

export const IssueForThreadGetInput = Schema.Struct({
  threadId: ThreadId,
});
export type IssueForThreadGetInput = typeof IssueForThreadGetInput.Type;

export const IssueThreadLinkResult = Schema.Struct({
  link: Schema.NullOr(IssueThreadLink),
});
export type IssueThreadLinkResult = typeof IssueThreadLinkResult.Type;

export const IssueThreadLinkSetInput = Schema.Struct({
  ...IssueRef.fields,
  threadId: ThreadId,
});
export type IssueThreadLinkSetInput = typeof IssueThreadLinkSetInput.Type;

export const IssueThreadLinkRemoveInput = Schema.Struct({
  ...IssueRef.fields,
});
export type IssueThreadLinkRemoveInput = typeof IssueThreadLinkRemoveInput.Type;

export const IssueOperationFailureReason = Schema.Literals([
  "not-connected",
  "unmapped-project",
  "authentication",
  "permission",
  "origin-not-allowed",
  "not-found",
  "stale-version",
  "invalid-response",
  "upload-failed",
  "unavailable",
  "invalid-input",
]);
export type IssueOperationFailureReason = typeof IssueOperationFailureReason.Type;

/** Stable, user-actionable failures that may cross local, relay, and tunnel transports. */
export class IssueOperationError extends Schema.TaggedErrorClass<IssueOperationError>()(
  "IssueOperationError",
  {
    operation: TrimmedNonEmptyString,
    reason: IssueOperationFailureReason,
    detail: TrimmedNonEmptyString,
    retryable: Schema.Boolean,
    requiredOrigin: Schema.optional(BoundedUrl),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return `Issue operation ${this.operation} failed: ${this.detail}`;
  }
}
