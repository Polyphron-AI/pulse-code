import { MailError, type MailMessageRef } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as NodeCrypto from "node:crypto";
import MailComposer from "nodemailer/lib/mail-composer";

import { MailConfigService } from "../../../mail/MailConfigService.ts";
import type { MailConnectionOptions } from "../../../mail/MailConnection.ts";
import * as MailImapRead from "../../../mail/MailImapRead.ts";
import * as MailImapWrite from "../../../mail/MailImapWrite.ts";
import { MailOAuth } from "../../../mail/MailOAuth.ts";
import { MailSendService } from "../../../mail/MailSendService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import { MailToolkit } from "./tools.ts";

/** Tool results stay small enough for an agent context window. */
export const RESULT_MAX_BYTES = 32_000;

const fail = (kind: MailError["kind"], message: string) => new MailError({ kind, message });

/** Fails with limit-exceeded when a result would not fit an agent's context. */
export const bounded = (value: object) => {
  // @effect-diagnostics preferSchemaOverJson:off -- measures the payload McpServer will serialize
  const size = Buffer.byteLength(JSON.stringify(value));
  return size > RESULT_MAX_BYTES
    ? Effect.fail(fail("limit-exceeded", "The result is too large. Narrow the request."))
    : Effect.succeed(value as Record<string, unknown>);
};

const addresses = (list: ReadonlyArray<{ readonly name?: string; readonly address: string }>) =>
  list.map((entry) => ({ name: entry.name ?? "", address: entry.address }));

