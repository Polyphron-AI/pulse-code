// @effect-diagnostics preferSchemaOverJson:off -- Malformed wire payloads, cursor tampering and serialized byte assertions.
import { CommunicationMessagePage, CommunicationConversationPage } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer, Schema } from "effect";
import * as TestClock from "effect/testing/TestClock";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";
import * as ServerConfig from "../config.ts";
import * as Secrets from "../auth/ServerSecretStore.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as Store from "./SlackAccountStore.ts";
import * as Connection from "./SlackConnection.ts";
import * as Reader from "./SlackReader.ts";

const auth = { ok: true, team_id: "T123", team: "Review team", user_id: "U123", user: "Asha" };
const isMessagePage = Schema.is(CommunicationMessagePage);
const isConversationPage = Schema.is(CommunicationConversationPage);
const headers = { "x-oauth-scopes": "channels:read,channels:history" };
const testLayer = () =>
  Layer.mergeAll(
    Store.layer.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    Secrets.layer.pipe(
      Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "slack-reader-test-" })),
    ),
  ).pipe(Layer.provideMerge(NodeServices.layer));

it.effect(
  "lists without history fanout or clock requests and reads only the selected channel",
  () => {
    const calls: URL[] = [];
    const client = HttpClient.make((request, url) =>
      Effect.sync(() => {
        calls.push(url);
        expect(url.origin).toBe("https://slack.com");
        const body = url.pathname.endsWith("auth.test")
          ? auth
          : url.pathname.endsWith("conversations.list")
            ? { ok: true, channels: [{ id: "C1", name: "marketing" }] }
            : { ok: true, messages: [{ ts: "1760343120.000001", text: "Hello", user: "U1" }] };
        return HttpClientResponse.fromWeb(request, Response.json(body, { headers }));
      }),
    );
    return Effect.gen(function* () {
      const accounts = yield* Connection.SlackConnection;
      const reader = yield* Reader.SlackReader;
      const connection = yield* accounts.connect({ token: "synthetic_slack_token" });
      const page = yield* reader.listConversations({ connectionId: connection.id });
      expect(page.conversations[0]).toMatchObject({ id: "C1", workspaceId: "T123" });
      expect(calls.filter((url) => url.pathname.endsWith("history"))).toHaveLength(0);
      yield* TestClock.adjust("1 hour");
      expect(calls).toHaveLength(2);
      const messages = yield* reader.listMessages({
        connectionId: connection.id,
        workspaceId: "T123",
        conversationId: "C1",
      });
      expect(messages.messages[0]!.id).toBe("1760343120.000001");
      expect(messages.messages).toHaveLength(1);
      expect(calls[1]!.searchParams.get("limit")).toBe("100");
      expect(calls[2]!.searchParams.get("limit")).toBe("15");
    }).pipe(
      Effect.provide(
        Reader.layer.pipe(
          Layer.provideMerge(Connection.layer),
          Layer.provideMerge(testLayer()),
          Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
        ),
      ),
      Effect.scoped,
    );
  },
);

const withReader = <A, E>(
  client: HttpClient.HttpClient,
  run: Effect.Effect<
    A,
    E,
    Connection.SlackConnection | Reader.SlackReader | Store.SlackAccountStore
  >,
) =>
  run.pipe(
    Effect.provide(
      Reader.layer.pipe(
        Layer.provideMerge(Connection.layer),
        Layer.provideMerge(testLayer()),
        Layer.provide(Layer.succeed(HttpClient.HttpClient, client)),
      ),
    ),
    Effect.scoped,
  );

it.effect("requires both read and history grants before a DM history request", () => {
  const calls: URL[] = [];
  const client = HttpClient.make((request, url) =>
    Effect.sync(() => {
      calls.push(url);
      return HttpClientResponse.fromWeb(
        request,
        Response.json(url.pathname.endsWith("auth.test") ? auth : { ok: true, messages: [] }, {
          headers: { "x-oauth-scopes": "channels:read,channels:history,im:history" },
        }),
      );
    }),
  );
  return withReader(
    client,
    Effect.gen(function* () {
      const account = yield* (yield* Connection.SlackConnection).connect({
        token: "synthetic_slack_token",
      });
      const result = yield* (yield* Reader.SlackReader)
        .listMessages({ connectionId: account.id, workspaceId: "T123", conversationId: "D1" })
        .pipe(Effect.flip);
      expect(result.kind).toBe("access-denied");
      expect(calls).toHaveLength(1);
    }),
  );
});

