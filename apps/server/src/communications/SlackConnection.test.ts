// @effect-diagnostics preferSchemaOverJson:off -- Inspect serialized public results and failures for credential leaks.
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { CommunicationsError } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, FileSystem, Layer, Logger, Option, Path, Redacted } from "effect";
import * as TestClock from "effect/testing/TestClock";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { HttpClient, HttpClientError, HttpClientResponse } from "effect/unstable/http";
import * as ServerConfig from "../config.ts";
import * as Secrets from "../auth/ServerSecretStore.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as SlackStore from "./SlackAccountStore.ts";
import * as Slack from "./SlackConnection.ts";
import { runMigrations } from "../persistence/Migrations.ts";

const token = "synthetic_slack_token";
const auth = { ok: true, team_id: "T123", team: "Review team", user_id: "U123", user: "Asha" };
const headers = { "x-oauth-scopes": "channels:read,channels:history" };
const fixture = (respond: (index: number) => Response = () => Response.json(auth, { headers })) => {
  const calls: { method: string; url: string }[] = [];
  const client = HttpClient.make((request, url) =>
    Effect.sync(() => {
      calls.push({ method: request.method, url: url.toString() });
      expect(request.headers.authorization).toBeDefined();
      return HttpClientResponse.fromWeb(request, respond(calls.length));
    }),
  );
  return { calls, client };
};
const rows = Effect.flatMap(SqlClient.SqlClient, (sql) => sql`SELECT * FROM slack_connections`);
const safeError = (error: CommunicationsError) => {
  expect(JSON.stringify(error)).not.toContain(token);
  expect(String(error)).not.toContain(token);
  expect(error).not.toHaveProperty("cause");
};

const testLayer = () =>
  Layer.mergeAll(
    SlackStore.layer.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    Secrets.layer.pipe(
      Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "slack-connection-test-" })),
    ),
  ).pipe(Layer.provideMerge(NodeServices.layer));

it.effect("persists identity, redacts secrets and disconnects after restart", () => {
  const calls: string[] = [];
  const client = HttpClient.make((request, url) =>
    Effect.sync(() => {
      calls.push(url.pathname);
      return HttpClientResponse.fromWeb(
        request,
        Response.json(
          { ok: true, team_id: "T123", team: "Review team", user_id: "U123", user: "Asha" },
          { headers: { "x-oauth-scopes": "channels:read,channels:history" } },
        ),
      );
    }),
  );
  return Effect.gen(function* () {
    const first = yield* Slack.make;
    const account = yield* first.connect({ token: "synthetic_slack_token" });
    expect(account.provider).toBe("slack");
    expect(JSON.stringify(account)).not.toContain("synthetic_slack_token");
    const restarted = yield* Slack.make;
    expect((yield* restarted.list)[0]!.id).toBe(account.id);
    yield* restarted.disconnect({ connectionId: account.id });
    expect((yield* restarted.list)[0]!.connected).toBe(false);
    expect(calls).toEqual(["/api/auth.test"]);
  }).pipe(Effect.provide(testLayer()), Effect.provideService(HttpClient.HttpClient, client));
});

it.effect.each(["", " ", "bad\nheader", "x".repeat(4097)])(
  "rejects invalid token input before HTTP or storage: %s",
  (value) => {
    const fake = fixture();
    return Effect.gen(function* () {
      const service = yield* Slack.make;
      expect((yield* service.connect({ token: value }).pipe(Effect.flip)).kind).toBe(
        "invalid-input",
      );
      expect(yield* rows).toEqual([]);
      expect(fake.calls).toEqual([]);
    }).pipe(Effect.provide(testLayer()), Effect.provideService(HttpClient.HttpClient, fake.client));
  },
);

