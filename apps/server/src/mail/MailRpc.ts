import {
  MailError,
  type MailAccountHealth,
  type MailErrorKind,
  type ProjectId,
  type ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { MailConfigService } from "./MailConfigService.ts";
import { withImap, type MailConnectionOptions } from "./MailConnection.ts";
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

const healthFor = (kind: MailErrorKind): MailAccountHealth["status"] =>
  kind === "auth-failed"
    ? "auth-failed"
    : kind === "network-denied" || kind === "unavailable"
      ? "unreachable"
      : "error";

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
    listThreadApprovals: (input: { readonly threadId: ThreadId }) =>
      redact(send.listThread(input.threadId)),
    getApproval: (input: { readonly approvalId: string }) => redact(send.status(input.approvalId)),
    respondApproval: (input: Parameters<typeof send.respond>[0]) => redact(send.respond(input)),
  };
};

const redactInput =
  <I, A, E>(run: (input: I) => Effect.Effect<A, E>) =>
  (input: I) =>
    redact(run(input));
