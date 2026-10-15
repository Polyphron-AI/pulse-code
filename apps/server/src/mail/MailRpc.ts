import {
  MailError,
  type MailAccountHealth,
  type MailErrorKind,
  type MailMessageContent,
  type MailMessageListItem,
  type MailMessageRef,
  type ProjectId,
  type ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import type { MailConfigService, StoredMailAccount } from "./MailConfigService.ts";
import { withImap, type MailConnectionOptions, type MailLogin } from "./MailConnection.ts";
import {
  fetchByReference,
  listMailboxes,
  search,
  type MailMessageDetail,
  type MailMessageSummary,
} from "./MailImapRead.ts";
import type { MailOAuth } from "./MailOAuth.ts";
import type { MailSendService } from "./MailSendService.ts";

const isMailError = Schema.is(MailError);

const unavailable = () =>
  new MailError({ kind: "unavailable", message: "The mail operation failed. Try again." });

/**
 * MailError messages are written redacted at their source, so they pass through. Anything else,
 * including defects whose text could carry a server reply or credential, becomes a generic error.
 */
const redact = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, MailError> =>
  effect.pipe(
    Effect.mapError((error) => (isMailError(error) ? error : unavailable())),
    Effect.catchDefect(() => Effect.fail(unavailable())),
  );

/** `redact` for streams. */
const redactStream = <A, E>(stream: Stream.Stream<A, E>): Stream.Stream<A, MailError> =>
  stream.pipe(
    Stream.mapError((error) => (isMailError(error) ? error : unavailable())),
    Stream.catchDefect(() => Stream.fail(unavailable())),
  );

const healthFor = (kind: MailErrorKind): MailAccountHealth["status"] =>
  kind === "auth-failed"
    ? "auth-failed"
    : kind === "network-denied" || kind === "unavailable"
      ? "unreachable"
      : "error";

/** Display text cut to `max` characters, so one odd header cannot bloat a page. */
const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

const toListItem = (summary: MailMessageSummary): MailMessageListItem => ({
  ref: summary.ref,
  seen: summary.seen,
  flagged: summary.flagged,
  answered: summary.answered,
  ...(summary.messageId ? { messageId: summary.messageId } : {}),
  ...(summary.subject ? { subject: clip(summary.subject, 300) } : {}),
  ...(summary.from ? { from: clip(summary.from, 300) } : {}),
  ...(summary.date ? { date: summary.date } : {}),
  ...(summary.size === undefined ? {} : { size: summary.size }),
});

const toContent = (detail: MailMessageDetail): MailMessageContent => ({
  ref: detail.ref,
  seen: detail.seen,
  flagged: detail.flagged,
  answered: detail.answered,
  ...(detail.messageId ? { messageId: detail.messageId } : {}),
  ...(detail.subject ? { subject: clip(detail.subject, 1_000) } : {}),
  ...(detail.from ? { from: clip(detail.from, 1_000) } : {}),
  ...(detail.to ? { to: clip(detail.to, 2_000) } : {}),
  ...(detail.cc ? { cc: clip(detail.cc, 2_000) } : {}),
  ...(detail.date ? { date: detail.date } : {}),
  body: detail.body,
  attachments: detail.attachments,
  ...(detail.sourceTruncated ? { sourceTruncated: true } : {}),
});

export const mailRpcHandlers = (
  config: MailConfigService["Service"],
  oauth: MailOAuth["Service"],
  send: MailSendService["Service"],
  imap: MailConnectionOptions = {},
) => {
  /** Signs in over IMAP and records the result as the account's health. */
  const testAccount = (accountId: string) =>
    Effect.gen(function* () {
      const account = yield* config.getAccount(accountId);
      const result = yield* oauth.login(accountId).pipe(
        Effect.flatMap((login) => withImap(account, login, () => Effect.void, imap)),
        Effect.result,
      );
      const checkedAt = DateTime.formatIso(yield* DateTime.now);
      return yield* config.setHealth(
        accountId,
        result._tag === "Success"
          ? { status: "ok", checkedAt }
          : { status: healthFor(result.failure.kind), message: result.failure.message, checkedAt },
      );
    });

  /** Signs in to `accountId` and runs `use` with its stored settings. */
  const withAccount = Effect.fnUntraced(function* <A>(
    accountId: string,
    use: (account: StoredMailAccount, login: MailLogin) => Effect.Effect<A, MailError>,
  ) {
    const account = yield* config.getAccount(accountId);
    const login = yield* oauth.login(accountId);
    return yield* use(account, login);
  });

  return {
    listAccounts: () => redact(config.listAccounts),
    upsertAccount: redactInput(config.upsertAccount),
    removeAccount: (input: { readonly accountId: string }) =>
      redact(config.removeAccount(input.accountId)),
    disconnectAccount: (input: { readonly accountId: string }) =>
      redact(config.disconnectAccount(input.accountId)),
    testAccount: (input: { readonly accountId: string }) => redact(testAccount(input.accountId)),
    setPassword: (input: { readonly accountId: string; readonly password: string }) =>
      redact(config.setCredential(input.accountId, { type: "password", password: input.password })),
    startOAuth: (input: { readonly accountId: string }) =>
      redact(oauth.startOAuth(input.accountId)),
    completeOAuth: (input: { readonly flowId: string; readonly redirectUrl: string }) =>
      redact(oauth.completeOAuth(input.flowId, input.redirectUrl)),
    getProjectAccess: (input: { readonly projectId: ProjectId }) =>
      redact(config.getProjectAccess(input.projectId)),
    setProjectAccess: redactInput(config.setProjectAccess),
    getThreadSelection: (input: { readonly threadId: ThreadId }) =>
      redact(config.getThreadSelection(input.threadId)).pipe(
        Effect.map((accountId) => (accountId === undefined ? {} : { accountId })),
      ),
    setThreadSelection: (input: {
      readonly threadId: ThreadId;
      readonly accountId: string | null;
    }) => redact(config.setThreadSelection(input.threadId, input.accountId)),
    subscribeThreadApprovals: (input: { readonly threadId: ThreadId }) =>
      redactStream(send.subscribeThread(input.threadId)),
    respondApproval: (input: Parameters<typeof send.respond>[0]) => redact(send.respond(input)),
    listFolders: (input: { readonly accountId: string }) =>
      redact(
        withAccount(input.accountId, (account, login) => listMailboxes(account, login, imap)).pipe(
          Effect.map(({ mailboxes, truncated }) => ({ folders: mailboxes, truncated })),
        ),
      ),
    listMessages: (input: {
      readonly accountId: string;
      readonly mailbox: string;
      readonly query?: string | undefined;
      readonly cursor?: string | undefined;
      readonly limit?: number | undefined;
    }) => {
      const text = input.query?.trim();
      return redact(
        withAccount(input.accountId, (account, login) =>
          search(
            account,
            login,
            {
              mailbox: input.mailbox,
              ...(text ? { query: { text } } : {}),
              ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
              ...(input.limit === undefined ? {} : { limit: input.limit }),
            },
            imap,
          ),
        ).pipe(
          Effect.map((page) => ({
            messages: page.messages.map(toListItem),
            ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
          })),
        ),
      );
    },
    readMessage: (input: {
      readonly accountId: string;
      readonly messageId?: string | undefined;
      readonly location?: MailMessageRef | undefined;
      readonly offset?: number | undefined;
    }) =>
      redact(
        input.location !== undefined && input.location.accountId !== input.accountId
          ? Effect.fail(
              new MailError({
                kind: "invalid-input",
                message: "This message belongs to another account.",
              }),
            )
          : withAccount(input.accountId, (account, login) =>
              fetchByReference(account, login, input, imap),
            ).pipe(Effect.map(toContent)),
      ),
  };
};

const redactInput =
  <I, A, E>(run: (input: I) => Effect.Effect<A, E>) =>
  (input: I) =>
    redact(run(input));
