import {
  chatResourceId,
  type ChatAccount,
  type ChatConversation,
  type ChatMessage,
  type WorkspaceLinkEndpoint,
} from "@t3tools/contracts";
import { endpointTitle } from "./mail/linkedItems";

/** Capture source metadata once for menus, drag, retained chips and saved references. */
export function chatEndpoint(
  account: ChatAccount,
  conversation: ChatConversation,
  message?: ChatMessage,
): WorkspaceLinkEndpoint | undefined {
  if (
    (account.provider !== "slack" && account.provider !== "discord") ||
    !conversation.workspaceId ||
    conversation.accountId !== account.id ||
    (message && (message.accountId !== account.id || message.conversationId !== conversation.id))
  )
    return undefined;
  try {
    return {
      ref: {
        type: "provider-resource",
        provider: account.provider,
        resourceId: chatResourceId({
          version: 1,
          transport: "desktop",
          connectionId: account.id,
          workspaceId: conversation.workspaceId,
          conversationId: conversation.id,
          ...(message
            ? {
                messageId: message.id,
                ...(account.provider === "slack"
                  ? { replyRootId: message.threadId ?? message.id }
                  : {}),
              }
            : {}),
        }),
      },
      title: endpointTitle(
        message ? `${message.author}: ${message.text || "Message"}` : conversation.title,
      ),
    };
  } catch {
    return undefined;
  }
}

export interface SavedChatReference {
  provider: string;
  accountId: string;
  conversationId: string;
  messageId: string;
  environmentId?: string;
  resourceId?: string;
}

export function chatReferenceKey(reference: SavedChatReference) {
  if (reference.resourceId)
    return JSON.stringify([reference.environmentId, reference.provider, reference.resourceId]);
  return JSON.stringify([
    reference.provider,
    reference.accountId,
    reference.conversationId,
    reference.messageId,
  ]);
}

export function mergeChatMessages(
  previous: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
) {
  const rows = new Map(
    previous.map((message) => [
      JSON.stringify([message.accountId, message.conversationId, message.id]),
      message,
    ]),
  );
  for (const message of incoming)
    rows.set(JSON.stringify([message.accountId, message.conversationId, message.id]), message);
  return [...rows.values()].sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
}

export function createRequestQueue<Q, R>(invoke: (request: Q) => Promise<R>) {
  let previous: Promise<unknown> = Promise.resolve();
  return (request: Q): Promise<R> => {
    const next = previous.then(() => invoke(request));
    previous = next.catch(() => undefined);
    return next;
  };
}

export function sendAttempt(
  text: string,
  previous: { text: string; nonce: string; destination: string } | undefined,
  createNonce: () => string,
  destination = "",
) {
  return previous?.text === text && previous.destination === destination
    ? previous
    : { text, nonce: createNonce(), destination };
}
