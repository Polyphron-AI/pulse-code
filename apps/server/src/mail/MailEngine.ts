import * as NodeCrypto from "node:crypto";
import * as DateTime from "effect/DateTime";
import type {
  MailAccount,
  MailAccountSaveInput,
  MailDraftDeleteInput,
  MailDraftSaveInput,
  MailDraft,
  MailMessage,
  MailMessageActionInput,
  MailMessageRef,
  MailMessagesInput,
  MailMetadata,
  MailMetadataSaveInput,
  MailSendInput,
  MailSendReceipt,
  MailStatus,
  MailPeopleContextInput,
  MailPersonReviewInput,
  MailWorkSaveInput,
  MailConnectionReviewInput,
} from "@t3tools/contracts";
import { MailOperationError } from "@t3tools/contracts";
import type { MailAdapter, MailCredentials } from "./MailAdapter.ts";
import { MAIL_ATTACHMENT_LIMIT, mailMessageIdentity } from "./MailAdapter.ts";
import { MailStore, type MailState } from "./MailStore.ts";
import {
  getPeopleContext,
  observePeople,
  relocatePeople,
  reviewConnection,
  reviewPerson,
  savePeopleWork,
} from "./MailPeople.ts";

export interface MailSecretAccess {
  get(id: string): Promise<MailCredentials | undefined>;
  set(id: string, credentials: MailCredentials): Promise<void>;
  remove(id: string): Promise<void>;
}
const fail = (reason: MailOperationError["reason"], detail: string): never => {
  throw new MailOperationError({ reason, detail });
};
const enabled = (state: MailState) => {
  if (!state.enabled)
    fail("disabled", "Enable Email alpha in this environment's settings to use mail connections.");
};
const metadataDefault = (): MailMetadata => ({
  revision: 0,
  tags: [],
  links: [],
  suppressedLinks: [],
});
const linkKey = (link: MailMetadata["links"][number]) =>
  `${link.type}:${link.target.trim().toLowerCase()}`;
const status = (state: MailState): MailStatus => ({
  enabled: state.enabled,
  maturity: "alpha",
  accounts: state.accounts,
  attachmentLimitBytes: MAIL_ATTACHMENT_LIMIT,
});
const validAddress = (value: string) => /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value);
const validRecipient = (value: string) =>
  !/[\r\n]/.test(value) &&
  (validAddress(value) ||
    (/^[^<>\r\n]*<[^<>]+>$/.test(value) &&
      validAddress(value.slice(value.lastIndexOf("<") + 1, -1))));
const now = () => DateTime.formatIso(DateTime.nowUnsafe());
export const MAIL_DRAFT_STORAGE_LIMIT = 25_000_000;
const identity = (ref: MailMessageRef) => mailMessageIdentity({ ref });