it.effect("orders exact equal-display timestamps and replaces edited duplicate IDs", () => {
  const client = HttpClient.make((request, url) =>
    Effect.sync(() =>
      HttpClientResponse.fromWeb(
        request,
        Response.json(
          url.pathname.endsWith("auth.test")
            ? auth
            : {
                ok: true,
                messages: [
                  { ts: "1760343120.000002", text: "second", reply_count: 0 },
                  { ts: "1760343120.000001", text: "old" },
                  { ts: "1760343120.000001", text: "edited", reply_count: 2 },
                ],
              },
          { headers },
        ),
      ),
    ),
  );
  return withReader(
    client,
    Effect.gen(function* () {
      const account = yield* (yield* Connection.SlackConnection).connect({
        token: "synthetic_slack_token",
      });
      const page = yield* (yield* Reader.SlackReader).listMessages({
        connectionId: account.id,
        workspaceId: "T123",
        conversationId: "C1",
      });
      expect(page.messages.map((row) => [row.id, row.text])).toEqual([
        ["1760343120.000001", "edited"],
        ["1760343120.000002", "second"],
      ]);
      expect(page.messages[0]!.date).toBe(page.messages[1]!.date);
      expect(page.messages[0]).toMatchObject({ threadId: "1760343120.000001", replyCount: 2 });
      expect(page.messages[1]!.replyCount).toBe(0);
    }),
  );
});

it.effect(
  "consumes native page two and replies, rejecting every cursor binding mismatch before HTTP",
  () => {
    const calls: URL[] = [];
    const client = HttpClient.make((request, url) =>
      Effect.sync(() => {
        calls.push(url);
        const second = url.searchParams.get("cursor") === "native_2";
        const list = url.pathname.endsWith("conversations.list");
        const body = url.pathname.endsWith("auth.test")
          ? auth
          : list
            ? {
                ok: true,
                channels: [
                  {
                    id: second ? "C2" : "C1",
                    name: second ? "other" : "marketing",
                    ...(second ? { num_members: 8 } : {}),
                  },
                ],
                ...(second ? {} : { response_metadata: { next_cursor: "native_2" } }),
              }
            : {
                ok: true,
                messages: [
                  {
                    ts: second ? "1760343120.000001" : "1760343120.000002",
                    text: "source text",
                    ...(url.pathname.endsWith("replies") ? { thread_ts: "1760343120.000001" } : {}),
                  },
                ],
                ...(second
                  ? {}
                  : { response_metadata: { next_cursor: "native_2" }, has_more: true }),
              };
        return HttpClientResponse.fromWeb(request, Response.json(body, { headers }));
      }),
    );
    return withReader(
      client,
      Effect.gen(function* () {
        const accounts = yield* Connection.SlackConnection;
        const reader = yield* Reader.SlackReader;
        const account = yield* accounts.connect({ token: "synthetic_slack_token" });
        const list = yield* reader.listConversations({ connectionId: account.id });
        expect(list.conversations[0]!.memberCount).toBeUndefined();
        const list2 = yield* reader.listConversations({
          connectionId: account.id,
          cursor: list.nextCursor!,
        });
        expect(list2.conversations[0]).toMatchObject({
          id: "C2",
          memberCount: { value: 8, complete: true },
        });
        const target = { connectionId: account.id, workspaceId: "T123", conversationId: "C1" };
        const first = yield* reader.listMessages(target);
        expect(first.messages[0]!.replyCount).toBeUndefined();
        const second = yield* reader.listMessages({ ...target, cursor: first.nextCursor! });
        expect(second.messages[0]!.id).toBe("1760343120.000001");
        const replies = yield* reader.listMessages({ ...target, replyRootId: "1760343120.000001" });
        const replies2 = yield* reader.listMessages({
          ...target,
          replyRootId: "1760343120.000001",
          cursor: replies.nextCursor!,
        });
        expect(replies2.messages[0]!.threadId).toBe("1760343120.000001");
        const before = calls.length;
        for (const patch of [
          { provider: "discord" },
          { connectionId: "other" },
          { generation: account.generation + 1 },
          { workspaceId: "T999" },
          { conversationId: "C2" },
          { replyRootId: "1760343120.000001" },
          { direction: "replies" },
          { offset: 100 },
          { native: "x".repeat(2049) },
        ]) {
          const cursor = JSON.stringify({ ...JSON.parse(first.nextCursor!), ...patch });
          expect((yield* reader.listMessages({ ...target, cursor }).pipe(Effect.flip)).kind).toBe(
            "invalid-input",
          );
        }
        expect(
          (yield* reader
            .listMessages({ ...target, conversationId: "C2", cursor: first.nextCursor! })
            .pipe(Effect.flip)).kind,
        ).toBe("invalid-input");
        expect(
          (yield* reader
            .listMessages({
              ...target,
              replyRootId: "1760343120.000002",
              cursor: replies.nextCursor!,
            })
            .pipe(Effect.flip)).kind,
        ).toBe("invalid-input");
        expect(
          (yield* reader
            .listConversations({ connectionId: account.id, cursor: first.nextCursor! })
            .pipe(Effect.flip)).kind,
        ).toBe("invalid-input");
        expect(calls).toHaveLength(before);
        yield* accounts.connect({ token: "replacement_synthetic_token" });
        const afterConnect = calls.length;
        expect(
          (yield* reader.listMessages({ ...target, cursor: first.nextCursor! }).pipe(Effect.flip))
            .kind,
        ).toBe("invalid-input");
        expect(calls).toHaveLength(afterConnect);
        expect(
          calls
            .filter((url) => url.pathname.endsWith("history") || url.pathname.endsWith("replies"))
            .every((url) => url.searchParams.get("limit") === "15"),
        ).toBe(true);
      }),
    );
  },
);

