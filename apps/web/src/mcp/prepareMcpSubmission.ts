import type { ProviderSessionStartInput, PulseMcpPreparationId } from "@t3tools/contracts";

export type McpSubmissionPreparation =
  | { readonly status: "ready"; readonly preparationId?: PulseMcpPreparationId }
  | { readonly status: "cancelled" };

export type PrepareComposerMcp = (
  session: ProviderSessionStartInput,
  options?: { readonly creatingWorktree?: boolean },
) => Promise<McpSubmissionPreparation>;

/** Guard the awaited preparation before any caller clears or dispatches a draft. */
export async function prepareMcpSubmission(input: {
  readonly prepare: PrepareComposerMcp | undefined;
  readonly session: ProviderSessionStartInput;
  readonly creatingWorktree?: boolean;
  readonly isCurrent: () => boolean;
}): Promise<McpSubmissionPreparation | { readonly status: "error"; readonly message: string }> {
  if (!input.prepare || !input.isCurrent()) return { status: "cancelled" };
  try {
    const result = await input.prepare(input.session, {
      ...(input.creatingWorktree !== undefined ? { creatingWorktree: input.creatingWorktree } : {}),
    });
    return input.isCurrent() ? result : { status: "cancelled" };
  } catch {
    return input.isCurrent()
      ? { status: "error", message: "MCP preparation failed. Your draft has not been sent." }
      : { status: "cancelled" };
  }
}
