/**
 * Pure shape of the assistant (Luna) row at the top of the thread list, so the
 * label, the open target, and the reset affordance can be tested without a
 * renderer.
 */
import {
  assistantAvatarToken,
  assistantDisplayName,
  assistantThreadId,
  canResetAssistant,
  type EnvironmentAssistant,
} from "@t3tools/client-runtime/state/assistants";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";

export interface AssistantThreadListEntry {
  readonly name: string;
  readonly avatar: string;
  readonly environmentId: EnvironmentId | null;
  readonly threadId: ThreadId | null;
  readonly canReset: boolean;
  readonly subtitle: string;
}

export function buildAssistantThreadListEntry(input: {
  readonly assistant: EnvironmentAssistant | null;
  readonly threads: ReadonlyArray<{
    readonly id: ThreadId;
    readonly environmentId: EnvironmentId;
    readonly origin?: string | null | undefined;
  }>;
}): AssistantThreadListEntry {
  const assistant = input.assistant;
  const name = assistantDisplayName(assistant);
  if (assistant === null) {
    return {
      name,
      avatar: assistantAvatarToken(assistant),
      environmentId: null,
      threadId: null,
      canReset: false,
      subtitle: `Start ${name} on the desktop app`,
    };
  }
  const threadId = assistantThreadId(
    assistant,
    input.threads.filter((thread) => thread.environmentId === assistant.environmentId),
  );
  return {
    name,
    avatar: assistantAvatarToken(assistant),
    environmentId: assistant.environmentId,
    threadId,
    canReset: canResetAssistant(assistant),
    subtitle: threadId === null ? "No conversation yet" : "Read-only assistant",
  };
}