it.effect(
  "lists only approved conversation types and blocks bot channel replies without HTTP",
  () => {
    const calls: URL[] = [];
    const client = HttpClient.make((request, url) =>
      Effect.sync(() => {
        calls.push(url);
        return HttpClientResponse.fromWeb(
          request,
          Response.json(
            url.pathname.endsWith("auth.test")
              ? { ...auth, bot_id: "B1" }
              : {
                  ok: true,
                  channels: [
                    { id: "C1", name: "public" },
                    { id: "D1", user: "U1", is_im: true },
                    { id: "G1", is_mpim: true },
                    { id: "G2", is_private: true },
                  ],
                },
            { headers },
          ),
        );
      }),
    );
    return withReader(
      client,
      Effect.gen(function* () {
        const account = yield* (yield* Connection.SlackConnection).connect({
          token: "synthetic_slack_token",
        });
        const reader = yield* Reader.SlackReader;
        const list = yield* reader.listConversations({ connectionId: account.id });
        expect(calls[1]!.searchParams.get("types")).toBe("public_channel");
        expect(list.conversations.map((row) => row.id)).toEqual(["C1"]);
        expect(list.conversations[0]!.replyRead).toBe(false);
        expect(
          (yield* reader
            .listMessages({
              connectionId: account.id,
              workspaceId: "T123",
              conversationId: "C1",
              replyRootId: "1760343120.000001",
            })
            .pipe(Effect.flip)).kind,
        ).toBe("unsupported");
        expect(calls).toHaveLength(2);
      }),
    );
  },
);

it.effect(
  "uses changed permission metadata and keeps permitted DM and group reads separate",
  () => {
    let scopes = "channels:read,channels:history,im:read,im:history,mpim:read,mpim:history";
    const calls: URL[] = [];
    const client = HttpClient.make((request, url) =>
      Effect.sync(() => {
        calls.push(url);
        const body = url.pathname.endsWith("auth.test")
          ? auth
          : url.pathname.endsWith("conversations.list")
            ? {
                ok: true,
                channels: [
                  { id: "D1", is_im: true },
                  { id: "G1", is_mpim: true },
                ],
              }
            : { ok: true, messages: [] };
        return HttpClientResponse.fromWeb(
          request,
          Response.json(body, { headers: { "x-oauth-scopes": scopes } }),
        );
      }),
    );
    return withReader(
      client,
      Effect.gen(function* () {
        const accounts = yield* Connection.SlackConnection;
        const reader = yield* Reader.SlackReader;
        const account = yield* accounts.connect({ token: "synthetic_slack_token" });
        yield* reader.listConversations({ connectionId: account.id });
        for (const conversationId of ["D1", "G1"])
          yield* reader.listMessages({
            connectionId: account.id,
            workspaceId: "T123",
            conversationId,
            replyRootId: "1760343120.000001",
          });
        scopes = "channels:read,channels:history";
        yield* accounts.connect({ token: "replacement_synthetic_token" });
        const before = calls.length;
        for (const conversationId of ["D1", "G1"])
          expect(
            (yield* reader
              .listMessages({ connectionId: account.id, workspaceId: "T123", conversationId })
              .pipe(Effect.flip)).kind,
          ).toBe("access-denied");
        expect(calls).toHaveLength(before);
      }),
    );
  },
);

