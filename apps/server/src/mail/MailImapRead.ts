import { MailError, normalizeMessageId, type MailMessageRef } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ImapFlow, SearchObject } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";

import { groupConversations, type ConversationMessage } from "./MailConversations.ts";

import type { StoredMailAccount } from "./MailConfigService.ts";
import {
  imapCall,
  toMailError,
  withImap,
  type MailConnectionOptions,
  type MailLogin,
} from "./MailConnection.ts";

export const PAGE_DEFAULT = 20;
export const PAGE_MAX = 50;
const MAILBOX_MAX = 200;
const RAW_FETCH_CAP = 2 * 1024 * 1024;
/** Body and attachment text budget, leaving headroom under the 32_000-byte tool result cap. */
export const TEXT_BUDGET = 24_000;

const fail = (kind: MailError["kind"], message: string) => new MailError({ kind, message });

/** Slices UTF-8 text by byte offset without splitting a character. */
export const sliceUtf8 = (text: string, offset: number, maxBytes: number) => {
  const bytes = Buffer.from(text, "utf8");
  let end = Math.min(bytes.length, offset + maxBytes);
  while (end < bytes.length && end > offset && (bytes[end]! & 0xc0) === 0x80) end -= 1;
  return {
    text: bytes.subarray(offset, end).toString("utf8"),
    truncated: end < bytes.length,
    ...(end < bytes.length ? { nextOffset: end } : {}),
  };
};

export interface MailSpecialUse {
  readonly drafts?: string;
  readonly sent?: string;
  readonly archive?: string;
  readonly all?: string;
  readonly trash?: string;
  readonly capabilities: {
    readonly move: boolean;
    readonly gmailLabels: boolean;
    readonly condstore: boolean;
  };
}

const SPECIAL_USE = {
  "\\Drafts": "drafts",
  "\\Sent": "sent",
  "\\Archive": "archive",
  "\\All": "all",
  "\\Trash": "trash",
} as const;

/** Special-use mailboxes and capabilities for an open session. Account overrides win. */
export const readSpecialUse = (client: ImapFlow, account: StoredMailAccount) =>
  imapCall(() => client.list()).pipe(
    Effect.map((mailboxes): MailSpecialUse => {
      const found: Partial<Record<(typeof SPECIAL_USE)[keyof typeof SPECIAL_USE], string>> = {};
      for (const mailbox of mailboxes) {
        const key = mailbox.specialUse
          ? SPECIAL_USE[mailbox.specialUse as keyof typeof SPECIAL_USE]
          : undefined;
        if (key && found[key] === undefined) found[key] = mailbox.path;
      }
      return {
        ...found,
        ...account.folders,
        capabilities: {
          move: client.capabilities.has("MOVE"),
          gmailLabels: client.capabilities.has("X-GM-EXT-1"),
          condstore: client.capabilities.has("CONDSTORE"),
        },
      };
    }),
  );

/** Opens `ref.mailbox` and fails with `stale-reference` when its UIDVALIDITY changed. */
export const openChecked = (
  client: ImapFlow,
  ref: { readonly mailbox: string; readonly uidValidity: number },
  readOnly: boolean,
) =>
  imapCall(() => client.mailboxOpen(ref.mailbox, { readOnly })).pipe(
    Effect.flatMap((mailbox) =>
      Number(mailbox.uidValidity) === ref.uidValidity
        ? Effect.succeed(mailbox)
        : Effect.fail(
            fail(
              "stale-reference",
              "This mailbox changed since the message was listed. Search again.",
            ),
          ),
    ),
  );

/** Search candidates with the mailbox UIDVALIDITY; header matches still need identity checks. */
const searchByMessageId = (
  client: ImapFlow,
  mailbox: string,
  messageId: string,
  requireComplete: boolean,
) =>
  imapCall(() => client.mailboxOpen(mailbox, { readOnly: true })).pipe(
    Effect.flatMap((opened) =>
      imapCall(() => client.search({ header: { "message-id": messageId } }, { uid: true })).pipe(
        Effect.flatMap((uids) => {
          // imapflow returns false for a refused search, distinct from a successful empty result.
          if (!uids && requireComplete) {
            return Effect.fail(fail("unavailable", "The folder could not be searched."));
          }
          return Effect.succeed({ uids: uids || [], uidValidity: Number(opened.uidValidity) });
        }),
      ),
    ),
  );

