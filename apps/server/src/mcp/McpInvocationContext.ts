import {
  type EnvironmentId,
  PreviewAutomationUnavailableError,
  type ProviderInstanceId,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export type McpCapability = "preview" | "warden";

export interface McpInvocationScope {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly providerSessionId: string;
  readonly providerInstanceId: ProviderInstanceId;
  readonly capabilities: ReadonlySet<McpCapability>;
  readonly issuedAt: number;
  readonly wardenAttempt?: { readonly id: string; readonly signal: AbortSignal };
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

export class WardenInvocationUnavailableError extends Schema.TaggedErrorClass<WardenInvocationUnavailableError>()(
  "WardenInvocationUnavailableError",
  {},
) {
  override get message() {
    return "Warden requires an authorized active provider turn.";
  }
}

/** A session credential alone never authorizes Warden use outside an active turn. */
export const requireWardenAttempt = Effect.fn("mcp.requireWardenAttempt")(function* () {
  const invocation = yield* McpInvocationContext;
  const attempt = invocation.wardenAttempt;
  if (!invocation.capabilities.has("warden") || !attempt || attempt.signal.aborted) {
    return yield* new WardenInvocationUnavailableError({});
  }
  return { ...invocation, wardenAttempt: attempt };
});
