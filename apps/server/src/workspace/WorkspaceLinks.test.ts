import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import {
  ComposerContextId,
  ProjectId,
  ThreadId,
  workspaceItemKey,
  type WorkspaceLinkEndpoint,
  type WorkspaceLinkId,
  type WorkspaceLinksError,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { confirmWorkspaceMessageContext } from "./linkedItemsContext.ts";
import { projectHub, WorkspaceLinks, WorkspaceLinksLive } from "./WorkspaceLinks.ts";

const testLayer = () =>
  WorkspaceLinksLive.pipe(
    Layer.provide(Layer.mergeAll(SqlitePersistenceMemory, NodeServices.layer)),
  );

const threadItem = (n: number): WorkspaceLinkEndpoint => ({
  ref: { type: "thread", threadId: ThreadId.make(`t${n}`) },
  title: `Thread ${n}`,
});
const projectItem = (n: number): WorkspaceLinkEndpoint => ({
  ref: { type: "project", projectId: ProjectId.make(`p${n}`) },
  title: `Project ${n}`,
});
const mailItem = (n: number, mailbox = "INBOX"): WorkspaceLinkEndpoint => ({
  ref: {
    type: "mail",
    accountId: "acct_1",
    messageId: `<m${n}@mail.test>`,
    location: { accountId: "acct_1", mailbox, uidValidity: 4, uid: n },
  },
  title: `Mail ${n}`,
});
const urlItem = (n: number, suffix = ""): WorkspaceLinkEndpoint => ({
  ref: { type: "url", url: `https://a.test/${n}${suffix}` },
});
const missingId = "wl_00000000-0000-4000-8000-000000000000" as WorkspaceLinkId;

const kindOf = <A>(effect: Effect.Effect<A, WorkspaceLinksError>) =>
  effect.pipe(
    Effect.map(() => "ok"),
    Effect.catch((error) => Effect.succeed(error.kind)),
  );

it.layer(testLayer())("WorkspaceLinks", (it) => {
  it.effect(
    "preserves another item's cached symmetric suggestion when opening or refreshing its target",
    () =>
      Effect.gen(function* () {
        const links = yield* WorkspaceLinks;
        const batch = {
          item: threadItem(902),
          suggestions: [{ item: mailItem(902), reason: "Related review" }],
          model: "chosen",
          modelKey: "selection",
          revision: "revision",
          incomplete: false,
        };
        yield* links.saveSuggestions(batch);
        const id = (yield* links.list(threadItem(902).ref)).suggested[0]!.id;
        yield* links.saveSuggestions({ ...batch, item: mailItem(902), suggestions: [] });
        assert.equal((yield* links.list(threadItem(902).ref)).suggested[0]?.id, id);
        assert.equal((yield* links.list(mailItem(902).ref)).suggested[0]?.id, id);
        yield* links.saveSuggestions({ ...batch, suggestions: [] });
        assert.lengthOf((yield* links.list(mailItem(902).ref)).suggested, 0);
      }),
  );
  it.effect(
    "keeps suggestions outside context, accepts with model provenance, and preserves dismissals",
    () =>
      Effect.gen(function* () {
        const links = yield* WorkspaceLinks;
        const batch = {
          item: threadItem(900),
          suggestions: [{ item: mailItem(900), reason: "Same launch review" }],
          model: "chosen-model",
          modelKey: "selection-1",
          revision: "revision-1",
          incomplete: false,
        };
        yield* links.saveSuggestions(batch);
        const initial = yield* links.list(threadItem(900).ref);
        assert.lengthOf(initial.linked, 0);
        assert.lengthOf(initial.suggested, 1);
        assert.lengthOf((yield* links.contextFor({ threadId: ThreadId.make("t900") })).items, 0);
        assert.isTrue(
          Option.isNone(
            yield* links.resolveLinked(
              { threadId: ThreadId.make("t900") },
              workspaceItemKey(mailItem(900).ref),
            ),
          ),
        );
        const id = initial.suggested[0]!.id;
        yield* links.acceptSuggestion({ id, viewing: threadItem(900) });
        const accepted = (yield* links.list(threadItem(900).ref)).linked[0]!;
        assert.deepEqual(accepted.source, {
          type: "model",
          model: "chosen-model",
          reason: "Same launch review",
        });
        assert.deepEqual(accepted.origin?.viewing, threadItem(900));
        assert.lengthOf((yield* links.contextFor({ threadId: ThreadId.make("t900") })).items, 1);
        yield* links.saveSuggestions({ ...batch, model: "new-model" });
        assert.deepEqual(
          (yield* links.list(threadItem(900).ref)).linked[0]?.source,
          accepted.source,
        );
        yield* links.unlink(id);
        yield* links.saveSuggestions(batch);
        assert.lengthOf((yield* links.list(threadItem(900).ref)).suggested, 0);
        yield* links.link({ a: threadItem(900), b: mailItem(900) });
        const manual = (yield* links.list(threadItem(900).ref)).linked[0]!;
        assert.deepEqual(manual.source, { type: "user" });
        assert.deepEqual(manual.origin, accepted.origin);
      }),
  );

  it.effect("dismisses a suggestion durably and makes a concurrent stale acceptance fail", () =>
    Effect.gen(function* () {
      const links = yield* WorkspaceLinks;
      const batch = {
        item: threadItem(901),
        suggestions: [{ item: mailItem(901), reason: "Related project" }],
        model: "chosen",
        modelKey: "selection",
        revision: "revision",
        incomplete: true,
      };
      yield* links.saveSuggestions(batch);
      const id = (yield* links.list(threadItem(901).ref)).suggested[0]!.id;
      yield* links.dismissSuggestion(id);
      assert.equal(
        yield* kindOf(links.acceptSuggestion({ id, viewing: threadItem(901) })),
        "not-found",
      );
      yield* links.saveSuggestions(batch);
      assert.lengthOf((yield* links.list(threadItem(901).ref)).suggested, 0);
      assert.lengthOf((yield* links.contextFor({ threadId: ThreadId.make("t901") })).items, 0);
    }),
  );
  it.effect("shows a link from both sides with what the user was viewing", () =>
    Effect.gen(function* () {
      const links = yield* WorkspaceLinks;
      const { id } = yield* links.link({ a: mailItem(1), b: projectItem(1), viewing: mailItem(1) });
      const fromMail = yield* links.list(mailItem(1).ref);
      const fromProject = yield* links.list(projectItem(1).ref);
      assert.deepStrictEqual(
        fromMail.linked.map((view) => view.item),
        [projectItem(1)],
      );
      assert.deepStrictEqual(
        fromProject.linked.map((view) => view.item),
        [mailItem(1)],
      );
      assert.strictEqual(fromProject.linked[0]?.id, id);
      assert.deepStrictEqual(fromProject.linked[0]?.source, { type: "user" });
      assert.deepStrictEqual(fromProject.linked[0]?.origin?.viewing, mailItem(1));
      assert.deepStrictEqual(fromProject.suggested, []);
    }),
  );

  it.effect("still lists a message after it moves to another folder", () =>
    Effect.gen(function* () {
      const links = yield* WorkspaceLinks;
      yield* links.link({ a: mailItem(2), b: projectItem(2) });
      const moved = yield* links.list(mailItem(2, "[Gmail]/All Mail").ref);
      assert.deepStrictEqual(
        moved.linked.map((view) => view.item),
        [projectItem(2)],
      );
    }),
  );

  it.effect("refuses to link an item to itself, even through a tracking parameter", () =>
    Effect.gen(function* () {
      const links = yield* WorkspaceLinks;
      const kind = yield* kindOf(links.link({ a: urlItem(3), b: urlItem(3, "?utm_source=mail") }));
      assert.strictEqual(kind, "invalid-input");
    }),
  );

  it.effect("unlink hides the link, and an unknown link is not found", () =>
    Effect.gen(function* () {
      const links = yield* WorkspaceLinks;
      const { id } = yield* links.link({ a: threadItem(4), b: urlItem(4) });
      yield* links.unlink(id);
      assert.deepStrictEqual((yield* links.list(threadItem(4).ref)).linked, []);
      assert.strictEqual(yield* kindOf(links.unlink(missingId)), "not-found");
    }),
  );

  it.effect("gives an agent the thread's and project's linked items once each", () =>
    Effect.gen(function* () {
      const links = yield* WorkspaceLinks;
      yield* links.link({ a: threadItem(5), b: projectItem(5) });
      yield* links.link({ a: threadItem(5), b: mailItem(5) });
      yield* links.link({ a: projectItem(5), b: mailItem(5) });
      yield* links.link({ a: projectItem(5), b: urlItem(5) });
      const removed = yield* links.link({ a: threadItem(5), b: urlItem(50) });
      yield* links.unlink(removed.id);
      const context = yield* links.contextFor({
        threadId: ThreadId.make("t5"),
        projectId: ProjectId.make("p5"),
      });
      assert.deepStrictEqual(
        context.items.map((entry) => entry.key).sort(),
        [workspaceItemKey(mailItem(5).ref), workspaceItemKey(urlItem(5).ref)].sort(),
      );
      assert.strictEqual(context.truncated, false);
    }),
  );

  it.effect("resolves a linked item only for the thread or project it is linked to", () =>
    Effect.gen(function* () {
      const links = yield* WorkspaceLinks;
      yield* links.link({ a: projectItem(6), b: mailItem(6) });
      const key = workspaceItemKey(mailItem(6).ref);
      const owner = { threadId: ThreadId.make("t6"), projectId: ProjectId.make("p6") };
      assert.deepStrictEqual(
        Option.getOrThrow(yield* links.resolveLinked(owner, key)),
        mailItem(6),
      );
      const stranger = yield* links.resolveLinked({ threadId: ThreadId.make("t7") }, key);
      assert.strictEqual(Option.isNone(stranger), true);
    }),
  );

  it.effect("keeps the original origin and id through repeat confirmation and relinking", () =>
    Effect.gen(function* () {
      const links = yield* WorkspaceLinks;
      const { id } = yield* links.link({
        a: mailItem(11),
        b: projectItem(11),
        viewing: mailItem(11),
      });
      const original = (yield* links.list(projectItem(11).ref)).linked[0]?.origin;
      const repeated = yield* links.link({
        a: projectItem(11),
        b: mailItem(11, "Archive"),
        viewing: projectItem(11),
        source: { type: "action", action: "add-to-project" },
      });
      assert.strictEqual(repeated.id, id);
      assert.deepStrictEqual((yield* links.list(projectItem(11).ref)).linked[0]?.source, {
        type: "user",
      });
      yield* links.unlink(id);
      const relinked = yield* links.link({
        a: mailItem(11, "Archive"),
        b: projectItem(11),
        viewing: projectItem(11),
        source: { type: "action", action: "add-to-project" },
      });
      assert.strictEqual(relinked.id, id);
      const page = yield* links.list(projectItem(11).ref);
      assert.strictEqual(page.linked.length, 1);
      assert.deepStrictEqual(page.linked[0]?.origin, original);
      assert.deepStrictEqual(page.linked[0]?.item, mailItem(11, "Archive"));
      assert.deepStrictEqual(page.linked[0]?.source, { type: "action", action: "add-to-project" });
    }),
  );

  it.effect("rejects invalid URLs in endpoints, viewing origins and list requests", () =>
    Effect.gen(function* () {
      const links = yield* WorkspaceLinks;
      const invalid = { ref: { type: "url" as const, url: "file:///private" } };
      assert.strictEqual(
        yield* kindOf(links.link({ a: invalid, b: projectItem(12) })),
        "invalid-input",
      );
      assert.strictEqual(
        yield* kindOf(links.link({ a: threadItem(12), b: invalid })),
        "invalid-input",
      );
      assert.strictEqual(
        yield* kindOf(links.link({ a: threadItem(12), b: projectItem(12), viewing: invalid })),
        "invalid-input",
      );
      assert.strictEqual(yield* kindOf(links.list(invalid.ref)), "invalid-input");
      assert.deepStrictEqual((yield* links.list(threadItem(12).ref)).linked, []);
    }),
  );

  it.effect("resolves exact confirmed links even beyond the context limit", () =>
    Effect.gen(function* () {
      const links = yield* WorkspaceLinks;
      const owner = { threadId: ThreadId.make("t13") };
      for (let n = 100; n < 202; n++) {
        yield* links.link({ a: threadItem(13), b: urlItem(n) });
      }
      const context = yield* links.contextFor(owner);
      assert.strictEqual(context.truncated, true);
      assert.strictEqual(context.items.length, 100);
      const included = new Set(context.items.map((item) => item.key));
      const outside = Array.from({ length: 102 }, (_, n) => urlItem(100 + n)).find(
        (item) => !included.has(workspaceItemKey(item.ref)),
      );
      assert.ok(outside);
      const key = workspaceItemKey(outside.ref);
      assert.deepStrictEqual(Option.getOrThrow(yield* links.resolveLinked(owner, key)), outside);
      assert.strictEqual(Option.isNone(yield* links.resolveLinked(owner, `${key}extra`)), true);
      assert.strictEqual(
        Option.isNone(yield* links.resolveLinked(owner, workspaceItemKey(threadItem(13).ref))),
        true,
      );
      const removed = (yield* links.list(outside.ref)).linked[0];
      assert.ok(removed);
      yield* links.unlink(removed.id);
      assert.strictEqual(Option.isNone(yield* links.resolveLinked(owner, key)), true);
    }),
  );
});

it.layer(testLayer())("WorkspaceLinks changes", (it) => {
  it.effect("wakes a waiting subscriber when a link is made", () =>
    Effect.gen(function* () {
      const links = yield* WorkspaceLinks;
      const waiting = yield* links.changes.pipe(
        Stream.runHead,
        Effect.forkScoped({ startImmediately: true }),
      );
      yield* links.link({ a: threadItem(8), b: urlItem(8) });
      assert.strictEqual(Option.getOrThrow(yield* Fiber.join(waiting)), 1);
    }),
  );
});

it.layer(testLayer())("WorkspaceLinks change replay", (it) => {
  it.effect("counts each link and unlink, and not a refused link", () =>
    Effect.gen(function* () {
      const links = yield* WorkspaceLinks;
      const latest = links.changes.pipe(Stream.runHead, Effect.map(Option.getOrThrow));
      const { id } = yield* links.link({ a: threadItem(9), b: urlItem(9) });
      assert.strictEqual(yield* latest, 1);
      yield* links.unlink(id);
      assert.strictEqual(yield* latest, 2);
      yield* kindOf(links.link({ a: urlItem(10), b: urlItem(10, "#top") }));
      assert.strictEqual(yield* latest, 2);
    }),
  );
});

it.layer(testLayer())("WorkspaceLinks live subscription", (it) => {
  it.effect("delivers successful link and unlink updates to the same subscriber", () =>
    Effect.gen(function* () {
      const links = yield* WorkspaceLinks;
      const waiting = yield* links.changes.pipe(
        Stream.take(2),
        Stream.runCollect,
        Effect.forkScoped({ startImmediately: true }),
      );
      const { id } = yield* links.link({ a: threadItem(14), b: urlItem(14) });
      yield* links.unlink(id);
      assert.deepStrictEqual(yield* Fiber.join(waiting), [1, 2]);
    }),
  );
});

it.layer(
  WorkspaceLinksLive.pipe(
    Layer.provideMerge(SqlitePersistenceMemory),
    Layer.provide(NodeServices.layer),
  ),
)("WorkspaceLinks unavailable store", (it) => {
  it.effect("maps repository failures to public errors without advancing the change count", () =>
    Effect.gen(function* () {
      const links = yield* WorkspaceLinks;
      const { id } = yield* links.link({ a: threadItem(15), b: urlItem(15) });
      const sql = yield* SqlClient.SqlClient;
      yield* sql`DROP TABLE workspace_links`;
      const owner = { threadId: ThreadId.make("t15") };
      const operations = [
        {
          effect: links.list(threadItem(15).ref),
          message: "Links could not be loaded. Try again.",
        },
        {
          effect: links.link({ a: threadItem(16), b: urlItem(16) }),
          message: "The link could not be saved. Try again.",
        },
        { effect: links.unlink(id), message: "The link could not be removed. Try again." },
        { effect: links.contextFor(owner), message: "Linked items could not be loaded." },
        {
          effect: links.resolveLinked(owner, workspaceItemKey(urlItem(15).ref)),
          message: "Linked items could not be loaded.",
        },
      ];
      for (const { effect, message } of operations) {
        const error = yield* Effect.flip(effect);
        assert.strictEqual(error._tag, "WorkspaceLinksError");
        assert.strictEqual(error.kind, "unavailable");
        assert.strictEqual(error.message, message);
      }
      assert.strictEqual(Option.getOrThrow(yield* Stream.runHead(links.changes)), 1);
    }),
  );
});

it.layer(testLayer())("project hub", (it) => {
  it.effect("a removed source grants no access and repeated confirmation is idempotent", () =>
    Effect.gen(function* () {
      const links = yield* WorkspaceLinks;
      const source = {
        version: 1 as const,
        kind: "workspace-item" as const,
        contextId: ComposerContextId.make("source"),
        label: "Source",
        item: mailItem(1),
        viewing: mailItem(1),
      };
      const retained = {
        ...source,
        contextId: ComposerContextId.make("retained"),
        label: "Retained file",
        item: urlItem(1),
      };
      const message = {
        text: "Read [Retained](t3-context://v1/workspace-item/retained)",
        context: { version: 1 as const, records: [source, retained] },
      };
      const owner = { threadId: ThreadId.make("t1") };
      yield* confirmWorkspaceMessageContext(links.link, owner, message);
      yield* confirmWorkspaceMessageContext(links.link, owner, message);
      const confirmed = yield* links.list(threadItem(1).ref);
      assert.lengthOf(confirmed.linked, 1);
      assert.deepEqual(confirmed.linked[0]?.item, retained.item);
      assert.deepEqual(confirmed.linked[0]?.origin?.viewing, source.item);
      assert.isTrue(
        Option.isNone(yield* links.resolveLinked(owner, workspaceItemKey(source.item.ref))),
      );
      assert.isTrue(
        Option.isSome(yield* links.resolveLinked(owner, workspaceItemKey(retained.item.ref))),
      );
    }),
  );

  it.effect("shows one hop through project threads without granting indirect context", () =>
    Effect.gen(function* () {
      const links = yield* WorkspaceLinks;
      yield* links.link({ a: projectItem(1), b: mailItem(1) });
      yield* links.link({ a: mailItem(1), b: urlItem(1) });
      yield* links.link({ a: threadItem(1), b: mailItem(2) });
      yield* links.link({ a: urlItem(1), b: urlItem(2) });
      const hub = yield* projectHub(links.list, {
        projectId: ProjectId.make("p1"),
        threadIds: [ThreadId.make("t1")],
      });
      assert.deepEqual(
        new Set(hub.related.map((row) => workspaceItemKey(row.item.ref))),
        new Set([workspaceItemKey(urlItem(1).ref), workspaceItemKey(mailItem(2).ref)]),
      );
      assert.isTrue(
        hub.related.some(
          (row) => workspaceItemKey(row.via.ref) === workspaceItemKey(threadItem(1).ref),
        ),
      );
      const context = yield* links.contextFor({
        threadId: ThreadId.make("other"),
        projectId: ProjectId.make("p1"),
      });
      assert.deepEqual(
        context.items.map((row) => row.key),
        [workspaceItemKey(mailItem(1).ref)],
      );
      assert.isFalse(hub.truncated);
    }),
  );
});
