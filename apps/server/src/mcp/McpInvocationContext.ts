import {
  type EnvironmentId,
  IssueOperationError,
  PreviewAutomationUnavailableError,
  type ProviderInstanceId,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";

export type McpCapability = "preview" | "pulse";

export interface McpInvocationScope {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly providerSessionId: string;
  readonly providerInstanceId: ProviderInstanceId;
  readonly capabilities: ReadonlySet<McpCapability>;
  readonly issuedAt: number;
}

export class McpInvocationContext extends Context.Service<
  McpInvocationContext,
  McpInvocationScope
>()("t3/mcp/McpInvocationContext") {}

export const requireMcpCapability = Effect.fn("mcp.requireCapability")(function* (
  capability: "preview",
) {
  const invocation = yield* McpInvocationContext;
  if (!invocation.capabilities.has(capability)) {
    return yield* new PreviewAutomationUnavailableError({
      capability,
      environmentId: invocation.environmentId,
      threadId: invocation.threadId,
      providerSessionId: invocation.providerSessionId,
      providerInstanceId: invocation.providerInstanceId,
    });
  }
  return invocation;
});

/**
 * Capability gate for the `pulse_*` toolkit.
 *
 * Fails with the same `IssueOperationError` the Issues surfaces already use so
 * an agent that lost the capability reads the refusal in the same vocabulary as
 * a disconnected Pulse, rather than a preview-shaped error naming a browser it
 * never asked about.
 */
export const requirePulseCapability = Effect.fn("mcp.requirePulseCapability")(function* (
  operation: string,
) {
  const invocation = yield* McpInvocationContext;
  if (!invocation.capabilities.has("pulse")) {
    return yield* new IssueOperationError({
      operation,
      reason: "permission",
      detail:
        "Agent access to Pulse is turned off for this server. Enable it in Settings → Integrations.",
      retryable: false,
    });
  }
  return invocation;
});