it.effect.each([
  { name: "401", response: () => Response.json({ token }, { status: 401 }), kind: "access-denied" },
  { name: "403", response: () => Response.json({ token }, { status: 403 }), kind: "access-denied" },
  {
    name: "revoked",
    response: () => Response.json({ ok: false, error: "token_revoked" }),
    kind: "access-denied",
  },
  {
    name: "provider error",
    response: () => Response.json({ ok: false, error: token }),
    kind: "unavailable",
  },
  {
    name: "provider rate limit",
    response: () =>
      Response.json({ ok: false, error: "ratelimited" }, { headers: { "retry-after": "12" } }),
    kind: "rate-limit",
  },
  {
    name: "provider missing scope",
    response: () => Response.json({ ok: false, error: "missing_scope" }),
    kind: "access-denied",
  },
  {
    name: "missing identity",
    response: () => Response.json({ ok: true }, { headers }),
    kind: "unavailable",
  },
  { name: "malformed JSON", response: () => new Response(token), kind: "unavailable" },
  {
    name: "oversized response",
    response: () => Response.json({ ...auth, extra: token.repeat(3000) }, { headers }),
    kind: "unavailable",
  },
  { name: "missing scope header", response: () => Response.json(auth), kind: "access-denied" },
  {
    name: "missing history scope",
    response: () =>
      Response.json(auth, { headers: { "x-oauth-scopes": "channels:read,chat:write" } }),
    kind: "access-denied",
  },
  {
    name: "mismatched scopes",
    response: () =>
      Response.json(auth, { headers: { "x-oauth-scopes": "channels:read,groups:history" } }),
    kind: "access-denied",
  },
  {
    name: "oversized scope header",
    response: () =>
      Response.json(auth, { headers: { "x-oauth-scopes": "channels:read,".repeat(400) } }),
    kind: "access-denied",
  },
  {
    name: "credential in metadata",
    response: () => Response.json({ ...auth, user: token }, { headers }),
    kind: "unavailable",
  },
  {
    name: "unsafe provider identity",
    response: () => Response.json({ ...auth, team_id: "../outside" }, { headers }),
    kind: "unavailable",
  },
  {
    name: "redirect",
    response: () =>
      new Response(null, { status: 302, headers: { location: "https://other.test" } }),
    kind: "unavailable",
  },
])("rejects $name with no persisted credential or raw error", ({ response, kind }) => {
  const fake = fixture(response);
  const logs: string[] = [];
  return Effect.gen(function* () {
    const service = yield* Slack.make;
    const error = yield* service.connect({ token }).pipe(Effect.flip);
    expect(error.kind).toBe(kind);
    safeError(error);
    expect(yield* rows).toEqual([]);
    const secrets = yield* Secrets.ServerSecretStore;
    const fs = yield* FileSystem.FileSystem;
    expect(yield* fs.readDirectory(secrets.directory!)).toEqual([]);
    expect(fake.calls).toEqual([{ method: "GET", url: "https://slack.com/api/auth.test" }]);
    expect(logs.join("\n")).not.toContain(token);
  }).pipe(
    Effect.provide(testLayer()),
    Effect.provideService(HttpClient.HttpClient, fake.client),
    Effect.provide(
      Logger.layer([
        Logger.make((options) => {
          logs.push(JSON.stringify(options.message));
        }),
      ]),
    ),
  );
});

it.effect("reports a bounded Retry-After without installing a retry", () => {
  const fake = fixture(() =>
    Response.json({ token }, { status: 429, headers: { "retry-after": "12" } }),
  );
  return Effect.gen(function* () {
    const service = yield* Slack.make;
    const error = yield* service.connect({ token }).pipe(Effect.flip);
    expect(error).toMatchObject({ kind: "rate-limit", retryAfterSeconds: 12 });
    safeError(error);
    yield* TestClock.adjust("1 hour");
    expect(fake.calls).toHaveLength(1);
  }).pipe(Effect.provide(testLayer()), Effect.provideService(HttpClient.HttpClient, fake.client));
});

it.effect(
  "serializes duplicate connects, retains identity and increments reconnect generations",
  () => {
    const fake = fixture();
    return Effect.gen(function* () {
      const service = yield* Slack.make;
      const accounts = yield* Effect.all(
        [service.connect({ token }), service.connect({ token: "replacement_token" })],
        { concurrency: "unbounded" },
      );
      expect(accounts[0]!.id).toBe(accounts[1]!.id);
      expect(accounts.map((account) => account.generation).sort()).toEqual([1, 2]);
      expect(yield* service.list).toHaveLength(1);
      const lease = yield* service.authorize({
        connectionId: accounts[0]!.id,
        workspaceId: "T123",
      });
      expect(lease.generation).toBe(2);
      expect(Redacted.isRedacted(lease.token)).toBe(true);
      expect(JSON.stringify(lease)).not.toContain(token);
      yield* service.disconnect({ connectionId: accounts[0]!.id });
      const reconnected = yield* service.connect({ token });
      expect(reconnected).toMatchObject({ id: accounts[0]!.id, generation: 4, connected: true });
      expect(
        (yield* service.authorize({ connectionId: reconnected.id, workspaceId: "T123" }))
          .generation,
      ).toBe(4);
      expect((yield* lease.check.pipe(Effect.flip)).kind).toBe("not-found");
      expect((yield* lease.cancelled.pipe(Effect.flip)).kind).toBe("not-found");
      expect(fake.calls).toHaveLength(3);
    }).pipe(Effect.provide(testLayer()), Effect.provideService(HttpClient.HttpClient, fake.client));
  },
);

