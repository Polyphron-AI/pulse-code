// @effect-diagnostics nodeBuiltinImport:off -- Tests build a directory junction to prove attachments cannot escape the project.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type MailAccountInput,
  type MailSendApproval,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import { ServerEnvironmentIdentity } from "../environment/ServerEnvironment.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import { PersistenceSqlError } from "../persistence/Errors.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as MailSendApprovals from "../persistence/MailSendApprovals.ts";
import * as ProjectService from "../project/ProjectService.ts";
import * as MailConfig from "./MailConfigService.ts";
import type { MailLookup } from "./MailNetworkPolicy.ts";
import { MailOAuth } from "./MailOAuth.ts";
import { mailRpcHandlers } from "./MailRpc.ts";
import * as MailSend from "./MailSendService.ts";
import {
  MAIL_TEST_CA,
  MailTestPeers,
  fakeImap,
  type FakeImapMailbox,
  type MailPeer,
  type MailPeerIo,
} from "./testing/MailTestPeers.ts";

const projectId = ProjectId.make("project-mail");
const threadId = ThreadId.make("thread-mail");
const otherThreadId = ThreadId.make("thread-other");
const workspaceRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "pulse-mail-send-"));
const outsideRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "pulse-mail-outside-"));
NodeFS.writeFileSync(NodePath.join(workspaceRoot, "notes.txt"), "project notes");
NodeFS.writeFileSync(NodePath.join(outsideRoot, "secret.txt"), "not for mail");
NodeFS.symlinkSync(outsideRoot, NodePath.join(workspaceRoot, "escape"), "junction");

/** `threadDeletedAt` lets a test delete the main thread part way through. */
const baseLayer = (threadDeletedAt: () => string | null = () => null) => {
  const configLayer = ServerConfig.layerTest(process.cwd(), { prefix: "pulse-mail-send-test-" });
  const orchestrator = Layer.mock(Orchestrator.OrchestratorV2)({
    getThreadShell: (id) =>
      Effect.succeed(
        id === threadId || id === otherThreadId
          ? ({
              projectId,
              worktreePath: null,
              deletedAt: id === threadId ? threadDeletedAt() : null,
            } as never)
          : null,
      ),
  });
  const mailConfig = MailConfig.layer.pipe(
    Layer.provide(ServerSecretStore.layer.pipe(Layer.provide(configLayer))),
    Layer.provide(configLayer),
    Layer.provide(orchestrator),
  );
  return Layer.mergeAll(
    mailConfig,
    orchestrator,
    Layer.mock(ProjectService.ProjectService)({
      getById: (id) =>
        id === projectId ? Effect.succeedSome({ workspaceRoot } as never) : Effect.succeedNone,
    }),
    MailSendApprovals.layer.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    Layer.mock(MailOAuth)({
      login: () => Effect.succeed({ type: "password", password: "hunter2" }),
    }),
    Layer.succeed(
      ServerEnvironmentIdentity,
      ServerEnvironmentIdentity.of({ getEnvironmentId: Effect.succeed(EnvironmentId.make("env")) }),
    ),
  ).pipe(Layer.provideMerge(NodeServices.layer));
};

const loopback: MailLookup = async () => [{ address: "127.0.0.1", family: 4 }];
const peerOptions = (peer: MailPeer) => ({
  lookup: loopback,
  testPeer: { port: peer.port, ca: MAIL_TEST_CA },
});

type AfterData = "accept" | "reject" | "drop";

/** An SMTP server whose reply to the message body is chosen by the test. */
const smtpPeer = (afterData: { current: AfterData }) =>
  MailTestPeers.smtp({
    implicitTls: true,
    greeting: "220 mail.test ESMTP\r\n",
    respond: ({ line }, io: MailPeerIo) => {
      if (/^EHLO/i.test(line)) io.send("250-mail.test\r\n250 AUTH PLAIN\r\n");
      else if (/^AUTH/i.test(line)) io.send("235 2.7.0 Accepted\r\n");
      else if (/^DATA$/i.test(line)) io.send("354 Go ahead\r\n");
      else if (/^QUIT/i.test(line)) {
        io.send("221 Bye\r\n");
        io.close();
      } else if (/^(MAIL|RCPT)/i.test(line)) io.send("250 OK\r\n");
      else if (afterData.current === "accept") io.send("250 2.0.0 Queued\r\n");
      else if (afterData.current === "reject") io.send("550 5.7.1 Rejected\r\n");
      else io.close();
    },
  });

