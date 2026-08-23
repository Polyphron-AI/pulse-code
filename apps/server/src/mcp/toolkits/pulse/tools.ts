import {
  Issue,
  IssueActivityResult,
  IssueAssigneeListResult,
  IssueCaptureInput,
  IssueCaptureResult,
  IssueConnectionSnapshot,
  IssueDetailResult,
  IssueId,
  IssueListInput,
  IssueListResult,
  IssueOperationError,
  IssueReport,
  IssueReportId,
  IssueReportsResult,
  IssueSeverity,
  IssueStatus,
  IssueThreadLinkResult,
  NonNegativeInt,
  PositiveInt,
  ProjectId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as PulseAgentGateway from "./gateway.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  PulseAgentGateway.PulseAgentGateway,
];

/**
 * Pulse Code project id, left optional on every tool.
 *
 * Omitting it resolves the project owning the thread the agent is running in,
 * which is the answer the agent wants in nearly every case and the one it
 * cannot look up for itself. It stays overridable because a thread in one
 * project routinely needs to read work filed against another.
 */
const OptionalProjectId = Schema.optional(ProjectId);

/** Mirrors the page bound the Issues contracts apply to the same fields. */
const PageLimit = PositiveInt.check(Schema.isLessThanOrEqualTo(100));

const Pagination = {
  limit: Schema.optional(PageLimit),
  offset: Schema.optional(NonNegativeInt),
};

const BoundedLabels = Schema.Array(Schema.String.check(Schema.isMaxLength(200))).check(
  Schema.isMaxLength(50),
);

const PulseIssueRefInput = Schema.Struct({
  projectId: OptionalProjectId,
  issueId: IssueId,
});

const PulseReportRefInput = Schema.Struct({
  projectId: OptionalProjectId,
  reportId: IssueReportId,
});

const PulseProjectsResult = Schema.Struct({
  connection: IssueConnectionSnapshot,
  threadProjectId: Schema.NullOr(ProjectId),
});

const readTool = <T extends Tool.Any>(tool: T): T =>
  tool
    .annotate(Tool.OpenWorld, true)
    .annotate(Tool.Readonly, true)
    .annotate(Tool.Destructive, false)
    .annotate(Tool.Idempotent, true) as T;

/**
 * Every Pulse write is marked destructive and open-world so the harness's
 * existing per-tool approval prompt stands between an agent's intent and a
 * change landing in the user's real tracker. That prompt is the confirmation
 * step the integration contract requires; the toolkit deliberately does not
 * grow a second, agent-driven preview/confirm pair, because an agent
 * confirming its own proposal confirms nothing.
 */
const writeTool = <T extends Tool.Any>(tool: T): T =>
  tool
    .annotate(Tool.OpenWorld, true)
    .annotate(Tool.Readonly, false)
    .annotate(Tool.Destructive, true)
    .annotate(Tool.Idempotent, false) as T;

export const PulseProjectsTool = readTool(
  Tool.make("pulse_projects", {
    description:
      "List the Pulse connection for this environment: status, endpoint, discovered Pulse projects, and the Pulse Code project mappings that scope every other pulse_* tool. Also reports which Pulse Code project owns the current thread, which is the default scope when a tool's projectId is omitted.",
    parameters: Schema.Struct({}),
    success: PulseProjectsResult,
    failure: IssueOperationError,
    dependencies,
  }).annotate(Tool.Title, "List Pulse projects and mappings"),
);

export const PulseIssuesListTool = readTool(
  Tool.make("pulse_issues_list", {
    description:
      "Search issues in Pulse. Omit projectId to search every mapped project rather than only the current thread's project, which is what you usually want when hunting for related work. Supports status, severities, assignee, free-text search, sort, and paging.",
    parameters: IssueListInput,
    success: IssueListResult,
    failure: IssueOperationError,
    dependencies,
  }).annotate(Tool.Title, "Search Pulse issues"),
);

export const PulseIssueGetTool = readTool(
  Tool.make("pulse_issue_get", {
    description:
      "Read one Pulse issue in full, with the project mapping it belongs to. Returns the issue's current version, which pulse_issue_update requires as expectedVersion.",
    parameters: PulseIssueRefInput,
    success: IssueDetailResult,
    failure: IssueOperationError,
    dependencies,
  }).annotate(Tool.Title, "Read Pulse issue"),
);

export const PulseIssueActivityTool = readTool(
  Tool.make("pulse_issue_activity", {
    description:
      "Read the activity trail for one Pulse issue: status changes, comments, and assignment history.",
    parameters: Schema.Struct({ ...PulseIssueRefInput.fields, ...Pagination }),
    success: IssueActivityResult,
    failure: IssueOperationError,
    dependencies,
  }).annotate(Tool.Title, "Read Pulse issue activity"),
);

export const PulseIssueAssigneesTool = readTool(
  Tool.make("pulse_issue_assignees", {
    description:
      "List the people who can be assigned work in a mapped Pulse project. Use this to resolve a name to the assignedToId that pulse_issue_update expects.",
    parameters: Schema.Struct({ projectId: OptionalProjectId }),
    success: IssueAssigneeListResult,
    failure: IssueOperationError,
    dependencies,
  }).annotate(Tool.Title, "List Pulse assignees"),
);

export const PulseReportsListTool = readTool(
  Tool.make("pulse_reports_list", {
    description:
      "List the bug reports attached to one Pulse issue. Reports carry the captured evidence -- console output, network entries, errors, and media -- which pulse_report_get returns in full.",
    parameters: Schema.Struct({ ...PulseIssueRefInput.fields, ...Pagination }),
    success: IssueReportsResult,
    failure: IssueOperationError,
    dependencies,
  }).annotate(Tool.Title, "List Pulse reports"),
);