it.effect.each([
  [401, "access-denied"],
  [403, "access-denied"],
  [404, "not-found"],
] as const)("maps HTTP %s safely without retries", ([status, kind]) => {
  let reads = 0;
  const client = HttpClient.make((request, url) =>
    Effect.sync(() =>
      HttpClientResponse.fromWeb(
        request,
        url.pathname.endsWith("auth.test")
          ? Response.json(auth, { headers })
          : (reads++, new Response("synthetic_secret_must_not_escape", { status })),
      ),
    ),
  );
  return withReader(
    client,
    Effect.gen(function* () {
      const account = yield* (yield* Connection.SlackConnection).connect({
        token: "synthetic_slack_token",
      });
      const failure = yield* (yield* Reader.SlackReader)
        .listMessages({ connectionId: account.id, workspaceId: "T123", conversationId: "C1" })
        .pipe(Effect.flip);
      expect(failure.kind).toBe(kind);
      expect(JSON.stringify(failure)).not.toContain("synthetic_secret");
      yield* TestClock.adjust("1 hour");
      expect(reads).toBe(1);
    }),
  );
});

it.effect("enforces a Clock deadline before HTTP and retries only on a new explicit read", () => {
  let reads = 0;
  const client = HttpClient.make((request, url) =>
    Effect.sync(() =>
      HttpClientResponse.fromWeb(
        request,
        url.pathname.endsWith("auth.test")
          ? Response.json(auth, { headers })
          : ++reads === 1
            ? new Response("", { status: 429, headers: { "retry-after": "30" } })
            : Response.json({ ok: true, messages: [] }),
      ),
    ),
  );
  return withReader(
    client,
    Effect.gen(function* () {
      const account = yield* (yield* Connection.SlackConnection).connect({
        token: "synthetic_slack_token",
      });
      const reader = yield* Reader.SlackReader;
      const target = { connectionId: account.id, workspaceId: "T123", conversationId: "C1" };
      expect((yield* reader.listMessages(target).pipe(Effect.flip)).retryAfterSeconds).toBe(30);
      yield* TestClock.adjust("10 seconds");
      expect(
        (yield* reader.listMessages({ ...target, conversationId: "C2" }).pipe(Effect.flip))
          .retryAfterSeconds,
      ).toBe(20);
      expect(reads).toBe(1);
      yield* TestClock.adjust("1 hour");
      expect(reads).toBe(1);
      expect((yield* reader.listMessages(target)).messages).toEqual([]);
      expect(reads).toBe(2);
    }),
  );
});

it.effect.each([
  "invalid json",
  JSON.stringify({ ok: true, messages: [{ ts: "1e10", text: "bad" }] }),
  JSON.stringify({
    ok: true,
    messages: Array.from({ length: 101 }, () => ({ ts: "1760343120.000001" })),
  }),
  "x".repeat(1_000_001),
])("rejects malformed or oversized provider response %#", (bad) => {
  const client = HttpClient.make((request, url) =>
    Effect.sync(() =>
      HttpClientResponse.fromWeb(
        request,
        url.pathname.endsWith("auth.test") ? Response.json(auth, { headers }) : new Response(bad),
      ),
    ),
  );
  return withReader(
    client,
    Effect.gen(function* () {
      const account = yield* (yield* Connection.SlackConnection).connect({
        token: "synthetic_slack_token",
      });
      const result = yield* (yield* Reader.SlackReader)
        .listMessages({ connectionId: account.id, workspaceId: "T123", conversationId: "C1" })
        .pipe(Effect.flip);
      expect(result.kind).toBe("unavailable");
    }),
  );
});

