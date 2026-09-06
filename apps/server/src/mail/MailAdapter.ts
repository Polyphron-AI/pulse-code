import * as NodeCrypto from "node:crypto";
import { ImapFlow, type FetchMessageObject } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { findMailPage } from "./MailPagination.ts";
import type {
  MailAccount,
  MailActionResult,
  MailDownload,
  MailDraft,
  MailFolder,
  MailMessage,
  MailMessageActionInput,
  MailMessageDetail,
  MailMessageRef,
  MailMessagesInput,
  MailMessagesResult,
} from "@t3tools/contracts";
import { MailOperationError } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const isMailOperationError = Schema.is(MailOperationError);

export const MAIL_ATTACHMENT_LIMIT = 5_000_000;
const MAX_MESSAGE_BYTES = 20_000_000;
export type MailCredentials = { imapPassword: string; smtpPassword: string };
export interface MailAdapter {
  verify(account: MailAccount, secrets: MailCredentials): Promise<void>;
  folders(account: MailAccount, secrets: MailCredentials): Promise<ReadonlyArray<MailFolder>>;
  folder(
    account: MailAccount,
    secrets: MailCredentials,
    operation: "create" | "rename" | "delete",
    folder: string,
    newPath?: string,
  ): Promise<void>;
  list(
    account: MailAccount,
    secrets: MailCredentials,
    input: MailMessagesInput,
  ): Promise<MailMessagesResult>;
  read(
    account: MailAccount,
    secrets: MailCredentials,
    ref: MailMessageRef,
  ): Promise<MailMessageDetail>;
  download(
    account: MailAccount,
    secrets: MailCredentials,
    ref: MailMessageRef,
    attachmentId?: string,
  ): Promise<MailDownload>;
  act(
    account: MailAccount,
    secrets: MailCredentials,
    input: MailMessageActionInput,
  ): Promise<MailActionResult>;
  send(
    account: MailAccount,
    secrets: MailCredentials,
    draft: MailDraft,
    messageId: string,
  ): Promise<{ accepted: string[]; rejected: string[]; detail?: string }>;
}
const error = (reason: MailOperationError["reason"], detail: string) =>
  new MailOperationError({ reason, detail });
const address = (value: { name?: string | undefined; address?: string | undefined }) =>
  value.name ? `${JSON.stringify(value.name)} <${value.address ?? ""}>` : (value.address ?? "");
const emptyMetadata = { revision: 0, tags: [], links: [], suppressedLinks: [] };
export const mailMessageIdentity = (message: Pick<MailMessage, "ref">) =>
  NodeCrypto.createHash("sha256")
    .update(
      JSON.stringify([
        message.ref.accountId,
        message.ref.folder,
        message.ref.uidValidity,
        message.ref.uid,
      ]),
    )
    .digest("hex");

