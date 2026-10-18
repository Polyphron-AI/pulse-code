import { expect, it } from "@effect/vitest";
import {
  type AuthEnvironmentScope,
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  PulseWorkspaceSavedItemsRpcs,
  RpcScopeAuthorization,
  chatResourceId,
  type WorkspaceItemRef,
  workspaceItemKey,
  WS_METHODS,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import * as TestClock from "effect/testing/TestClock";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { RpcGroup, RpcTest } from "effect/unstable/rpc";
import { rpcScopeAuthorizationLayer } from "../auth/RpcAuthorization.ts";
import { runMigrations } from "../persistence/Migrations.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as Saved from "./WorkspaceSavedItems.ts";

it.effect("saves one stable Mail ref and removes an unavailable original", () =>
  Effect.gen(function* () {
    const saved = yield* Saved.WorkspaceSavedItems;
    const ref = { type: "mail" as const, accountId: "acct_a", messageId: "<m@test>" };
    yield* saved.add(ref);
    yield* saved.add({
      ...ref,
      location: { accountId: "acct_a", mailbox: "Archive", uidValidity: 2, uid: 3 },
    });
    const page = yield* saved.list({ limit: 100 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.key).toBe(workspaceItemKey(ref));
    yield* saved.remove(page.items[0]!.key);
    yield* saved.remove(page.items[0]!.key);
    expect((yield* saved.list({ limit: 100 })).items).toEqual([]);
  }).pipe(Effect.provide(Saved.layer.pipe(Layer.provide(SqlitePersistenceMemory)))),
);

const testLayer = Saved.layer.pipe(Layer.provideMerge(SqlitePersistenceMemory));
const Json = Schema.fromJsonString(Schema.Unknown);
const encodeJson = Schema.encodeSync(Json);
const encodeJsonEffect = Schema.encodeEffect(Json);
const mail = (accountId = "acct_a", messageId = "<m@test>"): WorkspaceItemRef => ({
  type: "mail",
  accountId,
  messageId,
});

it.effect("normalizes refs and updates a moved Mail hint without changing saved order", () =>
  Effect.gen(function* () {
    const saved = yield* Saved.WorkspaceSavedItems;
    const ref = mail();
    yield* saved.add(ref);
    const original = (yield* saved.list({})).items[0]!;
    yield* TestClock.adjust("1 second");
    yield* saved.add({ type: "url", url: "https://a.test/?utm_source=x#top" });
    const moved = {
      ...ref,
      location: { accountId: "acct_a", mailbox: "Archive", uidValidity: 2, uid: 9 },
    };
    const revision = Option.getOrThrow(yield* Stream.runHead(saved.changes));
    yield* saved.add(moved);
    expect(Option.getOrThrow(yield* Stream.runHead(saved.changes))).toBe(revision + 1);
    yield* saved.add(ref);
    expect(Option.getOrThrow(yield* Stream.runHead(saved.changes))).toBe(revision + 1);
    expect((yield* saved.list({})).items).toEqual([
      expect.objectContaining({ ref: { type: "url", url: "https://a.test/" } }),
      { ...original, ref: moved },
    ]);
  }).pipe(Effect.provide(testLayer)),
);

it.effect(
  "keeps account, provider, connection, workspace and exact message identities distinct",
  () =>
    Effect.gen(function* () {
      const saved = yield* Saved.WorkspaceSavedItems;
      const chat = (
        provider: string,
        connectionId = "a",
        workspaceId = "w",
        messageId = "1.000001",
      ): WorkspaceItemRef => ({
        type: "provider-resource",
        provider,
        resourceId: chatResourceId({
          version: 1,
          transport: "server",
          connectionId,
          workspaceId,
          conversationId: "c",
          messageId,
        }),
      });
      const refs = [
        mail(),
        mail("acct_b"),
        chat("slack"),
        chat("discord"),
        chat("slack", "b"),
        chat("slack", "a", "other"),
        chat("slack", "a", "w", "1.000002"),
      ];
      for (const ref of refs) yield* saved.add(ref);
      expect(new Set((yield* saved.list({})).items.map((row) => row.key))).toEqual(
        new Set(refs.map(workspaceItemKey)),
      );
    }).pipe(Effect.provide(testLayer)),
);

it.effect("retains location-only warning identity even when a different location is saved", () =>
  Effect.gen(function* () {
    const saved = yield* Saved.WorkspaceSavedItems;
    const location = { accountId: "acct_a", mailbox: "INBOX", uidValidity: 1, uid: 1 };
    const fragile = { type: "mail", accountId: "acct_a", location } as const;
    yield* saved.add(fragile);
    yield* saved.add({ ...fragile, location: { ...location, mailbox: "Archive" } });
    const items = (yield* saved.list({})).items;
    expect(items).toHaveLength(2);
    expect(
      items.every(
        (item) =>
          item.key.startsWith("mail-location:") &&
          item.ref.type === "mail" &&
          item.ref.messageId === undefined,
      ),
    ).toBe(true);
  }).pipe(Effect.provide(testLayer)),
);

it.effect("paginates equal timestamps by key and rejects malformed cursors and page limits", () =>
  Effect.gen(function* () {
    const saved = yield* Saved.WorkspaceSavedItems;
    for (let n = 0; n < 205; n++)
      yield* saved.add({ type: "task", taskId: `task-${String(n).padStart(3, "0")}` });
    const small = yield* saved.list({ limit: 2 });
    expect(small.items).toHaveLength(2);
    expect(small.nextCursor).toBeDefined();
    const first = yield* saved.list({});
    expect(first.items).toHaveLength(100);
    const second = yield* saved.list({ cursor: first.nextCursor! });
    expect(second.items).toHaveLength(100);
    const third = yield* saved.list({ cursor: second.nextCursor! });
    expect(third.items).toHaveLength(5);
    expect(third.nextCursor).toBeUndefined();
    const keys = [...first.items, ...second.items, ...third.items].map((item) => item.key);
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(205);
    const encode = (value: unknown) => Buffer.from(encodeJson(value)).toString("base64url");
    for (const input of [
      { limit: 101 },
      { limit: 0 },
      { cursor: "bad!" },
      { cursor: encode({ version: 1, savedAt: "invalid", key: "task:a" }) },
      { cursor: encode({ version: 1, savedAt: "2026-99-99T00:00:00.000Z", key: "task:a" }) },
      { cursor: encode({ version: 2, savedAt: first.items[0]!.savedAt, key: "task:a" }) },
    ]) {
      expect((yield* Effect.flip(saved.list(input))).kind).toBe("invalid-input");
    }
  }).pipe(Effect.provide(testLayer)),
);

it.effect("enforces the 500-item cap under concurrent adds and admits duplicates at capacity", () =>
  Effect.gen(function* () {
    const saved = yield* Saved.WorkspaceSavedItems;
    for (let n = 0; n < 499; n++) yield* saved.add({ type: "task", taskId: `task-${n}` });
    const results = yield* Effect.all(
      [saved.add(mail()), saved.add(mail("acct_b"))].map(Effect.result),
      { concurrency: "unbounded" },
    );
    expect(results.filter((r) => r._tag === "Success")).toHaveLength(1);
    expect(results.filter((r) => r._tag === "Failure")).toEqual([
      expect.objectContaining({ failure: expect.objectContaining({ kind: "limit" }) }),
    ]);
    yield* saved.add({ type: "task", taskId: "task-0" });
    yield* saved.remove("task:task-0");
    yield* saved.add({ type: "task", taskId: "replacement" });
    const sql = yield* SqlClient.SqlClient;
    expect(yield* sql`SELECT COUNT(*) AS count FROM workspace_saved_items`).toEqual([
      { count: 500 },
    ]);
  }).pipe(Effect.provide(testLayer)),
);

it.effect(
  "announces committed changes, replays on reconnect and stays silent on failed or repeated writes",
  () =>
    Effect.gen(function* () {
      const saved = yield* Saved.WorkspaceSavedItems;
      const sql = yield* SqlClient.SqlClient;
      const initial = yield* Deferred.make<void>();
      const added = yield* Deferred.make<void>();
      const observed: number[] = [];
      const waiting = yield* saved.changes.pipe(
        Stream.tap((n) =>
          Effect.gen(function* () {
            const rows = yield* sql`SELECT item_key FROM workspace_saved_items`;
            expect(rows.length).toBe(n === 1 ? 1 : 0);
            observed.push(n);
            if (n === 0) yield* Deferred.succeed(initial, undefined);
            if (n === 1) yield* Deferred.succeed(added, undefined);
          }),
        ),
        Stream.take(3),
        Stream.runDrain,
        Effect.forkScoped({ startImmediately: true }),
      );
      yield* Deferred.await(initial);
      yield* saved.add(mail());
      yield* Deferred.await(added);
      yield* saved.add(mail());
      yield* saved.remove(workspaceItemKey(mail()));
      yield* saved.remove(workspaceItemKey(mail()));
      yield* Fiber.join(waiting);
      expect(observed).toEqual([0, 1, 2]);
      expect(Option.getOrThrow(yield* Stream.runHead(saved.changes))).toBe(2);
      yield* sql`CREATE TRIGGER refuse_save BEFORE INSERT ON workspace_saved_items BEGIN SELECT RAISE(ABORT, 'private provider token'); END`;
      const logs: unknown[] = [];
      const logger = Logger.make(({ message }) => {
        logs.push(message);
      });
      const failed = yield* Effect.flip(saved.add(mail())).pipe(
        Effect.provide(Logger.layer([logger], { mergeWithExisting: false })),
      );
      expect(logs).toEqual([["Saved items operation failed.", expect.anything()]]);
      expect(failed.kind).toBe("unavailable");
      expect(yield* encodeJsonEffect(failed)).not.toContain("private provider token");
      expect(Option.getOrThrow(yield* Stream.runHead(saved.changes))).toBe(2);
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
);

it.effect("rejects invalid refs and maps store failures to safe typed errors", () =>
  Effect.gen(function* () {
    const saved = yield* Saved.WorkspaceSavedItems;
    expect((yield* Effect.flip(saved.add({ type: "url", url: "file:///secret" }))).kind).toBe(
      "invalid-input",
    );
    expect(
      (yield* Effect.flip(
        saved.add({
          type: "mail",
          accountId: "acct_a",
          location: { accountId: "other", mailbox: "INBOX", uidValidity: 1, uid: 1 },
        }),
      )).kind,
    ).toBe("invalid-input");
    for (const key of ["", "task:bad\nkey", "task:" + "x".repeat(16_400)]) {
      expect((yield* Effect.flip(saved.remove(key))).kind).toBe("invalid-input");
    }
    expect((yield* Effect.flip(saved.add({ type: "task", taskId: "\ud800" }))).kind).toBe(
      "invalid-input",
    );
    const sql = yield* SqlClient.SqlClient;
    yield* sql`DROP TABLE workspace_saved_items`;
    for (const effect of [saved.add(mail()), saved.remove("task:missing"), saved.list({})]) {
      const error = yield* Effect.flip(effect);
      expect(error.kind).toBe("unavailable");
      expect(yield* encodeJsonEffect(error)).not.toContain("ref_json");
    }
  }).pipe(Effect.provide(testLayer)),
);

it.effect("skips unreadable rows and advances cursors past raw page tails", () =>
  Effect.gen(function* () {
    const saved = yield* Saved.WorkspaceSavedItems;
    const sql = yield* SqlClient.SqlClient;
    for (const taskId of ["a", "z"]) yield* saved.add({ type: "task", taskId });
    const timestamp = (yield* saved.list({})).items[0]!.savedAt;
    const invalid = [
      ["task:b", encodeJson({ type: "task", taskId: "actual", body: "private body" })],
      ["task:c", encodeJson({ type: "future", body: "private body" })],
      ["task:d", encodeJson({ type: "task", taskId: "\ud800" })],
      ["task:e", "invalid json"],
    ];
    for (const [key, json] of invalid)
      yield* sql`INSERT INTO workspace_saved_items VALUES(${key}, ${json}, ${timestamp})`;
    const logs: unknown[] = [];
    const logger = Logger.make(({ message }) => {
      logs.push(message);
    });
    const page = yield* saved
      .list({})
      .pipe(Effect.provide(Logger.layer([logger], { mergeWithExisting: false })));
    expect(page.items.map((item) => item.key)).toEqual(["task:a", "task:z"]);
    expect(logs).toEqual(
      invalid.map(([key]) => [
        "Skipping a saved item row that could not be read.",
        { itemKey: key },
      ]),
    );
    const first = yield* saved.list({ limit: 2 });
    expect(first.items.map((item) => item.key)).toEqual(["task:a"]);
    const decodeCursor = (cursor: string) =>
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    expect(decodeCursor(first.nextCursor!).key).toBe("task:b");
    const second = yield* saved.list({ cursor: first.nextCursor!, limit: 2 });
    expect(second.items).toEqual([]);
    expect(decodeCursor(second.nextCursor!).key).toBe("task:d");
    const third = yield* saved.list({ cursor: second.nextCursor!, limit: 2 });
    expect(third.items.map((item) => item.key)).toEqual(["task:z"]);
    expect(third.nextCursor).toBeUndefined();
    yield* saved.remove("task:b");
  }).pipe(Effect.provide(testLayer)),
);

it.effect("persists only the normalized ref", () =>
  Effect.gen(function* () {
    const saved = yield* Saved.WorkspaceSavedItems;
    const sql = yield* SqlClient.SqlClient;
    yield* saved.add({
      ...mail(),
      body: "private body",
      readGrant: true,
      snoozeUntil: "x",
    } as never);
    yield* saved.add({ type: "url", url: "https://a.test/?utm_source=x#top" });
    const rows = yield* sql<{
      ref_json: string;
    }>`SELECT ref_json FROM workspace_saved_items ORDER BY item_key`;
    expect(rows.map((row) => JSON.parse(row.ref_json))).toEqual([
      { type: "mail", accountId: "acct_a", messageId: "<m@test>" },
      { type: "url", url: "https://a.test/" },
    ]);
  }).pipe(Effect.provide(testLayer)),
);

it.effect("pages newest first across timestamps and stays stable while items change", () =>
  Effect.gen(function* () {
    const saved = yield* Saved.WorkspaceSavedItems;
    for (let n = 0; n < 150; n++) {
      yield* saved.add({ type: "task", taskId: `t-${String(n).padStart(3, "0")}` });
      if (n % 2 === 1) yield* TestClock.adjust("1 millis");
    }
    const first = yield* saved.list({ limit: 50 });
    expect(first.items[0]!.key).toBe("task:t-148");
    yield* Effect.all(
      [saved.add({ type: "task", taskId: "newer" }), saved.remove(first.items.at(-1)!.key)],
      { concurrency: "unbounded" },
    );
    const rest: string[] = [];
    let cursor = first.nextCursor;
    while (cursor !== undefined) {
      const page = yield* saved.list({ cursor, limit: 50 });
      rest.push(...page.items.map((item) => item.key));
      cursor = page.nextCursor;
    }
    const seen = [...first.items.map((item) => item.key), ...rest];
    const expected = Array.from({ length: 75 }, (_, group) => 74 - group)
      .flatMap((group) => [group * 2, group * 2 + 1])
      .map((n) => `task:t-${String(n).padStart(3, "0")}`);
    expect(seen).toEqual(expected);
    expect(new Set(seen).size).toBe(150);
    expect(seen).not.toContain("task:newer");
  }).pipe(Effect.provide(testLayer)),
);

it.effect("reloads refs after restart", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: "saved-items-" });
    const storage = NodeSqliteClient.layer({ filename: path.join(dir, "state.sqlite") });
    const run = <A, E>(effect: Effect.Effect<A, E, Saved.WorkspaceSavedItems>) =>
      effect.pipe(Effect.provide(Saved.layer.pipe(Layer.provide(storage))));
    yield* runMigrations().pipe(Effect.provide(storage));
    yield* run(Effect.flatMap(Saved.WorkspaceSavedItems, (saved) => saved.add(mail())));
    const first = yield* run(Effect.flatMap(Saved.WorkspaceSavedItems, (saved) => saved.list({})));
    expect(first.items.map((item) => item.key)).toEqual([workspaceItemKey(mail())]);
    yield* run(
      Effect.flatMap(Saved.WorkspaceSavedItems, (saved) => saved.remove(workspaceItemKey(mail()))),
    );
    expect(
      yield* run(Effect.flatMap(Saved.WorkspaceSavedItems, (saved) => saved.list({}))),
    ).toEqual({ items: [] });
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
);

it.effect(
  "authorizes reads and committed changes separately from add/remove through RPC middleware",
  () =>
    Effect.gen(function* () {
      const saved = yield* Saved.WorkspaceSavedItems;
      const group = RpcGroup.make(...PulseWorkspaceSavedItemsRpcs).middleware(
        RpcScopeAuthorization,
      );
      const handlers = group.toLayer({
        [WS_METHODS.workspaceSavedItemsAdd]: ({ ref }) => saved.add(ref),
        [WS_METHODS.workspaceSavedItemsRemove]: ({ key }) => saved.remove(key),
        [WS_METHODS.workspaceSavedItemsList]: saved.list,
        [WS_METHODS.workspaceSavedItemsSubscribeChanges]: () => saved.changes,
      });
      const scopeSets: AuthEnvironmentScope[][] = [
        [],
        [AuthOrchestrationReadScope],
        [AuthOrchestrationOperateScope],
      ];
      for (const scopes of scopeSets) {
        const client = yield* RpcTest.makeClient(group).pipe(
          Effect.provide(Layer.merge(handlers, rpcScopeAuthorizationLayer(scopes))),
        );
        const add = client[WS_METHODS.workspaceSavedItemsAdd]({ ref: mail() });
        const remove = client[WS_METHODS.workspaceSavedItemsRemove]({
          key: workspaceItemKey(mail()),
        });
        if (scopes.includes(AuthOrchestrationOperateScope)) {
          yield* add;
          yield* remove;
        } else {
          expect(yield* Effect.flip(add)).toMatchObject({
            requiredScope: AuthOrchestrationOperateScope,
          });
          expect(yield* Effect.flip(remove)).toMatchObject({
            requiredScope: AuthOrchestrationOperateScope,
          });
        }
        const list = client[WS_METHODS.workspaceSavedItemsList]({});
        const changes = Stream.runHead(client[WS_METHODS.workspaceSavedItemsSubscribeChanges]({}));
        if (scopes.includes(AuthOrchestrationReadScope)) {
          expect(yield* list).toEqual({ items: [] });
          expect(Option.isSome(yield* changes)).toBe(true);
        } else {
          expect(yield* Effect.flip(list)).toMatchObject({
            requiredScope: AuthOrchestrationReadScope,
          });
          expect(yield* Effect.flip(changes)).toMatchObject({
            requiredScope: AuthOrchestrationReadScope,
          });
        }
      }
    }).pipe(Effect.scoped, Effect.provide(testLayer)),
);
