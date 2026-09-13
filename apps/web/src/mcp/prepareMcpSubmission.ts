import type {
  ProjectId,
  ProviderSessionStartInput,
  PulseMcpPreparationId,
} from "@t3tools/contracts";

export type McpSubmissionPreparation =
  | { readonly status: "ready"; readonly preparationId?: PulseMcpPreparationId }
  | { readonly status: "cancelled" };

export type PrepareComposerMcp = (
  session: ProviderSessionStartInput,
  options?: { readonly creatingWorktree?: boolean; readonly projectId?: ProjectId },
) => Promise<McpSubmissionPreparation>;

/** Guard the awaited preparation before any caller clears or dispatches a draft. */
export async function prepareMcpSubmission(input: {
  readonly prepare: PrepareComposerMcp | undefined;
  readonly session: ProviderSessionStartInput;
  readonly creatingWorktree?: boolean;
  readonly projectId?: ProjectId;
  readonly isCurrent: () => boolean;
  readonly draft?: {
    readonly read: () => unknown;
    readonly subscribe: (changed: () => void) => () => void;
  };
}): Promise<McpSubmissionPreparation | { readonly status: "error"; readonly message: string }> {
  if (!input.prepare || !input.isCurrent()) return { status: "cancelled" };
  const initialDraft = input.draft?.read();
  let draftChanged = false;
  const unsubscribe = input.draft?.subscribe(() => {
    if (input.draft?.read() !== initialDraft) draftChanged = true;
  });
  const isCurrent = () => !draftChanged && input.isCurrent();
  try {
    const result = await input.prepare(input.session, {
      ...(input.creatingWorktree !== undefined ? { creatingWorktree: input.creatingWorktree } : {}),
      ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
    });
    return isCurrent() ? result : { status: "cancelled" };
  } catch {
    return isCurrent()
      ? { status: "error", message: "MCP preparation failed. Your draft has not been sent." }
      : { status: "cancelled" };
  } finally {
    unsubscribe?.();
  }
}