export const PulseReportGetTool = readTool(
  Tool.make("pulse_report_get", {
    description:
      "Read one Pulse bug report in full, including its captured evidence. Prefer this over pulse_reports_list when you are about to reproduce or fix the reported behavior.",
    parameters: PulseReportRefInput,
    success: IssueReport,
    failure: IssueOperationError,
    dependencies,
  }).annotate(Tool.Title, "Read Pulse report"),
);

export const PulseThreadIssueTool = readTool(
  Tool.make("pulse_thread_issue", {
    description:
      "Read the Pulse issue linked to the current thread, or null when the thread is not linked to one. Call this first when the user refers to 'the issue' or 'this ticket' without naming it.",
    parameters: Schema.Struct({}),
    success: IssueThreadLinkResult,
    failure: IssueOperationError,
    dependencies,
  }).annotate(Tool.Title, "Read this thread's Pulse issue"),
);

export const PulseIssueUpdateTool = writeTool(
  Tool.make("pulse_issue_update", {
    description:
      "Change a Pulse issue's status, severity, assignee, title, description, or labels. Read the issue first: expectedVersion must match its current version, and a mismatch fails rather than overwriting someone else's edit. Only the fields you pass are changed.",
    parameters: Schema.Struct({
      ...PulseIssueRefInput.fields,
      expectedVersion: NonNegativeInt,
      status: Schema.optional(IssueStatus),
      severity: Schema.optional(IssueSeverity),
      assignedToId: Schema.optional(Schema.NullOr(Schema.String.check(Schema.isMaxLength(200)))),
      title: Schema.optional(Schema.String.check(Schema.isMaxLength(500))),
      description: Schema.optional(Schema.String.check(Schema.isMaxLength(100_000))),
      labels: Schema.optional(BoundedLabels),
    }),
    success: Issue,
    failure: IssueOperationError,
    dependencies,
  }).annotate(Tool.Title, "Update Pulse issue"),
);

export const PulseReportUpdateTool = writeTool(
  Tool.make("pulse_report_update", {
    description:
      "Change a Pulse bug report's severity or labels, or mark it a duplicate of another report. expectedVersion must match the report's current version.",
    parameters: Schema.Struct({
      ...PulseReportRefInput.fields,
      expectedVersion: NonNegativeInt,
      severity: Schema.optional(IssueSeverity),
      labels: Schema.optional(BoundedLabels),
      duplicateOfId: Schema.optional(Schema.NullOr(IssueReportId)),
    }),
    success: IssueReport,
    failure: IssueOperationError,
    dependencies,
  }).annotate(Tool.Title, "Update Pulse report"),
);

export const PulseIssueCreateFromReportTool = writeTool(
  Tool.make("pulse_issue_create_from_report", {
    description:
      "Promote a Pulse bug report into a tracked issue. The report's evidence carries over; title is required, and description, severity, and labels override what the report inferred.",
    parameters: Schema.Struct({
      ...PulseReportRefInput.fields,
      title: Schema.String.check(Schema.isMaxLength(500)),
      description: Schema.optional(Schema.String.check(Schema.isMaxLength(100_000))),
      severity: Schema.optional(IssueSeverity),
      labels: Schema.optional(BoundedLabels),
    }),
    success: Issue,
    failure: IssueOperationError,
    dependencies,
  }).annotate(Tool.Title, "Create Pulse issue from report"),
);

export const PulseReportCaptureTool = writeTool(
  Tool.make("pulse_report_capture", {
    description:
      "File a new bug report in Pulse with captured evidence. Media may be a data URL or a preview-artifact reference returned by preview_recording_stop, so a reproduction you just recorded can be filed without leaving the thread.",
    parameters: Schema.Struct({
      ...IssueCaptureInput.fields,
      projectId: OptionalProjectId,
    }),
    success: IssueCaptureResult,
    failure: IssueOperationError,
    dependencies,
  }).annotate(Tool.Title, "Capture Pulse report"),
);

export const PulseThreadIssueLinkTool = writeTool(
  Tool.make("pulse_thread_issue_link", {
    description:
      "Link the current thread to a Pulse issue so the issue's work and this conversation stay associated across clients.",
    parameters: PulseIssueRefInput,
    success: IssueThreadLinkResult,
    failure: IssueOperationError,
    dependencies,
  })
    .annotate(Tool.Title, "Link thread to Pulse issue")
    .annotate(Tool.Idempotent, true),
);

export const PulseThreadIssueUnlinkTool = writeTool(
  Tool.make("pulse_thread_issue_unlink", {
    description:
      "Remove the link between the current thread and a Pulse issue. The issue itself is untouched.",
    parameters: PulseIssueRefInput,
    success: IssueThreadLinkResult,
    failure: IssueOperationError,
    dependencies,
  })
    .annotate(Tool.Title, "Unlink thread from Pulse issue")
    .annotate(Tool.Idempotent, true),
);

export const PulseToolkit = Toolkit.make(
  PulseProjectsTool,
  PulseIssuesListTool,
  PulseIssueGetTool,
  PulseIssueActivityTool,
  PulseIssueAssigneesTool,
  PulseReportsListTool,
  PulseReportGetTool,
  PulseThreadIssueTool,
  PulseIssueUpdateTool,
  PulseReportUpdateTool,
  PulseIssueCreateFromReportTool,
  PulseReportCaptureTool,
  PulseThreadIssueLinkTool,
  PulseThreadIssueUnlinkTool,
);
