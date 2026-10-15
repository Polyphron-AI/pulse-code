import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { SqlitePersistenceMemory } from "./Layers/Sqlite.ts";
import * as MailSendApprovals from "./MailSendApprovals.ts";

const layer = it.layer(MailSendApprovals.layer.pipe(Layer.provideMerge(SqlitePersistenceMemory)));

const snapshot = {
  accountId: "acct",
  accountNickname: "Work",
  from: { address: "me@example.com" },
  to: [{ address: "you@example.com" }],
  cc: [],
  bcc: [],
  subject: "Hello",
  text: "Body",
  attachments: [],
};

const insert = (id: string, overrides: { expiresAt?: string; threadId?: string } = {}) =>
  Effect.gen(function* () {
    const repo = yield* MailSendApprovals.MailSendApprovalRepository;
    yield* repo.insertPending({
      id,
      environmentId: "env",
      projectId: "project",
      threadId: overrides.threadId ?? "thread",
      accountId: "acct",
      snapshot,
      mime: new TextEncoder().encode(`mime-${id}`),
      digest: "d".repeat(64),
      sourceDraft: null,
      createdAt: "2026-10-02T10:00:00.000Z",
      expiresAt: overrides.expiresAt ?? "2026-10-02T10:30:00.000Z",
    });
    return repo;
  });

const now = "2026-10-02T10:05:00.000Z";
const digest = "d".repeat(64);

layer("MailSendApprovalRepository", (it) => {
  it.effect("claims a pending row exactly once under concurrent approvals", () =>
    Effect.gen(function* () {
      const repo = yield* insert("race");
      const results = yield* Effect.all(
        Array.from({ length: 5 }, () => repo.beginSubmit({ id: "race", digest, now })),
        { concurrency: "unbounded" },
      );
      const claimed = results.filter(Option.isSome);
      expect(claimed).toHaveLength(1);
      expect(new TextDecoder().decode(claimed[0]!.value.mime)).toBe("mime-race");
      expect(claimed[0]!.value.status).toBe("submitting");
    }),
  );

  it.effect("refuses wrong digests, expired, declined, and invalidated rows", () =>
    Effect.gen(function* () {
      const repo = yield* insert("wrong");
      expect(
        Option.isNone(yield* repo.beginSubmit({ id: "wrong", digest: "e".repeat(64), now })),
      ).toBe(true);

      yield* insert("old", { expiresAt: "2026-10-02T10:01:00.000Z" });
      expect(Option.isNone(yield* repo.beginSubmit({ id: "old", digest, now }))).toBe(true);
      expect(Option.isNone(yield* repo.decline({ id: "old", now }))).toBe(true);

      yield* insert("declined");
      expect(Option.isSome(yield* repo.decline({ id: "declined", now }))).toBe(true);
      expect(Option.isNone(yield* repo.beginSubmit({ id: "declined", digest, now }))).toBe(true);

      yield* insert("revoked");
      expect(yield* repo.invalidate({ accountId: "acct", projectId: "project" }, now)).not.toEqual(
        [],
      );
      expect(Option.isNone(yield* repo.beginSubmit({ id: "revoked", digest, now }))).toBe(true);
      const row = yield* repo.get("revoked");
      expect(Option.getOrThrow(row).status).toBe("invalidated");
    }),
  );

  it.effect("supersedes earlier pending rows for the same thread and account", () =>
    Effect.gen(function* () {
      const repo = yield* insert("first", { threadId: "t-super" });
      const superseded = yield* repo.supersedeForThread({
        threadId: "t-super",
        accountId: "acct",
        now,
      });
      expect(superseded.map((row) => row.id)).toEqual(["first"]);
    }),
  );

  it.effect("turns interrupted submissions into outcome unknown after restart", () =>
    Effect.gen(function* () {
      const repo = yield* insert("crash");
      yield* repo.beginSubmit({ id: "crash", digest, now });
      yield* insert("stale", { expiresAt: "2026-10-02T10:01:00.000Z" });
      const swept = yield* repo.sweepAfterRestart(now);
      expect(swept.outcomeUnknown).toBeGreaterThanOrEqual(1);
      expect(swept.expired).toBeGreaterThanOrEqual(1);
      expect(Option.getOrThrow(yield* repo.get("crash")).status).toBe("outcome_unknown");
      expect(Option.getOrThrow(yield* repo.get("stale")).status).toBe("expired");
      // An unknown outcome is terminal: a later approve cannot claim it again.
      expect(Option.isNone(yield* repo.beginSubmit({ id: "crash", digest, now }))).toBe(true);
    }),
  );

  it.effect("records the submission outcome only for a claimed row", () =>
    Effect.gen(function* () {
      const repo = yield* insert("done");
      yield* repo.complete({ id: "done", status: "accepted", now });
      expect(Option.getOrThrow(yield* repo.get("done")).status).toBe("pending");
      yield* repo.beginSubmit({ id: "done", digest, now });
      yield* repo.complete({
        id: "done",
        status: "failed",
        error: { code: "550", message: "Mailbox unavailable" },
        now,
      });
      const row = Option.getOrThrow(yield* repo.get("done"));
      expect(row.status).toBe("failed");
      expect(row.error).toEqual({ code: "550", message: "Mailbox unavailable" });
    }),
  );
});