export class ImapSmtpMailAdapter implements MailAdapter {
  private async imap<T>(
    account: MailAccount,
    secrets: MailCredentials,
    run: (client: ImapFlow) => Promise<T>,
  ): Promise<T> {
    const client = new ImapFlow({
      host: account.imap.host,
      port: account.imap.port,
      secure: account.imap.security === "tls",
      doSTARTTLS: account.imap.security === "starttls",
      auth: { user: account.imap.username, pass: secrets.imapPassword },
      logger: false,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
    client.on("error", () => {});
    try {
      await client.connect();
      return await run(client);
    } finally {
      client.close();
    }
  }
  private smtp(account: MailAccount, secrets: MailCredentials) {
    if (!account.smtp) throw error("unavailable", "Set up SMTP sending for this account first.");
    return nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.security === "tls",
      requireTLS: true,
      auth: { user: account.smtp.username, pass: secrets.smtpPassword },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }
  async verify(account: MailAccount, secrets: MailCredentials) {
    await this.imap(account, secrets, async () => {});
    if (!account.smtp) return;
    const transport = this.smtp(account, secrets);
    try {
      await transport.verify();
    } finally {
      transport.close();
    }
  }
  async folders(account: MailAccount, secrets: MailCredentials) {
    return this.imap(account, secrets, async (client) =>
      (await client.list()).map((folder) => ({
        path: folder.path,
        name: folder.name,
        specialUse: folder.specialUse ?? null,
        selectable: !folder.flags.has("\\Noselect"),
      })),
    );
  }
  async folder(
    account: MailAccount,
    secrets: MailCredentials,
    operation: "create" | "rename" | "delete",
    folder: string,
    newPath?: string,
  ) {
    await this.imap(account, secrets, async (client) => {
      if (operation === "create") {
        await client.mailboxCreate(folder);
        return;
      }
      const folders = await client.list();
      const listed = folders.find((entry) => entry.path === folder);
      if (!listed || listed.specialUse || folder.toUpperCase() === "INBOX")
        throw error("invalid", "System mail folders cannot be renamed or deleted.");
      if (
        listed.delimiter &&
        folders.some((entry) => entry.path.startsWith(`${folder}${listed.delimiter}`))
      )
        throw error(
          "invalid",
          "This folder contains subfolders. Rename or remove the leaf folders first in this alpha client.",
        );
      if (operation === "rename" && newPath) {
        await client.mailboxRename(folder, newPath);
        return;
      }
      const status = await client.status(folder, { messages: true });
      if (status.messages)
        throw error("invalid", "Move messages out of this folder before deleting it.");
      await client.mailboxDelete(folder);
    });
  }
  private message(
    account: MailAccount,
    folder: string,
    validity: string,
    item: FetchMessageObject,
  ): MailMessage {
    const message = {
      ref: { accountId: account.id, folder, uidValidity: validity, uid: item.uid },
      id: "pending",
      messageId: item.envelope?.messageId ?? null,
      subject: item.envelope?.subject ?? "",
      from: item.envelope?.from?.map(address).join(", ") ?? "",
      to: item.envelope?.to?.map(address) ?? [],
      cc: item.envelope?.cc?.map(address) ?? [],
      date: item.envelope?.date?.toISOString() ?? null,
      flags: [...(item.flags ?? [])],
      size: item.size ?? 0,
      metadata: emptyMetadata,
    };
    return { ...message, id: mailMessageIdentity(message) };
  }
  private assertValidity(client: ImapFlow, ref: MailMessageRef) {
    if (!client.mailbox || String(client.mailbox.uidValidity) !== ref.uidValidity)
      throw error(
        "conflict",
        "This folder has changed. Refresh before opening or changing this message.",
      );
  }
  async list(account: MailAccount, secrets: MailCredentials, input: MailMessagesInput) {
    return this.imap(account, secrets, async (client) => {
      const lock = await client.getMailboxLock(input.folder);
      try {
        if (!client.mailbox) throw error("not-found", "Mail folder unavailable.");
        const validity = String(client.mailbox.uidValidity);
        const upper = input.beforeUid ? input.beforeUid - 1 : Number(client.mailbox.uidNext) - 1;
        if (upper < 1) return { messages: [], nextBeforeUid: null, uidValidity: validity };
        const page = await findMailPage(
          upper,
          input.limit ?? 50,
          async (lower, higher) =>
            (await client.search(
              {
                uid: `${lower}:${higher}`,
                ...(input.query ? { text: input.query } : {}),
                ...(input.unreadOnly ? { seen: false } : {}),
                ...(input.flaggedOnly ? { flagged: true } : {}),
              },
              { uid: true },
            )) || [],
        );
        const messages: MailMessage[] = [];
        if (page.uids.length)
          for await (const item of client.fetch(
            page.uids.join(","),
            { uid: true, envelope: true, flags: true, size: true },
            { uid: true },
          ))
            messages.push(this.message(account, input.folder, validity, item));
        messages.sort((a, b) => b.ref.uid - a.ref.uid);
        return { messages, nextBeforeUid: page.nextBeforeUid, uidValidity: validity };
      } finally {
        lock.release();
      }
    });
  }
  private async source(client: ImapFlow, ref: MailMessageRef) {
    this.assertValidity(client, ref);
    const meta = await client.fetchOne(
      ref.uid,
      { uid: true, envelope: true, flags: true, size: true },
      { uid: true },
    );
    if (!meta) throw error("not-found", "The message no longer exists in this folder.");
    if ((meta.size ?? MAX_MESSAGE_BYTES + 1) > MAX_MESSAGE_BYTES)
      throw error(
        "too-large",
        "This alpha client opens messages up to 20 MB. Open this message in your existing mail app.",
      );
    const item = await client.fetchOne(ref.uid, { source: true }, { uid: true });
    if (!item || !item.source) throw error("not-found", "Message source unavailable.");
    if (item.source.byteLength > MAX_MESSAGE_BYTES)
      throw error("too-large", "Message exceeds the 20 MB client limit.");
    return { meta, source: item.source };
  }
  async read(account: MailAccount, secrets: MailCredentials, ref: MailMessageRef) {
    return this.imap(account, secrets, async (client) => {
      const lock = await client.getMailboxLock(ref.folder);
      try {
        const { meta, source } = await this.source(client, ref);
        const parsed = await simpleParser(source, {
          skipHtmlToText: false,
          skipTextToHtml: true,
          skipImageLinks: true,
        });
        return {
          message: this.message(account, ref.folder, ref.uidValidity, meta),
          text: parsed.text ?? "",
          html: typeof parsed.html === "string" ? parsed.html : null,
          replyTo: parsed.replyTo?.value.map(address) ?? [],
          attachments: parsed.attachments.map((item, index) => ({
            id: String(index),
            filename: item.filename ?? "attachment",
            contentType: item.contentType,
            size: item.size,
          })),
        };
      } finally {
        lock.release();
      }
    });
  }
  async download(
    account: MailAccount,
    secrets: MailCredentials,
    ref: MailMessageRef,
    attachmentId?: string,
  ) {
    return this.imap(account, secrets, async (client) => {
      const lock = await client.getMailboxLock(ref.folder);
      try {
        const { source } = await this.source(client, ref);
        if (attachmentId === undefined) {
          if (source.byteLength > MAIL_ATTACHMENT_LIMIT)
            throw error(
              "too-large",
              "Original download exceeds this client's 5 MB download limit.",
            );
          return {
            filename: `message-${ref.uid}.eml`,
            contentType: "message/rfc822",
            base64: source.toString("base64"),
          };
        }
        const parsed = await simpleParser(source, { skipImageLinks: true });
        const item = parsed.attachments[Number(attachmentId)];
        if (!item || !/^\d+$/.test(attachmentId))
          throw error("not-found", "Attachment no longer available.");
        if (item.size > MAIL_ATTACHMENT_LIMIT)
          throw error("too-large", "Attachment exceeds this client's 5 MB download limit.");
        return {
          filename: item.filename ?? "attachment",
          contentType: item.contentType,
          base64: item.content.toString("base64"),
        };
      } finally {
        lock.release();
      }
    });
  }
  async act(
    account: MailAccount,
    secrets: MailCredentials,
    input: MailMessageActionInput,
  ): Promise<MailActionResult> {
    return this.imap(account, secrets, async (client) => {
      const completed: MailMessageRef[] = [];
      const moved: { from: MailMessageRef; to: MailMessageRef }[] = [];
      const failed: { ref: MailMessageRef; detail: string }[] = [];
      const folders = await client.list();
      for (const ref of input.refs) {
        let lock: Awaited<ReturnType<ImapFlow["getMailboxLock"]>> | undefined;
        try {
          lock = await client.getMailboxLock(ref.folder);
          this.assertValidity(client, ref);
          if (!(await client.fetchOne(ref.uid, { uid: true }, { uid: true })))
            throw error("not-found", "Message no longer exists.");
          if (["read", "unread", "flag", "unflag"].includes(input.action)) {
            const flag =
              input.action === "read" || input.action === "unread" ? "\\Seen" : "\\Flagged";
            const result =
              input.action === "read" || input.action === "flag"
                ? await client.messageFlagsAdd(ref.uid, [flag], { uid: true })
                : await client.messageFlagsRemove(ref.uid, [flag], { uid: true });
            if (!result) throw error("connection", "The mail server did not confirm the change.");
          } else {
            const special =
              input.action === "archive"
                ? "\\Archive"
                : input.action === "trash"
                  ? "\\Trash"
                  : null;
            const destination =
              input.destination ??
              (input.action === "restore"
                ? "INBOX"
                : folders.find((entry) => entry.specialUse === special)?.path);
            if (!destination)
              throw error(
                "invalid",
                "Choose a destination folder; this account has no matching special folder.",
              );
            const result = await client.messageMove(ref.uid, destination, { uid: true });
            if (!result) throw error("connection", "The mail server did not confirm the move.");
            const newUid = result.uidMap?.get(ref.uid);
            if (newUid && result.uidValidity !== undefined)
              moved.push({
                from: ref,
                to: {
                  accountId: ref.accountId,
                  folder: result.destination,
                  uidValidity: String(result.uidValidity),
                  uid: newUid,
                },
              });
          }
          completed.push(ref);
        } catch (cause) {
          failed.push({
            ref,
            detail: isMailOperationError(cause)
              ? cause.detail
              : "The server did not confirm this change. Refresh before retrying.",
          });
        } finally {
          lock?.release();
        }
      }
      return { completed, moved, failed };
    });
  }
  async send(account: MailAccount, secrets: MailCredentials, draft: MailDraft, messageId: string) {
    const transport = this.smtp(account, secrets);
    try {
      const message = new MailComposer({
        from: { name: account.name, address: account.email },
        to: [...draft.content.to],
        cc: [...draft.content.cc],
        bcc: [...draft.content.bcc],
        subject: draft.content.subject,
        text: draft.content.text,
        messageId,
        disableFileAccess: true,
        disableUrlAccess: true,
        ...(draft.content.inReplyTo ? { inReplyTo: draft.content.inReplyTo } : {}),
        ...(draft.content.references ? { references: [...draft.content.references] } : {}),
        attachments: draft.content.attachments.map((item) => ({
          filename: item.filename,
          contentType: item.contentType,
          content: Buffer.from(item.base64, "base64"),
        })),
      }).compile();
      const raw = await new Promise<Buffer>((resolve, reject) =>
        message.build((cause, value) => (cause ? reject(cause) : resolve(value))),
      );
      const result = await transport.sendMail({ envelope: message.getEnvelope(), raw });
      const accepted = result.accepted.map(String);
      const rejected = result.rejected.map(String);
      let detail: string | undefined;
      if (accepted.length) {
        try {
          await this.imap(account, secrets, async (client) => {
            const sent = (await client.list()).find((folder) => folder.specialUse === "\\Sent");
            if (!sent) throw error("unavailable", "No Sent folder is mapped.");
            const lock = await client.getMailboxLock(sent.path);
            try {
              const existing = await client.search(
                { header: { "message-id": messageId } },
                { uid: true },
              );
              if (!existing || !existing.length) {
                if (!(await client.append(sent.path, raw, ["\\Seen"])))
                  throw error("connection", "Sent copy was not confirmed.");
              }
            } finally {
              lock.release();
            }
          });
        } catch {
          detail =
            "SMTP accepted the message, but Pulse could not confirm its Sent-folder copy. Do not resend it to repair the copy.";
        }
      }
      return { accepted, rejected, ...(detail ? { detail } : {}) };
    } finally {
      transport.close();
    }
  }
}
