import { IssueOperationError, type ProjectId, type ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { ProjectionSnapshotQuery } from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import { IssuesService } from "../../../issues/IssuesService.ts";

/**
 * The single seam the `pulse_*` tools reach the rest of the server through.
 *
 * Handlers depend on this rather than on `IssuesService` and
 * `ProjectionSnapshotQuery` directly for two reasons: it keeps the toolkit's
 * only knowledge of orchestration to "which project owns this thread", and it
 * gives tests one small thing to substitute instead of two large services.
 */
export class PulseAgentGateway extends Context.Service<
  PulseAgentGateway,
  {
    readonly issues: IssuesService["Service"];
    /**
     * The project owning `threadId`, or `null` when the thread has no active
     * projection row. Never fails on a projection read error -- the toolkit
     * would rather report "no default project, pass projectId" than surface a
     * storage error the agent cannot act on.
     */
    readonly threadProjectId: (threadId: ThreadId) => Effect.Effect<ProjectId | null>;
  }
>()("t3/mcp/toolkits/pulse/gateway/PulseAgentGateway") {}

export const layer = Layer.effect(
  PulseAgentGateway,
  Effect.gen(function* () {
    const issues = yield* IssuesService;
    const projections = yield* ProjectionSnapshotQuery;
    return PulseAgentGateway.of({
      issues,
      threadProjectId: (threadId) =>
        projections.getThreadShellById(threadId).pipe(
          Effect.map((shell) =>
            Option.match(shell, { onNone: () => null, onSome: (t) => t.projectId }),
          ),
          Effect.catch((cause) =>
            Effect.logWarning("Could not resolve the thread's project for a Pulse tool call", {
              threadId,
              cause,
            }).pipe(Effect.as(null)),
          ),
        ),
    });
  }),
);

/** Shared failure for a call that needs a project and could not find one. */
export const missingProjectError = (operation: string): IssueOperationError =>
  new IssueOperationError({
    operation,
    reason: "unmapped-project",
    detail:
      "No Pulse Code project is in scope for this call. Pass projectId explicitly, or run pulse_projects to see which projects are mapped to Pulse.",
    retryable: false,
  });
