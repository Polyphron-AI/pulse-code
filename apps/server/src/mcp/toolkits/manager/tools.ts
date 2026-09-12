/**
 * Manager (Argo) MCP toolkit definition.
 *
 * These are the tools a manager thread uses during a cycle: read its
 * children, spawn one, message one, stop one, and write the single cycle log
 * row. Every tool is gated at call time on the caller's session belonging to
 * a manager's own thread (`manager:<id>` origin bound to that manager), so a
 * non-manager thread that sees these tools in the catalog still cannot use
 * them.
 *
 * See docs/plans/2026-09-11-agent-roles-design.md section 3 (Manager).
 *
 * @module toolkits/manager/tools
 */
import { ManagerId, ProjectId, ThreadId, TrimmedNonEmptyString } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/unstable/ai";

import * as GitWorkflowService from "../../../git/GitWorkflowService.ts";
import { OrchestrationEngineService } from "../../../orchestration/Services/OrchestrationEngine.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const dependencies = [
  Crypto.Crypto,
  McpInvocationContext.McpInvocationContext,
  OrchestrationEngineService,
  GitWorkflowService.GitWorkflowService,
];

/** Why a manager tool refused. Every reason is the caller's to fix. */
export const ManagerToolErrorReason = Schema.Literals([
  "not-a-manager-thread",
  "manager-missing",
  "child-limit-reached",
  "not-your-child",
  "project-missing",
  "no-model-selection",
  "failed",
]);
export type ManagerToolErrorReason = typeof ManagerToolErrorReason.Type;

export class ManagerToolError extends Schema.TaggedErrorClass<ManagerToolError>()(
  "ManagerToolError",
  {
    reason: ManagerToolErrorReason,
    detail: Schema.String,
  },
) {
  override get message(): string {
    return `${this.reason}: ${this.detail}`;
  }
}

export const ManagerChildSummary = Schema.Struct({
  threadId: ThreadId,
  title: TrimmedNonEmptyString,
  projectId: ProjectId,
  projectTitle: Schema.String,
  branch: Schema.NullOr(Schema.String),
  worktreePath: Schema.NullOr(Schema.String),
  status: Schema.String,
  lastActivityAt: Schema.String,
});
export type ManagerChildSummary = typeof ManagerChildSummary.Type;

export const ManagerListChildrenResult = Schema.Struct({
  managerId: ManagerId,
  maxChildren: Schema.Number,
  children: Schema.Array(ManagerChildSummary),
});

export const ManagerSpawnChildResult = Schema.Struct({
  threadId: ThreadId,
  branch: Schema.NullOr(Schema.String),
  worktreePath: Schema.NullOr(Schema.String),
});

export const ManagerThreadResult = Schema.Struct({
  threadId: ThreadId,
});

export const ManagerLogResult = Schema.Struct({
  threadId: ThreadId,
  kind: Schema.String,
});

/** The kinds a cycle log row may carry, as in the design's log table. */
export const ManagerLogKind = Schema.Literals([
  "spawned",
  "stopped",
  "progressed",
  "stalled",
  "idle",
  "error",
]);
export type ManagerLogKind = typeof ManagerLogKind.Type;

export const ManagerListChildrenTool = Tool.make("manager_list_children", {
  description:
    "List the live child threads this Argo manager owns, with project, branch, status, and last activity. Only callable from a manager's own thread.",
  parameters: Schema.Struct({}),
  success: ManagerListChildrenResult,
  failure: ManagerToolError,
  dependencies,
})
  .annotate(Tool.Title, "List Argo children")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const ManagerSpawnChildTool = Tool.make("manager_spawn_child", {
  description:
    "Start a new child thread in its own git worktree on the given project, using this manager's child model and runtime mode, and send it its first instruction. Refuses once the manager is at its child limit.",
  parameters: Schema.Struct({
    title: TrimmedNonEmptyString,
    prompt: TrimmedNonEmptyString,
    projectId: ProjectId,
  }),
  success: ManagerSpawnChildResult,
  failure: ManagerToolError,
  dependencies,
})
  .annotate(Tool.Title, "Spawn Argo child")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false);

export const ManagerMessageChildTool = Tool.make("manager_message_child", {
  description:
    "Send a directive to one of this manager's own child threads and start its next turn. Refuses for any thread this manager does not own.",
  parameters: Schema.Struct({
    threadId: ThreadId,
    prompt: TrimmedNonEmptyString,
  }),
  success: ManagerThreadResult,
  failure: ManagerToolError,
  dependencies,
})
  .annotate(Tool.Title, "Message Argo child")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false);

export const ManagerStopChildTool = Tool.make("manager_stop_child", {
  description:
    "Interrupt a running child of this manager and archive its thread. Refuses for any thread this manager does not own.",
  parameters: Schema.Struct({
    threadId: ThreadId,
  }),
  success: ManagerThreadResult,
  failure: ManagerToolError,
  dependencies,
})
  .annotate(Tool.Title, "Stop Argo child")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.Idempotent, false);

export const ManagerLogTool = Tool.make("manager_log", {
  description:
    "Append this cycle's single log row to the manager thread. Call exactly once at the end of a cycle.",
  parameters: Schema.Struct({
    kind: ManagerLogKind,
    threadId: Schema.optional(ThreadId),
    summary: TrimmedNonEmptyString,
  }),
  success: ManagerLogResult,
  failure: ManagerToolError,
  dependencies,
})
  .annotate(Tool.Title, "Write Argo cycle log")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, false);

export const ManagerToolkit = Toolkit.make(
  ManagerListChildrenTool,
  ManagerSpawnChildTool,
  ManagerMessageChildTool,
  ManagerStopChildTool,
  ManagerLogTool,
);
