import { assert, it } from "@effect/vitest";
import { ProjectId, ThreadId, type WorkspaceLinkId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "./Layers/Sqlite.ts";
import * as WorkspaceLinks from "./WorkspaceLinks.ts";

const layer = it.layer(WorkspaceLinks.layer.pipe(Layer.provideMerge(SqlitePersistenceMemory)));

const thread = {
  key: "thread:t1",
  endpoint: { ref: { type: "thread" as const, threadId: ThreadId.make("t1") }, title: "Draft" },
};
const project = {
  key: "project:p1",
  endpoint: { ref: { type: "project" as const, projectId: ProjectId.make("p1") }, title: "SynKEK" },
};
const mail = {
  key: "mail:acct_1:%3Ca%40b%3E",
  endpoint: {
    ref: { type: "mail" as const, accountId: "acct_1", messageId: "<a@b>" },
    title: "Q3 brief",
  },
};
const id = (n: number) =>
  `wl_00000000-0000-4000-8000-${String(n).padStart(12, "0")}` as WorkspaceLinkId;
const user = { type: "user" as const };

layer("WorkspaceLinksRepository", (it) => {
  it.effect("keeps one row per pair whichever way round it is linked", () =>
    Effect.gen(function* () {
      const repo = yield* WorkspaceLinks.WorkspaceLinksRepository;
      const first = yield* repo.confirm({
        id: id(1),
        first: mail,
        second: project,
        source: user,
        origin: { confirmedAt: "2026-10-14T10:00:00.000Z", viewing: mail.endpoint },
        now: "2026-10-14T10:00:00.000Z",
      });
      const again = yield* repo.confirm({
        id: id(2),
        first: project,
        second: { ...mail, endpoint: { ...mail.endpoint, title: "Re: Q3 brief" } },
        source: { type: "action", action: "add-to-project" },
        origin: { confirmedAt: "2026-10-15T09:00:00.000Z" },
        now: "2026-10-15T09:00:00.000Z",
      });
      assert.strictEqual(again.id, first.id);
      assert.strictEqual(again.a.key < again.b.key, true);
      assert.deepStrictEqual(again.origin, {
        confirmedAt: "2026-10-14T10:00:00.000Z",
        viewing: mail.endpoint,
      });
      assert.deepStrictEqual(again.source, user, "a confirmed link keeps who made it");
      const titled = again.a.key === mail.key ? again.a : again.b;
      assert.strictEqual(
        titled.endpoint.title,
        "Re: Q3 brief",
        "titles follow the latest snapshot",
      );
      const sql = yield* SqlClient.SqlClient;
      const rows = yield* sql<{ n: number }>`SELECT COUNT(*) AS n FROM workspace_links
        WHERE key_a = ${first.a.key} AND key_b = ${first.b.key}`;
      assert.strictEqual(rows[0]?.n, 1);
    }),
  );

  it.effect("unlink hides the link and linking again keeps the first origin", () =>
    Effect.gen(function* () {
      const repo = yield* WorkspaceLinks.WorkspaceLinksRepository;
      const made = yield* repo.confirm({
        id: id(3),
        first: thread,
        second: mail,
        source: user,
        origin: { confirmedAt: "2026-10-14T10:00:00.000Z" },
        now: "2026-10-14T10:00:00.000Z",
      });
      const unlinked = yield* repo.unlink(made.id, "2026-10-14T11:00:00.000Z");
      assert.strictEqual(Option.getOrThrow(unlinked).status, "dismissed");
      assert.strictEqual((yield* repo.listFor(thread.key)).links.length, 0);
      assert.deepStrictEqual(yield* repo.confirmedFor([thread.key]), {
        links: [],
        truncated: false,
      });
      assert.strictEqual(Option.isNone(yield* repo.findConfirmed([thread.key], mail.key)), true);
      const again = yield* repo.unlink(made.id, "2026-10-14T11:30:00.000Z");
      assert.strictEqual(Option.isSome(again), true, "unlinking twice is not an error");
      const relinked = yield* repo.confirm({
        id: id(4),
        first: mail,
        second: thread,
        source: { type: "action", action: "start-thread" },
        origin: { confirmedAt: "2026-10-14T12:00:00.000Z" },
        now: "2026-10-14T12:00:00.000Z",
      });
      assert.strictEqual(relinked.status, "confirmed");
      assert.strictEqual(relinked.id, made.id);
      assert.strictEqual(relinked.origin?.confirmedAt, "2026-10-14T10:00:00.000Z");
      assert.deepStrictEqual(relinked.source, { type: "action", action: "start-thread" });
      assert.strictEqual(
        Option.isNone(yield* repo.unlink(id(99), "2026-10-14T13:00:00.000Z")),
        true,
      );
    }),
  );

  it.effect("finds confirmed links from either side and caps reads", () =>
    Effect.gen(function* () {
      const repo = yield* WorkspaceLinks.WorkspaceLinksRepository;
      const project = {
        key: "project:limits",
        endpoint: { ref: { type: "project" as const, projectId: ProjectId.make("limits") } },
      };
      const mail = {
        key: "mail:acct_1:%3Cc%40d%3E",
        endpoint: {
          ref: { type: "mail" as const, accountId: "acct_1", messageId: "<c@d>" },
          title: "Lookup brief",
        },
      };
      yield* repo.confirm({
        id: id(5),
        first: project,
        second: mail,
        source: user,
        origin: { confirmedAt: "2026-10-14T10:00:00.000Z" },
        now: "2026-10-14T10:00:00.000Z",
      });
      const found = yield* repo.findConfirmed([thread.key, project.key], mail.key);
      assert.strictEqual(Option.getOrThrow(found).id, id(5));
      assert.strictEqual(
        Option.getOrThrow(yield* repo.findConfirmed([mail.key], project.key)).id,
        id(5),
      );
      assert.strictEqual(Option.isNone(yield* repo.findConfirmed([], mail.key)), true);
      assert.deepStrictEqual(yield* repo.confirmedFor([]), { links: [], truncated: false });
      assert.deepStrictEqual(
        (yield* repo.listFor(mail.key)).links.map((link) => link.id),
        [id(5)],
      );
      assert.deepStrictEqual(
        (yield* repo.confirmedFor([mail.key])).links.map((link) => link.id),
        [id(5)],
      );
      const missing = yield* repo.findConfirmed([thread.key], mail.key);
      assert.strictEqual(Option.isNone(missing), true);
      for (let n = 0; n < WorkspaceLinks.MAX_LINKS_PER_ITEM; n += 1) {
        if (n === WorkspaceLinks.MAX_CONTEXT_LINKS - 1) {
          const exactContext = yield* repo.confirmedFor([project.key]);
          assert.strictEqual(exactContext.links.length, WorkspaceLinks.MAX_CONTEXT_LINKS);
          assert.strictEqual(exactContext.truncated, false);
        }
        if (n === WorkspaceLinks.MAX_LINKS_PER_ITEM - 1) {
          const exactPage = yield* repo.listFor(project.key);
          assert.strictEqual(exactPage.links.length, WorkspaceLinks.MAX_LINKS_PER_ITEM);
          assert.strictEqual(exactPage.truncated, false);
        }
        yield* repo.confirm({
          id: id(100 + n),
          first: project,
          second: {
            key: `url:${n}`,
            endpoint: { ref: { type: "url", url: `https://a.test/${n}` } },
          },
          source: user,
          origin: { confirmedAt: "2026-10-14T10:00:00.000Z" },
          now: "2026-10-14T10:00:00.000Z",
        });
      }
      const page = yield* repo.listFor(project.key);
      assert.strictEqual(page.links.length, WorkspaceLinks.MAX_LINKS_PER_ITEM);
      assert.strictEqual(page.truncated, true);
      const context = yield* repo.confirmedFor([project.key, mail.key]);
      assert.strictEqual(context.links.length, WorkspaceLinks.MAX_CONTEXT_LINKS);
      assert.strictEqual(context.truncated, true);
      assert.strictEqual(new Set(context.links.map((link) => link.id)).size, context.links.length);
    }),
  );

  it.effect("skips a row it cannot read instead of failing the list", () =>
    Effect.gen(function* () {
      const repo = yield* WorkspaceLinks.WorkspaceLinksRepository;
      const sql = yield* SqlClient.SqlClient;
      yield* sql`
        INSERT INTO workspace_links (
          link_id, key_a, key_b, ref_a_json, ref_b_json, status, source_json, created_at, updated_at
        ) VALUES (${id(7)}, 'project:p9', 'url:x', '{bad', '{}', 'confirmed', '{}', 'now', 'now')
      `;
      const page = yield* repo.listFor("project:p9");
      assert.strictEqual(page.links.length, 0);
      const made = yield* repo.confirm({
        id: id(8),
        first: {
          key: "project:p9",
          endpoint: { ref: { type: "project", projectId: ProjectId.make("p9") } },
        },
        second: mail,
        source: user,
        origin: { confirmedAt: "2026-10-14T10:00:00.000Z" },
        now: "2026-10-14T10:00:00.000Z",
      });
      assert.deepStrictEqual((yield* repo.listFor("project:p9")).links, [made]);
      assert.deepStrictEqual((yield* repo.confirmedFor(["project:p9"])).links, [made]);
    }),
  );
  it.effect(
    "lists suggestions without adding them to confirmed context and preserves their ID",
    () =>
      Effect.gen(function* () {
        const repo = yield* WorkspaceLinks.WorkspaceLinksRepository;
        const sql = yield* SqlClient.SqlClient;
        const first = {
          key: "project:suggested",
          endpoint: { ref: { type: "project" as const, projectId: ProjectId.make("suggested") } },
        };
        const second = {
          key: "url:suggested",
          endpoint: { ref: { type: "url" as const, url: "https://example.test/suggested" } },
        };
        yield* sql`
        INSERT INTO workspace_links (
          link_id, key_a, key_b, ref_a_json, ref_b_json, status, source_json, created_at, updated_at
        ) VALUES (
          ${id(9)}, ${first.key}, ${second.key}, '{"type":"project","projectId":"suggested"}',
          '{"type":"url","url":"https://example.test/suggested"}',  'suggested',
          '{"type":"model","model":"test","reason":"Related"}', 'now', 'now'
        )
      `;
        const page = yield* repo.listFor(second.key);
        assert.strictEqual(page.truncated, false);
        assert.strictEqual(page.links.length, 1);
        assert.strictEqual(page.links[0]?.status, "suggested");
        assert.strictEqual(page.links[0]?.origin, undefined);
        assert.deepStrictEqual(yield* repo.confirmedFor([first.key]), {
          links: [],
          truncated: false,
        });
        assert.strictEqual(Option.isNone(yield* repo.findConfirmed([first.key], second.key)), true);
        const confirmed = yield* repo.confirm({
          id: id(10),
          first,
          second,
          source: user,
          origin: { confirmedAt: "2026-10-14T10:00:00.000Z" },
          now: "2026-10-14T10:00:00.000Z",
        });
        assert.strictEqual(confirmed.id, id(9));
        assert.strictEqual(confirmed.status, "confirmed");
        assert.deepStrictEqual(confirmed.source, user);
        assert.strictEqual(confirmed.origin?.confirmedAt, "2026-10-14T10:00:00.000Z");
      }),
  );
});