it.effect("returns UTF-8 bounded pages with explicit clipping and recoverable continuation", () => {
  const rows = Array.from({ length: 15 }, (_, i) => ({
    ts: `1760343120.${String(i).padStart(6, "0")}`,
    text: '😀\\"'.repeat(i === 0 ? 20000 : 2000),
  }));
  const client = HttpClient.make((request, url) =>
    Effect.sync(() =>
      HttpClientResponse.fromWeb(
        request,
        Response.json(
          url.pathname.endsWith("auth.test")
            ? auth
            : url.pathname.endsWith("conversations.list")
              ? {
                  ok: true,
                  channels: Array.from({ length: 100 }, (_, i) => ({
                    id: `C${i}`,
                    name: "😀".repeat(1000),
                  })),
                }
              : { ok: true, messages: rows },
          { headers },
        ),
      ),
    ),
  );
  return withReader(
    client,
    Effect.gen(function* () {
      const account = yield* (yield* Connection.SlackConnection).connect({
        token: "synthetic_slack_token",
      });
      const reader = yield* Reader.SlackReader;
      let cursor: string | undefined;
      const ids: string[] = [];
      do {
        const page = yield* reader.listMessages({
          connectionId: account.id,
          workspaceId: "T123",
          conversationId: "C1",
          ...(cursor ? { cursor } : {}),
        });
        expect(new TextEncoder().encode(JSON.stringify(page)).length).toBeLessThanOrEqual(32000);
        expect(isMessagePage(page)).toBe(true);
        expect(page.messages.length).toBeGreaterThan(0);
        if (!ids.length) expect(page.messages[0]!.textTruncated).toBe(true);
        ids.push(...page.messages.map((row) => row.id));
        cursor = page.nextCursor;
      } while (cursor);
      expect(new Set(ids).size).toBe(15);
      let listCursor: string | undefined;
      const channelIds: string[] = [];
      do {
        const page = yield* reader.listConversations({
          connectionId: account.id,
          ...(listCursor ? { cursor: listCursor } : {}),
        });
        expect(isConversationPage(page)).toBe(true);
        expect(new TextEncoder().encode(JSON.stringify(page)).length).toBeLessThanOrEqual(32000);
        channelIds.push(...page.conversations.map((row) => row.id));
        listCursor = page.nextCursor;
      } while (listCursor);
      expect(new Set(channelIds).size).toBe(100);
    }),
  );
});

it.effect.each(["list", "history", "replies"] as const)(
  "aborts held %s HTTP on disconnect and rejects the old generation",
  (operation) => {
    return Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const aborted = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      let held = true;
      let reads = 0;
      const client = HttpClient.make((request, url, signal) =>
        url.pathname.endsWith("auth.test")
          ? Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(auth, { headers })))
          : Effect.gen(function* () {
              reads++;
              if (held) {
                signal.addEventListener(
                  "abort",
                  () => {
                    Deferred.doneUnsafe(aborted, Effect.void);
                  },
                  { once: true },
                );
                yield* Deferred.succeed(entered, undefined);
                yield* Deferred.await(release);
              }
              return HttpClientResponse.fromWeb(
                request,
                Response.json(
                  operation === "list"
                    ? { ok: true, channels: [] }
                    : { ok: true, messages: [{ ts: "1760343120.000001", text: "late" }] },
                ),
              );
            }),
      );
      yield* withReader(
        client,
        Effect.gen(function* () {
          const accounts = yield* Connection.SlackConnection;
          const reader = yield* Reader.SlackReader;
          const account = yield* accounts.connect({ token: "synthetic_slack_token" });
          const input = {
            connectionId: account.id,
            workspaceId: "T123",
            conversationId: "C1",
            ...(operation === "replies" ? { replyRootId: "1760343120.000001" } : {}),
          };
          const read =
            operation === "list"
              ? reader.listConversations(input).pipe(Effect.asVoid)
              : reader.listMessages(input).pipe(Effect.asVoid);
          const fiber = yield* read.pipe(Effect.forkChild);
          yield* Deferred.await(entered);
          yield* accounts.disconnect({ connectionId: account.id });
          expect((yield* Fiber.join(fiber).pipe(Effect.flip)).kind).toBe("not-found");
          yield* Deferred.await(aborted);
          yield* Deferred.succeed(release, undefined);
          expect((yield* read.pipe(Effect.flip)).kind).toBe("not-found");
          expect(reads).toBe(1);
          held = false;
          yield* accounts.connect({ token: "replacement_synthetic_token" });
          yield* read;
          expect(reads).toBe(2);
        }),
      );
    });
  },
);