const dataCommands = (peer: MailPeer) =>
  peer.received.filter(({ line }) => /^DATA$/i.test(line)).length;

const draftsBox = (): FakeImapMailbox => ({
  name: "Drafts",
  specialUse: "\\Drafts",
  uidValidity: 9,
  uidNext: 2,
  messages: [
    {
      uid: 1,
      modseq: 3,
      flags: new Set(["\\Draft", "\\Seen"]),
      raw: [
        "Message-ID: <draft@pulse>",
        "From: me@mail.test",
        "To: Ana <ana@example.com>",
        "Subject: From the draft",
        "",
        "Draft body",
        "",
      ].join("\r\n"),
    },
  ],
});

const accountInput = {
  nickname: "Work",
  address: "me@mail.test",
  imap: { host: "mail.test", port: 993 },
  smtp: { host: "mail.test", port: 465 },
  auth: { kind: "password" },
  allowPrivateNetwork: true,
  appendToSent: true,
} satisfies MailAccountInput;

const content = {
  to: [{ name: "Ana", address: "ana@example.com" }],
  cc: [{ address: "cc@example.com" }],
  bcc: [{ address: "hidden@example.com" }],
  subject: "Status",
  text: "All good.",
};

/** A granted account, a send service pointed at fresh peers, and the peers themselves. */
const setup = (mailboxes: Array<FakeImapMailbox> = [], capabilities = "UIDPLUS") =>
  Effect.gen(function* () {
    const config = yield* MailConfig.MailConfigService;
    const account = yield* config.upsertAccount(accountInput);
    yield* config.setCredential(account.id, { type: "password", password: "hunter2" });
    yield* config.setProjectAccess({
      projectId,
      accountIds: [account.id],
      defaultAccountId: account.id,
    });
    const sent: FakeImapMailbox = {
      name: "Sent",
      specialUse: "\\Sent",
      uidValidity: 1,
      uidNext: 1,
      messages: [],
    };
    const server = fakeImap([...mailboxes, sent], { capabilities });
    const imap = yield* MailTestPeers.imap({ implicitTls: true, ...server });
    const afterData = { current: "accept" as AfterData };
    const smtp = yield* smtpPeer(afterData);
    const options = { imap: peerOptions(imap), smtp: peerOptions(smtp) };
    const service = yield* MailSend.make(options);
    return { config, account, service, smtp, sent, afterData, options };
  });

/** Every list the service pushes for the thread, starting with the one sent on subscribe. */
const watchThread = (service: MailSend.MailSendService["Service"]) =>
  Effect.gen(function* () {
    const pushed = yield* Queue.unbounded<ReadonlyArray<MailSendApproval>>();
    yield* service.subscribeThread(threadId).pipe(
      Stream.runForEach((approvals) => Queue.offer(pushed, approvals)),
      Effect.forkScoped({ startImmediately: true }),
    );
    return pushed;
  });

/** A send service over the real store with some of its calls replaced by the test. */
const makeWithStore = (
  options: Parameters<typeof MailSend.make>[0],
  replace: (
    store: MailSendApprovals.MailSendApprovalRepository["Service"],
  ) => Partial<MailSendApprovals.MailSendApprovalRepository["Service"]>,
) =>
  Effect.gen(function* () {
    const store = yield* MailSendApprovals.MailSendApprovalRepository;
    return yield* MailSend.make(options).pipe(
      Effect.provideService(MailSendApprovals.MailSendApprovalRepository, {
        ...store,
        ...replace(store),
      }),
    );
  });

const statuses = (approvals: ReadonlyArray<MailSendApproval>) =>
  approvals.map((approval) => [approval.id, approval.status]);

const kindOf = <A>(effect: Effect.Effect<A, { kind: string }>) =>
  effect.pipe(
    Effect.map(() => "ok"),
    Effect.catch((error) => Effect.succeed(error.kind)),
  );