it.effect(
  "separates workspace and subject identities and denies cross-workspace authorization",
  () => {
    const fake = fixture((index) =>
      Response.json(
        {
          ...auth,
          ...(index === 2 ? { team_id: "T456" } : index === 3 ? { user_id: "U456" } : {}),
        },
        { headers },
      ),
    );
    return Effect.gen(function* () {
      const service = yield* Slack.make;
      const accounts = [];
      for (let index = 0; index < 3; index++) accounts.push(yield* service.connect({ token }));
      expect(new Set(accounts.map((account) => account.id)).size).toBe(3);
      const error = yield* service
        .authorize({ connectionId: accounts[0]!.id, workspaceId: "T456" })
        .pipe(Effect.flip);
      expect(error.kind).toBe("not-found");
      expect(fake.calls).toHaveLength(3);
    }).pipe(Effect.provide(testLayer()), Effect.provideService(HttpClient.HttpClient, fake.client));
  },
);

it.effect("list and disconnect are local and retain saved refs and safe metadata only", () => {
  const fake = fixture();
  return Effect.gen(function* () {
    const service = yield* Slack.make;
    const account = yield* service.connect({ token });
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO workspace_saved_items VALUES('slack:ref','{}','2026-10-18T00:00:00.000Z')`;
    expect(JSON.stringify(yield* rows)).not.toContain(token);
    expect(yield* service.list).toEqual([account]);
    expect(Object.keys(account).sort()).toEqual([
      "connected",
      "generation",
      "id",
      "identity",
      "label",
      "provider",
    ]);
    yield* service.disconnect({ connectionId: account.id });
    expect(yield* service.list).toEqual([{ ...account, connected: false, generation: 2 }]);
    const secrets = yield* Secrets.ServerSecretStore;
    expect(Option.isNone(yield* secrets.get(`slack-token-${account.id}`))).toBe(true);
    expect(yield* sql`SELECT item_key FROM workspace_saved_items`).toEqual([
      { item_key: "slack:ref" },
    ]);
    expect(
      (yield* service
        .authorize({ connectionId: account.id, workspaceId: "T123" })
        .pipe(Effect.flip)).kind,
    ).toBe("not-found");
    yield* TestClock.adjust("1 hour");
    expect(fake.calls).toHaveLength(1);
  }).pipe(Effect.provide(testLayer()), Effect.provideService(HttpClient.HttpClient, fake.client));
});

it.effect("removes a new token and restores the prior token when SQL commits fail", () => {
  const fake = fixture();
  return Effect.gen(function* () {
    const service = yield* Slack.make;
    const secrets = yield* Secrets.ServerSecretStore;
    const fs = yield* FileSystem.FileSystem;
    const sql = yield* SqlClient.SqlClient;
    yield* sql`CREATE TRIGGER slack_fixture_failure BEFORE INSERT ON slack_connections BEGIN SELECT RAISE(ABORT, 'synthetic_slack_token'); END`;
    safeError(yield* service.connect({ token }).pipe(Effect.flip));
    expect(yield* service.list).toEqual([]);
    expect(yield* fs.readDirectory(secrets.directory!)).toEqual([]);
    yield* sql`DROP TRIGGER slack_fixture_failure`;
    const account = yield* service.connect({ token });
    yield* sql`CREATE TRIGGER slack_fixture_failure BEFORE INSERT ON slack_connections BEGIN SELECT RAISE(ABORT, 'synthetic_slack_token'); END`;
    safeError(yield* service.connect({ token: "replacement_token" }).pipe(Effect.flip));
    const lease = yield* service.authorize({ connectionId: account.id, workspaceId: "T123" });
    expect(Redacted.value(lease.token)).toBe(token);
    expect(yield* service.list).toEqual([account]);
  }).pipe(Effect.provide(testLayer()), Effect.provideService(HttpClient.HttpClient, fake.client));
});

it.effect("compensates a secret write that fails after replacing the credential", () => {
  const fake = fixture();
  return Effect.gen(function* () {
    const original = yield* Secrets.ServerSecretStore;
    let failed = false;
    const service = yield* Slack.make.pipe(
      Effect.provideService(Secrets.ServerSecretStore, {
        ...original,
        set: (name, bytes) =>
          original.set(name, bytes).pipe(
            Effect.andThen(
              Effect.suspend(() => {
                if (failed) return Effect.void;
                failed = true;
                return Effect.fail(
                  new Secrets.SecretStorePersistError({ resource: token, cause: token }),
                );
              }),
            ),
          ),
      }),
    );
    safeError(yield* service.connect({ token }).pipe(Effect.flip));
    expect(yield* service.list).toEqual([]);
    const fs = yield* FileSystem.FileSystem;
    expect(yield* fs.readDirectory(original.directory!)).toEqual([]);
    const account = yield* service.connect({ token });
    expect(account.generation).toBe(1);
  }).pipe(Effect.provide(testLayer()), Effect.provideService(HttpClient.HttpClient, fake.client));
});

it.effect("retains disconnected metadata and cancels leases even when secret removal fails", () => {
  const fake = fixture();
  return Effect.gen(function* () {
    const original = yield* Secrets.ServerSecretStore;
    const service = yield* Slack.make.pipe(
      Effect.provideService(Secrets.ServerSecretStore, {
        ...original,
        remove: () =>
          Effect.fail(new Secrets.SecretStoreRemoveError({ resource: token, cause: token })),
      }),
    );
    const account = yield* service.connect({ token });
    const lease = yield* service.authorize({ connectionId: account.id, workspaceId: "T123" });
    const error = yield* service.disconnect({ connectionId: account.id }).pipe(Effect.flip);
    safeError(error);
    expect(error.kind).toBe("unavailable");
    expect((yield* service.list)[0]).toMatchObject({
      connected: false,
      generation: 2,
      error: error.message,
    });
    expect((yield* lease.check.pipe(Effect.flip)).kind).toBe("not-found");
    expect((yield* lease.cancelled.pipe(Effect.flip)).kind).toBe("not-found");
    expect(
      (yield* service
        .authorize({ connectionId: account.id, workspaceId: "T123" })
        .pipe(Effect.flip)).kind,
    ).toBe("not-found");
    expect(fake.calls).toHaveLength(1);
  }).pipe(Effect.provide(testLayer()), Effect.provideService(HttpClient.HttpClient, fake.client));
});

it.effect(
  "disconnect cancels an in-flight leased operation before secret removal completes",
  () => {
    const fake = fixture();
    return Effect.gen(function* () {
      const original = yield* Secrets.ServerSecretStore;
      const removing = yield* Deferred.make<void>();
      const removeAllowed = yield* Deferred.make<void>();
      const cancelled = yield* Deferred.make<void>();
      const started = yield* Deferred.make<void>();
      const service = yield* Slack.make.pipe(
        Effect.provideService(Secrets.ServerSecretStore, {
          ...original,
          remove: (name) =>
            Deferred.succeed(removing, undefined).pipe(
              Effect.andThen(Deferred.await(removeAllowed)),
              Effect.andThen(original.remove(name)),
            ),
        }),
      );
      const account = yield* service.connect({ token });
      const lease = yield* service.authorize({ connectionId: account.id, workspaceId: "T123" });
      const request = Deferred.succeed(started, undefined).pipe(
        Effect.andThen(Effect.never),
        Effect.ensuring(Deferred.succeed(cancelled, undefined)),
      );
      const read = yield* Effect.raceFirst(request, lease.cancelled).pipe(Effect.forkChild);
      yield* Deferred.await(started);
      const disconnect = yield* service
        .disconnect({ connectionId: account.id })
        .pipe(Effect.forkChild);
      yield* Deferred.await(removing);
      yield* Deferred.await(cancelled);
      expect((yield* Fiber.join(read).pipe(Effect.flip)).kind).toBe("not-found");
      expect((yield* service.list)[0]).toMatchObject({ connected: false, generation: 2 });
      yield* Deferred.succeed(removeAllowed, undefined);
      yield* Fiber.join(disconnect);
    }).pipe(Effect.provide(testLayer()), Effect.provideService(HttpClient.HttpClient, fake.client));
  },
);

it.effect("does not reconnect from an auth response that arrived after disconnect", () =>
  Effect.gen(function* () {
    const arrived = yield* Deferred.make<void>();
    const responseAllowed = yield* Deferred.make<void>();
    let calls = 0;
    const client = HttpClient.make((request) =>
      Effect.gen(function* () {
        if (++calls === 2) {
          yield* Deferred.succeed(arrived, undefined);
          yield* Deferred.await(responseAllowed);
        }
        return HttpClientResponse.fromWeb(request, Response.json(auth, { headers }));
      }),
    );
    const service = yield* Slack.make.pipe(Effect.provideService(HttpClient.HttpClient, client));
    const account = yield* service.connect({ token });
    const reconnect = yield* service.connect({ token }).pipe(Effect.forkChild);
    yield* Deferred.await(arrived);
    yield* service.disconnect({ connectionId: account.id });
    yield* Deferred.succeed(responseAllowed, undefined);
    expect((yield* Fiber.join(reconnect).pipe(Effect.flip)).kind).toBe("not-found");
    expect((yield* service.list)[0]).toMatchObject({ connected: false, generation: 2 });
  }).pipe(Effect.provide(testLayer())),
);

it.effect("times out held HTTP under TestClock without saving or retrying", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>();
    let calls = 0;
    const client = HttpClient.make(() =>
      Effect.sync(() => {
        calls++;
      }).pipe(Effect.andThen(Deferred.succeed(started, undefined)), Effect.andThen(Effect.never)),
    );
    const service = yield* Slack.make.pipe(Effect.provideService(HttpClient.HttpClient, client));
    const connecting = yield* service.connect({ token }).pipe(Effect.forkChild);
    yield* Deferred.await(started);
    yield* TestClock.adjust("15 seconds");
    safeError(yield* Fiber.join(connecting).pipe(Effect.flip));
    expect(yield* service.list).toEqual([]);
    expect(calls).toBe(1);
  }).pipe(Effect.provide(testLayer())),
);

it.effect(
  "returns and logs safe public failures for transport errors containing authorization headers",
  () => {
    const logs: string[] = [];
    const client = HttpClient.make((request) =>
      Effect.fail(
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({
            request,
            cause: { token, authorization: `Bearer ${token}` },
          }),
        }),
      ),
    );
    return Effect.gen(function* () {
      const service = yield* Slack.make;
      const error = yield* service.connect({ token }).pipe(Effect.flip);
      safeError(error);
      yield* Effect.logError(error);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.join("\n")).not.toContain(token);
      expect(logs.join("\n")).not.toContain("Bearer");
      expect(yield* service.list).toEqual([]);
    }).pipe(
      Effect.provide(testLayer()),
      Effect.provideService(HttpClient.HttpClient, client),
      Effect.provide(
        Logger.layer([
          Logger.make((options) => {
            logs.push(JSON.stringify(options.message));
          }),
        ]),
      ),
    );
  },
);

it.effect(
  "fails closed and invalidates old leases if restoration of a prior credential fails",
  () => {
    const fake = fixture();
    return Effect.gen(function* () {
      const original = yield* Secrets.ServerSecretStore;
      let rejectRestore = false;
      const service = yield* Slack.make.pipe(
        Effect.provideService(Secrets.ServerSecretStore, {
          ...original,
          set: (name, bytes) =>
            rejectRestore && new TextDecoder().decode(bytes) === token
              ? Effect.fail(new Secrets.SecretStorePersistError({ resource: token, cause: token }))
              : original.set(name, bytes),
        }),
      );
      const account = yield* service.connect({ token });
      const lease = yield* service.authorize({ connectionId: account.id, workspaceId: "T123" });
      const sql = yield* SqlClient.SqlClient;
      yield* sql`CREATE TRIGGER slack_fixture_failure BEFORE INSERT ON slack_connections BEGIN SELECT RAISE(ABORT, 'synthetic_slack_token'); END`;
      rejectRestore = true;
      const error = yield* service.connect({ token: "replacement_token" }).pipe(Effect.flip);
      safeError(error);
      expect((yield* service.list)[0]).toMatchObject({ connected: false, generation: 2 });
      expect((yield* lease.cancelled.pipe(Effect.flip)).kind).toBe("not-found");
      expect(
        (yield* service
          .authorize({ connectionId: account.id, workspaceId: "T123" })
          .pipe(Effect.flip)).kind,
      ).toBe("not-found");
    }).pipe(Effect.provide(testLayer()), Effect.provideService(HttpClient.HttpClient, fake.client));
  },
);

it.effect(
  "keeps the prior connection intact on a secret read failure and on failed disconnect storage",
  () => {
    const fake = fixture();
    return Effect.gen(function* () {
      const original = yield* Secrets.ServerSecretStore;
      const service = yield* Slack.make;
      const account = yield* service.connect({ token });
      const failing = yield* Slack.make.pipe(
        Effect.provideService(Secrets.ServerSecretStore, {
          ...original,
          get: () =>
            Effect.fail(new Secrets.SecretStoreReadError({ resource: token, cause: token })),
        }),
      );
      safeError(yield* failing.connect({ token: "replacement_token" }).pipe(Effect.flip));
      const lease = yield* service.authorize({ connectionId: account.id, workspaceId: "T123" });
      const sql = yield* SqlClient.SqlClient;
      yield* sql`CREATE TRIGGER slack_disconnect_failure BEFORE UPDATE ON slack_connections BEGIN SELECT RAISE(ABORT, 'synthetic_slack_token'); END`;
      safeError(yield* service.disconnect({ connectionId: account.id }).pipe(Effect.flip));
      yield* lease.check;
      expect(yield* service.list).toEqual([account]);
      expect(
        Redacted.value(
          (yield* service.authorize({ connectionId: account.id, workspaceId: "T123" })).token,
        ),
      ).toBe(token);
    }).pipe(Effect.provide(testLayer()), Effect.provideService(HttpClient.HttpClient, fake.client));
  },
);

it.effect(
  "denies missing credentials and maps unreadable local metadata to a safe storage error",
  () => {
    const fake = fixture();
    return Effect.gen(function* () {
      const service = yield* Slack.make;
      const account = yield* service.connect({ token });
      const secrets = yield* Secrets.ServerSecretStore;
      yield* secrets.remove(`slack-token-${account.id}`);
      safeError(
        yield* service
          .authorize({ connectionId: account.id, workspaceId: "T123" })
          .pipe(Effect.flip),
      );
      const sql = yield* SqlClient.SqlClient;
      yield* sql`UPDATE slack_connections SET scopes_json=${token} WHERE id=${account.id}`;
      const error = yield* service.list.pipe(Effect.flip);
      expect(error.kind).toBe("unavailable");
      safeError(error);
      expect(fake.calls).toHaveLength(1);
    }).pipe(Effect.provide(testLayer()), Effect.provideService(HttpClient.HttpClient, fake.client));
  },
);

it.effect(
  "reopens real SQL and secret layers with retained scopes, generation and bot identity",
  () => {
    const fake = fixture(() => Response.json({ ...auth, bot_id: "B123" }, { headers }));
    return Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const path = yield* Path.Path;
      const storage = NodeSqliteClient.layer({
        filename: path.join(config.secretsDir, "../slack.sqlite"),
      });
      const dependencies = Layer.mergeAll(
        SlackStore.layer.pipe(Layer.provide(storage)),
        Secrets.layer,
      );
      yield* runMigrations().pipe(Effect.provide(storage));
      const account = yield* Slack.make.pipe(
        Effect.flatMap((service) => service.connect({ token })),
        Effect.provide(dependencies),
      );
      yield* Slack.make.pipe(
        Effect.flatMap((service) =>
          Effect.gen(function* () {
            expect(yield* service.list).toEqual([account]);
            const lease = yield* service.authorize({
              connectionId: account.id,
              workspaceId: "T123",
            });
            expect(Redacted.value(lease.token)).toBe(token);
            expect(lease).toMatchObject({
              generation: 1,
              isBot: true,
              scopes: ["channels:read", "channels:history"],
            });
            yield* service.disconnect({ connectionId: account.id });
          }),
        ),
        Effect.provide(dependencies),
      );
      const list = yield* Slack.make.pipe(
        Effect.flatMap((service) => service.list),
        Effect.provide(dependencies),
      );
      expect(list).toEqual([{ ...account, connected: false, generation: 2 }]);
      expect(fake.calls).toHaveLength(1);
    }).pipe(
      Effect.provide(
        ServerConfig.layerTest(process.cwd(), { prefix: "slack-restart-test-" }).pipe(
          Layer.provideMerge(NodeServices.layer),
        ),
      ),
      Effect.provideService(HttpClient.HttpClient, fake.client),
    );
  },
);
