// @effect-diagnostics nodeBuiltinImport:off - Tests exercise the atomic on-disk persistence boundary.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { MailAccount, MailMessageRef } from "@t3tools/contracts";
import { MailEngine, type MailSecretAccess } from "./MailEngine.ts";
import { MailStore } from "./MailStore.ts";
import { mailMessageIdentity, type MailAdapter, type MailCredentials } from "./MailAdapter.ts";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => NodeFSP.rm(directory, { recursive: true, force: true })),
  );
});
const server = {
  host: "mail.example.test",
  port: 993,
  security: "tls" as const,
  username: "me@example.test",
};
const account: MailAccount = {
  id: "account",
  name: "Me",
  email: "me@example.test",
  imap: server,
  smtp: { ...server, port: 465 },
  connected: true,
};
const ref: MailMessageRef = { accountId: account.id, folder: "INBOX", uidValidity: "10", uid: 4 };
const movedRef = { ...ref, folder: "Archive", uid: 44 };
const message = (currentRef: MailMessageRef) => {
  const value = {
    ref: currentRef,
    messageId: "<same@example.test>",
    size: 100,
    date: "2026-09-06T00:00:00Z",
  };
  return {
    ...value,
    id: mailMessageIdentity(value),
    from: "Sender <sender@example.test>",
    to: [account.email],
    cc: [],
    subject: "Example",
    flags: [],
    metadata: { revision: 0, tags: [], links: [], suppressedLinks: [] },
  };
};
const adapter = (): MailAdapter => ({
  verify: vi.fn(async () => {}),
  folders: vi.fn(async () => []),
  folder: vi.fn(async () => {}),
  list: vi.fn(async () => ({ messages: [message(ref)], nextBeforeUid: null, uidValidity: "10" })),
  read: vi.fn(async (_account, _secrets, currentRef) => ({
    message: message(currentRef),
    text: "private body must not be persisted",
    html: null,
    replyTo: [],
    attachments: [],
  })),
  download: vi.fn(async () => ({ filename: "x", contentType: "text/plain", base64: "eA==" })),
  act: vi.fn(async () => ({ completed: [ref], failed: [], moved: [{ from: ref, to: movedRef }] })),
  send: vi.fn(async () => ({ accepted: ["recipient@example.test"], rejected: [] })),
});
async function fixture() {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "pulse-mail-test-"));
  directories.push(directory);
  const filename = NodePath.join(directory, "state.json");
  const store = new MailStore(filename);
  await store.transaction(async (state) => ({
    state: { ...state, enabled: true, accounts: [account] },
    result: undefined,
  }));
  const values = new Map<string, MailCredentials>([
    [account.id, { imapPassword: "secret-imap", smtpPassword: "secret-smtp" }],
  ]);
  const secrets: MailSecretAccess = {
    get: async (id) => values.get(id),
    set: async (id, value) => {
      values.set(id, value);
    },
    remove: async (id) => {
      values.delete(id);
    },
  };
  const transport = adapter();
  return { filename, store, secrets, transport, engine: new MailEngine(store, transport, secrets) };
}
async function draft(engine: MailEngine) {
  return engine.saveDraft({
    revision: 0,
    content: {
      accountId: account.id,
      to: ["Recipient <recipient@example.test>"],
      cc: [],
      bcc: [],
      subject: "Test",
      text: "A draft",
      attachments: [],
    },
  });
}

