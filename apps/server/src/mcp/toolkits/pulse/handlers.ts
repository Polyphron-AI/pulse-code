import type { IssueOperationError, ProjectId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as PulseAgentGateway from "./gateway.ts";
import { PulseToolkit } from "./tools.ts";

/**
 * Resolves the capability gate and the project scope for one Pulse tool call.
 *
 * Both happen here rather than per-handler because getting either wrong is
 * silent: a missing capability check would let a server with agent Pulse
 * access turned off still answer, and a missing project default would make
 * every tool demand an id the agent has no way to know.
 */
const scoped = Effect.fn("PulseToolkit.scoped")(function* (
  operation: string,
  provided: ProjectId | undefined,
): Effect.fn.Return<
  {
    readonly projectId: ProjectId;
    readonly gateway: PulseAgentGateway.PulseAgentGateway["Service"];
    readonly invocation: McpInvocationContext.McpInvocationScope;
  },
  IssueOperationError,
  McpInvocationContext.McpInvocationContext | PulseAgentGateway.PulseAgentGateway
> {
  const invocation = yield* McpInvocationContext.requirePulseCapability(operation);
  const gateway = yield* PulseAgentGateway.PulseAgentGateway;
  const projectId = provided ?? (yield* gateway.threadProjectId(invocation.threadId));
  if (!projectId) return yield* PulseAgentGateway.missingProjectError(operation);
  return { projectId, gateway, invocation };
});

/** The unscoped variant, for calls that legitimately span every mapped project. */
const unscoped = Effect.fn("PulseToolkit.unscoped")(function* (operation: string) {
  const invocation = yield* McpInvocationContext.requirePulseCapability(operation);
  const gateway = yield* PulseAgentGateway.PulseAgentGateway;
  return { invocation, gateway };
});

/**
 * Exported so tests can drive one tool at a time against a substituted
 * gateway, without standing up the MCP transport to reach them.
 */
export const pulseToolHandlers = {
  pulse_projects: () =>
    Effect.gen(function* () {
      const { invocation, gateway } = yield* unscoped("pulse.projects");
      const connection = yield* gateway.issues.getConnection();
      const threadProjectId = yield* gateway.threadProjectId(invocation.threadId);
      return { connection, threadProjectId };
    }),

  // Deliberately passes `projectId` through untouched, including when absent:
  // `list` reads every mapping in that case, and narrowing it to the thread's
  // project would quietly hide the cross-project search the agent asked for.
  pulse_issues_list: (input) =>
    Effect.gen(function* () {
      const { gateway } = yield* unscoped("pulse.issues.list");
      return yield* gateway.issues.list(input);
    }),

  pulse_issue_get: (input) =>
    Effect.gen(function* () {
      const { projectId, gateway } = yield* scoped("pulse.issue.get", input.projectId);
      return yield* gateway.issues.detail({ projectId, issueId: input.issueId });
    }),

  pulse_issue_activity: (input) =>
    Effect.gen(function* () {
      const { projectId, gateway } = yield* scoped("pulse.issue.activity", input.projectId);
      return yield* gateway.issues.activity({ ...input, projectId });
    }),

  pulse_issue_assignees: (input) =>
    Effect.gen(function* () {
      const { projectId, gateway } = yield* scoped("pulse.issue.assignees", input.projectId);
      return yield* gateway.issues.assignees({ projectId });
    }),

  pulse_reports_list: (input) =>
    Effect.gen(function* () {
      const { projectId, gateway } = yield* scoped("pulse.reports.list", input.projectId);
      return yield* gateway.issues.reports({ ...input, projectId });
    }),

  pulse_report_get: (input) =>
    Effect.gen(function* () {
      const { projectId, gateway } = yield* scoped("pulse.report.get", input.projectId);
      return yield* gateway.issues.reportDetail({ projectId, reportId: input.reportId });
    }),

  pulse_thread_issue: () =>
    Effect.gen(function* () {
      const { invocation, gateway } = yield* unscoped("pulse.thread.issue");
      return yield* gateway.issues.getForThread({ threadId: invocation.threadId });
    }),

  pulse_issue_update: (input) =>
    Effect.gen(function* () {
      const { projectId, gateway } = yield* scoped("pulse.issue.update", input.projectId);
      return yield* gateway.issues.update({ ...input, projectId });
    }),

  pulse_report_update: (input) =>
    Effect.gen(function* () {
      const { projectId, gateway } = yield* scoped("pulse.report.update", input.projectId);
      return yield* gateway.issues.updateReport({ ...input, projectId });
    }),

  pulse_issue_create_from_report: (input) =>
    Effect.gen(function* () {
      const { projectId, gateway } = yield* scoped("pulse.issue.createFromReport", input.projectId);
      return yield* gateway.issues.createFromReport({ ...input, projectId });
    }),

  pulse_report_capture: (input) =>
    Effect.gen(function* () {
      const { projectId, gateway } = yield* scoped("pulse.report.capture", input.projectId);
      return yield* gateway.issues.capture({ ...input, projectId });
    }),

  pulse_thread_issue_link: (input) =>
    Effect.gen(function* () {
      const { projectId, gateway, invocation } = yield* scoped(
        "pulse.thread.issue.link",
        input.projectId,
      );
      return yield* gateway.issues.setThreadLink({
        projectId,
        issueId: input.issueId,
        threadId: invocation.threadId,
      });
    }),

  pulse_thread_issue_unlink: (input) =>
    Effect.gen(function* () {
      const { projectId, gateway } = yield* scoped("pulse.thread.issue.unlink", input.projectId);
      return yield* gateway.issues.removeThreadLink({ projectId, issueId: input.issueId });
    }),
} satisfies Parameters<typeof PulseToolkit.toLayer>[0];

export const PulseToolkitHandlersLive = PulseToolkit.toLayer(pulseToolHandlers);
