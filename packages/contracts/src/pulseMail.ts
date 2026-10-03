import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";

import { EnvironmentAuthorizationError } from "./auth.ts";
import { NonNegativeInt, PositiveInt, ProjectId, ThreadId } from "./baseSchemas.ts";

export const MailAccountId = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]{1,64}$/));
export type MailAccountId = typeof MailAccountId.Type;
export const MailApprovalId = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]{1,64}$/));
export type MailApprovalId = typeof MailApprovalId.Type;

const Nickname = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64));
export const MailAddressString = Schema.String.check(
  Schema.isMaxLength(320),
  Schema.isPattern(/^[^\s@<>]+@[^\s@<>]+$/),
);
const Host = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(253));
const MailboxName = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1_024));
const ClientId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512));
const Tenant = Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9.-]{1,128}$/));

/** Port picks the TLS mode: 993 and 465 are implicit TLS, 143 and 587 require STARTTLS. */
export const MailImapEndpoint = Schema.Struct({ host: Host, port: Schema.Literals([993, 143]) });
export const MailSmtpEndpoint = Schema.Struct({ host: Host, port: Schema.Literals([465, 587]) });

export const MailFolderOverrides = Schema.Struct({
  drafts: Schema.optionalKey(MailboxName),
  sent: Schema.optionalKey(MailboxName),
  archive: Schema.optionalKey(MailboxName),
});

/** Omitted `clientSecret` keeps the stored secret; an empty string clears it. */
export const MailAuthInput = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("password") }),
  Schema.Struct({
    kind: Schema.Literal("oauth-google"),
    clientId: ClientId,
    clientSecret: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(1_024))),
  }),
  Schema.Struct({
    kind: Schema.Literal("oauth-microsoft"),
    clientId: ClientId,
    tenant: Schema.optionalKey(Tenant),
    clientSecret: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(1_024))),
  }),
]);
export type MailAuthInput = typeof MailAuthInput.Type;

export const MailAuth = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("password") }),
  Schema.Struct({
    kind: Schema.Literal("oauth-google"),
    clientId: ClientId,
    clientSecretConfigured: Schema.Boolean,
  }),
  Schema.Struct({
    kind: Schema.Literal("oauth-microsoft"),
    clientId: ClientId,
    tenant: Schema.optionalKey(Tenant),
    clientSecretConfigured: Schema.Boolean,
  }),
]);
export type MailAuth = typeof MailAuth.Type;

/** Omitted `id` creates an account; the server assigns a stable ID. */
export const MailAccountInput = Schema.Struct({
  id: Schema.optionalKey(MailAccountId),
  nickname: Nickname,
  address: MailAddressString,
  username: Schema.optionalKey(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(320))),
  imap: MailImapEndpoint,
  smtp: MailSmtpEndpoint,
  auth: MailAuthInput,
  allowPrivateNetwork: Schema.optionalKey(Schema.Boolean),
  appendToSent: Schema.optionalKey(Schema.Boolean),
  folders: Schema.optionalKey(MailFolderOverrides),
});
export type MailAccountInput = typeof MailAccountInput.Type;

export const MailAccountHealth = Schema.Struct({
  status: Schema.Literals([
    "unknown",
    "ok",
    "auth-failed",
    "reauth-required",
    "unreachable",
    "error",
  ]),
  message: Schema.optionalKey(Schema.String),
  checkedAt: Schema.optionalKey(Schema.String),
});
export type MailAccountHealth = typeof MailAccountHealth.Type;

/** Public account view. It never carries a password, token, client secret, or secret reference. */
export const MailAccount = Schema.Struct({
  id: MailAccountId,
  nickname: Nickname,
  address: MailAddressString,
  username: Schema.String,
  imap: MailImapEndpoint,
  smtp: MailSmtpEndpoint,
  auth: MailAuth,
  allowPrivateNetwork: Schema.Boolean,
  appendToSent: Schema.Boolean,
  folders: MailFolderOverrides,
  credentialConfigured: Schema.Boolean,
  health: MailAccountHealth,
});
export type MailAccount = typeof MailAccount.Type;