/** Domain rules shared by every client; no provider/model runtime participates in sending. */
export class MailEngine {
  private readonly activeSends = new Set<string>();
  private readonly store: MailStore;
  private readonly adapter: MailAdapter;
  private readonly secrets: MailSecretAccess;
  constructor(store: MailStore, adapter: MailAdapter, secrets: MailSecretAccess) {
    this.store = store;
    this.adapter = adapter;
    this.secrets = secrets;
  }
  getStatus(_input: {}) {
    return this.store.transaction(async (state) => ({ state, result: status(state) }));
  }
  setEnabled(input: { enabled: boolean }) {
    return this.store.transaction(async (state) => {
      const next = { ...state, enabled: input.enabled };
      return { state: next, result: status(next) };
    });
  }
  private async connection(accountId: string) {
    const { account, credentialId } = await this.store.transaction(async (state) => {
      enabled(state);
      const found = state.accounts.find((entry) => entry.id === accountId && entry.connected);
      if (!found) return fail("not-found", "Reconnect this mail account in settings.");
      return {
        state,
        result: { account: found, credentialId: state.credentialIds[found.id] ?? found.id },
      };
    });
    const credentials = await this.secrets.get(credentialId);
    if (!credentials) return fail("not-found", "This account needs its credentials entered again.");
    return { account, credentials };
  }
  async saveAccount(input: MailAccountSaveInput) {
    if (!validAddress(input.email))
      return fail("invalid", "Enter a single valid email address for this account.");
    return this.store.transaction(async (state) => {
      enabled(state);
      const previous = input.id ? state.accounts.find((entry) => entry.id === input.id) : undefined;
      if (input.id && !previous) return fail("not-found", "Mail account no longer exists.");
      if (
        previous &&
        (previous.email.toLowerCase() !== input.email.toLowerCase() ||
          previous.imap.host.toLowerCase() !== input.imap.host.toLowerCase() ||
          previous.imap.username !== input.imap.username)
      )
        return fail(
          "invalid",
          "Add a separate account to use a different email address, IMAP host, or login. Existing links and drafts belong to this account.",
        );
      if (
        state.accounts.some(
          (entry) =>
            entry.id !== input.id &&
            entry.email.toLowerCase() === input.email.toLowerCase() &&
            entry.imap.host.toLowerCase() === input.imap.host.toLowerCase() &&
            entry.imap.username === input.imap.username,
        )
      )
        return fail(
          "conflict",
          "This email account is already configured. Edit its existing connection.",
        );
      const id = previous?.id ?? NodeCrypto.randomUUID();
      const oldSecrets = previous
        ? await this.secrets.get(state.credentialIds[id] ?? id)
        : undefined;
      const credentials = {
        imapPassword: input.imapPassword ?? oldSecrets?.imapPassword ?? "",
        smtpPassword: input.smtpPassword ?? oldSecrets?.smtpPassword ?? "",
      };
      if (!credentials.imapPassword || (input.smtp && !credentials.smtpPassword))
        return fail(
          "invalid",
          "Enter an IMAP password and, when sending is configured, an SMTP password or app password.",
        );
      const account: MailAccount = {
        id,
        name: input.name,
        email: input.email,
        imap: input.imap,
        smtp: input.smtp,
        connected: true,
      };
      await this.adapter.verify(account, credentials);
      const credentialId = NodeCrypto.randomUUID();
      await this.secrets.set(credentialId, credentials);
      return {
        state: {
          ...state,
          accounts: [...state.accounts.filter((entry) => entry.id !== id), account],
          credentialIds: { ...state.credentialIds, [id]: credentialId },
        },
        result: account,
      };
    });
  }
  disconnectAccount(input: { accountId: string }) {
    return this.store.transaction(async (state) => {
      if (!state.accounts.some((account) => account.id === input.accountId))
        return fail("not-found", "Mail account no longer exists.");
      if (this.activeSends.size)
        return fail("conflict", "Wait for the current send operation before disconnecting mail.");
      await this.secrets.remove(state.credentialIds[input.accountId] ?? input.accountId);
      const next = {
        ...state,
        accounts: state.accounts.map((account) =>
          account.id === input.accountId ? { ...account, connected: false } : account,
        ),
      };
      return { state: next, result: status(next) };
    });
  }
  async listFolders(input: { accountId: string }) {
    const { account, credentials } = await this.connection(input.accountId);
    return this.adapter.folders(account, credentials);
  }
  async createFolder(input: { accountId: string; folder: string }) {
    const { account, credentials } = await this.connection(input.accountId);
    return this.adapter.folder(account, credentials, "create", input.folder);
  }
  async renameFolder(input: { accountId: string; folder: string; newPath: string }) {
    const { account, credentials } = await this.connection(input.accountId);
    await this.adapter.folder(account, credentials, "rename", input.folder, input.newPath);
    await this.store.transaction(async (state) => {
      let peopleState = state;
      for (const source of state.peopleContext?.sources ?? []) {
        const ref = source.evidence.ref;
        if (ref.accountId === input.accountId && ref.folder === input.folder)
          peopleState = relocatePeople(peopleState, ref, { ...ref, folder: input.newPath });
      }
      const aliases = { ...state.aliases },
        references = { ...state.references };
      for (const source of state.peopleContext?.sources ?? []) {
        const ref = source.evidence.ref;
        if (ref.accountId === input.accountId && ref.folder === input.folder)
          aliases[identity({ ...ref, folder: input.newPath })] = source.id;
      }
      for (const [id, ref] of Object.entries(state.references)) {
        if (ref.accountId !== input.accountId || ref.folder !== input.folder) continue;
        const moved = { ...ref, folder: input.newPath };
        aliases[identity(moved)] = state.aliases[id] ?? id;
        references[identity(moved)] = moved;
      }
      return { state: { ...peopleState, aliases, references }, result: undefined };
    });
  }
  async deleteFolder(input: { accountId: string; folder: string }) {
    const { account, credentials } = await this.connection(input.accountId);
    return this.adapter.folder(account, credentials, "delete", input.folder);
  }
  private withMetadata(message: MailMessage, state: MailState) {
    return {
      ...message,
      metadata: state.metadata[state.aliases[message.id] ?? message.id] ?? metadataDefault(),
    };
  }
  async listMessages(input: MailMessagesInput) {
    const { account, credentials } = await this.connection(input.accountId);
    const page = await this.adapter.list(account, credentials, input);
    return this.store.transaction(async (state) => ({
      state,
      result: {
        ...page,
        messages: page.messages.map((message) => this.withMetadata(message, state)),
      },
    }));
  }
  async readMessage(input: MailMessageRef) {
    const { account, credentials } = await this.connection(input.accountId);
    const detail = await this.adapter.read(account, credentials, input);
    return this.store.transaction(async (state) => ({
      state: observePeople(state, detail),
      result: { ...detail, message: this.withMetadata(detail.message, state) },
    }));
  }
  async getPeopleContext(input: MailPeopleContextInput) {
    if (input.ref && input.ref.accountId !== input.accountId)
      return fail("invalid", "Choose a message in this account.");
    return this.store.transaction(async (state) => {
      enabled(state);
      if (!state.accounts.some((account) => account.id === input.accountId))
        return fail("not-found", "Choose a configured account.");
      return { state, result: getPeopleContext(state, input, false) };
    });
  }
  reviewPerson(input: MailPersonReviewInput) {
    return this.store.transaction(async (state) => {
      enabled(state);
      return { state: reviewPerson(state, input), result: undefined };
    });
  }
  async savePeopleWork(input: MailWorkSaveInput) {
    const detail = input.id ? undefined : await this.readMessage(input.ref);
    return this.store.transaction(async (state) => {
      enabled(state);
      return savePeopleWork(state, input, detail);
    });
  }
  reviewConnection(input: MailConnectionReviewInput) {
    return this.store.transaction(async (state) => {
      enabled(state);
      return { state: reviewConnection(state, input), result: undefined };
    });
  }
  async downloadAttachment(input: { ref: MailMessageRef; attachmentId: string }) {
    const { account, credentials } = await this.connection(input.ref.accountId);
    return this.adapter.download(account, credentials, input.ref, input.attachmentId);
  }
  async downloadOriginal(input: MailMessageRef) {
    const { account, credentials } = await this.connection(input.accountId);
    return this.adapter.download(account, credentials, input);
  }
  async actOnMessages(input: MailMessageActionInput) {
    const accountId = input.refs[0]?.accountId;
    if (!accountId || input.refs.some((ref) => ref.accountId !== accountId))
      return fail("invalid", "Apply bulk mail changes within one account at a time.");
    const { account, credentials } = await this.connection(accountId);
    const result = await this.adapter.act(account, credentials, input);
    await this.store.transaction(async (state) => {
      let peopleState = state;
      const aliases = { ...state.aliases },
        references = { ...state.references };
      for (const moved of result.moved) {
        peopleState = relocatePeople(peopleState, moved.from, moved.to);
        aliases[identity(moved.to)] = state.aliases[identity(moved.from)] ?? identity(moved.from);
        references[identity(moved.to)] = moved.to;
      }
      return { state: { ...peopleState, aliases, references }, result: undefined };
    });
    return result;
  }
  async saveMetadata(input: MailMetadataSaveInput) {
    const detail = await this.readMessage(input.ref);
    return this.store.transaction(async (state) => {
      enabled(state);
      const id = state.aliases[detail.message.id] ?? detail.message.id;
      const previous = state.metadata[id] ?? metadataDefault();
      if (previous.revision !== input.revision)
        return fail("conflict", "Links changed on another device. Refresh before saving.");
      const retained = new Set(input.links.map(linkKey));
      const suppressed = new Set([
        ...previous.suppressedLinks,
        ...previous.links.filter((link) => !retained.has(linkKey(link))).map(linkKey),
      ]);
      // Explicit manual relinking is allowed; inference cannot resurrect a removed association.
      const links = input.links.filter((link) => !link.inferred || !suppressed.has(linkKey(link)));
      const next: MailMetadata = {
        revision: previous.revision + 1,
        tags: [...new Set(input.tags)],
        links,
        suppressedLinks: [...suppressed],
      };
      return {
        state: {
          ...state,
          metadata: { ...state.metadata, [id]: next },
          references: { ...state.references, [detail.message.id]: input.ref },
        },
        result: next,
      };
    });
  }
  listDrafts(_input: {}) {
    return this.store.transaction(async (state) => ({
      state,
      result: [...state.drafts]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map((draft) => ({
          id: draft.id,
          revision: draft.revision,
          updatedAt: draft.updatedAt,
          content: {
            accountId: draft.content.accountId,
            to: draft.content.to,
            subject: draft.content.subject,
          },
          attachmentCount: draft.content.attachments.length,
        })),
    }));
  }
  getDraft(input: { id: string }) {
    return this.store.transaction(async (state) => {
      const draft = state.drafts.find((entry) => entry.id === input.id);
      if (!draft) return fail("not-found", "Draft no longer exists.");
      return { state, result: draft };
    });
  }
  saveDraft(input: MailDraftSaveInput) {
    const bytes = input.content.attachments.reduce(
      (total, item) => total + Buffer.byteLength(item.base64, "base64"),
      0,
    );
    if (bytes > MAIL_ATTACHMENT_LIMIT)
      return Promise.reject(
        new MailOperationError({
          reason: "too-large",
          detail: "Draft attachments exceed this client's 5 MB combined limit.",
        }),
      );
    if (
      input.content.attachments.some(
        (item) => Buffer.from(item.base64, "base64").toString("base64") !== item.base64,
      )
    )
      return Promise.reject(
        new MailOperationError({
          reason: "invalid",
          detail: "Attachment data is not valid base64. Attach the file again.",
        }),
      );
    return this.store.transaction(async (state) => {
      enabled(state);
      if (!state.accounts.some((account) => account.id === input.content.accountId))
        return fail("not-found", "Choose a configured email account.");
      const previous = input.id ? state.drafts.find((draft) => draft.id === input.id) : undefined;
      if (!previous && state.drafts.length >= 200)
        return fail(
          "too-large",
          "This alpha environment supports 200 saved drafts. Remove unneeded drafts before creating another.",
        );
      if ((input.id && !previous) || (previous?.revision ?? 0) !== input.revision)
        return fail(
          "conflict",
          "Draft changed on another device. Load its current version before saving.",
        );
      if (
        previous &&
        state.outbox.some((entry) => entry.draftId === previous.id && entry.state !== "failed")
      )
        return fail(
          "conflict",
          "This draft has been submitted. Create a new draft to send another message.",
        );
      const draft: MailDraft = {
        id: previous?.id ?? NodeCrypto.randomUUID(),
        revision: input.revision + 1,
        updatedAt: now(),
        content: input.content,
      };
      const drafts = [...state.drafts.filter((entry) => entry.id !== draft.id), draft];
      if (Buffer.byteLength(JSON.stringify(drafts), "utf8") > MAIL_DRAFT_STORAGE_LIMIT)
        return fail(
          "too-large",
          "Saved drafts have reached this alpha environment's 25 MB storage limit. Remove unneeded drafts or attachments, then save again. The previous saved version is unchanged.",
        );
      return {
        state: {
          ...state,
          drafts,
        },
        result: draft,
      };
    });
  }
  deleteDraft(input: typeof MailDraftDeleteInput.Type) {
    return this.store.transaction(async (state) => {
      const previous = state.drafts.find((draft) => draft.id === input.id);
      if (!previous || previous.revision !== input.revision)
        return fail("conflict", "Draft changed on another device. Refresh before deleting.");
      if (
        state.outbox.some(
          (entry) =>
            entry.draftId === input.id &&
            (entry.state === "sending" || entry.state === "uncertain" || entry.state === "partial"),
        )
      )
        return fail("conflict", "Keep this draft until its send outcome has been resolved.");
      return {
        state: { ...state, drafts: state.drafts.filter((draft) => draft.id !== input.id) },
        result: undefined,
      };
    });
  }
  listOutbox(_input: {}) {
    return this.store.transaction(async (state) => {
      const outbox = state.outbox.map((entry) =>
        entry.state === "sending" && !this.activeSends.has(entry.operationId)
          ? {
              ...entry,
              state: "uncertain" as const,
              detail:
                "The server restarted before recording the SMTP result. Check Sent mail and recipients before creating another send.",
            }
          : entry,
      );
      return {
        state: outbox.some((entry, index) => entry !== state.outbox[index])
          ? { ...state, outbox }
          : state,
        result: outbox.toReversed(),
      };
    });
  }
  async sendDraft(input: MailSendInput): Promise<MailSendReceipt> {
    let reserved = false;
    const prepared = await this.store
      .transaction<{ receipt: MailSendReceipt; draft: MailDraft | undefined }>(async (state) => {
        enabled(state);
        const existing = state.outbox.find((entry) => entry.operationId === input.operationId);
        if (existing) {
          if (existing.draftId !== input.draftId)
            return fail("conflict", "This send operation belongs to a different draft.");
          if (existing.state === "sending" && !this.activeSends.has(input.operationId)) {
            const recovered = {
              ...existing,
              state: "uncertain" as const,
              detail:
                "The server restarted before recording SMTP acceptance. Check Outbox before sending again.",
            };
            return {
              state: {
                ...state,
                outbox: state.outbox.map((entry) => (entry === existing ? recovered : entry)),
              },
              result: { receipt: recovered, draft: undefined },
            };
          }
          return { state, result: { receipt: existing, draft: undefined } };
        }
        const draft = state.drafts.find((entry) => entry.id === input.draftId);
        if (!draft || draft.revision !== input.revision)
          return fail("conflict", "Save and review the latest draft before sending.");
        if (state.outbox.some((entry) => entry.draftId === draft.id && entry.state !== "failed"))
          return fail(
            "conflict",
            "This draft already has a send operation. Check Outbox before creating another message.",
          );
        const recipients = [...draft.content.to, ...draft.content.cc, ...draft.content.bcc];
        if (!recipients.length || !recipients.every(validRecipient))
          return fail(
            "invalid",
            "Enter valid recipient email addresses, separated into individual recipients.",
          );
        const sendingAccount = state.accounts.find(
          (entry) => entry.id === draft.content.accountId && entry.connected,
        );
        if (!sendingAccount) return fail("not-found", "Reconnect the sending account first.");
        if (!sendingAccount.smtp)
          return fail(
            "invalid",
            "Set up SMTP sending for this account before sending. Your draft is saved.",
          );
        const receipt: MailSendReceipt = {
          operationId: input.operationId,
          draftId: draft.id,
          accountId: draft.content.accountId,
          state: "sending",
          messageId: `<${NodeCrypto.randomUUID()}@pulse.local>`,
          accepted: [],
          rejected: [],
          detail: "Submitting to the SMTP service.",
          updatedAt: now(),
        };
        this.activeSends.add(input.operationId);
        reserved = true;
        return {
          state: { ...state, outbox: [...state.outbox, receipt] },
          result: { receipt, draft },
        };
      })
      .catch((cause: unknown) => {
        if (reserved) this.activeSends.delete(input.operationId);
        throw cause;
      });
    if (!prepared.draft) return prepared.receipt;
    let receipt = prepared.receipt;
    let smtpAttempted = false;
    try {
      const { account, credentials } = await this.connection(prepared.draft.content.accountId);
      smtpAttempted = true;
      const result = await this.adapter.send(
        account,
        credentials,
        prepared.draft,
        receipt.messageId,
      );
      receipt = {
        ...receipt,
        accepted: result.accepted,
        rejected: result.rejected,
        state: result.accepted.length
          ? result.rejected.length
            ? "partial"
            : "accepted"
          : "failed",
        detail: [
          result.accepted.length
            ? result.rejected.length
              ? "SMTP accepted some recipients and rejected others. Do not resend to accepted recipients."
              : "SMTP accepted the message. This confirms submission, not delivery."
            : "The SMTP service did not accept any recipients.",
          result.detail,
        ]
          .filter(Boolean)
          .join(" "),
        updatedAt: now(),
      };
    } catch (cause) {
      const rejected =
        !smtpAttempted ||
        (cause instanceof Error &&
          (("code" in cause && ["EAUTH", "EENVELOPE"].includes(String(cause.code))) ||
            ("responseCode" in cause && Number(cause.responseCode) >= 400)));
      receipt = {
        ...receipt,
        state: rejected ? "failed" : "uncertain",
        detail: rejected
          ? "The message was not accepted for sending. Check the account and recipient details before retrying."
          : "SMTP acceptance could not be confirmed. Check Sent mail and recipients before creating another send.",
        updatedAt: now(),
      };
    }
    try {
      return await this.store.transaction(async (state) => ({
        state: {
          ...state,
          outbox: state.outbox.map((entry) =>
            entry.operationId === input.operationId ? receipt : entry,
          ),
        },
        result: receipt,
      }));
    } finally {
      this.activeSends.delete(input.operationId);
    }
  }
}
