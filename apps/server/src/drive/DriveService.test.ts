import * as Schema from "effect/Schema";
import { ProjectId, workspaceItemKey } from "@t3tools/contracts";
import * as NodeCrypto from "node:crypto";
import * as TestClock from "effect/testing/TestClock";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Secrets from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as Store from "./DriveStore.ts";
import * as Api from "./DriveApi.ts";
import * as OAuth from "./DriveOAuth.ts";
import * as Service from "./DriveService.ts";
import { makeFakeDrive } from "./testing/fakeDrive.ts";
import * as Tools from "../workspace/WorkspaceTools.ts";
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const testLayer = () =>
  Store.layer.pipe(
    Layer.provideMerge(SqlitePersistenceMemory),
    Layer.provideMerge(
      Secrets.layer.pipe(
        Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "drive-reader-test-" })),
      ),
    ),
    Layer.provideMerge(NodeServices.layer),
  );
const setup = Effect.gen(function* () {
  const fake = makeFakeDrive();
  const api = yield* Api.make.pipe(Effect.provide(fake.layer));
  const oauth = yield* OAuth.make.pipe(
    Effect.provide(fake.layer),
    Effect.provideService(Api.DriveApi, api),
  );
  const service = yield* Service.make.pipe(
    Effect.provideService(Api.DriveApi, api),
    Effect.provideService(OAuth.DriveOAuth, oauth),
  );
  const store = yield* Store.DriveStore;
  const connection = yield* store.upsert({
    nickname: "Primary",
    clientId: "synthetic.apps.googleusercontent.com",
    clientSecret: "synthetic-client-secret",
  });
  const signIn = Effect.gen(function* () {
    const flow = yield* oauth.start(connection.id).pipe(Effect.scoped);
    const authorize = new URL(flow.authorizeUrl);
    const returned = new URL(authorize.searchParams.get("redirect_uri")!);
    returned.search = new URLSearchParams({
      state: authorize.searchParams.get("state")!,
      code: "synthetic-code",
    }).toString();
    return { flow, authorize, returned };
  });
  return { fake, api, oauth, service, store, connection, signIn };
});
const projectId = ProjectId.make("drive-project");
const rootLinkId = "wl_00000000-0000-0000-0000-000000000001";
const seedRootLink = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const project = { type: "project" as const, projectId };
  const file = { type: "file" as const, provider: "google-drive" as const, fileId: "synkek-root" };
  const [a, b] = [project, file].sort((a, b) =>
    workspaceItemKey(a).localeCompare(workspaceItemKey(b)),
  );
  yield* sql`INSERT INTO projection_projects(project_id,title,workspace_root,scripts_json,created_at,updated_at) VALUES(${projectId},'Drive project','/synthetic','[]','2026-10-13T08:30:00Z','2026-10-13T08:30:00Z')`;
  yield* sql`INSERT INTO workspace_links(link_id,key_a,key_b,ref_a_json,ref_b_json,status,source_json,created_at,updated_at) VALUES(${rootLinkId},${workspaceItemKey(a!)},${workspaceItemKey(b!)},${encodeJson(a)},${encodeJson(b)},'confirmed',${encodeJson({ type: "user" })},'2026-10-13T08:30:00Z','2026-10-13T08:30:00Z')`;
});
describe("Drive read-only account and file lifecycle", () => {
  it.effect("retains unavailable designations through unlink, rebind, disconnect and restart", () =>
    Effect.gen(function* () {
      const { fake, oauth, service, store, connection, signIn } = yield* setup;
      const sign = yield* signIn;
      yield* oauth.complete(sign.flow.flowId, sign.returned.href);
      yield* seedRootLink;
      expect((yield* service.getProjectRoot({ projectId })).state).toBe("unconfigured");
      fake.state.mimeType = "application/vnd.google-apps.folder";
      yield* service.bindFile({ connectionId: connection.id, fileId: "synkek-root" });
      const root = { linkId: rootLinkId, connectionId: connection.id, fileId: "synkek-root" };
      yield* service.setProjectRoot({ projectId, root });
      const sql = yield* SqlClient.SqlClient;
      const restarted = yield* Store.make;
      expect((yield* restarted.getProjectRoot(projectId)).root).toEqual(root);
      yield* sql`UPDATE workspace_links SET status='dismissed' WHERE link_id=${rootLinkId}`;
      expect(yield* service.getProjectRoot({ projectId })).toMatchObject({
        root,
        state: "unlinked",
      });
      yield* sql`UPDATE workspace_links SET status='confirmed' WHERE link_id=${rootLinkId}`;
      yield* sql`UPDATE drive_file_bindings SET connection_id='other' WHERE file_id='synkek-root'`;
      expect((yield* service.getProjectRoot({ projectId })).state).toBe("binding-changed");
      yield* sql`UPDATE drive_file_bindings SET connection_id=${connection.id} WHERE file_id='synkek-root'`;
      yield* store.disconnect(connection.id);
      expect(yield* service.getProjectRoot({ projectId })).toMatchObject({
        root,
        state: "disconnected",
      });
      const reconnect = yield* signIn;
      yield* oauth.complete(reconnect.flow.flowId, reconnect.returned.href);
      expect((yield* service.getProjectRoot({ projectId })).state).toBe("available");
      yield* store.disconnect(connection.id, true);
      expect(yield* service.getProjectRoot({ projectId })).toMatchObject({
        root,
        state: "disconnected",
      });
      const before = fake.calls.length;
      yield* service.setProjectRoot({ projectId, root: null });
      expect(fake.calls).toHaveLength(before);
      expect(yield* sql`SELECT * FROM drive_file_bindings`).toHaveLength(1);
      expect(yield* sql`SELECT * FROM workspace_links WHERE status='confirmed'`).toHaveLength(1);
      yield* sql`UPDATE projection_projects SET deleted_at='2026-10-14T00:00:00Z' WHERE project_id=${projectId}`;
      expect((yield* service.getProjectRoot({ projectId }).pipe(Effect.flip)).kind).toBe(
        "not-found",
      );
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect.each([
    "suggested",
    "dismissed",
    "foreign",
    "non-folder",
    "missing-binding",
    "mismatched-binding",
    "deleted-project",
    "removed-connection",
  ] as const)(
    "rejects %s root selection without changing stored relationships or bindings",
    (invalid) =>
      Effect.gen(function* () {
        const { fake, oauth, service, store, connection, signIn } = yield* setup;
        const sign = yield* signIn;
        yield* oauth.complete(sign.flow.flowId, sign.returned.href);
        yield* seedRootLink;
        fake.state.mimeType = "application/vnd.google-apps.folder";
        yield* service.bindFile({ connectionId: connection.id, fileId: "synkek-root" });
        const root = { linkId: rootLinkId, connectionId: connection.id, fileId: "synkek-root" };
        yield* service.setProjectRoot({ projectId, root });
        const sql = yield* SqlClient.SqlClient;
        if (invalid === "suggested" || invalid === "dismissed")
          yield* sql`UPDATE workspace_links SET status=${invalid}`;
        if (invalid === "foreign") yield* sql`UPDATE workspace_links SET key_b='project:other'`;
        if (invalid === "non-folder") fake.state.mimeType = "text/plain";
        if (invalid === "missing-binding") yield* sql`DELETE FROM drive_file_bindings`;
        if (invalid === "mismatched-binding")
          yield* sql`UPDATE drive_file_bindings SET connection_id='other'`;
        if (invalid === "deleted-project")
          yield* sql`UPDATE projection_projects SET deleted_at='2026-10-14T00:00:00Z'`;
        if (invalid === "removed-connection") yield* store.disconnect(connection.id, true);
        const before = yield* sql`SELECT * FROM workspace_project_config`;
        const bindings = yield* sql`SELECT * FROM drive_file_bindings`;
        const links = yield* sql`SELECT * FROM workspace_links`;
        const error = yield* service.setProjectRoot({ projectId, root }).pipe(Effect.flip);
        expect(error.kind).toMatch(
          /invalid-input|conflict|not-found|connection-required|auth-required/,
        );
        expect(yield* sql`SELECT * FROM workspace_project_config`).toEqual(before);
        expect(yield* sql`SELECT * FROM drive_file_bindings`).toEqual(bindings);
        expect(yield* sql`SELECT * FROM workspace_links`).toEqual(links);
      }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect.each(["disconnect", "rebind", "unlink", "delete-project"] as const)(
    "rechecks %s after a pending metadata read before saving a root",
    (change) =>
      Effect.gen(function* () {
        const { fake, oauth, service, store, connection, signIn } = yield* setup;
        const sign = yield* signIn;
        yield* oauth.complete(sign.flow.flowId, sign.returned.href);
        yield* seedRootLink;
        fake.state.mimeType = "application/vnd.google-apps.folder";
        yield* service.bindFile({ connectionId: connection.id, fileId: "synkek-root" });
        const entered = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        fake.state.metadataGate = { entered, release };
        const pending = yield* service
          .setProjectRoot({
            projectId,
            root: { linkId: rootLinkId, connectionId: connection.id, fileId: "synkek-root" },
          })
          .pipe(Effect.flip, Effect.forkChild);
        yield* Deferred.await(entered);
        const sql = yield* SqlClient.SqlClient;
        if (change === "disconnect") yield* store.disconnect(connection.id);
        if (change === "rebind") yield* sql`UPDATE drive_file_bindings SET connection_id='other'`;
        if (change === "unlink") yield* sql`UPDATE workspace_links SET status='dismissed'`;
        if (change === "delete-project")
          yield* sql`UPDATE projection_projects SET deleted_at='2026-10-14T00:00:00Z'`;
        yield* Deferred.succeed(release, undefined);
        expect((yield* Fiber.join(pending)).kind).toBe("conflict");
        expect(yield* sql`SELECT * FROM workspace_project_config`).toHaveLength(0);
      }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect("keeps a root designation separate from links and legacy settings saves", () =>
    Effect.gen(function* () {
      const { fake, oauth, service, connection, signIn } = yield* setup;
      const sign = yield* signIn;
      yield* oauth.complete(sign.flow.flowId, sign.returned.href);
      yield* seedRootLink;
      fake.state.mimeType = "application/vnd.google-apps.folder";
      yield* service.bindFile({ connectionId: connection.id, fileId: "synkek-root" });
      const root = { linkId: rootLinkId, connectionId: connection.id, fileId: "synkek-root" };
      expect((yield* service.setProjectRoot({ projectId, root })).state).toBe("available");
      const sql = yield* SqlClient.SqlClient;
      expect(yield* sql`SELECT link_id FROM workspace_links`).toHaveLength(1);
      const tools = yield* Tools.make;
      const currentConfig = yield* tools.config(projectId);
      yield* tools.saveConfig({
        ...currentConfig,
        taskColumns: ["To do", "Done"],
        browserThreadId: null,
      });
      expect((yield* service.getProjectRoot({ projectId })).root).toEqual(root);
      expect((yield* tools.config(projectId)).driveRoot).toEqual(root);
      expect(currentConfig.completedColumn).toBe("Done");
      expect((yield* tools.config(projectId)).completedColumn).toBe("Done");
      yield* service.setProjectRoot({ projectId, root: null });
      expect((yield* service.getProjectRoot({ projectId })).state).toBe("unconfigured");
      expect(yield* sql`SELECT link_id FROM workspace_links WHERE status='confirmed'`).toHaveLength(
        1,
      );
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect("replaces only an explicitly chosen root and fails closed on corrupt stored JSON", () =>
    Effect.gen(function* () {
      const { fake, oauth, service, connection, signIn } = yield* setup;
      const sign = yield* signIn;
      yield* oauth.complete(sign.flow.flowId, sign.returned.href);
      yield* seedRootLink;
      fake.state.mimeType = "application/vnd.google-apps.folder";
      yield* service.bindFile({ connectionId: connection.id, fileId: "synkek-root" });
      const first = { linkId: rootLinkId, connectionId: connection.id, fileId: "synkek-root" };
      yield* service.setProjectRoot({ projectId, root: first });
      const sql = yield* SqlClient.SqlClient;
      const nextFile = {
        type: "file" as const,
        provider: "google-drive" as const,
        fileId: "replacement",
      };
      const nextId = "wl_00000000-0000-0000-0000-000000000002";
      yield* sql`INSERT INTO workspace_links(link_id,key_a,key_b,ref_a_json,ref_b_json,status,source_json,created_at,updated_at) SELECT ${nextId},${workspaceItemKey(nextFile)},key_b,${encodeJson(nextFile)},ref_b_json,status,source_json,created_at,updated_at FROM workspace_links WHERE link_id=${rootLinkId}`;
      yield* service.bindFile({ connectionId: connection.id, fileId: "replacement" });
      const next = { linkId: nextId, connectionId: connection.id, fileId: "replacement" };
      fake.state.status = 404;
      expect(
        (yield* service.setProjectRoot({ projectId, root: next }).pipe(Effect.flip)).kind,
      ).toBe("not-found");
      expect((yield* service.getProjectRoot({ projectId })).root).toEqual(first);
      fake.state.status = 200;
      yield* service.setProjectRoot({ projectId, root: next });
      expect((yield* service.getProjectRoot({ projectId })).root).toEqual(next);
      expect(yield* sql`SELECT * FROM workspace_links WHERE status='confirmed'`).toHaveLength(2);
      expect(yield* sql`SELECT * FROM drive_file_bindings`).toHaveLength(2);
      yield* sql`UPDATE workspace_project_config SET drive_root_json='broken'`;
      expect((yield* service.getProjectRoot({ projectId }).pipe(Effect.flip)).kind).toBe(
        "unavailable",
      );
      expect((yield* service.setProjectRoot({ projectId, root: null })).state).toBe("unconfigured");
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect(
    "uses HTTP-shaped token JSON, PKCE, exact state and explicit file binding with durable metadata",
    () =>
      Effect.gen(function* () {
        const { fake, oauth, service, store, connection, signIn } = yield* setup;
        const { flow, authorize, returned } = yield* signIn;
        expect(authorize.searchParams.get("scope")).toBe(
          "https://www.googleapis.com/auth/drive.readonly",
        );
        expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
        const wrong = new URL(returned);
        wrong.searchParams.set("state", "wrong");
        expect((yield* oauth.complete(flow.flowId, wrong.href).pipe(Effect.flip)).kind).toBe(
          "invalid-input",
        );
        expect(fake.state.tokenCalls).toBe(0);
        const connected = yield* oauth.complete(flow.flowId, returned.href);
        expect(connected.connected).toBe(true);
        expect(connected.identity?.id).toBe("google-user-1");
        const token = fake.calls.find((call) => call.url.hostname === "oauth2.googleapis.com")!;
        expect(token.body.get("code_verifier")!.length).toBeGreaterThan(40);
        expect(
          NodeCrypto.createHash("sha256")
            .update(token.body.get("code_verifier")!)
            .digest("base64url"),
        ).toBe(authorize.searchParams.get("code_challenge"));
        expect(token.body.get("redirect_uri")).toBe(authorize.searchParams.get("redirect_uri"));
        expect(token.body.get("client_secret")).toBe("synthetic-client-secret");
        expect((yield* service.readFile({ fileId: "file-one" }).pipe(Effect.flip)).kind).toBe(
          "connection-required",
        );
        yield* service.bindFile({ connectionId: connection.id, fileId: "file-one" });
        expect((yield* service.readFile({ fileId: "file-one" })).body.text).toBe(
          "Synthetic launch brief",
        );
        const sql = yield* SqlClient.SqlClient;
        const rows = yield* sql`SELECT * FROM drive_connections`;
        expect(encodeJson(rows)).not.toContain("synthetic-client-secret");
        expect(encodeJson(rows)).not.toContain("synthetic-refresh-secret");
        const restarted = yield* Store.make;
        expect(Option.isSome(yield* restarted.binding("file-one"))).toBe(true);
        yield* store.disconnect(connection.id, true);
        expect(Option.isSome(yield* store.binding("file-one"))).toBe(true);
        expect(yield* store.list).toHaveLength(0);
        expect((yield* service.readFile({ fileId: "file-one" }).pipe(Effect.flip)).kind).toBe(
          "not-found",
        );
      }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect(
    "keeps account identities separate and never falls back to another connected account",
    () =>
      Effect.gen(function* () {
        const { fake, oauth, service, store, connection, signIn } = yield* setup;
        let flow = yield* signIn;
        yield* oauth.complete(flow.flow.flowId, flow.returned.href);
        yield* service.bindFile({ connectionId: connection.id, fileId: "file-one" });
        const other = yield* store.upsert({
          nickname: "Other",
          clientId: "other.apps.googleusercontent.com",
        });
        yield* store.setCredential(
          other.id,
          (yield* store.get(other.id)).generation,
          { id: "google-user-2", name: "Other" },
          { refreshToken: "other", accessToken: "other", expiresAt: Number.MAX_SAFE_INTEGER },
        );
        fake.state.identity = "google-user-2";
        flow = yield* signIn;
        expect(
          (yield* oauth.complete(flow.flow.flowId, flow.returned.href).pipe(Effect.flip)).kind,
        ).toBe("conflict");
        expect((yield* store.get(connection.id)).identity?.id).toBe("google-user-1");
        yield* store.disconnect(connection.id);
        const before = fake.calls.length;
        expect((yield* service.readFile({ fileId: "file-one" }).pipe(Effect.flip)).kind).toBe(
          "auth-required",
        );
        expect(fake.calls).toHaveLength(before);
        expect((yield* store.get(other.id)).connected).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect(
    "rejects canceled, duplicate, config-changed flows and missing offline or write-scope grants",
    () =>
      Effect.gen(function* () {
        const { fake, oauth, store, connection, signIn } = yield* setup;
        let value = yield* signIn;
        yield* oauth.cancel(value.flow.flowId);
        expect(
          (yield* oauth.complete(value.flow.flowId, value.returned.href).pipe(Effect.flip)).kind,
        ).toMatch(/conflict|not-found/);
        value = yield* signIn;
        yield* store.upsert({
          id: connection.id,
          nickname: "Primary",
          clientId: "changed.apps.googleusercontent.com",
        });
        expect(
          (yield* oauth.complete(value.flow.flowId, value.returned.href).pipe(Effect.flip)).kind,
        ).toBe("conflict");
        value = yield* signIn;
        fake.state.refreshToken = false;
        expect(
          (yield* oauth.complete(value.flow.flowId, value.returned.href).pipe(Effect.flip)).kind,
        ).toBe("auth-required");
        fake.state.refreshToken = true;
        value = yield* signIn;
        fake.state.scope = "https://www.googleapis.com/auth/drive";
        expect(
          (yield* oauth.complete(value.flow.flowId, value.returned.href).pipe(Effect.flip)).kind,
        ).toBe("auth-required");
        expect((yield* store.get(connection.id)).connected).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect(
    "refreshes offline credentials and reports revoked access without exposing tokens",
    () =>
      Effect.gen(function* () {
        const { fake, oauth, store, connection, signIn } = yield* setup;
        const value = yield* signIn;
        yield* oauth.complete(value.flow.flowId, value.returned.href);
        const before = fake.state.tokenCalls;
        yield* TestClock.adjust("56 minutes");
        fake.state.refreshToken = false;
        yield* oauth.accessToken(connection.id);
        expect(fake.state.tokenCalls).toBe(before + 1);
        expect(Option.isSome(yield* store.readCredential(connection.id))).toBe(true);
        yield* TestClock.adjust("56 minutes");
        fake.state.tokenStatus = 400;
        const error = yield* oauth.accessToken(connection.id).pipe(Effect.flip);
        expect(error.kind).toBe("auth-required");
        expect(encodeJson(error)).not.toContain("synthetic-refresh-secret");
        expect((yield* store.get(connection.id)).connected).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect(
    "bounds search, body pages and JSON, exposes unsupported types, and sanitizes errors",
    () =>
      Effect.gen(function* () {
        const { fake, oauth, service, connection, signIn } = yield* setup;
        const value = yield* signIn;
        yield* oauth.complete(value.flow.flowId, value.returned.href);
        expect(
          (yield* service
            .search({ connectionId: connection.id, query: "launch", limit: 21 })
            .pipe(Effect.flip)).kind,
        ).toBe("invalid-input");
        expect(
          (yield* service.search({ connectionId: connection.id, query: "launch" })).incomplete,
        ).toBe(true);
        yield* service.bindFile({ connectionId: connection.id, fileId: "file-one" });
        fake.state.content = '"\\\n'.repeat(100000);
        const page = yield* service.readFile({ fileId: "file-one" });
        expect(Buffer.byteLength(encodeJson(page))).toBeLessThan(32000);
        expect(page.body.truncated).toBe(true);
        expect(page.body.nextOffset).toBeGreaterThan(0);
        expect(page.limitation).toContain("256 KiB");
        expect(
          (yield* service.readFile({ fileId: "file-one", offset: page.body.nextOffset! })).body.text
            .length,
        ).toBeGreaterThan(0);
        fake.state.mimeType = "application/vnd.google-apps.spreadsheet";
        expect((yield* service.readFile({ fileId: "file-one" })).limitation).toContain(
          "first sheet",
        );
        fake.state.mimeType = "application/pdf";
        expect((yield* service.readFile({ fileId: "file-one" }).pipe(Effect.flip)).kind).toBe(
          "unsupported",
        );
        fake.state.status = 404;
        const error = yield* service.readFile({ fileId: "file-one" }).pipe(Effect.flip);
        expect(error.kind).toBe("not-found");
        expect(encodeJson(error)).not.toContain("synthetic-access-secret");
        fake.state.status = 401;
        expect((yield* service.readFile({ fileId: "file-one" }).pipe(Effect.flip)).kind).toBe(
          "auth-required",
        );
        expect((yield* service.listConnections)[0]?.connected).toBe(false);
        expect(
          fake.calls.every(
            (call) =>
              call.method === "GET" || call.url.href === "https://oauth2.googleapis.com/token",
          ),
        ).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
});