describe("MailSendService", () => {
  it.effect("prepares without sending and submits only after a matching approval (A12)", () =>
    Effect.gen(function* () {
      const { service, smtp, sent } = yield* setup();
      const approval = yield* service.prepare({
        threadId,
        content,
        attachments: ["notes.txt"],
      });
      expect(approval.status).toBe("pending");
      expect(approval.snapshot.attachments).toEqual([
        {
          name: "notes.txt",
          contentType: "text/plain",
          size: 13,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      ]);
      expect(smtp.connections()).toBe(0);

      const wrong = "0".repeat(64);
      expect(
        yield* kindOf(
          service.respond({ approvalId: approval.id, decision: "approve", digest: wrong }),
        ),
      ).toBe("conflict");
      expect(smtp.connections()).toBe(0);

      const accepted = yield* service.respond({
        approvalId: approval.id,
        decision: "approve",
        digest: approval.digest,
      });
      expect(accepted.status).toBe("accepted");
      expect(dataCommands(smtp)).toBe(1);
      const recipients = smtp.received.filter(({ line }) => /^RCPT/i.test(line));
      expect(recipients).toHaveLength(3);
      expect(smtp.received.some(({ line }) => /^bcc:/i.test(line))).toBe(false);
      expect(sent.messages).toHaveLength(1);
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );

  it.effect("pushes the thread's approvals on subscribe and after each change", () =>
    Effect.gen(function* () {
      const { service } = yield* setup();
      const pushed = yield* watchThread(service);
      expect(yield* Queue.take(pushed)).toEqual([]);

      const approval = yield* service.prepare({ threadId, content });
      expect(statuses(yield* Queue.take(pushed))).toEqual([[approval.id, "pending"]]);

      yield* service.respond({
        approvalId: approval.id,
        decision: "decline",
        digest: approval.digest,
      });
      expect(statuses(yield* Queue.take(pushed))).toEqual([[approval.id, "declined"]]);
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );

  it.effect("pushes live approvals plus those resolved in the last 30 minutes", () =>
    Effect.gen(function* () {
      const { service } = yield* setup();
      const old = yield* service.prepare({ threadId, content });
      yield* service.respond({ approvalId: old.id, decision: "decline", digest: old.digest });
      yield* TestClock.adjust("31 minutes");
      // Declined longer ago than the window, so it is left out.
      const pushed = yield* watchThread(service);
      expect(yield* Queue.take(pushed)).toEqual([]);

      const recent = yield* service.prepare({ threadId, content });
      expect(statuses(yield* Queue.take(pushed))).toEqual([[recent.id, "pending"]]);
      yield* service.respond({ approvalId: recent.id, decision: "decline", digest: recent.digest });
      expect(statuses(yield* Queue.take(pushed))).toEqual([[recent.id, "declined"]]);

      // A client that subscribes again after the decision, as on a reconnect, still gets it.
      yield* TestClock.adjust("29 minutes");
      expect(statuses(yield* Queue.take(yield* watchThread(service)))).toEqual([
        [recent.id, "declined"],
      ]);

      // One that expired undecided counts from its expiry.
      const expiring = yield* service.prepare({ threadId, content });
      yield* TestClock.adjust("31 minutes");
      expect(statuses(yield* Queue.take(yield* watchThread(service)))).toEqual([
        [expiring.id, "expired"],
      ]);
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );

  it.effect("does not push a change on another thread", () =>
    Effect.gen(function* () {
      const { service } = yield* setup();
      const pushed = yield* watchThread(service);
      expect(yield* Queue.take(pushed)).toEqual([]);

      yield* service.prepare({ threadId: otherThreadId, content });
      const mine = yield* service.prepare({ threadId, content });
      // Each push below is this thread's own change, in order; a push for the other thread
      // would arrive first and break the sequence.
      expect(statuses(yield* Queue.take(pushed))).toEqual([[mine.id, "pending"]]);
      yield* service.respond({ approvalId: mine.id, decision: "decline", digest: mine.digest });
      expect(statuses(yield* Queue.take(pushed))).toEqual([[mine.id, "declined"]]);
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );

  it.effect("refuses an expired or declined approval (A12)", () =>
    Effect.gen(function* () {
      const { service, smtp } = yield* setup();
      const expiring = yield* service.prepare({ threadId, content });
      yield* TestClock.adjust("31 minutes");
      expect((yield* service.status(expiring.id)).status).toBe("expired");
      expect(
        yield* kindOf(
          service.respond({
            approvalId: expiring.id,
            decision: "approve",
            digest: expiring.digest,
          }),
        ),
      ).toBe("conflict");

      const declining = yield* service.prepare({ threadId, content });
      const declined = yield* service.respond({
        approvalId: declining.id,
        decision: "decline",
        digest: declining.digest,
      });
      expect(declined.status).toBe("declined");
      expect(
        yield* kindOf(
          service.respond({
            approvalId: declining.id,
            decision: "approve",
            digest: declining.digest,
          }),
        ),
      ).toBe("conflict");
      expect(smtp.connections()).toBe(0);
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );

  it.effect("supersedes an earlier pending approval for the same thread and account", () =>
    Effect.gen(function* () {
      const { service } = yield* setup();
      const first = yield* service.prepare({ threadId, content });
      const pushed = yield* watchThread(service);
      expect(statuses(yield* Queue.take(pushed))).toEqual([[first.id, "pending"]]);
      const second = yield* service.prepare({
        threadId,
        content: { ...content, subject: "Again" },
      });
      expect((yield* service.status(first.id)).status).toBe("invalidated");
      // One push closes the earlier approval and lists the new one; the next is the decline.
      expect(Object.fromEntries(statuses(yield* Queue.take(pushed)))).toEqual({
        [first.id]: "invalidated",
        [second.id]: "pending",
      });
      yield* service.respond({ approvalId: second.id, decision: "decline", digest: second.digest });
      expect(Object.fromEntries(statuses(yield* Queue.take(pushed)))).toEqual({
        [first.id]: "invalidated",
        [second.id]: "declined",
      });
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );

  it.effect("rejects approval when the source draft changed or vanished (A07)", () =>
    Effect.gen(function* () {
      const drafts = draftsBox();
      const { service, smtp, account } = yield* setup([drafts], "UIDPLUS ENABLE CONDSTORE");
      const draftRef = { accountId: account.id, mailbox: "Drafts", uidValidity: 9, uid: 1 };
      const changed = yield* service.prepare({ threadId, draftRef });
      expect(changed.snapshot).toMatchObject({
        subject: "From the draft",
        to: [{ name: "Ana", address: "ana@example.com" }],
        sourceDraft: draftRef,
      });
      drafts.messages[0]!.modseq = 4;
      expect(
        yield* kindOf(
          service.respond({ approvalId: changed.id, decision: "approve", digest: changed.digest }),
        ),
      ).toBe("conflict");
      expect((yield* service.status(changed.id)).status).toBe("invalidated");

      const removed = yield* service.prepare({ threadId, draftRef });
      drafts.messages.length = 0;
      expect(
        yield* kindOf(
          service.respond({ approvalId: removed.id, decision: "approve", digest: removed.digest }),
        ),
      ).toBe("conflict");
      expect((yield* service.status(removed.id)).status).toBe("invalidated");
      expect(smtp.connections()).toBe(0);
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );

  it.effect("invalidates a pending approval when the grant is revoked (A05)", () =>
    Effect.gen(function* () {
      const { service, smtp, config } = yield* setup();
      const approval = yield* service.prepare({ threadId, content });
      yield* config.setProjectAccess({ projectId, accountIds: [] });
      // The access-change consumer or the approve-time recheck invalidates it, whichever runs first.
      const kind = yield* kindOf(
        service.respond({ approvalId: approval.id, decision: "approve", digest: approval.digest }),
      );
      expect(["access-denied", "conflict"]).toContain(kind);
      expect((yield* service.status(approval.id)).status).toBe("invalidated");
      expect(smtp.connections()).toBe(0);
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );

  it.effect("refuses a missing or deleted thread and voids its pending approval", () => {
    let deletedAt: string | null = null;
    return Effect.gen(function* () {
      const { service, smtp } = yield* setup();
      expect(
        yield* kindOf(service.prepare({ threadId: ThreadId.make("thread-missing"), content })),
      ).toBe("access-denied");

      const approval = yield* service.prepare({ threadId, content });
      deletedAt = "2026-10-15T00:00:00.000Z";
      expect(yield* kindOf(service.prepare({ threadId, content }))).toBe("access-denied");
      expect(
        yield* kindOf(
          service.respond({
            approvalId: approval.id,
            decision: "approve",
            digest: approval.digest,
          }),
        ),
      ).toBe("access-denied");
      expect((yield* service.status(approval.id)).status).toBe("invalidated");
      expect(smtp.connections()).toBe(0);
    }).pipe(Effect.scoped, Effect.provide(baseLayer(() => deletedAt)));
  });

  it.effect("records and announces the result when the approving client drops mid-send", () =>
    Effect.gen(function* () {
      const { options } = yield* setup();
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      const smtp = yield* MailTestPeers.smtp({
        implicitTls: true,
        greeting: "220 mail.test ESMTP\r\n",
        respond: ({ line }, io: MailPeerIo) => {
          if (/^EHLO/i.test(line)) io.send("250-mail.test\r\n250 AUTH PLAIN\r\n");
          else if (/^AUTH/i.test(line)) io.send("235 2.7.0 Accepted\r\n");
          else if (/^(MAIL|RCPT)/i.test(line)) io.send("250 OK\r\n");
          else if (/^DATA$/i.test(line)) io.send("354 Go ahead\r\n");
          else if (/^QUIT/i.test(line)) io.close();
          // The message body arrives as one line. The server holds its reply until the test has
          // seen the send in progress.
          else void released.then(() => io.send("250 2.0.0 Queued\r\n"));
        },
      });
      const service = yield* MailSend.make({ ...options, smtp: peerOptions(smtp) });
      const pushed = yield* watchThread(service);
      yield* Queue.take(pushed);
      const approval = yield* service.prepare({ threadId, content });
      expect(statuses(yield* Queue.take(pushed))).toEqual([[approval.id, "pending"]]);

      const fiber = yield* Effect.forkChild(
        service.respond({ approvalId: approval.id, decision: "approve", digest: approval.digest }),
      );
      expect(statuses(yield* Queue.take(pushed))).toEqual([[approval.id, "submitting"]]);
      // The client drops mid-send. The interrupt may land before SMTP even connects; the whole
      // approve is uninterruptible, so the send completes either way.
      const dropped = yield* Effect.forkChild(Fiber.interrupt(fiber), { startImmediately: true });
      release();
      yield* Fiber.join(dropped);
      expect(statuses(yield* Queue.take(pushed))).toEqual([[approval.id, "accepted"]]);
      expect((yield* service.status(approval.id)).status).toBe("accepted");
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );

  it.effect("records and announces a decline when the client drops mid-way", () =>
    Effect.gen(function* () {
      const { options } = yield* setup();
      const entered = yield* Deferred.make<void>();
      const proceed = yield* Deferred.make<void>();
      const service = yield* makeWithStore(options, (store) => ({
        decline: (input) =>
          Deferred.succeed(entered, undefined).pipe(
            Effect.andThen(Deferred.await(proceed)),
            Effect.andThen(store.decline(input)),
          ),
      }));
      const pushed = yield* watchThread(service);
      yield* Queue.take(pushed);
      const approval = yield* service.prepare({ threadId, content });
      expect(statuses(yield* Queue.take(pushed))).toEqual([[approval.id, "pending"]]);

      const fiber = yield* Effect.forkChild(
        service.respond({ approvalId: approval.id, decision: "decline", digest: approval.digest }),
      );
      yield* Deferred.await(entered);
      // The client drops while the decline is being stored.
      const dropped = yield* Effect.forkChild(Fiber.interrupt(fiber), { startImmediately: true });
      yield* Deferred.succeed(proceed, undefined);
      yield* Fiber.join(dropped);
      expect((yield* service.status(approval.id)).status).toBe("declined");
      expect(statuses(yield* Queue.take(pushed))).toEqual([[approval.id, "declined"]]);
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );

  it.effect("announces a supersede once even when the new approval cannot be saved", () =>
    Effect.gen(function* () {
      const { options } = yield* setup();
      let insertFails = false;
      const service = yield* makeWithStore(options, (store) => ({
        insertPending: (input) =>
          insertFails
            ? Effect.fail(new PersistenceSqlError({ operation: "insertMailSendApproval" }))
            : store.insertPending(input),
      }));
      const first = yield* service.prepare({ threadId, content });
      const pushed = yield* watchThread(service);
      expect(statuses(yield* Queue.take(pushed))).toEqual([[first.id, "pending"]]);

      insertFails = true;
      expect(yield* kindOf(service.prepare({ threadId, content }))).toBe("unavailable");
      expect(statuses(yield* Queue.take(pushed))).toEqual([[first.id, "invalidated"]]);

      // The failed prepare pushed once, so the next push is this prepare's.
      insertFails = false;
      const third = yield* service.prepare({ threadId, content });
      expect(Object.fromEntries(statuses(yield* Queue.take(pushed)))).toEqual({
        [first.id]: "invalidated",
        [third.id]: "pending",
      });
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );

  it.effect("submits once when two clients approve at the same time (A14)", () =>
    Effect.gen(function* () {
      const { service, smtp } = yield* setup();
      const approval = yield* service.prepare({ threadId, content });
      const decision = {
        approvalId: approval.id,
        decision: "approve" as const,
        digest: approval.digest,
      };
      const exits = yield* Effect.all(
        [Effect.exit(service.respond(decision)), Effect.exit(service.respond(decision))],
        { concurrency: 2 },
      );
      expect(exits.filter(Exit.isSuccess)).toHaveLength(1);
      expect(dataCommands(smtp)).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );

  it.effect("keeps outcome_unknown across a restart and refuses a second approve (A17)", () =>
    Effect.gen(function* () {
      const { service, smtp, afterData, options } = yield* setup();
      afterData.current = "drop";
      const approval = yield* service.prepare({ threadId, content });
      const decision = {
        approvalId: approval.id,
        decision: "approve" as const,
        digest: approval.digest,
      };
      expect((yield* service.respond(decision)).status).toBe("outcome_unknown");

      const restarted = yield* MailSend.make(options);
      const after = yield* restarted.status(approval.id);
      expect(after.status).toBe("outcome_unknown");
      expect(after.error?.code).toBe("outcome_unknown");
      afterData.current = "accept";
      expect(yield* kindOf(restarted.respond(decision))).toBe("conflict");
      expect(dataCommands(smtp)).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );

  it.effect("needs a fresh prepare after a refused send (A18)", () =>
    Effect.gen(function* () {
      const { service, smtp, afterData } = yield* setup();
      afterData.current = "reject";
      const approval = yield* service.prepare({ threadId, content });
      const failed = yield* service.respond({
        approvalId: approval.id,
        decision: "approve",
        digest: approval.digest,
      });
      expect(failed).toMatchObject({ status: "failed", error: { code: "550" } });
      afterData.current = "accept";
      expect(
        yield* kindOf(
          service.respond({
            approvalId: approval.id,
            decision: "approve",
            digest: approval.digest,
          }),
        ),
      ).toBe("conflict");

      const fresh = yield* service.prepare({ threadId, content });
      expect(fresh.id).not.toBe(approval.id);
      const accepted = yield* service.respond({
        approvalId: fresh.id,
        decision: "approve",
        digest: fresh.digest,
      });
      expect(accepted.status).toBe("accepted");
      expect(dataCommands(smtp)).toBe(2);
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );

  it.effect("rejects attachments outside the project, by .. or through a junction", () =>
    Effect.gen(function* () {
      const { service } = yield* setup();
      const outside = NodePath.relative(workspaceRoot, NodePath.join(outsideRoot, "secret.txt"));
      expect(yield* kindOf(service.prepare({ threadId, content, attachments: [outside] }))).toBe(
        "access-denied",
      );
      expect(
        yield* kindOf(service.prepare({ threadId, content, attachments: ["escape/secret.txt"] })),
      ).toBe("access-denied");
      expect(
        yield* kindOf(service.prepare({ threadId, content, attachments: ["missing.txt"] })),
      ).toBe("not-found");
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );
});

describe("mailRpcHandlers", () => {
  const rpc = Effect.gen(function* () {
    const ctx = yield* setup();
    const oauth = yield* MailOAuth;
    return { ...ctx, rpc: mailRpcHandlers(ctx.config, oauth, ctx.service) };
  });

  it.effect("refuses a stale digest and never sends (A12)", () =>
    Effect.gen(function* () {
      const { rpc: handlers, service, smtp } = yield* rpc;
      const approval = yield* service.prepare({ threadId, content });
      const kind = yield* kindOf(
        handlers.respondApproval({
          approvalId: approval.id,
          decision: "approve",
          digest: "0".repeat(64),
        }),
      );
      expect(kind).not.toBe("ok");
      expect((yield* service.status(approval.id)).status).toBe("pending");
      expect(smtp.connections()).toBe(0);
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );

  it.effect("returns no credential bytes from any account response (A21)", () =>
    Effect.gen(function* () {
      const { rpc: handlers, account } = yield* rpc;
      const responses = [
        yield* handlers.setPassword({ accountId: account.id, password: "s3cret-pass" }),
        yield* handlers.listAccounts(),
        yield* handlers.upsertAccount({ ...accountInput, id: account.id }),
      ];
      // @effect-diagnostics-next-line preferSchemaOverJson:off -- scans the serialized responses
      const wire = JSON.stringify(responses);
      expect(wire).not.toContain("s3cret-pass");
      expect(wire).not.toContain("hunter2");
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );

  it.effect("invalidates pending approvals when the account is removed (A25)", () =>
    Effect.gen(function* () {
      const { rpc: handlers, service, account, smtp } = yield* rpc;
      const approval = yield* service.prepare({ threadId, content });
      yield* handlers.removeAccount({ accountId: account.id });
      const kind = yield* kindOf(
        handlers.respondApproval({
          approvalId: approval.id,
          decision: "approve",
          digest: approval.digest,
        }),
      );
      expect(kind).not.toBe("ok");
      expect((yield* service.status(approval.id)).status).toBe("invalidated");
      expect(smtp.connections()).toBe(0);
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );

  it.effect(
    "disconnect keeps the account, drops the sign-in, and voids pending sends (A01, A05)",
    () =>
      Effect.gen(function* () {
        const { rpc: handlers, service, account, smtp, config } = yield* rpc;
        const approval = yield* service.prepare({ threadId, content });
        const disconnected = yield* handlers.disconnectAccount({ accountId: account.id });
        expect(disconnected).toMatchObject({
          id: account.id,
          health: { status: "reauth-required" },
        });
        expect(Option.isNone(yield* config.readCredential(account.id))).toBe(true);
        expect((yield* handlers.listAccounts()).map(({ id }) => id)).toEqual([account.id]);
        const kind = yield* kindOf(
          handlers.respondApproval({
            approvalId: approval.id,
            decision: "approve",
            digest: approval.digest,
          }),
        );
        expect(kind).not.toBe("ok");
        expect((yield* service.status(approval.id)).status).toBe("invalidated");
        expect(smtp.connections()).toBe(0);
      }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );

  it.effect("turns a defect into a generic error", () =>
    Effect.gen(function* () {
      const { config, service } = yield* rpc;
      const handlers = mailRpcHandlers(
        config,
        MailOAuth.of({
          startOAuth: () => Effect.die(new Error("token=abc123 leaked")),
        } as never),
        service,
      );
      const error = yield* Effect.flip(handlers.startOAuth({ accountId: "any" }));
      expect(error.kind).toBe("unavailable");
      expect(error.message).not.toContain("abc123");
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );

  it.effect("turns a stream's other errors and defects into a generic error", () =>
    Effect.gen(function* () {
      const { config, service } = yield* rpc;
      const oauth = yield* MailOAuth;
      const leak = new Error("token=abc123 leaked");
      for (const broken of [Stream.fail(leak), Stream.die(leak)]) {
        const handlers = mailRpcHandlers(config, oauth, {
          ...service,
          subscribeThread: () => broken as never,
        });
        const error = yield* Effect.flip(
          Stream.runDrain(handlers.subscribeThreadApprovals({ threadId })),
        );
        expect(error.kind).toBe("unavailable");
        expect(error.message).not.toContain("abc123");
      }
    }).pipe(Effect.scoped, Effect.provide(baseLayer())),
  );
});