/** The newest candidate UID; draft recovery retains empty-result handling for refused searches. */
export const findByMessageId = (
  client: ImapFlow,
  mailbox: string,
  messageId: string,
  requireComplete = false,
) =>
  searchByMessageId(client, mailbox, messageId, requireComplete).pipe(
    Effect.map(({ uids, uidValidity }) => {
      const uid = uids.at(-1);
      return uid === undefined ? undefined : { uid, uidValidity };
    }),
  );

const openMailbox = (client: ImapFlow, mailbox: string) =>
  imapCall(() => client.mailboxOpen(mailbox, { readOnly: true })).pipe(
    Effect.mapError(() => fail("not-found", `Mailbox "${mailbox}" was not found.`)),
  );

export interface MailMessageSummary {
  readonly ref: MailMessageRef;
  readonly messageId?: string;
  readonly subject?: string;
  readonly from?: string;
  readonly date?: string;
  readonly seen: boolean;
  readonly flagged: boolean;
  readonly answered: boolean;
  readonly keywords: ReadonlyArray<string>;
  readonly size?: number;
}

export interface MailSearchQuery {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly subject?: string | undefined;
  readonly text?: string | undefined;
  /** ISO dates. */
  readonly since?: string | undefined;
  readonly before?: string | undefined;
  readonly unseen?: boolean | undefined;
  readonly flagged?: boolean | undefined;
}

const toSearchObject = (query: MailSearchQuery = {}): SearchObject => {
  const criteria: SearchObject = {
    ...(query.from ? { from: query.from } : {}),
    ...(query.to ? { to: query.to } : {}),
    ...(query.subject ? { subject: query.subject } : {}),
    ...(query.text ? { text: query.text } : {}),
    ...(query.since ? { since: query.since } : {}),
    ...(query.before ? { before: query.before } : {}),
    ...(query.unseen ? { seen: false } : {}),
    ...(query.flagged ? { flagged: true } : {}),
  };
  return Object.keys(criteria).length > 0 ? criteria : { all: true };
};

const CURSOR = /^(\d+)\.(\d+)$/;

const parse = (source: Buffer) =>
  Effect.tryPromise({
    try: () => simpleParser(source, { skipImageLinks: true }),
    catch: () => fail("unavailable", "The message could not be read."),
  });

const flagState = (
  accountId: string,
  mailbox: string,
  uidValidity: number,
  message: {
    readonly uid: number;
    readonly flags?: Set<string> | undefined;
  },
) => {
  const flags = message.flags ?? new Set<string>();
  return {
    ref: { accountId, mailbox, uidValidity, uid: message.uid },
    seen: flags.has("\\Seen"),
    flagged: flags.has("\\Flagged"),
    answered: flags.has("\\Answered"),
    keywords: [...flags].filter((flag) => !flag.startsWith("\\")),
  };
};

const session = <A>(
  account: StoredMailAccount,
  login: MailLogin,
  options: MailConnectionOptions,
  use: (client: ImapFlow) => Effect.Effect<A, MailError>,
) => withImap(account, login, use, options);

export const listMailboxes = (
  account: StoredMailAccount,
  login: MailLogin,
  options: MailConnectionOptions = {},
) =>
  session(account, login, options, (client) =>
    imapCall(() => client.list()).pipe(
      Effect.map((mailboxes) => ({
        mailboxes: mailboxes.slice(0, MAILBOX_MAX).map((mailbox) => ({
          name: mailbox.path,
          ...(mailbox.specialUse ? { specialUse: mailbox.specialUse } : {}),
        })),
        truncated: mailboxes.length > MAILBOX_MAX,
      })),
    ),
  );

export const discoverSpecialUse = (
  account: StoredMailAccount,
  login: MailLogin,
  options: MailConnectionOptions = {},
) => session(account, login, options, (client) => readSpecialUse(client, account));

/**
 * Newest-first page of a mailbox. The cursor pins UIDVALIDITY and the last UID returned, so a
 * mailbox renumbered between pages yields `stale-reference` instead of skipped messages.
 */