/** Durable message identity. Sequence numbers are never part of a reference. */
export const MailMessageRef = Schema.Struct({
  accountId: MailAccountId,
  mailbox: MailboxName,
  uidValidity: NonNegativeInt,
  uid: PositiveInt,
});
export type MailMessageRef = typeof MailMessageRef.Type;

export const MailAddress = Schema.Struct({
  name: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  address: MailAddressString,
});
export type MailAddress = typeof MailAddress.Type;

export const MailAttachmentSummary = Schema.Struct({
  name: Schema.String,
  contentType: Schema.String,
  size: NonNegativeInt,
  sha256: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
});
export type MailAttachmentSummary = typeof MailAttachmentSummary.Type;

/** The exact outgoing message a user approves. The server submits only the bytes it digested. */
export const MailSendSnapshot = Schema.Struct({
  accountId: MailAccountId,
  accountNickname: Nickname,
  from: MailAddress,
  to: Schema.Array(MailAddress),
  cc: Schema.Array(MailAddress),
  bcc: Schema.Array(MailAddress),
  subject: Schema.String,
  text: Schema.String,
  inReplyTo: Schema.optionalKey(Schema.String),
  references: Schema.optionalKey(Schema.Array(Schema.String)),
  attachments: Schema.Array(MailAttachmentSummary),
  sourceDraft: Schema.optionalKey(MailMessageRef),
});
export type MailSendSnapshot = typeof MailSendSnapshot.Type;

export const MailSendApprovalStatus = Schema.Literals([
  "pending",
  "submitting",
  "accepted",
  "failed",
  "outcome_unknown",
  "declined",
  "expired",
  "invalidated",
]);
export type MailSendApprovalStatus = typeof MailSendApprovalStatus.Type;

export const MailSendApproval = Schema.Struct({
  id: MailApprovalId,
  projectId: ProjectId,
  threadId: ThreadId,
  accountId: MailAccountId,
  status: MailSendApprovalStatus,
  snapshot: MailSendSnapshot,
  digest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
  createdAt: Schema.String,
  expiresAt: Schema.String,
  decidedAt: Schema.optionalKey(Schema.String),
  completedAt: Schema.optionalKey(Schema.String),
  error: Schema.optionalKey(Schema.Struct({ code: Schema.String, message: Schema.String })),
});
export type MailSendApproval = typeof MailSendApproval.Type;

/** Activity kind appended to a thread when a send needs approval. Its payload is `{ approvalId }` only. */
export const MAIL_SEND_APPROVAL_ACTIVITY_KIND = "mail.send-approval";

/** Activity kind appended when the user approves or declines, so every client closes the request. */
export const MAIL_SEND_APPROVAL_RESOLVED_ACTIVITY_KIND = "mail.send-approval.resolved";

export const MailErrorKind = Schema.Literals([
  "access-denied",
  "ambiguous-account",
  "stale-reference",
  "unsupported",
  "limit-exceeded",
  "network-denied",
  "auth-failed",
  "outcome-unknown",
  "not-found",
  "invalid-input",
  "conflict",
  "unavailable",
]);
export type MailErrorKind = typeof MailErrorKind.Type;

/** Mail failures for tools and RPCs. Messages are redacted and never carry credentials. */
export class MailError extends Schema.TaggedError<MailError>()("MailError", {
  kind: MailErrorKind,
  message: Schema.String,
}) {}

export const MailProjectAccess = Schema.Struct({
  projectId: ProjectId,
  accountIds: Schema.Array(MailAccountId).check(Schema.isMaxLength(64)),
  defaultAccountId: Schema.optionalKey(MailAccountId),
});
export type MailProjectAccess = typeof MailProjectAccess.Type;

const errors = Schema.Union([MailError, EnvironmentAuthorizationError]);
const AccountRef = Schema.Struct({ accountId: MailAccountId });

