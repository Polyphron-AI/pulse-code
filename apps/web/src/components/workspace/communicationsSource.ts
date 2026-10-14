import type { PulseTaskSource } from "@t3tools/contracts";
export type CommunicationTaskDraft = { title: string; source: PulseTaskSource };

/** Relative links reopen the source on the Pulse host that serves the task. */
export function communicationTaskDraft(input: {
  provider: string;
  accountId: string;
  conversationId: string;
  messageId: string;
  threadId?: string | undefined;
  email?: boolean;
  title: string;
  text: string;
}): CommunicationTaskDraft {
  const query = new URLSearchParams({
    space: "office",
    officeView: input.email ? "email" : "communications",
    sourceProvider: input.provider,
    sourceAccount: input.accountId,
    sourceConversation: input.conversationId,
    sourceMessage: input.messageId,
    ...(input.threadId ? { sourceThread: input.threadId } : {}),
  });
  return {
    title: input.title.trim().slice(0, 240),
    source: { url: `/workspace?${query}`, excerpt: input.text.slice(0, 10000) },
  };
}