it.effect("scope cancellation aborts held HTTP and releases the endpoint lane", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const aborted = yield* Deferred.make<void>();
    let held = true;
    const client = HttpClient.make((request, url, signal) =>
      url.pathname.endsWith("auth.test")
        ? Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(auth, { headers })))
        : Effect.gen(function* () {
            if (held) {
              signal.addEventListener(
                "abort",
                () => {
                  Deferred.doneUnsafe(aborted, Effect.void);
                },
                { once: true },
              );
              yield* Deferred.succeed(entered, undefined);
              return yield* Effect.never;
            }
            return HttpClientResponse.fromWeb(request, Response.json({ ok: true, messages: [] }));
          }),
    );
    yield* withReader(
      client,
      Effect.gen(function* () {
        const account = yield* (yield* Connection.SlackConnection).connect({
          token: "synthetic_slack_token",
        });
        const reader = yield* Reader.SlackReader;
        const target = { connectionId: account.id, workspaceId: "T123", conversationId: "C1" };
        yield* Effect.scoped(
          Effect.gen(function* () {
            yield* reader.listMessages(target).pipe(Effect.forkScoped);
            yield* Deferred.await(entered);
          }),
        );
        yield* Deferred.await(aborted);
        held = false;
        expect((yield* reader.listMessages(target)).messages).toEqual([]);
      }),
    );
  }),
);

it.effect("shares one pending endpoint across two clients and refuses an overlapping page", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const release = yield* Deferred.make<void>();
    let reads = 0;
    const client = HttpClient.make((request, url) =>
      url.pathname.endsWith("auth.test")
        ? Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(auth, { headers })))
        : Effect.gen(function* () {
            reads++;
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);
            return HttpClientResponse.fromWeb(
              request,
              Response.json({ ok: true, messages: [{ ts: "1760343120.000001", text: "shared" }] }),
            );
          }),
    );
    yield* withReader(
      client,
      Effect.gen(function* () {
        const accounts = yield* Connection.SlackConnection;
        const account = yield* accounts.connect({ token: "synthetic_slack_token" });
        const reader = yield* Reader.SlackReader;
        const target = { connectionId: account.id, workspaceId: "T123", conversationId: "C1" };
        const first = yield* reader.listMessages(target).pipe(Effect.forkChild);
        yield* Deferred.await(entered);
        const second = yield* reader
          .listMessages(target)
          .pipe(Effect.forkChild({ startImmediately: true }));
        // The differing-page call passes the same real authorization path behind client two.
        const cursor = JSON.stringify({
          version: 1,
          provider: "slack",
          connectionId: account.id,
          generation: account.generation,
          workspaceId: "T123",
          conversationId: "C1",
          replyRootId: null,
          direction: "older",
          native: "page2",
          offset: 0,
        });
        expect((yield* reader.listMessages({ ...target, cursor }).pipe(Effect.flip)).kind).toBe(
          "unavailable",
        );
        expect(reads).toBe(1);
        yield* Deferred.succeed(release, undefined);
        const [a, b] = yield* Effect.all([Fiber.join(first), Fiber.join(second)]);
        expect(a).toEqual(b);
        expect(a.messages[0]!.text).toBe("shared");
        expect(reads).toBe(1);
      }),
    );
  }),
);

it.effect(
  "final persisted lease check rejects content after generation changes without cancellation",
  () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const client = HttpClient.make((request, url) =>
        url.pathname.endsWith("auth.test")
          ? Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(auth, { headers })))
          : Effect.gen(function* () {
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(release);
              return HttpClientResponse.fromWeb(
                request,
                Response.json({
                  ok: true,
                  messages: [{ ts: "1760343120.000001", text: "must not escape" }],
                }),
              );
            }),
      );
      yield* withReader(
        client,
        Effect.gen(function* () {
          const account = yield* (yield* Connection.SlackConnection).connect({
            token: "synthetic_slack_token",
          });
          const store = yield* Store.SlackAccountStore;
          const row = (yield* store.get(account.id))!;
          const read = yield* (yield* Reader.SlackReader)
            .listMessages({ connectionId: account.id, workspaceId: "T123", conversationId: "C1" })
            .pipe(Effect.forkChild);
          yield* Deferred.await(entered);
          yield* store.save({ ...row, generation: row.generation + 1 });
          yield* Deferred.succeed(release, undefined);
          expect((yield* Fiber.join(read).pipe(Effect.flip)).kind).toBe("not-found");
        }),
      );
    }),
);
