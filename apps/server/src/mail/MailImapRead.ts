import { MailError, type MailMessageRef } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type { ImapFlow, SearchObject } from "imapflow";
import { simpleParser, type ParsedMail } from "mailparser";

import type { StoredMailAccount } from "./MailConfigService.ts";
import {
  imapCall,
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

const openMailbox = (client: ImapFlow, mailbox: string) =>
  imapCall(() => client.mailboxOpen(mailbox, { readOnly: true })).pipe(
    Effect.mapError(() => fail("not-found", `Mailbox "${mailbox}" was not found.`)),
  );

export interface MailMessageSummary {
  readonly ref: MailMessageRef;
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
  readonly from?: string;
  readonly to?: string;
  readonly subject?: string;
  readonly text?: string;
  /** ISO dates. */
  readonly since?: string;
  readonly before?: string;
  readonly unseen?: boolean;
  readonly flagged?: boolean;
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
        const uids = (
          (yield* imapCall(() => client.search(toSearchObject(input.query), { uid: true }))) || []
        )
          .filter((uid) => uid < before)
          .sort((a, b) => b - a);
        const page = uids.slice(0, limit);
        const fetched =
          page.length === 0
            ? []
            : yield* imapCall(() =>
                client.fetchAll(
                  page.join(","),
                  { uid: true, flags: true, size: true, headers: ["subject", "from", "date"] },
                  { uid: true },
                ),
              );
        const messages: Array<MailMessageSummary> = [];
        for (const message of fetched.sort((a, b) => b.uid - a.uid)) {
          const headers = message.headers ? yield* parse(message.headers) : undefined;
          messages.push({
            ...flagState(account.id, input.mailbox, uidValidity, message),
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

/** One message with its text body paged by byte offset. Attachment bytes are never included. */
export const fetchMessage = (
  account: StoredMailAccount,
  login: MailLogin,
  ref: MailMessageRef,
  input: { readonly offset?: number } = {},
  options: MailConnectionOptions = {},
) =>
  session(account, login, options, (client) =>
    fetchParsed(client, ref).pipe(
      Effect.map(({ message, parsed, rawTruncated }) => {
        const to = addressText(parsed.to);
        const cc = addressText(parsed.cc);
        const references = parsed.references;
        return {
          ...flagState(account.id, ref.mailbox, ref.uidValidity, message),
          ...(parsed.subject ? { subject: parsed.subject } : {}),
          ...(parsed.from?.text ? { from: parsed.from.text } : {}),
          ...(to ? { to } : {}),
          ...(cc ? { cc } : {}),
          ...(parsed.date ? { date: parsed.date.toISOString() } : {}),
          ...(parsed.messageId ? { messageId: parsed.messageId } : {}),
          ...(parsed.inReplyTo ? { inReplyTo: parsed.inReplyTo } : {}),
          ...(references
            ? { references: Array.isArray(references) ? references : [references] }
            : {}),
          body: sliceUtf8(parsed.text ?? "", input.offset ?? 0, TEXT_BUDGET),
          attachments: attachmentsOf(parsed),
          ...(rawTruncated ? { sourceTruncated: true } : {}),
        };
      }),
    ),
  );

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
