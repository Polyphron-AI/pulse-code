import * as NodeNet from "node:net";
import type * as NodeTls from "node:tls";

import { MailError } from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ImapFlow } from "imapflow";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

import type { StoredMailAccount } from "./MailConfigService.ts";
import { resolveMailDestination, type MailLookup } from "./MailNetworkPolicy.ts";

/** What a connection signs in with. OAuth callers pass a fresh access token, never a refresh token. */
export type MailLogin =
  | { readonly type: "password"; readonly password: string }
  | { readonly type: "oauth"; readonly accessToken: string };

export interface MailConnectionOptions {
  readonly lookup?: MailLookup;
  /** Test-only: dial a scripted peer's port instead of 993/143/465/587, optionally trusting its CA. */
  readonly testPeer?: { readonly port: number; readonly ca?: string };
  readonly timeout?: Duration.Input;
}

const DEFAULT_TIMEOUT = Duration.seconds(30);

const target = (
  endpoint: { readonly host: string; readonly port: number },
  protocol: "imap" | "smtp",
  account: StoredMailAccount,
  options: MailConnectionOptions,
) =>
  resolveMailDestination(
    endpoint.host,
    endpoint.port,
    protocol,
    account.allowPrivateNetwork,
    options.lookup,
  ).pipe(
    Effect.map((destination) => {
      const tls: NodeTls.ConnectionOptions = {
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
        // SNI must be a hostname; an IP literal host is verified against the IP instead.
        ...(NodeNet.isIP(destination.servername) ? {} : { servername: destination.servername }),
        ...(options.testPeer?.ca ? { ca: options.testPeer.ca } : {}),
      };
      return {
        // Dial the checked address so a second DNS answer can never redirect the socket.
        host: destination.address,
        port: options.testPeer?.port ?? endpoint.port,
        implicitTls: endpoint.port === 993 || endpoint.port === 465,
        tls,
      };
    }),
  );

const isMailError = Schema.is(MailError);

const CERTIFICATE_ERROR =
  /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME|UNABLE_TO_GET_ISSUER|ERR_SSL|EPROTO/;

/** Maps an imapflow or nodemailer failure to a mail error without echoing server payloads. */
export const toMailError = (cause: unknown): MailError => {
  if (isMailError(cause)) return cause;
  const error = (cause ?? {}) as {
    readonly authenticationFailed?: boolean;
    readonly tlsFailed?: boolean;
    readonly code?: string;
    readonly responseCode?: number;
    readonly message?: string;
  };
  if (error.authenticationFailed || error.code === "EAUTH" || error.responseCode === 535) {
    return new MailError({ kind: "auth-failed", message: "The mail server rejected the sign-in." });
  }
  if (error.tlsFailed || /STARTTLS/i.test(error.message ?? "") || error.code === "ETLS") {
    return new MailError({
      kind: "unavailable",
      message: "The mail server does not offer a secure connection (STARTTLS).",
    });
  }
  if (CERTIFICATE_ERROR.test(error.code ?? "")) {
    return new MailError({
      kind: "unavailable",
      message: "The mail server's TLS certificate is not trusted for this host.",
    });
  }
  return new MailError({ kind: "unavailable", message: "Could not reach the mail server." });
};

/** Runs an imapflow call, mapping its failure. */
export const imapCall = <A>(run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: toMailError });

/**
 * Opens an authenticated IMAP session for `use`, then logs out. TLS is mandatory: 993 is implicit
 * TLS and 143 must upgrade with STARTTLS before any credential is sent.
 */
export const withImap = <A, E, R>(
  account: StoredMailAccount,
  login: MailLogin,
  use: (client: ImapFlow) => Effect.Effect<A, E, R>,
  options: MailConnectionOptions = {},
): Effect.Effect<A, E | MailError, R> =>
  Effect.gen(function* () {
    const { host, port, implicitTls, tls } = yield* target(account.imap, "imap", account, options);
    const timeout = Duration.toMillis(options.timeout ?? DEFAULT_TIMEOUT);
    const connect = imapCall(async () => {
      const client = new ImapFlow({
        host,
        port,
        secure: implicitTls,
        doSTARTTLS: implicitTls ? undefined : true,
        ...(tls.servername ? { servername: tls.servername } : {}),
        tls,
        auth:
          login.type === "password"
            ? { user: account.username, pass: login.password }
            : { user: account.username, accessToken: login.accessToken },
        logger: false,
        disableAutoIdle: true,
        connectionTimeout: timeout,
        greetingTimeout: timeout,
        socketTimeout: timeout,
      });
      // imapflow emits socket errors as events; the awaited call already reports them.
      client.on("error", () => undefined);
      try {
        await client.connect();
        return client;
      } catch (cause) {
        client.close();
        throw cause;
      }
    });
    return yield* Effect.acquireUseRelease(connect, use, (client) =>
      Effect.promise(() => client.logout().catch(() => client.close())),
    ).pipe(
      Effect.timeoutOrElse({
        duration: timeout,
        orElse: () =>
          Effect.fail(
            new MailError({ kind: "unavailable", message: "The mail server timed out." }),
          ),
      }),
    );
  });

/** Nodemailer SMTP options with the same destination and TLS guarantees as `withImap`. */
export const smtpTransportOptions = (
  account: StoredMailAccount,
  login: MailLogin,
  options: MailConnectionOptions = {},
): Effect.Effect<SMTPTransport.Options, MailError> =>
  target(account.smtp, "smtp", account, options).pipe(
    Effect.map(({ host, port, implicitTls, tls }) => {
      const timeout = Duration.toMillis(options.timeout ?? DEFAULT_TIMEOUT);
      return {
        host,
        port,
        secure: implicitTls,
        requireTLS: !implicitTls,
        tls,
        auth:
          login.type === "password"
            ? { user: account.username, pass: login.password }
            : { type: "OAuth2", user: account.username, accessToken: login.accessToken },
        connectionTimeout: timeout,
        greetingTimeout: timeout,
        socketTimeout: timeout,
        disableFileAccess: true,
        disableUrlAccess: true,
        logger: false,
      } satisfies SMTPTransport.Options;
    }),
  );