export const search = (
  account: StoredMailAccount,
  login: MailLogin,
  input: {
    readonly mailbox: string;
    readonly query?: MailSearchQuery;
    readonly cursor?: string;
    readonly limit?: number;
  },
  options: MailConnectionOptions = {},
) =>
  Effect.gen(function* () {
    const limit = input.limit ?? PAGE_DEFAULT;
    if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_MAX) {
      return yield* fail("limit-exceeded", `A page holds 1 to ${PAGE_MAX} messages.`);
    }
    const cursor = input.cursor === undefined ? undefined : CURSOR.exec(input.cursor);
    if (cursor === null) return yield* fail("invalid-input", "This cursor is not valid.");
    return yield* session(account, login, options, (client) =>
      Effect.gen(function* () {
        const mailbox = yield* openMailbox(client, input.mailbox);
        const uidValidity = Number(mailbox.uidValidity);
        if (cursor && Number(cursor[1]) !== uidValidity) {
          return yield* fail(
            "stale-reference",
            "This mailbox changed since the previous page. Search again.",
          );
        }
        const before = cursor ? Number(cursor[2]) : Number.POSITIVE_INFINITY;
        const result = yield* imapCall(() =>
          client.search(toSearchObject(input.query), { uid: true }),
        );
        if (result === false) {
          return yield* fail("unavailable", "The folder could not be searched.");
        }
        const uids = (result ?? []).filter((uid) => uid < before).sort((a, b) => b - a);
        const page = uids.slice(0, limit);
        const fetched =
          page.length === 0
            ? []
            : yield* imapCall(() =>
                client.fetchAll(
                  page.join(","),
                  {
                    uid: true,
                    flags: true,
                    size: true,
                    headers: ["subject", "from", "date", "message-id"],
                  },
                  { uid: true },
                ),
              );
        const messages: Array<MailMessageSummary> = [];
        for (const message of fetched.sort((a, b) => b.uid - a.uid)) {
          const headers = message.headers ? yield* parse(message.headers) : undefined;
          const messageId = headers?.messageId ? normalizeMessageId(headers.messageId) : undefined;
          messages.push({
            ...flagState(account.id, input.mailbox, uidValidity, message),
            ...(messageId ? { messageId } : {}),
            ...(headers?.subject ? { subject: headers.subject } : {}),
            ...(headers?.from?.text ? { from: headers.from.text } : {}),
            ...(headers?.date ? { date: headers.date.toISOString() } : {}),
            ...(message.size === undefined ? {} : { size: message.size }),
          });
        }
        const last = page.at(-1);
        return {
          messages,
          ...(uids.length > page.length && last !== undefined
            ? { nextCursor: `${uidValidity}.${last}` }
            : {}),
        };
      }),
    );
  });

const fetchParsed = (client: ImapFlow, ref: MailMessageRef) =>
  Effect.gen(function* () {
    yield* openChecked(client, ref, true);
    const message = yield* imapCall(() =>
      client.fetchOne(
        String(ref.uid),
        { uid: true, flags: true, source: { maxLength: RAW_FETCH_CAP } },
        { uid: true },
      ),
    );
    if (!message || !message.source) {
      return yield* fail("not-found", "This message is no longer in the mailbox.");
    }
    return {
      message,
      parsed: yield* parse(message.source),
      rawTruncated: message.source.length >= RAW_FETCH_CAP,
    };
  });

const addressText = (value: ParsedMail["to"]) =>
  value === undefined
    ? undefined
    : (Array.isArray(value) ? value : [value]).map((a) => a.text).join(", ");

const attachmentsOf = (parsed: ParsedMail) =>
  parsed.attachments.map((attachment, index) => ({
    partId: String(index + 1),
    name: attachment.filename ?? `attachment-${index + 1}`,
    contentType: attachment.contentType,
    size: attachment.size,
  }));

/** One message read inside an open session. Its Message-ID is normalised for matching. */
const readIn = (
  client: ImapFlow,
  account: StoredMailAccount,
  ref: MailMessageRef,
  offset: number,
) =>
  fetchParsed(client, ref).pipe(
    Effect.map(({ message, parsed, rawTruncated }) => {
      const to = addressText(parsed.to);
      const cc = addressText(parsed.cc);
      const references = parsed.references;
      const messageId = parsed.messageId ? normalizeMessageId(parsed.messageId) : undefined;
      return {
        ...flagState(account.id, ref.mailbox, ref.uidValidity, message),
        ...(parsed.subject ? { subject: parsed.subject } : {}),
        ...(parsed.from?.text ? { from: parsed.from.text } : {}),
        ...(to ? { to } : {}),
        ...(cc ? { cc } : {}),
        ...(parsed.date ? { date: parsed.date.toISOString() } : {}),
        ...(messageId ? { messageId } : {}),
        ...(parsed.inReplyTo ? { inReplyTo: parsed.inReplyTo } : {}),
        ...(references
          ? { references: Array.isArray(references) ? references : [references] }
          : {}),
        body: sliceUtf8(parsed.text ?? "", offset, TEXT_BUDGET),
        attachments: attachmentsOf(parsed),
        ...(rawTruncated ? { sourceTruncated: true } : {}),
      };
    }),
  );

