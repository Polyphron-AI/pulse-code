import * as Schema from "effect/Schema";
import { NonNegativeInt, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

const Label = TrimmedNonEmptyString.check(Schema.isMaxLength(500));
const Id = TrimmedNonEmptyString.check(Schema.isMaxLength(512));
const Addresses = Schema.Array(Label).check(Schema.isMaxLength(100));
export const MailServer = Schema.Struct({
  host: Label,
  port: PositiveInt.check(Schema.isLessThanOrEqualTo(65535)),
  security: Schema.Literals(["tls", "starttls"]),
  username: Label,
});
export type MailServer = typeof MailServer.Type;
export const MailAccount = Schema.Struct({
  id: Id,
  name: Label,
  email: Label,
  imap: MailServer,
  smtp: Schema.NullOr(MailServer),
  connected: Schema.Boolean,
});
export type MailAccount = typeof MailAccount.Type;
export const MailStatus = Schema.Struct({
  enabled: Schema.Boolean,
  maturity: Schema.Literal("alpha"),
  accounts: Schema.Array(MailAccount),
  attachmentLimitBytes: PositiveInt,
});
export type MailStatus = typeof MailStatus.Type;
const Password = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096));
export const MailAccountSaveInput = Schema.Struct({
  id: Schema.optional(Id),
  name: Label,
  email: Label,
  imap: MailServer,
  smtp: Schema.NullOr(MailServer),
  imapPassword: Schema.optional(Password),
  smtpPassword: Schema.optional(Password),
});
export type MailAccountSaveInput = typeof MailAccountSaveInput.Type;
export const MailAccountInput = Schema.Struct({ accountId: Id });
export const MailFolder = Schema.Struct({
  path: Label,
  name: Label,
  specialUse: Schema.NullOr(Schema.String),
  selectable: Schema.Boolean,
});
export type MailFolder = typeof MailFolder.Type;
export const MailFolderInput = Schema.Struct({ accountId: Id, folder: Label });
export const MailFolderRenameInput = Schema.Struct({
  accountId: Id,
  folder: Label,
  newPath: Label,
});
export const MailMessageRef = Schema.Struct({
  accountId: Id,
  folder: Label,
  uidValidity: Id,
  uid: PositiveInt,
});
export type MailMessageRef = typeof MailMessageRef.Type;
export const MailLink = Schema.Struct({
  id: Id,
  type: Schema.Literals(["project", "customer", "department", "task", "sop", "file", "url"]),
  target: Label,
  label: Label,
  inferred: Schema.Boolean,
});
export type MailLink = typeof MailLink.Type;
export const MailMetadata = Schema.Struct({
  revision: NonNegativeInt,
  tags: Schema.Array(Label).check(Schema.isMaxLength(100)),
  links: Schema.Array(MailLink).check(Schema.isMaxLength(100)),
  suppressedLinks: Schema.Array(Id),
});
export type MailMetadata = typeof MailMetadata.Type;
export const MailMessage = Schema.Struct({
  ref: MailMessageRef,
  id: Id,
  messageId: Schema.NullOr(Schema.String),
  subject: Schema.String,
  from: Schema.String,
  to: Schema.Array(Schema.String),
  cc: Schema.Array(Schema.String),
  date: Schema.NullOr(Schema.String),
  flags: Schema.Array(Schema.String),
  size: NonNegativeInt,
  metadata: MailMetadata,
});
export type MailMessage = typeof MailMessage.Type;
export const MailMessagesInput = Schema.Struct({
  accountId: Id,
  folder: Label,
  beforeUid: Schema.optional(PositiveInt),
  limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(100))),
  query: Schema.optional(Label),
  unreadOnly: Schema.optional(Schema.Boolean),
  flaggedOnly: Schema.optional(Schema.Boolean),
});
export type MailMessagesInput = typeof MailMessagesInput.Type;
export const MailMessagesResult = Schema.Struct({
  messages: Schema.Array(MailMessage),
  nextBeforeUid: Schema.NullOr(PositiveInt),
  uidValidity: Id,
});
export type MailMessagesResult = typeof MailMessagesResult.Type;
export const MailAttachment = Schema.Struct({
  id: Id,
  filename: Schema.String,
  contentType: Schema.String,
  size: NonNegativeInt,
});
export type MailAttachment = typeof MailAttachment.Type;
export const MailMessageDetail = Schema.Struct({
  message: MailMessage,
  text: Schema.String,
  html: Schema.NullOr(Schema.String),
  replyTo: Schema.Array(Schema.String),
  attachments: Schema.Array(MailAttachment),
});
export type MailMessageDetail = typeof MailMessageDetail.Type;
export const MailAttachmentInput = Schema.Struct({ ref: MailMessageRef, attachmentId: Id });
export const MailDownload = Schema.Struct({
  filename: Schema.String,
  contentType: Schema.String,
  base64: Schema.String,
});
export type MailDownload = typeof MailDownload.Type;
export const MailMessageActionInput = Schema.Struct({
  refs: Schema.Array(MailMessageRef).check(Schema.isMinLength(1), Schema.isMaxLength(100)),
  action: Schema.Literals([
    "read",
    "unread",
    "flag",
    "unflag",
    "move",
    "archive",
    "trash",
    "restore",
  ]),
  destination: Schema.optional(Label),
});
export type MailMessageActionInput = typeof MailMessageActionInput.Type;
export const MailActionResult = Schema.Struct({
  completed: Schema.Array(MailMessageRef),
  moved: Schema.Array(Schema.Struct({ from: MailMessageRef, to: MailMessageRef })),
  failed: Schema.Array(Schema.Struct({ ref: MailMessageRef, detail: Schema.String })),
});
export type MailActionResult = typeof MailActionResult.Type;
export const MailMetadataSaveInput = Schema.Struct({
  ref: MailMessageRef,
  revision: NonNegativeInt,
  tags: Schema.Array(Label).check(Schema.isMaxLength(100)),
  links: Schema.Array(MailLink).check(Schema.isMaxLength(100)),
});
export type MailMetadataSaveInput = typeof MailMetadataSaveInput.Type;
export const MailDraftAttachment = Schema.Struct({
  id: Id,
  filename: Label,
  contentType: Label,
  base64: Schema.String.check(Schema.isMaxLength(7_000_000)),
});
export const MailDraftContent = Schema.Struct({
  accountId: Id,
  to: Addresses,
  cc: Addresses,
  bcc: Addresses,
  subject: Schema.String.check(Schema.isMaxLength(998)),
  text: Schema.String.check(Schema.isMaxLength(1_000_000)),
  attachments: Schema.Array(MailDraftAttachment).check(Schema.isMaxLength(20)),
  inReplyTo: Schema.optional(Label),
  references: Schema.optional(Schema.Array(Label)),
});
export const MailDraft = Schema.Struct({
  id: Id,
  revision: NonNegativeInt,
  updatedAt: Schema.String,
  content: MailDraftContent,
});
export type MailDraft = typeof MailDraft.Type;
export const MailDraftSummary = Schema.Struct({
  id: Id,
  revision: NonNegativeInt,
  updatedAt: Schema.String,
  content: Schema.Struct({ accountId: Id, to: Addresses, subject: Schema.String }),
  attachmentCount: NonNegativeInt,
});
export type MailDraftSummary = typeof MailDraftSummary.Type;
export const MailDraftGetInput = Schema.Struct({ id: Id });
export const MailDraftSaveInput = Schema.Struct({
  id: Schema.optional(Id),
  revision: NonNegativeInt,
  content: MailDraftContent,
});
export type MailDraftSaveInput = typeof MailDraftSaveInput.Type;
export const MailDraftDeleteInput = Schema.Struct({ id: Id, revision: NonNegativeInt });
export const MailSendInput = Schema.Struct({
  draftId: Id,
  revision: NonNegativeInt,
  operationId: Id,
});
export type MailSendInput = typeof MailSendInput.Type;
export const MailSendReceipt = Schema.Struct({
  operationId: Id,
  draftId: Id,
  accountId: Id,
  state: Schema.Literals(["sending", "accepted", "partial", "failed", "uncertain"]),
  messageId: Schema.String,
  accepted: Schema.Array(Schema.String),
  rejected: Schema.Array(Schema.String),
  detail: Schema.String,
  updatedAt: Schema.String,
});
export type MailSendReceipt = typeof MailSendReceipt.Type;
export class MailOperationError extends Schema.TaggedErrorClass<MailOperationError>()(
  "MailOperationError",
  {
    reason: Schema.Literals([
      "disabled",
      "not-found",
      "conflict",
      "connection",
      "invalid",
      "unavailable",
      "too-large",
    ]),
    detail: Schema.String,
  },
) {
  override get message() {
    return this.detail;
  }
}
