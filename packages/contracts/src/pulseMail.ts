import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";

import { EnvironmentAuthorizationError } from "./auth.ts";
import { IsoDateTime, NonNegativeInt, PositiveInt, ProjectId, ThreadId } from "./baseSchemas.ts";

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
export const MailboxName = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1_024));
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

/** A Message-ID header as `<inner>`, or undefined when it cannot serve as a stable key. */
export function normalizeMessageId(raw: string): string | undefined {
  const inner = raw.trim().replace(/^</, "").replace(/>$/, "").trim();
  if (inner.length === 0 || inner.length > 996 || /[\s<>]/.test(inner)) return undefined;
  return `<${inner}>`;
}

export const MailMessageIdHeader = Schema.String.check(
  Schema.makeFilter(
    (value) => normalizeMessageId(value) === value || "Expected a Message-ID such as <id@host>.",
  ),
);

export const MailFolder = Schema.Struct({
  name: MailboxName,
  specialUse: Schema.optionalKey(Schema.String),
});
export type MailFolder = typeof MailFolder.Type;

export const MailFolderList = Schema.Struct({
  folders: Schema.Array(MailFolder),
  truncated: Schema.Boolean,
});
export type MailFolderList = typeof MailFolderList.Type;

/** One row of a folder listing. `messageId` is what a link to this message stores. */
export const MailMessageListItem = Schema.Struct({
  ref: MailMessageRef,
  messageId: Schema.optionalKey(MailMessageIdHeader),
  subject: Schema.optionalKey(Schema.String),
  from: Schema.optionalKey(Schema.String),
  date: Schema.optionalKey(IsoDateTime),
  seen: Schema.Boolean,
  flagged: Schema.Boolean,
  answered: Schema.Boolean,
  size: Schema.optionalKey(NonNegativeInt),
});
export type MailMessageListItem = typeof MailMessageListItem.Type;

export const MailMessagePage = Schema.Struct({
  messages: Schema.Array(MailMessageListItem),
  nextCursor: Schema.optionalKey(Schema.String),
});
export type MailMessagePage = typeof MailMessagePage.Type;

/** One message as the reader shows it. `ref` is where it was actually found. */
export const MailMessageContent = Schema.Struct({
  ref: MailMessageRef,
  messageId: Schema.optionalKey(MailMessageIdHeader),
  subject: Schema.optionalKey(Schema.String),
  from: Schema.optionalKey(Schema.String),
  to: Schema.optionalKey(Schema.String),
  cc: Schema.optionalKey(Schema.String),
  date: Schema.optionalKey(IsoDateTime),
  seen: Schema.Boolean,
  flagged: Schema.Boolean,
  answered: Schema.Boolean,
  body: Schema.Struct({
    text: Schema.String,
    truncated: Schema.Boolean,
    nextOffset: Schema.optionalKey(NonNegativeInt),
  }),
  attachments: Schema.Array(
    Schema.Struct({
      partId: Schema.String,
      name: Schema.String,
      contentType: Schema.String,
      size: NonNegativeInt,
    }),
  ),
  sourceTruncated: Schema.optionalKey(Schema.Boolean),
});
export type MailMessageContent = typeof MailMessageContent.Type;

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
  disconnectAccount: "pulse.mail.disconnectAccount",
  testAccount: "pulse.mail.testAccount",
  setPassword: "pulse.mail.setPassword",
  startOAuth: "pulse.mail.startOAuth",
  completeOAuth: "pulse.mail.completeOAuth",
  getProjectAccess: "pulse.mail.getProjectAccess",
  setProjectAccess: "pulse.mail.setProjectAccess",
  getThreadSelection: "pulse.mail.getThreadSelection",
  setThreadSelection: "pulse.mail.setThreadSelection",
  subscribeThreadApprovals: "pulse.mail.subscribeThreadApprovals",
  respondApproval: "pulse.mail.respondApproval",
  listFolders: "pulse.mail.listFolders",
  listMessages: "pulse.mail.listMessages",
  readMessage: "pulse.mail.readMessage",
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
  Rpc.make(PULSE_MAIL_METHODS.disconnectAccount, {
    payload: AccountRef,
    success: MailAccount,
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
  /**
   * The thread's pending and submitting approvals plus any resolved in the last 30 minutes, on
   * subscribe and again after each change to any of them.
   */
  Rpc.make(PULSE_MAIL_METHODS.subscribeThreadApprovals, {
    payload: Schema.Struct({ threadId: ThreadId }),
    success: Schema.Array(MailSendApproval),
    error: errors,
    stream: true,
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
  Rpc.make(PULSE_MAIL_METHODS.listFolders, {
    payload: AccountRef,
    success: MailFolderList,
    error: errors,
  }),
  Rpc.make(PULSE_MAIL_METHODS.listMessages, {
    payload: Schema.Struct({
      accountId: MailAccountId,
      mailbox: MailboxName,
      query: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(200))),
      cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(64))),
      limit: Schema.optionalKey(PositiveInt),
    }),
    success: MailMessagePage,
    error: errors,
  }),
  Rpc.make(PULSE_MAIL_METHODS.readMessage, {
    payload: Schema.Struct({
      accountId: MailAccountId,
      messageId: Schema.optionalKey(MailMessageIdHeader),
      location: Schema.optionalKey(MailMessageRef),
      offset: Schema.optionalKey(NonNegativeInt),
    }),
    success: MailMessageContent,
    error: errors,
  }),
] as const;
