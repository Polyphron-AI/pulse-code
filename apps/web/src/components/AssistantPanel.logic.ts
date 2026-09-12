import {
  assistantAvatarToken,
  assistantDisplayName,
  assistantThreadId,
  canResetAssistant,
  type EnvironmentAssistant,
} from "@t3tools/client-runtime/state/assistants";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

/**
 * Pure shape of the Luna panel, so the header, the body switch, and the rename
 * field can be tested without mounting a chat view.
 */
export interface AssistantPanelHeader {
  readonly name: string;
  readonly avatar: string;
  readonly canReset: boolean;
}

export function assistantPanelHeader(assistant: EnvironmentAssistant | null): AssistantPanelHeader {
  return {
    name: assistantDisplayName(assistant),
    avatar: assistantAvatarToken(assistant),
    canReset: canResetAssistant(assistant),
  };
}

export type AssistantPanelBody =
  | { readonly kind: "thread"; readonly environmentId: EnvironmentId; readonly threadId: ThreadId }
  | { readonly kind: "empty" };

/**
 * The panel shows the bound thread when there is one, and the empty-state
 * composer otherwise. A thread the shell has not caught up on yet is found by
 * origin, which is why the thread list is passed in.
 */
export function assistantPanelBody(input: {
  readonly assistant: EnvironmentAssistant | null;
  readonly threads: ReadonlyArray<{
    readonly id: ThreadId;
    readonly environmentId: EnvironmentId;
    readonly origin?: string | null | undefined;
  }>;
}): AssistantPanelBody {
  const assistant = input.assistant;
  if (assistant === null) return { kind: "empty" };
  const threads = input.threads.filter(
    (thread) => thread.environmentId === assistant.environmentId,
  );
  const threadId = assistantThreadId(assistant, threads);
  if (threadId === null) return { kind: "empty" };
  return { kind: "thread", environmentId: assistant.environmentId, threadId };
}

/** Blank or whitespace-only drafts never reach the server. */
export function canSendAssistantMessage(text: string): boolean {
  return text.trim().length > 0;
}

/**
 * A rename only dispatches when the trimmed draft differs from the current
 * name. Clearing the field is a cancel, not a rename to blank.
 */
export function assistantRenameValue(draft: string, current: string): string | null {
  const next = draft.trim();
  if (next.length === 0) return null;
  if (next === current.trim()) return null;
  return next;
}
