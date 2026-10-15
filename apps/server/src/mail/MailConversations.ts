import { normalizeMessageId } from "@t3tools/contracts";
import type { MailMessageSummary } from "./MailImapRead.ts";

export interface ConversationMessage extends MailMessageSummary {
  readonly gmailThreadId?: string;
  readonly references?: ReadonlyArray<string>;
  readonly inReplyTo?: string;
}

/** Groups header-only results; subjects never establish identity. Missing ancestors still join replies. */
export function groupConversations(messages: ReadonlyArray<ConversationMessage>) {
  const parents = new Map<string, string>();
  const root = (key: string): string => {
    const parent = parents.get(key);
    if (parent === undefined || parent === key) return key;
    const found = root(parent);
    parents.set(key, found);
    return found;
  };
  const join = (a: string, b: string) => {
    const x = root(a);
    const y = root(b);
    if (x !== y) parents.set(x < y ? y : x, x < y ? x : y);
  };
  const keys = messages.map((message) => {
    if (message.gmailThreadId) return `gmail:${message.gmailThreadId}`;
    const ids = [message.messageId, ...(message.references ?? []), message.inReplyTo].flatMap(
      (id) => (id ? [normalizeMessageId(id)].filter((value) => value !== undefined) : []),
    );
    const key = ids[0] ?? `location:${message.ref.uidValidity}:${message.ref.uid}`;
    for (const id of ids) join(key, id);
    return key;
  });
  const groups = new Map<string, Array<ConversationMessage>>();
  messages.forEach((message, index) => {
    const key = root(keys[index]!);
    const group = groups.get(key) ?? [];
    group.push(message);
    groups.set(key, group);
  });
  const newest = (a: ConversationMessage, b: ConversationMessage) =>
    (Date.parse(b.date ?? "") || 0) - (Date.parse(a.date ?? "") || 0) || b.ref.uid - a.ref.uid;
  return [...groups]
    .map(([id, members]) => {
      members.sort(newest);
      // Prefer an ancestry root over a newly arrived reply's own Message-ID.
      const replies = new Set(
        members
          .filter((message) => message.references?.length || message.inReplyTo)
          .flatMap((message) => (message.messageId ? [message.messageId] : [])),
      );
      const anchors = members
        .flatMap((message) => [message.references?.[0] ?? message.inReplyTo ?? message.messageId])
        .flatMap((value) =>
          value
            ? [normalizeMessageId(value)].filter((key) => key !== undefined && !replies.has(key))
            : [],
        );
      const stableId = id.startsWith("gmail:") ? id : (anchors.sort()[0] ?? id);
      return { id: stableId, messages: members, newest: members[0]! };
    })
    .sort((a, b) => newest(a.newest, b.newest) || a.id.localeCompare(b.id));
}
