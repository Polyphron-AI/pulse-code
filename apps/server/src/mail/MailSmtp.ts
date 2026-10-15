import * as NodeStream from "node:stream";

import * as Effect from "effect/Effect";
import type { NodemailerError } from "nodemailer/lib/errors";
import SMTPConnection from "nodemailer/lib/smtp-connection";
import XOAuth2 from "nodemailer/lib/xoauth2";

import type { StoredMailAccount } from "./MailConfigService.ts";
import {
  smtpTransportOptions,
  toMailError,
  type MailConnectionOptions,
  type MailLogin,
} from "./MailConnection.ts";

export type MailSubmitResult =
  | { readonly kind: "accepted"; readonly response: string }
  | { readonly kind: "failed"; readonly code: number; readonly message: string }
  | { readonly kind: "outcome_unknown"; readonly reason: string };

export interface MailSubmission {
  readonly envelope: { readonly from: string; readonly to: ReadonlyArray<string> };
  readonly mime: Uint8Array;
}

const summarize = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, 300);

/**
 * A server reply of 4xx or 5xx is a definite failure. Without a reply, the message may or may not
 * have been queued once its bytes started flowing, so that case is never reported as failed.
 */
const classify = (error: NodemailerError | undefined, dataStarted: boolean): MailSubmitResult => {
  const code = error?.responseCode;
  if (code !== undefined && code >= 400) {
    return { kind: "failed", code, message: summarize(error?.response ?? error?.message ?? "") };
  }
  if (dataStarted) {
    return {
      kind: "outcome_unknown",
      reason:
        "The connection ended after the message was sent and before the server confirmed it. Check the Sent folder before sending again.",
    };
  }
  return { kind: "failed", code: 0, message: toMailError(error).message };
};

/**
 * Submits one message over one connection and never retries: a retry after DATA could deliver a
 * duplicate. The result says whether the server accepted, refused, or left the outcome unknown.
 */
export const submit = (
  account: StoredMailAccount,
  login: MailLogin,
  submission: MailSubmission,
  options: MailConnectionOptions = {},
) =>
  smtpTransportOptions(account, login, options).pipe(
    Effect.flatMap(({ auth: _auth, ...connectionOptions }) =>
      Effect.callback<MailSubmitResult>((resume) => {
        let dataStarted = false;
        let settled = false;
        const connection = new SMTPConnection(connectionOptions);
        const finish = (result: MailSubmitResult) => {
          if (settled) return;
          settled = true;
          if (result.kind === "accepted") connection.quit();
          else connection.close();
          resume(Effect.succeed(result));
        };
        const fail = (error?: NodemailerError | null) =>
          finish(classify(error ?? undefined, dataStarted));
        connection.on("error", fail);
        connection.connect((connectError) => {
          if (connectError) return fail(connectError);
          connection.login(
            login.type === "password"
              ? { user: account.username, pass: login.password }
              : {
                  user: account.username,
                  oauth2: new XOAuth2({ user: account.username, accessToken: login.accessToken }),
                },
            (loginError) => {
              if (loginError) return fail(loginError);
              // nodemailer reads the body only after the server answers DATA with 354.
              const message = new NodeStream.Readable({
                read() {
                  dataStarted = true;
                  this.push(Buffer.from(submission.mime));
                  this.push(null);
                },
              });
              connection.send(
                { from: submission.envelope.from, to: [...submission.envelope.to] },
                message,
                (sendError, info) =>
                  sendError
                    ? fail(sendError)
                    : finish({ kind: "accepted", response: summarize(info?.response ?? "") }),
              );
            },
          );
        });
        return Effect.sync(() => {
          settled = true;
          connection.close();
        });
      }),
    ),
  );
