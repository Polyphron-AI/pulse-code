import type { OfficeMessage } from "@t3tools/contracts";

export function mailMessageKey(message: Pick<OfficeMessage, "accountId" | "id">) {
  return JSON.stringify([message.accountId, message.id]);
}

export function mailConversations(messages: readonly OfficeMessage[]) {
  const conversations = new Map<string, { message: OfficeMessage; unread: boolean }>();
  for (const message of messages) {
    const key = JSON.stringify([
      message.accountId,
      message.conversationId ? "conversation" : "message",
      message.conversationId ?? message.id,
    ]);
    const previous = conversations.get(key);
    conversations.set(key, {
      message:
        !previous || Date.parse(message.date) > Date.parse(previous.message.date)
          ? message
          : previous.message,
      unread: message.unread || (previous?.unread ?? false),
    });
  }
  return [...conversations.values()];
}