export const make = (options: { readonly imap?: MailConnectionOptions } = {}) =>
  Effect.gen(function* () {
    const config = yield* MailConfigService;
    const oauth = yield* MailOAuth;
    const send = yield* MailSendService;
    const imap = options.imap ?? {};

    const scope = McpInvocationContext.requireMcpCapability("mail");

    /** Grant checks run on every call; the account always comes from the thread's project. */
    const connect = (selector: string | undefined) =>
      Effect.gen(function* () {
        const { threadId } = yield* scope;
        const { account } = yield* config.resolveAccount({ threadId, selector });
        const login = yield* oauth.login(account.id);
        return { account, login, threadId };
      });

    const onRef = <A extends object>(
      ref: MailMessageRef,
      use: (session: Effect.Success<ReturnType<typeof connect>>) => Effect.Effect<A, MailError>,
    ) => connect(ref.accountId).pipe(Effect.flatMap(use), Effect.flatMap(bounded));

    return MailToolkit.of({
      mail_accounts: (input) =>
        Effect.gen(function* () {
          const { threadId } = yield* scope;
          const { accounts } = yield* config.listThreadAccounts(threadId);
          const selected =
            input.account === undefined
              ? undefined
              : (yield* config.resolveAccount({ threadId, selector: input.account })).account.id;
          return yield* bounded({
            accounts: accounts.map((account) => ({
              id: account.id,
              nickname: account.nickname,
              address: account.address,
              health: account.health.status,
            })),
            ...(selected ? { resolved: selected } : {}),
          });
        }),
      mail_list_mailboxes: (input) =>
        connect(input.account).pipe(
          Effect.flatMap(({ account, login }) => MailImapRead.listMailboxes(account, login, imap)),
          Effect.flatMap(bounded),
        ),
      mail_search: ({ account: selector, mailbox, cursor, limit, ...query }) =>
        connect(selector).pipe(
          Effect.flatMap(({ account, login }) =>
            MailImapRead.search(
              account,
              login,
              {
                mailbox,
                query,
                ...(cursor !== undefined ? { cursor } : {}),
                ...(limit !== undefined ? { limit } : {}),
              },
              imap,
            ),
          ),
          Effect.flatMap(bounded),
        ),
      mail_fetch: ({ ref, offset }) =>
        onRef(ref, ({ account, login }) =>
          MailImapRead.fetchMessage(
            account,
            login,
            ref,
            offset !== undefined ? { offset } : {},
            imap,
          ),
        ),
      mail_read_attachment: ({ ref, partId }) =>
        onRef(ref, ({ account, login }) =>
          MailImapRead.readAttachment(account, login, ref, partId, imap),
        ),
      mail_save_draft: ({ account: selector, replacesRef, ...message }) =>
        Effect.gen(function* () {
          const { account, login } = yield* connect(replacesRef?.accountId ?? selector);
          const domain = account.address.split("@").at(-1);
          const messageId = `<${NodeCrypto.randomUUID()}@${domain}>`;
          const mime = yield* Effect.tryPromise({
            try: () => {
              const node = new MailComposer({
                from: { name: "", address: account.address },
                to: addresses(message.to),
                cc: addresses(message.cc ?? []),
                bcc: addresses(message.bcc ?? []),
                subject: message.subject,
                text: message.text,
                messageId,
                ...(message.inReplyTo ? { inReplyTo: message.inReplyTo } : {}),
                ...(message.references ? { references: [...message.references] } : {}),
              }).compile();
              // Drafts keep Bcc so the user sees every recipient before sending.
              node.keepBcc = true;
              return node.build();
            },
            catch: () => fail("invalid-input", "The draft could not be built."),
          });
          const saved = yield* MailImapWrite.saveDraft(
            account,
            login,
            { mime, messageId, ...(replacesRef ? { replacesRef } : {}) },
            imap,
          );
          return yield* bounded(saved);
        }),
      mail_set_flags: ({ ref, addKeywords, removeKeywords, ...flags }) =>
        onRef(ref, ({ account, login }) =>
          MailImapWrite.setFlags(
            account,
            login,
            ref,
            {
              ...flags,
              keywords: {
                ...(addKeywords ? { add: addKeywords } : {}),
                ...(removeKeywords ? { remove: removeKeywords } : {}),
              },
            },
            imap,
          ),
        ),
      mail_set_labels: ({ ref, ...change }) =>
        onRef(ref, ({ account, login }) =>
          MailImapWrite.setLabels(account, login, ref, change, imap),
        ),
      mail_move: ({ ref, mailbox }) =>
        onRef(ref, ({ account, login }) => MailImapWrite.move(account, login, ref, mailbox, imap)),
      mail_archive: ({ ref }) =>
        onRef(ref, ({ account, login }) => MailImapWrite.archive(account, login, ref, imap)),
      mail_prepare_send: ({ account: selector, draftRef, replyTo, attachments, ...content }) =>
        Effect.gen(function* () {
          const { threadId } = yield* scope;
          if (draftRef !== undefined && (content.to !== undefined || content.text !== undefined)) {
            return yield* fail("invalid-input", "Pass draftRef or new content, not both.");
          }
          const approval = yield* send.prepare({
            threadId,
            ...(replyTo ? { replyTo } : {}),
            ...((draftRef?.accountId ?? selector) !== undefined
              ? { selector: draftRef?.accountId ?? selector }
              : {}),
            ...(draftRef
              ? { draftRef }
              : {
                  content: {
                    to: content.to ?? [],
                    subject: content.subject ?? "",
                    text: content.text ?? "",
                    ...(content.cc ? { cc: content.cc } : {}),
                    ...(content.bcc ? { bcc: content.bcc } : {}),
                    ...(content.inReplyTo ? { inReplyTo: content.inReplyTo } : {}),
                    ...(content.references ? { references: content.references } : {}),
                  },
                }),
            ...(attachments ? { attachments } : {}),
          });
          return yield* bounded(statusView(approval));
        }),
      mail_send_status: ({ approvalId }) =>
        Effect.gen(function* () {
          const { threadId } = yield* scope;
          const approval = yield* send.status(approvalId, threadId);
          // Another thread's approval is reported as missing, not forbidden.
          if (approval.threadId !== threadId) {
            return yield* fail("not-found", "That send approval was not found.");
          }
          return yield* bounded(statusView(approval));
        }),
    });
  });

/** What the agent sees of an approval: no digest, which only the user's approval presents. */
const statusView = (
  approval: Effect.Success<ReturnType<MailSendService["Service"]["status"]>>,
) => ({
  approvalId: approval.id,
  status: approval.status,
  accountId: approval.accountId,
  ...(approval.sentMessage
    ? { sentMessage: approval.sentMessage, sentLinksPending: approval.sentLinksPending }
    : {}),
  to: approval.snapshot.to,
  cc: approval.snapshot.cc,
  bcc: approval.snapshot.bcc,
  subject: approval.snapshot.subject,
  attachments: approval.snapshot.attachments.map(({ name, size }) => ({ name, size })),
  expiresAt: approval.expiresAt,
  ...(approval.completedAt ? { completedAt: approval.completedAt } : {}),
  ...(approval.error ? { error: approval.error } : {}),
});

export const layer = (options?: Parameters<typeof make>[0]) => MailToolkit.toLayer(make(options));
