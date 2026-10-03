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
  type OrchestrationCommand,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import { ServerEnvironmentIdentity } from "../environment/ServerEnvironment.ts";
import { OrchestrationEngineService } from "../orchestration/Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as MailSendApprovals from "../persistence/MailSendApprovals.ts";
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
const workspaceRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "pulse-mail-send-"));
const outsideRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "pulse-mail-outside-"));
NodeFS.writeFileSync(NodePath.join(workspaceRoot, "notes.txt"), "project notes");
NodeFS.writeFileSync(NodePath.join(outsideRoot, "secret.txt"), "not for mail");
NodeFS.symlinkSync(outsideRoot, NodePath.join(workspaceRoot, "escape"), "junction");

const dispatched: Array<OrchestrationCommand> = [];

const baseLayer = () => {
  const configLayer = ServerConfig.layerTest(process.cwd(), { prefix: "pulse-mail-send-test-" });
  const snapshots = Layer.mock(ProjectionSnapshotQuery)({
    getThreadShellById: (id) =>
      Effect.succeed(id === threadId ? Option.some({ projectId } as never) : Option.none()),
    getThreadCheckpointContext: (id) =>
      Effect.succeed(
        id === threadId
          ? Option.some({ threadId, projectId, workspaceRoot, worktreePath: null, checkpoints: [] })
          : Option.none(),
      ),
  });
  const mailConfig = MailConfig.layer.pipe(
    Layer.provide(ServerSecretStore.layer.pipe(Layer.provide(configLayer))),
    Layer.provide(configLayer),
    Layer.provide(snapshots),
  );
  return Layer.mergeAll(
    mailConfig,
    snapshots,
    MailSendApprovals.layer.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    Layer.mock(MailOAuth)({
      login: () => Effect.succeed({ type: "password", password: "hunter2" }),
    }),
    Layer.mock(OrchestrationEngineService)({
      dispatch: (command) =>
        Effect.sync(() => {
          dispatched.push(command);
          return { sequence: dispatched.length };
        }),
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
      const activity = dispatched.at(-1);
      expect(activity).toMatchObject({
        type: "thread.activity.append",
        threadId,
        activity: {
          tone: "approval",
          kind: "mail.send-approval",
          payload: { approvalId: approval.id },
        },
      });

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
      yield* service.prepare({ threadId, content: { ...content, subject: "Again" } });
      expect((yield* service.status(first.id)).status).toBe("invalidated");
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
      expect((yield* handlers.getApproval({ approvalId: approval.id })).status).toBe("pending");
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
      expect((yield* handlers.getApproval({ approvalId: approval.id })).status).toBe("invalidated");
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
});
