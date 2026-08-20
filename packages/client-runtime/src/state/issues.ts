import {
  type EnvironmentId,
  type ExecutionEnvironmentDescriptor,
  type IssueActivityInput,
  type IssueAssigneeListInput,
  type IssueForThreadGetInput,
  type IssueListInput,
  type IssueRef,
  type IssueReportRef,
  type IssueReportsInput,
  type IssueThreadLinkGetInput,
  WS_METHODS,
} from "@t3tools/contracts";
import { Atom, AtomRegistry } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "./runtime.ts";

export interface IssueEnvironmentTarget<Input> {
  readonly environmentId: EnvironmentId;
  readonly input: Input;
}

/** Version-skewed servers are excluded before any Issues RPC is mounted. */
export const supportsNativeIssues = (descriptor: ExecutionEnvironmentDescriptor): boolean =>
  descriptor.capabilities.issues === true;

export const issuesEnvironmentCommandKey = (input: {
  readonly environmentId: EnvironmentId;
}): string => input.environmentId;

/**
 * Native Issues state is always keyed by environment before local project/report identifiers.
 * This prevents collisions when two connected machines happen to use the same Pulse or project IDs.
 */
export function createIssueEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const scheduler = createAtomCommandScheduler();
  const serialPerEnvironment = {
    mode: "serial",
    key: issuesEnvironmentCommandKey,
  } as const;

  const connection = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "environment-data:issues:connection",
    tag: WS_METHODS.issuesGetConnection,
    staleTimeMs: 15_000,
  });
  const list = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "environment-data:issues:list",
    tag: WS_METHODS.issuesList,
    staleTimeMs: 15_000,
  });
  const detail = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "environment-data:issues:detail",
    tag: WS_METHODS.issuesDetail,
    staleTimeMs: 10_000,
  });
  const reports = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "environment-data:issues:reports",
    tag: WS_METHODS.issuesReports,
    staleTimeMs: 15_000,
  });
  const reportDetail = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "environment-data:issues:report-detail",
    tag: WS_METHODS.issuesReportDetail,
    staleTimeMs: 30_000,
  });
  const activity = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "environment-data:issues:activity",
    tag: WS_METHODS.issuesActivity,
    staleTimeMs: 10_000,
  });
  const assignees = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "environment-data:issues:assignees",
    tag: WS_METHODS.issuesAssignees,
    staleTimeMs: 60_000,
  });
  const threadLink = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "environment-data:issues:thread-link",
    tag: WS_METHODS.issuesGetThreadLink,
    staleTimeMs: 15_000,
  });
  const forThread = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "environment-data:issues:for-thread",
    tag: WS_METHODS.issuesGetForThread,
    staleTimeMs: 15_000,
  });

  const command = <
    Tag extends
      | typeof WS_METHODS.issuesUpdateConnection
      | typeof WS_METHODS.issuesDisconnect
      | typeof WS_METHODS.issuesSetProjectMapping
      | typeof WS_METHODS.issuesRemoveProjectMapping
      | typeof WS_METHODS.issuesUpdate
      | typeof WS_METHODS.issuesUpdateReport
      | typeof WS_METHODS.issuesCreateFromReport
      | typeof WS_METHODS.issuesCapture
      | typeof WS_METHODS.issuesSetThreadLink
      | typeof WS_METHODS.issuesRemoveThreadLink,
  >(
    tag: Tag,
    label: string,
  ) =>
    createEnvironmentRpcCommand(runtime, {
      label,
      tag,
      scheduler,
      concurrency: serialPerEnvironment,
    });

  return {
    connection,
    list,
    detail,
    reports,
    reportDetail,
    activity,
    assignees,
    threadLink,
    forThread,
    updateConnection: command(
      WS_METHODS.issuesUpdateConnection,
      "environment-data:issues:update-connection",
    ),
    disconnect: command(WS_METHODS.issuesDisconnect, "environment-data:issues:disconnect"),
    setProjectMapping: command(
      WS_METHODS.issuesSetProjectMapping,
      "environment-data:issues:set-project-mapping",
    ),
    removeProjectMapping: command(
      WS_METHODS.issuesRemoveProjectMapping,
      "environment-data:issues:remove-project-mapping",
    ),
    update: command(WS_METHODS.issuesUpdate, "environment-data:issues:update"),
    updateReport: command(WS_METHODS.issuesUpdateReport, "environment-data:issues:update-report"),
    createFromReport: command(
      WS_METHODS.issuesCreateFromReport,
      "environment-data:issues:create-from-report",
    ),
    capture: command(WS_METHODS.issuesCapture, "environment-data:issues:capture"),
    setThreadLink: command(
      WS_METHODS.issuesSetThreadLink,
      "environment-data:issues:set-thread-link",
    ),
    removeThreadLink: command(
      WS_METHODS.issuesRemoveThreadLink,
      "environment-data:issues:remove-thread-link",
    ),
    /** Explicit refresh hooks let each mutation refresh only the visible native surfaces. */
    refresh: {
      connection: (registry: AtomRegistry.AtomRegistry, environmentId: EnvironmentId) =>
        registry.refresh(connection({ environmentId, input: {} })),
      list: (registry: AtomRegistry.AtomRegistry, target: IssueEnvironmentTarget<IssueListInput>) =>
        registry.refresh(list(target)),
      detail: (registry: AtomRegistry.AtomRegistry, target: IssueEnvironmentTarget<IssueRef>) =>
        registry.refresh(detail(target)),
      reports: (
        registry: AtomRegistry.AtomRegistry,
        target: IssueEnvironmentTarget<IssueReportsInput>,
      ) => registry.refresh(reports(target)),
      reportDetail: (
        registry: AtomRegistry.AtomRegistry,
        target: IssueEnvironmentTarget<IssueReportRef>,
      ) => registry.refresh(reportDetail(target)),
      activity: (
        registry: AtomRegistry.AtomRegistry,
        target: IssueEnvironmentTarget<IssueActivityInput>,
      ) => registry.refresh(activity(target)),
      assignees: (
        registry: AtomRegistry.AtomRegistry,
        target: IssueEnvironmentTarget<IssueAssigneeListInput>,
      ) => registry.refresh(assignees(target)),
      threadLink: (
        registry: AtomRegistry.AtomRegistry,
        target: IssueEnvironmentTarget<IssueThreadLinkGetInput>,
      ) => registry.refresh(threadLink(target)),
      forThread: (
        registry: AtomRegistry.AtomRegistry,
        target: IssueEnvironmentTarget<IssueForThreadGetInput>,
      ) => registry.refresh(forThread(target)),
    },
  };
}
