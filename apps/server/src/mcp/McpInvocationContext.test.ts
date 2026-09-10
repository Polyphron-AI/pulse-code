import { expect, it } from "@effect/vitest";
import {
  EnvironmentId,
  PreviewAutomationUnavailableError,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import * as McpInvocationContext from "./McpInvocationContext.ts";

it.effect("reports the scoped credential context when preview capability is unavailable", () => {
  const invocation: McpInvocationContext.McpInvocationScope = {
    environmentId: EnvironmentId.make("environment-1"),
    threadId: ThreadId.make("thread-1"),
    providerSessionId: "provider-session-1",
    providerInstanceId: ProviderInstanceId.make("codex"),
    capabilities: new Set(),
    issuedAt: 1,
  };

  return Effect.gen(function* () {
    const error = yield* McpInvocationContext.requireMcpCapability("preview").pipe(
      Effect.provideService(McpInvocationContext.McpInvocationContext, invocation),
      Effect.flip,
    );

    expect(error).toBeInstanceOf(PreviewAutomationUnavailableError);
    expect(error).toMatchObject({
      capability: "preview",
      environmentId: invocation.environmentId,
      threadId: invocation.threadId,
      providerSessionId: invocation.providerSessionId,
      providerInstanceId: invocation.providerInstanceId,
    });
    expect(error.message).toBe("MCP credential does not grant the preview capability.");
  });
});

it.effect("requires Warden capability and a non-aborted trusted attempt", () =>
  Effect.gen(function* () {
    const controller = new AbortController();
    const scope: McpInvocationContext.McpInvocationScope = {
      environmentId: EnvironmentId.make("env-warden"),
      threadId: ThreadId.make("thread-warden"),
      providerSessionId: "session-warden",
      providerInstanceId: ProviderInstanceId.make("codex"),
      capabilities: new Set(["warden"]),
      issuedAt: 1,
      wardenAttempt: { id: "trusted-attempt", signal: controller.signal },
    };
    const run = (value: McpInvocationContext.McpInvocationScope) =>
      McpInvocationContext.requireWardenAttempt().pipe(
        Effect.provideService(McpInvocationContext.McpInvocationContext, value),
      );
    expect((yield* run(scope)).wardenAttempt.id).toBe("trusted-attempt");
    expect(
      yield* run({ ...scope, capabilities: new Set(["preview"]) }).pipe(Effect.flip),
    ).toBeInstanceOf(McpInvocationContext.WardenInvocationUnavailableError);
    const { wardenAttempt: _attempt, ...idle } = scope;
    expect(yield* run(idle).pipe(Effect.flip)).toBeInstanceOf(
      McpInvocationContext.WardenInvocationUnavailableError,
    );
    controller.abort();
    expect(yield* run(scope).pipe(Effect.flip)).toBeInstanceOf(
      McpInvocationContext.WardenInvocationUnavailableError,
    );
  }),
);
