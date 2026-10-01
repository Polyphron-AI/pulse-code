import type {
  PulseMcpPrepareTurnInput,
  PulseMcpPrepareTurnResult,
  ProviderDriverKind,
  ServerConfig,
} from "@t3tools/contracts";

/** Queued and parallel submissions cannot use the current composer's mutable selection. */
export async function preparePinnedMcpSubmission(input: {
  readonly prepare: (input: PulseMcpPrepareTurnInput) => Promise<PulseMcpPrepareTurnResult>;
  readonly session: PulseMcpPrepareTurnInput["providerSession"];
  readonly projectId: PulseMcpPrepareTurnInput["projectId"];
  readonly connectionIds: ReadonlyArray<string>;
  readonly supported: boolean;
  readonly creatingWorktree?: boolean;
  readonly saveSelection?: (
    threadId: PulseMcpPrepareTurnInput["threadId"],
    connectionIds: ReadonlyArray<string>,
  ) => Promise<void>;
}) {
  if (!input.supported && input.connectionIds.length === 0) return undefined;
  if (!input.supported) throw new Error("Managed MCPs are unavailable for this provider.");
  if (input.creatingWorktree) {
    if (!input.saveSelection) throw new Error("The queued MCP selection could not be saved.");
    await input.saveSelection(input.session.threadId, input.connectionIds);
    // The server prepares the provider after the new worktree exists.
    return undefined;
  }
  const result = await input.prepare({
    threadId: input.session.threadId,
    providerSession: input.session,
    ...(input.projectId ? { projectId: input.projectId } : {}),
    connectionIds: [...input.connectionIds],
  });
  if (result.status === "ready") return result.preparationId;
  if (result.status === "active-turn")
    throw new Error("Finish or stop the active turn, then retry.");
  if (result.status === "unsupported-provider")
    throw new Error("This provider cannot use Pulse-managed MCP connections.");
  throw new Error(
    result.connections
      .flatMap((connection) =>
        connection.status === "failed" ? [`${connection.name}: ${connection.message}`] : [],
      )
      .join("; ") || "The provider did not confirm MCP readiness. Retry or manage connections.",
  );
}

export function supportsPinnedMcpPreparation(
  capabilities: ServerConfig["pulseCapabilities"] | undefined,
  driver: ProviderDriverKind,
) {
  return driver === "codex"
    ? capabilities?.codexManagedMcp === true
    : driver === "claudeAgent"
      ? capabilities?.claudeManagedMcp === true
      : driver === "opencode"
        ? capabilities?.openCodeManagedMcp === true
        : false;
}
