import * as NodeCrypto from "node:crypto";

import {
  MailError,
  ProjectId,
  ThreadId,
  type MailAddress,
  type MailAttachmentSummary,
  type MailMessageRef,
  type MailSendApproval,
  type MailSendSnapshot,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PubSub from "effect/PubSub";
import * as Stream from "effect/Stream";
import type { AddressObject, ParsedMail } from "mailparser";
import MailComposer from "nodemailer/lib/mail-composer";
import { detectMimeType } from "nodemailer/lib/mime-funcs";

import { ServerEnvironmentIdentity } from "../environment/ServerEnvironment.ts";
import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import {
  MailSendApprovalRepository,
  type MailSendApprovalRecord,
  type MailSourceDraft,
} from "../persistence/MailSendApprovals.ts";
import * as ProjectService from "../project/ProjectService.ts";
import { MailConfigService } from "./MailConfigService.ts";
import type { MailConnectionOptions } from "./MailConnection.ts";
import { messageVersion, readMessageSource } from "./MailImapRead.ts";
import { appendSent } from "./MailImapWrite.ts";
import { MailOAuth } from "./MailOAuth.ts";
import { submit } from "./MailSmtp.ts";

const MIB = 1024 * 1024;
const MAX_MIME_BYTES = 25 * MIB;
const MAX_ATTACHMENT_BYTES = 10 * MIB;
const MAX_ATTACHMENTS = 10;
const MAX_RECIPIENTS = 50;
const APPROVAL_TTL_MS = 30 * 60 * 1000;

const fail = (kind: MailError["kind"], message: string) => new MailError({ kind, message });

/** New message content when the send does not come from a saved draft. */
export interface MailComposeContent {
  readonly to: ReadonlyArray<MailAddress>;
  readonly cc?: ReadonlyArray<MailAddress> | undefined;
  readonly bcc?: ReadonlyArray<MailAddress> | undefined;
  readonly subject: string;
  readonly text: string;
  readonly inReplyTo?: string | undefined;
  readonly references?: ReadonlyArray<string> | undefined;
}

export interface MailPrepareInput {
  readonly threadId: ThreadId;
  readonly selector?: string | undefined;
  /** Send this saved draft as it is now. Exclusive with `content`. */
  readonly draftRef?: MailMessageRef | undefined;
  readonly content?: MailComposeContent | undefined;
  /** Project-relative paths. Each must resolve inside the project root. */
  readonly attachments?: ReadonlyArray<string> | undefined;
}

export class MailSendService extends Context.Service<
  MailSendService,
  {
    /** Builds the exact bytes to send and asks the user to approve them. Never sends. */
    readonly prepare: (input: MailPrepareInput) => Effect.Effect<MailSendApproval, MailError>;
    /** The user's decision. Approve submits the stored bytes at most once. */
    readonly respond: (input: {
      readonly approvalId: string;
      readonly decision: "approve" | "decline";
      readonly digest: string;
    }) => Effect.Effect<MailSendApproval, MailError>;
    readonly status: (approvalId: string) => Effect.Effect<MailSendApproval, MailError>;
    readonly listThread: (
      threadId: ThreadId,
    ) => Effect.Effect<ReadonlyArray<MailSendApproval>, MailError>;
    /** The thread's approvals now, then again after each change to any of them. */
    readonly subscribeThread: (
      threadId: ThreadId,
    ) => Stream.Stream<ReadonlyArray<MailSendApproval>, MailError>;
  }
>()("t3/mail/MailSendService") {}

const isoAt = (ms: number) => DateTime.formatIso(DateTime.makeUnsafe(ms));

const storeError = () => fail("unavailable", "Pulse could not read or save the send approval.");

const toApproval = (record: MailSendApprovalRecord, now: string): MailSendApproval => ({
  id: record.id,
  projectId: ProjectId.make(record.projectId),
  threadId: ThreadId.make(record.threadId),
  accountId: record.accountId,
  // A pending row past its expiry reads as expired; the startup sweep writes it later.
  status: record.status === "pending" && record.expiresAt <= now ? "expired" : record.status,
  snapshot: record.snapshot,
  digest: record.digest,
  createdAt: record.createdAt,
  expiresAt: record.expiresAt,
  ...(record.decidedAt === null ? {} : { decidedAt: record.decidedAt }),
  ...(record.completedAt === null ? {} : { completedAt: record.completedAt }),
  ...(record.error === null ? {} : { error: record.error }),
});

const addressesOf = (field: AddressObject | Array<AddressObject> | undefined) =>
  (field === undefined ? [] : Array.isArray(field) ? field : [field]).flatMap((group) =>
    group.value.flatMap((entry): Array<MailAddress> =>
      entry.address
        ? [{ ...(entry.name ? { name: entry.name } : {}), address: entry.address }]
        : [],
    ),
  );

const contentOfDraft = (parsed: ParsedMail): MailComposeContent => ({
  to: addressesOf(parsed.to),
  cc: addressesOf(parsed.cc),
  bcc: addressesOf(parsed.bcc),
  subject: parsed.subject ?? "",
  text: parsed.text ?? "",
  ...(parsed.inReplyTo ? { inReplyTo: parsed.inReplyTo } : {}),
  ...(parsed.references
    ? { references: Array.isArray(parsed.references) ? parsed.references : [parsed.references] }
    : {}),
});

interface AttachmentFile {
  readonly summary: MailAttachmentSummary;
  readonly content: Uint8Array;
}

const sha256 = (bytes: Uint8Array) => NodeCrypto.createHash("sha256").update(bytes).digest("hex");

const summarize = (name: string, contentType: string, content: Uint8Array): AttachmentFile => ({
  summary: { name, contentType, size: content.byteLength, sha256: sha256(content) },
  content,
});

/** The digest the user approves: the SMTP envelope plus the exact MIME bytes. */
const digestOf = (envelope: { from: string; to: ReadonlyArray<string> }, mime: Uint8Array) =>
  NodeCrypto.createHash("sha256")
    .update(`${envelope.from}\n${envelope.to.join(",")}\n`)
    .update(mime)
    .digest("hex");

const composerAddresses = (addresses: ReadonlyArray<MailAddress>) =>
  addresses.map((entry) => ({ name: entry.name ?? "", address: entry.address }));

const envelopeOf = (snapshot: MailSendSnapshot) => ({
  from: snapshot.from.address,
  to: [...snapshot.to, ...snapshot.cc, ...snapshot.bcc].map((entry) => entry.address),
});

export const make = (
  options: {
    readonly imap?: MailConnectionOptions;
    readonly smtp?: MailConnectionOptions;
  } = {},
) =>
  Effect.gen(function* () {
    const config = yield* MailConfigService;
    const oauth = yield* MailOAuth;
    const repo = yield* MailSendApprovalRepository;
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const projects = yield* ProjectService.ProjectService;
    const environment = yield* ServerEnvironmentIdentity;
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const now = Clock.currentTimeMillis.pipe(Effect.map(isoAt));
    const store = <A, E>(effect: Effect.Effect<A, E>) => effect.pipe(Effect.mapError(storeError));

    const readAttachments = (threadId: ThreadId, paths: ReadonlyArray<string>) =>
      Effect.gen(function* () {
        if (paths.length === 0) return [];
        const thread = yield* orchestrator
          .getThreadShell(threadId)
          .pipe(Effect.mapError(storeError));
        if (thread === null || thread.deletedAt !== null) {
          return yield* fail("not-found", "This thread was not found.");
        }
        const project = yield* projects.getById(thread.projectId).pipe(Effect.mapError(storeError));
        if (Option.isNone(project)) return yield* fail("not-found", "This project was not found.");
        const root = yield* fs
          .realPath(thread.worktreePath ?? project.value.workspaceRoot)
          .pipe(Effect.mapError(() => fail("not-found", "The project folder is missing.")));
        return yield* Effect.forEach(paths, (relative) =>
          Effect.gen(function* () {
            const outside = fail(
              "access-denied",
              `${relative} is outside this project. Attach files from the project folder only.`,
            );
            // realpath follows symlinks, so a link pointing out of the project is caught here.
            const resolved = yield* fs
              .realPath(path.resolve(root, relative))
              .pipe(Effect.mapError(() => fail("not-found", `${relative} was not found.`)));
            const inside = path.relative(root, resolved);
            if (inside === "" || inside.startsWith("..") || path.isAbsolute(inside)) {
              return yield* outside;
            }
            const info = yield* fs
              .stat(resolved)
              .pipe(Effect.mapError(() => fail("not-found", `${relative} was not found.`)));
            if (info.type !== "File") {
              return yield* fail("invalid-input", `${relative} is not a file.`);
            }
            if (Number(info.size) > MAX_ATTACHMENT_BYTES) {
              return yield* fail("limit-exceeded", `${relative} is larger than 10 MiB.`);
            }
            const content = yield* fs
              .readFile(resolved)
              .pipe(Effect.mapError(() => fail("unavailable", `${relative} could not be read.`)));
            const name = path.basename(resolved);
            return summarize(name, detectMimeType(name), content);
          }),
        );
      });

    /** Threads whose approvals changed. Subscribers re-read the list on each one. */
    const threadChanges = yield* PubSub.unbounded<ThreadId>();
    const announce = (threadId: ThreadId) => PubSub.publish(threadChanges, threadId);

    /** Rows that left pending without an answer still close on every client. */
    const announceResolved = (rows: ReadonlyArray<{ readonly threadId: string }>) =>
      Effect.forEach(
        new Set(rows.map((row) => row.threadId)),
        (threadId) => announce(ThreadId.make(threadId)),
        { discard: true },
      );

    const prepare = (input: MailPrepareInput) =>
      Effect.gen(function* () {
        if ((input.draftRef === undefined) === (input.content === undefined)) {
          return yield* fail("invalid-input", "Give either a saved draft or new message content.");
        }
        const { account, projectId, threadId } = yield* config.resolveAccount({
          threadId: input.threadId,
          selector: input.draftRef?.accountId ?? input.selector,
        });
        if (account.credentialRef === undefined || account.health.status === "reauth-required") {
          return yield* fail("auth-failed", "Sign in to this account again in Email settings.");
        }
        const login = yield* oauth.login(account.id);

        let content = input.content;
        let draftAttachments: Array<AttachmentFile> = [];
        let sourceDraft: MailSourceDraft | undefined;
        if (input.draftRef !== undefined) {
          const draft = yield* readMessageSource(account, login, input.draftRef, options.imap);
          content = contentOfDraft(draft.parsed);
          draftAttachments = draft.parsed.attachments.map((attachment) =>
            summarize(
              attachment.filename ?? "attachment",
              attachment.contentType,
              attachment.content,
            ),
          );
          sourceDraft = {
            ...input.draftRef,
            ...(draft.modseq === undefined ? {} : { modseq: draft.modseq }),
          };
        }
        const message = content!;

        const attachmentPaths = input.attachments ?? [];
        if (draftAttachments.length + attachmentPaths.length > MAX_ATTACHMENTS) {
          return yield* fail("limit-exceeded", "A message can carry at most 10 attachments.");
        }
        const attachments = [
          ...draftAttachments,
          ...(yield* readAttachments(threadId, attachmentPaths)),
        ];

        const snapshot: MailSendSnapshot = {
          accountId: account.id,
          accountNickname: account.nickname,
          from: { address: account.address },
          to: [...message.to],
          cc: [...(message.cc ?? [])],
          bcc: [...(message.bcc ?? [])],
          subject: message.subject,
          text: message.text,
          ...(message.inReplyTo ? { inReplyTo: message.inReplyTo } : {}),
          ...(message.references ? { references: [...message.references] } : {}),
          attachments: attachments.map((attachment) => attachment.summary),
          ...(input.draftRef ? { sourceDraft: input.draftRef } : {}),
        };
        const envelope = envelopeOf(snapshot);
        if (envelope.to.length === 0) {
          return yield* fail("invalid-input", "Add at least one recipient.");
        }
        if (envelope.to.length > MAX_RECIPIENTS) {
          return yield* fail("limit-exceeded", "A message can have at most 50 recipients.");
        }

        // Bcc stays in the envelope only; MailComposer leaves it out of the headers.
        const mime = yield* Effect.tryPromise({
          try: () =>
            new MailComposer({
              from: snapshot.from,
              to: composerAddresses(snapshot.to),
              cc: composerAddresses(snapshot.cc),
              bcc: composerAddresses(snapshot.bcc),
              subject: snapshot.subject,
              text: snapshot.text,
              ...(snapshot.inReplyTo ? { inReplyTo: snapshot.inReplyTo } : {}),
              ...(snapshot.references ? { references: [...snapshot.references] } : {}),
              attachments: attachments.map((attachment) => ({
                filename: attachment.summary.name,
                contentType: attachment.summary.contentType,
                content: Buffer.from(attachment.content),
              })),
            })
              .compile()
              .build(),
          catch: () => fail("invalid-input", "The message could not be built."),
        });
        if (mime.byteLength > MAX_MIME_BYTES) {
          return yield* fail("limit-exceeded", "The message is larger than 25 MiB.");
        }

        const createdMs = yield* Clock.currentTimeMillis;
        const createdAt = isoAt(createdMs);
        const id = `mail_${NodeCrypto.randomUUID().replaceAll("-", "")}`;
        yield* announceResolved(
          yield* store(
            repo.supersedeForThread({ threadId, accountId: account.id, now: createdAt }),
          ),
        );
        yield* store(
          repo.insertPending({
            id,
            environmentId: yield* environment.getEnvironmentId,
            projectId,
            threadId,
            accountId: account.id,
            snapshot,
            mime,
            digest: digestOf(envelope, mime),
            sourceDraft: sourceDraft ?? null,
            createdAt,
            expiresAt: isoAt(createdMs + APPROVAL_TTL_MS),
          }),
        );
        yield* announce(threadId);
        return yield* status(id);
      });

    const getRecord = (approvalId: string) =>
      store(repo.get(approvalId)).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.fail(fail("not-found", "This send approval was not found.")),
            onSome: Effect.succeed,
          }),
        ),
      );

    const status = (approvalId: string) =>
      Effect.all([getRecord(approvalId), now]).pipe(
        Effect.map(([record, at]) => toApproval(record, at)),
      );

    const invalidate = (id: string, error: MailError) =>
      Effect.gen(function* () {
        yield* announceResolved(yield* store(repo.invalidate({ id }, yield* now)));
        return yield* error;
      });

    const approve = (approvalId: string, digest: string) =>
      Effect.gen(function* () {
        const record = yield* getRecord(approvalId);
        const at = yield* now;
        const current = toApproval(record, at);
        if (current.status !== "pending") {
          return yield* fail(
            "conflict",
            `This send is already ${current.status.replace("_", " ")}.`,
          );
        }
        if (record.digest !== digest) {
          return yield* fail("conflict", "The message changed. Review it again before approving.");
        }
        const threadId = ThreadId.make(record.threadId);
        const resolved = yield* config
          .resolveAccount({ threadId, selector: record.accountId })
          .pipe(
            Effect.catch((error) =>
              error.kind === "access-denied" || error.kind === "not-found"
                ? invalidate(
                    approvalId,
                    fail("access-denied", "This project no longer has access to the account."),
                  )
                : Effect.fail(error),
            ),
          );
        const login = yield* oauth.login(resolved.account.id);
        if (record.sourceDraft !== null) {
          const { modseq, ...ref } = record.sourceDraft;
          const version = yield* messageVersion(resolved.account, login, ref, options.imap).pipe(
            Effect.catchTag("MailError", (error) =>
              error.kind === "stale-reference" || error.kind === "not-found"
                ? Effect.succeed({ present: false as const })
                : Effect.fail(error),
            ),
          );
          if (!version.present || (modseq !== undefined && version.modseq !== modseq)) {
            return yield* invalidate(
              approvalId,
              fail("conflict", "The draft changed after this send was prepared. Prepare it again."),
            );
          }
        }
        const claimed = yield* store(repo.beginSubmit({ id: approvalId, digest, now: at }));
        if (Option.isNone(claimed)) {
          return yield* fail("conflict", "This send was already approved or is no longer pending.");
        }
        const result = yield* submit(
          resolved.account,
          login,
          { envelope: envelopeOf(claimed.value.snapshot), mime: claimed.value.mime },
          options.smtp,
        ).pipe(
          Effect.catch((error) =>
            Effect.succeed({ kind: "failed" as const, code: 0, message: error.message }),
          ),
        );
        yield* store(
          repo.complete({
            id: approvalId,
            status: result.kind,
            ...(result.kind === "failed"
              ? { error: { code: String(result.code), message: result.message } }
              : result.kind === "outcome_unknown"
                ? { error: { code: "outcome_unknown", message: result.reason } }
                : {}),
            now: yield* now,
          }),
        );
        if (result.kind === "accepted" && resolved.account.appendToSent) {
          // The message is already sent; a missing Sent copy must not turn that into a failure.
          yield* appendSent(resolved.account, login, claimed.value.mime, options.imap).pipe(
            Effect.catch((error) => Effect.logWarning("mail sent copy not saved", error.message)),
          );
        }
        return yield* status(approvalId);
      }).pipe(
        // A dropped client must not strand a claimed send in submitting; every step has a timeout.
        Effect.uninterruptible,
      );

    const respond = (input: {
      readonly approvalId: string;
      readonly decision: "approve" | "decline";
      readonly digest: string;
    }) =>
      (input.decision === "approve"
        ? approve(input.approvalId, input.digest)
        : Effect.gen(function* () {
            const declined = yield* store(repo.decline({ id: input.approvalId, now: yield* now }));
            if (Option.isNone(declined)) {
              return yield* fail("conflict", "This send is no longer pending.");
            }
            return yield* status(input.approvalId);
          })
      ).pipe(Effect.tap((approval) => announce(approval.threadId)));

    const listThread = (threadId: ThreadId) =>
      Effect.all([store(repo.listForThread(threadId)), now]).pipe(
        Effect.map(([records, at]) => records.map((record) => toApproval(record, at))),
      );

    const subscribeThread = (threadId: ThreadId) =>
      Stream.unwrap(
        Effect.gen(function* () {
          // Subscribe before the first read so a change during it is not missed.
          const subscription = yield* PubSub.subscribe(threadChanges);
          return Stream.concat(
            Stream.make(threadId),
            Stream.fromSubscription(subscription).pipe(
              Stream.filter((changed) => changed === threadId),
            ),
          ).pipe(Stream.mapEffect(() => listThread(threadId)));
        }),
      );

    yield* store(repo.sweepAfterRestart(yield* now));
    const changes = yield* config.subscribeAccessChanges;
    yield* Effect.forkScoped(
      Effect.forever(
        PubSub.take(changes).pipe(
          Effect.flatMap((change) => Effect.flatMap(now, (at) => repo.invalidate(change, at))),
          Effect.flatMap(announceResolved),
          Effect.catch((error) => Effect.logWarning("mail approval invalidation failed", error)),
        ),
      ),
    );

    return MailSendService.of({ prepare, respond, status, listThread, subscribeThread });
  });

export const layer = (options?: Parameters<typeof make>[0]) =>
  Layer.effect(MailSendService, make(options));
