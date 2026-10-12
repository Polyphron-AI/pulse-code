import type { ChatMessage } from "@t3tools/contracts";

export interface SavedChatReference {
  provider: string;
  accountId: string;
  conversationId: string;
  messageId: string;
}

export function chatReferenceKey(reference: SavedChatReference) {
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