describe("MailEngine", () => {
  it("keeps context queries local and preserves participant work when its folder is renamed", async () => {
    const { engine, transport } = await fixture();
    await engine.readMessage(ref);
    vi.mocked(transport.read).mockClear();
    const context = await engine.getPeopleContext({ accountId: account.id, ref });
    expect(transport.read).not.toHaveBeenCalled();
    const person = context.people[0]!;
    await engine.reviewPerson({
      id: person.id,
      revision: 0,
      name: person.name,
      state: "confirmed",
    });
    const work = await engine.savePeopleWork({
      personId: person.id,
      title: "Review",
      kind: "task",
      state: "open",
      dueDate: null,
      revision: 0,
      ref,
    });
    await engine.renameFolder({ accountId: account.id, folder: "INBOX", newPath: "Renamed" });
    const moved = { ...ref, folder: "Renamed" };
    await engine.readMessage(moved);
    const after = await engine.getPeopleContext({ accountId: account.id, ref: moved });
    expect(after.work[0]).toMatchObject({ id: work.id, evidence: { ref: moved } });
    expect(after.recent.filter((item) => item.personId === person.id)).toHaveLength(1);
  });
  it("persists participant work across restart and permits completion when its source is unavailable", async () => {
    const { engine, filename, secrets, transport } = await fixture();
    await engine.readMessage(ref);
    const context = await engine.getPeopleContext({ accountId: account.id, ref });
    const person = context.people.find((item) => item.address === "sender@example.test")!;
    await engine.reviewPerson({
      id: person.id,
      revision: person.revision,
      name: "Confirmed Sender",
      state: "confirmed",
    });
    const work = await engine.savePeopleWork({
      personId: person.id,
      title: "Send feedback",
      kind: "feedback",
      state: "waiting",
      dueDate: null,
      revision: 0,
      ref,
    });
    const restarted = new MailEngine(new MailStore(filename), transport, secrets);
    expect((await restarted.getPeopleContext({ accountId: account.id })).work[0]?.id).toBe(work.id);
    vi.mocked(transport.read).mockRejectedValue(new Error("Source removed"));
    await restarted.savePeopleWork({
      id: work.id,
      personId: person.id,
      title: work.title,
      kind: work.kind,
      state: "done",
      dueDate: null,
      revision: work.revision,
      ref,
    });
    expect((await restarted.getPeopleContext({ accountId: account.id })).work[0]?.state).toBe(
      "done",
    );
    expect(await NodeFSP.readFile(filename, "utf8")).not.toContain(
      "private body must not be persisted",
    );
  });
  it("allows a replacement mailbox source with the same sender address without reusing context", async () => {
    const { engine } = await fixture();
    const replacement = await engine.saveAccount({
      name: "Replacement",
      email: account.email,
      imap: { ...account.imap, host: "replacement.example.test" },
      smtp: null,
      imapPassword: "replacement-password",
    });
    expect(replacement.id).not.toBe(account.id);
    expect((await engine.getStatus({})).accounts).toHaveLength(2);
  });
  it("rejects draft growth beyond the aggregate storage budget without replacing the saved version", async () => {
    const { engine, store } = await fixture();
    const saved = await draft(engine);
    await store.transaction(async (state) => ({
      state: {
        ...state,
        drafts: [
          ...state.drafts,
          ...Array.from({ length: 24 }, (_, index) => ({
            ...saved,
            id: `seed-${index}`,
            content: { ...saved.content, text: "x".repeat(1_000_000) },
          })),
        ],
      },
      result: undefined,
    }));
    await expect(
      engine.saveDraft({
        id: saved.id,
        revision: saved.revision,
        content: {
          ...saved.content,
          attachments: [
            {
              id: "large",
              filename: "large.bin",
              contentType: "application/octet-stream",
              base64: Buffer.alloc(2_000_000).toString("base64"),
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ reason: "too-large", detail: expect.stringContaining("25 MB") });
    expect(await engine.getDraft({ id: saved.id })).toEqual(saved);
  });
  it("supports an IMAP-only account without creating a send receipt until SMTP is set up", async () => {
    const { engine, transport } = await fixture();
    const receivingAccount = await engine.saveAccount({ ...account, smtp: null });
    expect(receivingAccount.smtp).toBeNull();
    await engine.listFolders({ accountId: account.id });
    expect(transport.folders).toHaveBeenCalledOnce();
    const saved = await draft(engine);
    await expect(
      engine.sendDraft({ draftId: saved.id, revision: saved.revision, operationId: "imap-only" }),
    ).rejects.toMatchObject({ reason: "invalid" });
    expect(await engine.listOutbox({})).toEqual([]);
    expect(transport.send).not.toHaveBeenCalled();
  });
  it("lists bounded draft metadata and loads attachment content only through explicit detail", async () => {
    const { engine } = await fixture();
    const saved = await engine.saveDraft({
      revision: 0,
      content: {
        accountId: account.id,
        to: [],
        cc: [],
        bcc: [],
        subject: "Attachment",
        text: "private draft body",
        attachments: [
          {
            id: "attachment",
            filename: "private.txt",
            contentType: "text/plain",
            base64: "cHJpdmF0ZQ==",
          },
        ],
      },
    });
    const summaries = await engine.listDrafts({});
    expect(summaries[0]?.attachmentCount).toBe(1);
    expect(JSON.stringify(summaries)).not.toContain("private");
    await engine.setEnabled({ enabled: false });
    expect((await engine.getDraft({ id: saved.id })).content.attachments[0]?.base64).toBe(
      "cHJpdmF0ZQ==",
    );
  });
  it("prevents account identity edits from attaching old message context to a different mailbox", async () => {
    const { engine, transport } = await fixture();
    await expect(
      engine.saveAccount({ ...account, email: "other@example.test" }),
    ).rejects.toMatchObject({ reason: "invalid" });
    await expect(
      engine.saveAccount({ ...account, imap: { ...account.imap, username: "other@example.test" } }),
    ).rejects.toMatchObject({ reason: "invalid" });
    expect(transport.verify).not.toHaveBeenCalled();
  });
  it("preserves context when a custom folder is renamed", async () => {
    const { engine } = await fixture();
    const folderRef = { ...ref, folder: "Old" };
    await engine.saveMetadata({ ref: folderRef, revision: 0, tags: ["customer-a"], links: [] });
    await engine.renameFolder({ accountId: account.id, folder: "Old", newPath: "New" });
    expect(
      (await engine.readMessage({ ...folderRef, folder: "New" })).message.metadata.tags,
    ).toEqual(["customer-a"]);
  });
  it("returns the in-flight receipt to concurrent callers without submitting twice", async () => {
    const { engine, transport } = await fixture();
    const saved = await draft(engine);
    let completeSend: (value: { accepted: string[]; rejected: string[] }) => void = () => {};
    let started: () => void = () => {};
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.mocked(transport.send).mockImplementation(() => {
      started();
      return new Promise((resolve) => {
        completeSend = resolve;
      });
    });
    const input = { draftId: saved.id, revision: saved.revision, operationId: "concurrent" };
    const first = engine.sendDraft(input);
    await startedPromise;
    expect((await engine.sendDraft(input)).state).toBe("sending");
    completeSend({ accepted: ["recipient@example.test"], rejected: [] });
    expect((await first).state).toBe("accepted");
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
  it("retains drafts and receipts for recovery while disabling external mail operations", async () => {
    const { engine, transport } = await fixture();
    const saved = await draft(engine);
    await engine.setEnabled({ enabled: false });
    expect((await engine.listDrafts({}))[0]?.id).toBe(saved.id);
    await expect(engine.listFolders({ accountId: account.id })).rejects.toMatchObject({
      reason: "disabled",
    });
    expect(transport.folders).not.toHaveBeenCalled();
  });
  it("serializes competing draft revisions across clients without dropping either saved version silently", async () => {
    const { engine } = await fixture();
    const saved = await draft(engine);
    const edits = await Promise.allSettled(
      ["first", "second"].map((text) =>
        engine.saveDraft({
          id: saved.id,
          revision: saved.revision,
          content: { ...saved.content, text },
        }),
      ),
    );
    expect(edits.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(edits.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect((await engine.listDrafts({}))[0]?.revision).toBe(2);
  });
  it("persists send identity before SMTP and never re-sends after reconnect, reload, or another operation ID", async () => {
    const { engine, store, transport, secrets, filename } = await fixture();
    const saved = await draft(engine);
    const input = { draftId: saved.id, revision: saved.revision, operationId: "send-once" };
    const result = await engine.sendDraft(input);
    expect(result.state).toBe("accepted");
    expect(
      await new MailEngine(new MailStore(filename), transport, secrets).sendDraft(input),
    ).toEqual(result);
    await expect(
      new MailEngine(store, transport, secrets).sendDraft({ ...input, operationId: "another" }),
    ).rejects.toMatchObject({ reason: "conflict" });
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
  it("keeps uncertain submissions blocked from duplicate send and preserves their draft", async () => {
    const { engine, transport } = await fixture();
    const saved = await draft(engine);
    vi.mocked(transport.send).mockRejectedValue(new Error("socket lost after DATA"));
    expect(
      (
        await engine.sendDraft({
          draftId: saved.id,
          revision: saved.revision,
          operationId: "uncertain",
        })
      ).state,
    ).toBe("uncertain");
    await expect(
      engine.deleteDraft({ id: saved.id, revision: saved.revision }),
    ).rejects.toMatchObject({ reason: "conflict" });
    await expect(
      engine.sendDraft({ draftId: saved.id, revision: saved.revision, operationId: "retry" }),
    ).rejects.toMatchObject({ reason: "conflict" });
    expect(transport.send).toHaveBeenCalledTimes(1);
  });
  it("records partial acceptance and Sent-copy failure without describing either as delivery", async () => {
    const { engine, transport } = await fixture();
    const saved = await draft(engine);
    vi.mocked(transport.send).mockResolvedValue({
      accepted: ["yes@example.test"],
      rejected: ["no@example.test"],
      detail: "Sent copy could not be saved.",
    });
    const receipt = await engine.sendDraft({
      draftId: saved.id,
      revision: saved.revision,
      operationId: "partial",
    });
    expect(receipt).toMatchObject({
      state: "partial",
      accepted: ["yes@example.test"],
      rejected: ["no@example.test"],
    });
    expect(receipt.detail).toContain("Do not resend");
    expect(receipt.detail).toContain("Sent copy");
  });
  it("recovers abandoned sending records as uncertain after a server restart", async () => {
    const { engine, store } = await fixture();
    const saved = await draft(engine);
    await store.transaction(async (state) => ({
      state: {
        ...state,
        outbox: [
          {
            operationId: "abandoned",
            draftId: saved.id,
            accountId: account.id,
            state: "sending",
            messageId: "<test@pulse.local>",
            accepted: [],
            rejected: [],
            detail: "Sending",
            updatedAt: saved.updatedAt,
          },
        ],
      },
      result: undefined,
    }));
    expect((await engine.listOutbox({}))[0]?.state).toBe("uncertain");
  });
  it("preserves suppression through confirmed moves and never uses email headers to merge unrelated messages", async () => {
    const { engine } = await fixture();
    const link = {
      id: "link-1",
      type: "project" as const,
      target: "project-a",
      label: "Project A",
      inferred: true,
    };
    await engine.saveMetadata({ ref, revision: 0, tags: ["sales"], links: [link] });
    await engine.saveMetadata({ ref, revision: 1, tags: ["sales"], links: [] });
    await engine.actOnMessages({ refs: [ref], action: "archive" });
    const moved = await engine.readMessage(movedRef);
    expect(moved.message.metadata).toMatchObject({ revision: 2, links: [], tags: ["sales"] });
    const suggestedAgain = await engine.saveMetadata({
      ref: movedRef,
      revision: 2,
      tags: ["sales"],
      links: [{ ...link, id: "different-id" }],
    });
    expect(suggestedAgain.links).toEqual([]);
    expect((await engine.readMessage({ ...ref, uid: 99 })).message.metadata.revision).toBe(0);
  });
  it("never stores received message bodies or connection passwords with mail metadata", async () => {
    const { engine, filename } = await fixture();
    await engine.saveMetadata({ ref, revision: 0, tags: ["project"], links: [] });
    const persisted = await NodeFSP.readFile(filename, "utf8");
    expect(persisted).not.toContain("private body");
    expect(persisted).not.toContain("secret-imap");
    expect(persisted).not.toContain("secret-smtp");
  });
  it("verifies edited credentials before replacing the working connection", async () => {
    const { engine, transport, secrets } = await fixture();
    vi.mocked(transport.verify).mockRejectedValue(new Error("invalid password"));
    await expect(
      engine.saveAccount({ ...account, imapPassword: "wrong", smtpPassword: "wrong" }),
    ).rejects.toThrow();
    expect((await secrets.get(account.id))?.imapPassword).toBe("secret-imap");
  });
  it("bounds draft attachment storage and rejects injected recipient headers before SMTP", async () => {
    const { engine, transport } = await fixture();
    const saved = await draft(engine);
    await expect(
      engine.saveDraft({
        id: saved.id,
        revision: saved.revision,
        content: {
          ...saved.content,
          attachments: [
            {
              id: "large",
              filename: "large.bin",
              contentType: "application/octet-stream",
              base64: Buffer.alloc(5_000_001).toString("base64"),
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ reason: "too-large" });
    const injected = await engine.saveDraft({
      id: saved.id,
      revision: saved.revision,
      content: { ...saved.content, to: ["sender@example.test\r\nBcc: attacker@example.test"] },
    });
    await expect(
      engine.sendDraft({
        draftId: injected.id,
        revision: injected.revision,
        operationId: "injection",
      }),
    ).rejects.toMatchObject({ reason: "invalid" });
    expect(transport.send).not.toHaveBeenCalled();
  });
});
