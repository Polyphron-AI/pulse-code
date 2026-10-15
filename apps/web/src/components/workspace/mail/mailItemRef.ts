import type { MailMessageRef, WorkspaceItemRef } from "@t3tools/contracts";

export type MailItemRef = Extract<WorkspaceItemRef, { readonly type: "mail" }>;

function location(ref: MailMessageRef): MailMessageRef {
  return {
    accountId: ref.accountId,
    mailbox: ref.mailbox,
    uidValidity: ref.uidValidity,
    uid: ref.uid,
  };
}

/**
 * The one shape a mail item takes on this client. Query atoms key by JSON, so two refs to the
 * same message must serialize the same way; every mail ref the UI builds goes through here.
 */
export function canonicalMailRef(ref: {
  readonly accountId: string;
  readonly messageId?: string | undefined;
  readonly location?: MailMessageRef | undefined;
}): MailItemRef {
  return {
    type: "mail",
    accountId: ref.accountId,
    ...(ref.messageId !== undefined ? { messageId: ref.messageId } : {}),
    ...(ref.location !== undefined ? { location: location(ref.location) } : {}),
  };
}

/** The link endpoint for a message from a folder listing or the reader. */
export function mailItemRef(message: {
  readonly ref: MailMessageRef;
  readonly messageId?: string | undefined;
}): MailItemRef {
  return canonicalMailRef({
    accountId: message.ref.accountId,
    messageId: message.messageId,
    location: message.ref,
  });
}

/** A message with no Message-ID can only be found at the location it was linked from. */
export function mailLinkMayBreak(ref: MailItemRef): boolean {
  return ref.messageId === undefined;
}

export function mailItemTitle(subject: string | undefined): string {
  return subject?.trim() || "Message with no subject";
}

export function mailFolderLabel(name: string): string {
  return name.toUpperCase() === "INBOX" ? "Inbox" : name;
}

/** Read input in a fixed key order, so one message always hits one atom. */
export function mailReadInput(ref: MailItemRef, offset?: number) {
  return {
    accountId: ref.accountId,
    ...(ref.messageId !== undefined ? { messageId: ref.messageId } : {}),
    ...(ref.location !== undefined ? { location: location(ref.location) } : {}),
    ...(offset !== undefined ? { offset } : {}),
  };
}

/** Folder listing input in a fixed key order. A blank search is no search. */
export function mailMessagesInput(input: {
  readonly accountId: string;
  readonly mailbox: string;
  readonly query?: string | undefined;
  readonly cursor?: string | undefined;
}) {
  const query = input.query?.trim();
  return {
    accountId: input.accountId,
    mailbox: input.mailbox,
    ...(query ? { query } : {}),
    ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
  };
}