export const PULSE_MAIL_METHODS = {
  listAccounts: "pulse.mail.listAccounts",
  upsertAccount: "pulse.mail.upsertAccount",
  removeAccount: "pulse.mail.removeAccount",
  testAccount: "pulse.mail.testAccount",
  setPassword: "pulse.mail.setPassword",
  startOAuth: "pulse.mail.startOAuth",
  completeOAuth: "pulse.mail.completeOAuth",
  getProjectAccess: "pulse.mail.getProjectAccess",
  setProjectAccess: "pulse.mail.setProjectAccess",
  getThreadSelection: "pulse.mail.getThreadSelection",
  setThreadSelection: "pulse.mail.setThreadSelection",
  listThreadApprovals: "pulse.mail.listThreadApprovals",
  getApproval: "pulse.mail.getApproval",
  respondApproval: "pulse.mail.respondApproval",
} as const;

export const PulseMailRpcs = [
  Rpc.make(PULSE_MAIL_METHODS.listAccounts, {
    payload: Schema.Struct({}),
    success: Schema.Array(MailAccount),
    error: errors,
  }),
  Rpc.make(PULSE_MAIL_METHODS.upsertAccount, {
    payload: MailAccountInput,
    success: MailAccount,
    error: errors,
  }),
  Rpc.make(PULSE_MAIL_METHODS.removeAccount, {
    payload: AccountRef,
    success: Schema.Void,
    error: errors,
  }),
  Rpc.make(PULSE_MAIL_METHODS.testAccount, {
    payload: AccountRef,
    success: MailAccount,
    error: errors,
  }),
  Rpc.make(PULSE_MAIL_METHODS.setPassword, {
    payload: Schema.Struct({
      accountId: MailAccountId,
      password: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1_024)),
    }),
    success: MailAccount,
    error: errors,
  }),
  Rpc.make(PULSE_MAIL_METHODS.startOAuth, {
    payload: AccountRef,
    success: Schema.Struct({ flowId: Schema.String, authorizeUrl: Schema.String }),
    error: errors,
  }),
  Rpc.make(PULSE_MAIL_METHODS.completeOAuth, {
    payload: Schema.Struct({
      flowId: Schema.String.check(Schema.isMaxLength(128)),
      redirectUrl: Schema.String.check(Schema.isMaxLength(8_192)),
    }),
    success: MailAccount,
    error: errors,
  }),
  Rpc.make(PULSE_MAIL_METHODS.getProjectAccess, {
    payload: Schema.Struct({ projectId: ProjectId }),
    success: MailProjectAccess,
    error: errors,
  }),
  Rpc.make(PULSE_MAIL_METHODS.setProjectAccess, {
    payload: MailProjectAccess,
    success: MailProjectAccess,
    error: errors,
  }),
  Rpc.make(PULSE_MAIL_METHODS.getThreadSelection, {
    payload: Schema.Struct({ threadId: ThreadId }),
    success: Schema.Struct({ accountId: Schema.optionalKey(MailAccountId) }),
    error: errors,
  }),
  Rpc.make(PULSE_MAIL_METHODS.setThreadSelection, {
    payload: Schema.Struct({ threadId: ThreadId, accountId: Schema.NullOr(MailAccountId) }),
    success: Schema.Void,
    error: errors,
  }),
  Rpc.make(PULSE_MAIL_METHODS.listThreadApprovals, {
    payload: Schema.Struct({ threadId: ThreadId }),
    success: Schema.Array(MailSendApproval),
    error: errors,
  }),
  Rpc.make(PULSE_MAIL_METHODS.getApproval, {
    payload: Schema.Struct({ approvalId: MailApprovalId }),
    success: MailSendApproval,
    error: errors,
  }),
  Rpc.make(PULSE_MAIL_METHODS.respondApproval, {
    payload: Schema.Struct({
      approvalId: MailApprovalId,
      decision: Schema.Literals(["approve", "decline"]),
      digest: Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)),
    }),
    success: MailSendApproval,
    error: errors,
  }),
] as const;