export type MailMessageDetail = Effect.Success<ReturnType<typeof readIn>>;

/** One message with its text body paged by byte offset. Attachment bytes are never included. */
export const fetchMessage = (
  account: StoredMailAccount,
  login: MailLogin,
  ref: MailMessageRef,
  input: { readonly offset?: number } = {},
  options: MailConnectionOptions = {},
) => session(account, login, options, (client) => readIn(client, account, ref, input.offset ?? 0));

/** How many folders a moved message is searched for in, at most. */
export const SCAN_MAX = 50;
const SCAN_RANK = ["\\All", "\\Archive", "\\Inbox", "\\Sent", "\\Junk"];
const UNSELECTABLE = /^\\(noselect|nonexistent)$/i;
const selectable = (mailbox: { readonly flags?: ReadonlySet<string> | undefined }) =>
  ![...(mailbox.flags ?? [])].some((flag) => UNSELECTABLE.test(flag));

/**
 * Folders to search for a moved message, best guesses first: where it was last seen, then All
 * Mail, Archive, Inbox, Sent and Junk, then the rest in server order.
 */
export const scanOrder = (
  mailboxes: ReadonlyArray<{
    readonly path: string;
    readonly specialUse?: string | undefined;
    readonly flags?: ReadonlySet<string> | undefined;
  }>,
  hint: string | undefined,
) => {
  const rank = (mailbox: (typeof mailboxes)[number]) => {
    if (mailbox.path === hint) return 0;
    const use = mailbox.path.toUpperCase() === "INBOX" ? "\\Inbox" : mailbox.specialUse;
    const index = use === undefined ? -1 : SCAN_RANK.indexOf(use);
    return index < 0 ? SCAN_RANK.length + 1 : index + 1;
  };
  return mailboxes
    .filter(selectable)
    .map((mailbox, index) => ({ path: mailbox.path, rank: rank(mailbox), index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .slice(0, SCAN_MAX)
    .map((entry) => entry.path);
};

const LOCATION_LOST =
  "This message moved or was deleted. It was linked without a Message-ID, so it cannot be found again.";

/** True when the server answered NO, as opposed to the connection failing. */
const refused = (cause: unknown) =>
  typeof cause === "object" &&
  cause !== null &&
  (cause as { readonly responseStatus?: unknown }).responseStatus === "NO";

/**
 * Reads a linked message wherever it now is, in one IMAP session. A stored location is only
 * trusted when the message there has the same Message-ID; otherwise folders are searched by
 * Message-ID in `scanOrder`. A message linked without a Message-ID can only be read where it was.
 */
export const fetchByReference = (
  account: StoredMailAccount,
  login: MailLogin,
  reference: {
    readonly messageId?: string | undefined;
    readonly location?: MailMessageRef | undefined;
    readonly offset?: number | undefined;
  },
  options: MailConnectionOptions = {},
): Effect.Effect<MailMessageDetail, MailError> =>
  Effect.gen(function* () {
    const { messageId, location } = reference;
    const offset = reference.offset ?? 0;
    if (messageId === undefined && location === undefined) {
      return yield* fail("invalid-input", "A message reference needs a Message-ID or a location.");
    }
    return yield* session(account, login, options, (client) =>
      Effect.gen(function* () {
        if (messageId === undefined) {
          if (location === undefined) {
            return yield* fail(
              "invalid-input",
              "A message reference needs a Message-ID or a location.",
            );
          }
          const ref = location;
          yield* Effect.tryPromise({
            try: () => client.mailboxOpen(ref.mailbox, { readOnly: true }),
            catch: (cause) =>
              refused(cause) ? fail("not-found", LOCATION_LOST) : toMailError(cause),
          });
          return yield* readIn(client, account, ref, offset).pipe(
            Effect.mapError((error) =>
              error.kind === "not-found" || error.kind === "stale-reference"
                ? fail("not-found", LOCATION_LOST)
                : error,
            ),
          );
        }
        if (location !== undefined) {
          const there = yield* Effect.option(readIn(client, account, location, offset));
          if (Option.isSome(there) && there.value.messageId === messageId) return there.value;
        }
        const mailboxes = yield* imapCall(() => client.list());
        const order = scanOrder(mailboxes, location?.mailbox);
        let incomplete = mailboxes.filter(selectable).length > order.length;
        // ponytail: cap full-message candidate reads at SCAN_MAX plus the cached read; use paged
        // header verification if actual accounts need more.
        let remaining = SCAN_MAX;
        const searchId = messageId.trim().replace(/^</, "").replace(/>$/, "").trim();
        for (const mailbox of order) {
          const hit: Option.Option<Effect.Success<ReturnType<typeof searchByMessageId>>> =
            yield* Effect.option(searchByMessageId(client, mailbox, searchId, true));
          if (Option.isNone(hit)) {
            incomplete = true;
            continue;
          }
          const { uids, uidValidity } = hit.value;
          for (let index = uids.length - 1; index >= 0; index -= 1) {
            if (remaining === 0) {
              incomplete = true;
              break;
            }
            remaining -= 1;
            const ref: MailMessageRef = {
              accountId: account.id,
              mailbox,
              uidValidity,
              uid: uids[index]!,
            };
            const found = yield* Effect.option(readIn(client, account, ref, offset));
            if (Option.isNone(found)) incomplete = true;
            else if (found.value.messageId === messageId) return found.value;
          }
        }
        return yield* incomplete
          ? fail("unavailable", "Some folders could not be searched. Try again.")
          : fail(
              "not-found",
              "This message was not found in any folder. It may have been deleted.",
            );
      }),
    );
  });

const isText = (contentType: string) =>
  /^text\//i.test(contentType) || /^application\/(json|xml)\b/i.test(contentType);

/** Attachment metadata, plus text content for text types only. Binary bytes never leave here. */
export const readAttachment = (
  account: StoredMailAccount,
  login: MailLogin,
  ref: MailMessageRef,
  partId: string,
  options: MailConnectionOptions = {},
) =>
  session(account, login, options, (client) =>
    Effect.gen(function* () {
      const { parsed } = yield* fetchParsed(client, ref);
      const index = Number(partId) - 1;
      const attachment = parsed.attachments[index];
      const summary = attachmentsOf(parsed)[index];
      if (!attachment || !summary) {
        return yield* fail("not-found", "This message has no attachment with that part ID.");
      }
      if (!isText(attachment.contentType)) return { ...summary, binary: true as const };
      return {
        ...summary,
        binary: false as const,
        content: sliceUtf8(attachment.content.toString("utf8"), 0, TEXT_BUDGET),
      };
    }),
  );

/** Cap for reading a whole draft to send; matches the outgoing MIME limit. */
const SEND_SOURCE_CAP = 25 * 1024 * 1024;

const modseqOf = (message: { readonly modseq?: bigint | undefined }) =>
  message.modseq === undefined ? {} : { modseq: String(message.modseq) };

/** A whole message parsed for sending, with its MODSEQ when the server has CONDSTORE. */
export const readMessageSource = (
  account: StoredMailAccount,
  login: MailLogin,
  ref: MailMessageRef,
  options: MailConnectionOptions = {},
) =>
  session(account, login, options, (client) =>
    Effect.gen(function* () {
      yield* openChecked(client, ref, true);
      const message = yield* imapCall(() =>
        client.fetchOne(
          String(ref.uid),
          { uid: true, source: { maxLength: SEND_SOURCE_CAP } },
          { uid: true },
        ),
      );
      if (!message || !message.source) {
        return yield* fail("not-found", "This draft is no longer in the mailbox.");
      }
      if (message.source.length >= SEND_SOURCE_CAP) {
        return yield* fail("limit-exceeded", "This draft is larger than 25 MiB.");
      }
      return { parsed: yield* parse(message.source), ...modseqOf(message) };
    }),
  );

/** Whether a message is still present under its UIDVALIDITY, with its current MODSEQ. */
export const messageVersion = (
  account: StoredMailAccount,
  login: MailLogin,
  ref: MailMessageRef,
  options: MailConnectionOptions = {},
) =>
  session(account, login, options, (client) =>
    Effect.gen(function* () {
      yield* openChecked(client, ref, true);
      const message = yield* imapCall(() =>
        client.fetchOne(String(ref.uid), { uid: true, flags: true }, { uid: true }),
      );
      return message
        ? { present: true as const, ...modseqOf(message) }
        : { present: false as const };
    }),
  );

/** Snapshot-pinned, header-only scan before conversation paging. Older unscanned mail is explicit. */
export const conversations = (
  account: StoredMailAccount,
  login: MailLogin,
  input: {
    readonly mailbox: string;
    readonly query?: MailSearchQuery;
    readonly cursor?: string;
    readonly limit?: number;
  },
  options: MailConnectionOptions = {},
) =>
  session(account, login, options, (client) =>
    Effect.gen(function* () {
      const limit = input.limit ?? PAGE_DEFAULT;
      if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_MAX)
        return yield* fail("limit-exceeded", "A page holds 1 to 50 conversations.");
      const cursor =
        input.cursor === undefined ? undefined : /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(input.cursor);
      if (cursor === null)
        return yield* fail("invalid-input", "This conversation cursor is not valid.");
      const mailbox = yield* openMailbox(client, input.mailbox);
      const uidValidity = Number(mailbox.uidValidity);
      if (cursor && Number(cursor[1]) !== uidValidity)
        return yield* fail("stale-reference", "This mailbox changed. Refresh conversations.");
      const found = yield* imapCall(() =>
        client.search(toSearchObject(input.query), { uid: true }),
      );
      if (found === false) return yield* fail("unavailable", "The folder could not be searched.");
      const ceiling = cursor
        ? Number(cursor[2])
        : (found ?? []).reduce((maximum, uid) => Math.max(maximum, uid), 0);
      const candidates = (found ?? []).filter((uid) => uid <= ceiling).sort((a, b) => b - a);
      if (cursor && Number(cursor[4]) !== candidates.length)
        return yield* fail(
          "stale-reference",
          "Messages changed while paging. Refresh conversations.",
        );
      const uids = candidates.slice(0, 500);
      const fetched =
        uids.length === 0
          ? []
          : yield* imapCall(() =>
              client.fetchAll(
                uids.join(","),
                {
                  uid: true,
                  flags: true,
                  size: true,
                  threadId: client.capabilities.has("X-GM-EXT-1"),
                  headers: ["subject", "from", "date", "message-id", "references", "in-reply-to"],
                },
                { uid: true },
              ),
            );
      const messages: Array<ConversationMessage> = [];
      for (const message of fetched) {
        if ((message.headers?.byteLength ?? 0) > 64_000)
          return yield* fail(
            "limit-exceeded",
            "A message has oversized headers. Use Messages to read it separately.",
          );
        const headers = message.headers ? yield* parse(message.headers) : undefined;
        const messageId = headers?.messageId ? normalizeMessageId(headers.messageId) : undefined;
        messages.push({
          ...flagState(account.id, input.mailbox, uidValidity, message),
          ...(messageId ? { messageId } : {}),
          ...(client.capabilities.has("X-GM-EXT-1") && message.threadId
            ? { gmailThreadId: String(message.threadId) }
            : {}),
          ...(headers?.references
            ? {
                references: Array.isArray(headers.references)
                  ? headers.references
                  : [headers.references],
              }
            : {}),
          ...(headers?.inReplyTo ? { inReplyTo: headers.inReplyTo } : {}),
          ...(headers?.subject ? { subject: headers.subject } : {}),
          ...(headers?.from?.text ? { from: headers.from.text } : {}),
          ...(headers?.date ? { date: headers.date.toISOString() } : {}),
          ...(message.size === undefined ? {} : { size: message.size }),
        });
      }
      const grouped = groupConversations(messages);
      const offset = cursor ? Number(cursor[3]) : 0;
      return {
        conversations: grouped.slice(offset, offset + limit),
        scannedMessages: messages.length,
        incomplete: candidates.length > uids.length || fetched.length !== uids.length,
        ...(offset + limit < grouped.length
          ? { nextCursor: `${uidValidity}.${ceiling}.${offset + limit}.${candidates.length}` }
          : {}),
      };
    }),
  );
