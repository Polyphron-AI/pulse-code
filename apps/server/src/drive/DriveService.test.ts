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
import * as Stream from "effect/Stream";
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
const browseSetup = Effect.gen(function* () {
  const context = yield* setup;
  const sign = yield* context.signIn;
  yield* context.oauth.complete(sign.flow.flowId, sign.returned.href);
  yield* seedRootLink;
  context.fake.state.mimeType = "application/vnd.google-apps.folder";
  yield* context.service.bindFile({ connectionId: context.connection.id, fileId: "synkek-root" });
  const root = { linkId: rootLinkId, connectionId: context.connection.id, fileId: "synkek-root" };
  yield* context.service.setProjectRoot({ projectId, root });
  const input = {
    projectId,
    connectionId: context.connection.id,
    parentId: root.fileId,
    path: [],
    sort: "name" as const,
    direction: "asc" as const,
    limit: 20,
  };
  return { ...context, root, input };
});
describe("project Drive folder browsing", () => {
  it.effect("rejects a provider token whose encoded cursor exceeds the wire bound", () =>
    Effect.gen(function* () {
      const { service, fake, input } = yield* browseSetup;
      fake.state.listRequests.push({ files: [], nextPageToken: '"'.repeat(4096) });
      expect((yield* service.listChildren(input).pipe(Effect.flip)).kind).toBe("unavailable");
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect("bounds a verified 16-folder path to 17 metadata reads and one list request", () =>
    Effect.gen(function* () {
      const { service, fake, input } = yield* browseSetup;
      const path = Array.from({ length: 16 }, (_, index) => `folder-${index}`);
      for (const [index, id] of path.entries())
        fake.state.metadata[id] = {
          id,
          name: "Folder",
          mimeType: "application/vnd.google-apps.folder",
          parents: [index === 0 ? "synkek-root" : path[index - 1]!],
        };
      fake.state.listRequests.push({ files: [] });
      const before = fake.calls.length;
      expect(
        (yield* service.listChildren({ ...input, path, parentId: path.at(-1)! })).files,
      ).toEqual([]);
      expect(fake.calls).toHaveLength(before + 18);
      expect(
        fake.calls.slice(before).filter((call) => call.url.pathname.endsWith("/files")),
      ).toHaveLength(1);
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect("fails unavailable on malformed provider metadata while retaining the root", () =>
    Effect.gen(function* () {
      const { service, fake, input, root } = yield* browseSetup;
      fake.state.listRequests.push({
        files: [{ id: "../outside", name: "Invalid", mimeType: "text/plain" }],
      });
      const before = fake.calls.length;
      expect((yield* service.listChildren(input).pipe(Effect.flip)).kind).toBe("unavailable");
      expect(fake.calls).toHaveLength(before + 2);
      expect((yield* service.getProjectRoot({ projectId })).root).toEqual(root);
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect.each(["replace", "relink"] as const)(
    "rejects a continuation after a valid root %s before Google access",
    (change) =>
      Effect.gen(function* () {
        const { service, fake, input, root } = yield* browseSetup;
        fake.state.listRequests.push({ files: [], nextPageToken: "next" });
        const page = yield* service.listChildren(input);
        const sql = yield* SqlClient.SqlClient;
        const nextLinkId = "wl_00000000-0000-0000-0000-000000000002";
        if (change === "relink") {
          yield* sql`UPDATE workspace_links SET link_id=${nextLinkId} WHERE link_id=${rootLinkId}`;
          yield* service.setProjectRoot({ projectId, root: { ...root, linkId: nextLinkId } });
        } else {
          const file = {
            type: "file" as const,
            provider: "google-drive" as const,
            fileId: "replacement",
          };
          yield* sql`INSERT INTO workspace_links(link_id,key_a,key_b,ref_a_json,ref_b_json,status,source_json,created_at,updated_at) SELECT ${nextLinkId},${workspaceItemKey(file)},key_b,${encodeJson(file)},ref_b_json,status,source_json,created_at,updated_at FROM workspace_links WHERE link_id=${rootLinkId}`;
          yield* service.bindFile({ connectionId: input.connectionId, fileId: file.fileId });
          yield* service.setProjectRoot({
            projectId,
            root: { ...root, fileId: file.fileId, linkId: nextLinkId },
          });
        }
        expect((yield* service.getProjectRoot({ projectId })).state).toBe("available");
        const before = fake.calls.length;
        expect(
          (yield* service.listChildren({ ...input, cursor: page.nextCursor! }).pipe(Effect.flip))
            .kind,
        ).toBe("conflict");
        expect(fake.calls).toHaveLength(before);
      }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect("bounds opaque cursors and normalizes query whitespace and equivalent UTC bounds", () =>
    Effect.gen(function* () {
      const { service, fake, input } = yield* browseSetup;
      fake.state.listRequests.push({ files: [], nextPageToken: "x".repeat(4096) }, { files: [] });
      const page = yield* service.listChildren({
        ...input,
        query: "  brief  ",
        modifiedAfter: "2026-10-10T02:00:00+02:00",
      });
      expect(page.nextCursor!.length).toBeLessThanOrEqual(8192);
      yield* service.listChildren({
        ...input,
        query: "brief",
        modifiedAfter: "2026-10-10T00:00:00Z",
        cursor: page.nextCursor!,
      });
      expect(fake.calls.at(-1)!.url.searchParams.get("pageToken")).toBe("x".repeat(4096));
      expect(fake.calls.at(-1)!.url.searchParams.has("cursor")).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect("bounds batched local binding reads without Google access", () =>
    Effect.gen(function* () {
      const { service, fake } = yield* browseSetup;
      const before = fake.calls.length;
      expect(yield* service.getBindings({ fileIds: [] })).toEqual({ bindings: [] });
      const ids = ["synkek-root", ...Array.from({ length: 199 }, (_, index) => `missing-${index}`)];
      expect(
        (yield* service.getBindings({ fileIds: ids })).bindings.map((binding) => binding.file.id),
      ).toEqual(["synkek-root"]);
      expect(
        (yield* service.getBindings({ fileIds: [...ids, "extra"] }).pipe(Effect.flip)).kind,
      ).toBe("invalid-input");
      expect((yield* service.getBindings({ fileIds: ["../invalid"] }).pipe(Effect.flip)).kind).toBe(
        "invalid-input",
      );
      expect(fake.calls).toHaveLength(before);
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect.each([
    { connectionId: "drv_00000000-0000-0000-0000-000000000099" },
    { projectId: ProjectId.make("other-project") },
    { parentId: "other-folder" },
    { path: ["other-folder"] },
    { query: "changed" },
    { type: "document" as const },
    { owner: "me" },
    { modifiedAfter: "2026-10-10T00:00:00Z" },
    { modifiedBefore: "2026-10-11T00:00:00Z" },
    { sort: "modifiedTime" as const },
    { direction: "desc" as const },
    { limit: 10 },
  ])("rejects a cursor when its browse scope changes: %j", (change) =>
    Effect.gen(function* () {
      const { service, fake, input } = yield* browseSetup;
      fake.state.listRequests.push({ files: [], nextPageToken: "provider-token" });
      const first = yield* service.listChildren(input);
      const before = fake.calls.length;
      expect(
        (yield* service
          .listChildren({ ...input, ...change, cursor: first.nextCursor! })
          .pipe(Effect.flip)).kind,
      ).toBe("conflict");
      expect(fake.calls).toHaveLength(before);
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect("rejects raw, tampered, expired and previous-server cursors before Google access", () =>
    Effect.gen(function* () {
      const { service, fake, input, api, oauth } = yield* browseSetup;
      fake.state.listRequests.push({ files: [], nextPageToken: "provider-token" });
      const first = yield* service.listChildren(input);
      const before = fake.calls.length;
      expect(
        (yield* service.listChildren({ ...input, cursor: "provider-token" }).pipe(Effect.flip))
          .kind,
      ).toBe("invalid-input");
      const tampered = `A${first.nextCursor!.slice(1)}`;
      expect(
        (yield* service.listChildren({ ...input, cursor: tampered }).pipe(Effect.flip)).kind,
      ).toBe("conflict");
      const restarted = yield* Service.make.pipe(
        Effect.provideService(Api.DriveApi, api),
        Effect.provideService(OAuth.DriveOAuth, oauth),
      );
      expect(
        (yield* restarted.listChildren({ ...input, cursor: first.nextCursor! }).pipe(Effect.flip))
          .kind,
      ).toBe("conflict");
      yield* TestClock.adjust("10 minutes");
      expect(
        (yield* service.listChildren({ ...input, cursor: first.nextCursor! }).pipe(Effect.flip))
          .kind,
      ).toBe("conflict");
      expect(fake.calls).toHaveLength(before);
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect(
    "rejects a cursor after a same-identity reconnect and preserves current-generation health",
    () =>
      Effect.gen(function* () {
        const { service, fake, input, connection, store, oauth, signIn } = yield* browseSetup;
        fake.state.listRequests.push({ files: [], nextPageToken: "next" });
        const first = yield* service.listChildren(input);
        yield* store.disconnect(connection.id);
        const sign = yield* signIn;
        yield* oauth.complete(sign.flow.flowId, sign.returned.href);
        const before = fake.calls.length;
        expect(
          (yield* service.listChildren({ ...input, cursor: first.nextCursor! }).pipe(Effect.flip))
            .kind,
        ).toBe("conflict");
        expect(fake.calls).toHaveLength(before);
      }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect.each(["unlinked", "binding-changed", "disconnected", "deleted", "corrupt"] as const)(
    "gates %s roots before Google access",
    (state) =>
      Effect.gen(function* () {
        const { service, fake, input, connection, store } = yield* browseSetup;
        const sql = yield* SqlClient.SqlClient;
        if (state === "unlinked")
          yield* sql`UPDATE workspace_links SET status='dismissed' WHERE link_id=${rootLinkId}`;
        if (state === "binding-changed")
          yield* sql`DELETE FROM drive_file_bindings WHERE file_id='synkek-root'`;
        if (state === "disconnected") yield* store.disconnect(connection.id);
        if (state === "deleted")
          yield* sql`UPDATE projection_projects SET deleted_at='2026-10-14T00:00:00Z' WHERE project_id=${projectId}`;
        if (state === "corrupt")
          yield* sql`UPDATE workspace_project_config SET drive_root_json='invalid-json'`;
        const before = fake.calls.length;
        expect((yield* service.listChildren(input).pipe(Effect.flip)).kind).toBe(
          state === "disconnected"
            ? "auth-required"
            : state === "deleted"
              ? "not-found"
              : "unavailable",
        );
        expect(fake.calls).toHaveLength(before);
      }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect.each([
    "unlink",
    "clear",
    "replace",
    "rebind",
    "disconnect",
    "reconnect",
    "delete",
    "storage",
  ] as const)("discards a page when %s happens during the GET", (change) =>
    Effect.gen(function* () {
      const { service, fake, input, connection, store, oauth, signIn, root } = yield* browseSetup;
      const gate = { entered: yield* Deferred.make<void>(), release: yield* Deferred.make<void>() };
      fake.state.listRequests.push({
        files: [{ id: "late", name: "Late", mimeType: "text/plain" }],
        gate,
      });
      const pending = yield* service.listChildren(input).pipe(Effect.flip, Effect.forkChild);
      yield* Deferred.await(gate.entered);
      const sql = yield* SqlClient.SqlClient;
      if (change === "unlink")
        yield* sql`UPDATE workspace_links SET status='dismissed' WHERE link_id=${rootLinkId}`;
      if (change === "clear") yield* service.setProjectRoot({ projectId, root: null });
      if (change === "replace")
        yield* sql`UPDATE workspace_project_config SET drive_root_json=${encodeJson({ ...root, fileId: "replacement" })}`;
      if (change === "rebind")
        yield* sql`UPDATE drive_file_bindings SET connection_id='other' WHERE file_id='synkek-root'`;
      if (change === "disconnect" || change === "reconnect") yield* store.disconnect(connection.id);
      if (change === "reconnect") {
        const sign = yield* signIn;
        yield* oauth.complete(sign.flow.flowId, sign.returned.href);
      }
      if (change === "delete")
        yield* sql`UPDATE projection_projects SET deleted_at='2026-10-14T00:00:00Z' WHERE project_id=${projectId}`;
      if (change === "storage") yield* sql`ALTER TABLE workspace_links RENAME TO unavailable_links`;
      yield* Deferred.succeed(gate.release, undefined);
      expect((yield* Fiber.join(pending)).kind).toBe(
        change === "storage" ? "unavailable" : "conflict",
      );
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect.each([401, 403, 404])(
    "sanitizes provider %s without alternate-account retries",
    (status) =>
      Effect.gen(function* () {
        const { service, fake, input, store, connection } = yield* browseSetup;
        fake.state.listRequests.push({ status });
        const before = fake.calls.length;
        const error = yield* service.listChildren(input).pipe(Effect.flip);
        expect(error.kind).toBe(
          status === 401 ? "auth-required" : status === 404 ? "not-found" : "unavailable",
        );
        expect(error.message).not.toContain("synthetic");
        expect(fake.calls).toHaveLength(before + 2);
        expect((yield* store.get(connection.id)).connected).toBe(status !== 401);
        expect((yield* service.getProjectRoot({ projectId })).root).not.toBeNull();
      }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect.each([true, false])("reports incompleteSearch with continuation=%s", (continuation) =>
    Effect.gen(function* () {
      const { service, fake, input } = yield* browseSetup;
      fake.state.listRequests.push({
        files: [],
        incompleteSearch: true,
        ...(continuation ? { nextPageToken: "next" } : {}),
      });
      const page = yield* service.listChildren(input);
      expect(page.incomplete).toBe(true);
      expect(page.limitation).toBe("Results may be incomplete. Refresh or open Google Drive.");
      expect(Boolean(page.nextCursor)).toBe(continuation);
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect(
    "verifies bounded parent metadata and returns a fresh root without rewriting its binding",
    () =>
      Effect.gen(function* () {
        const { service, fake, input } = yield* browseSetup;
        fake.state.metadata["synkek-root"] = {
          id: "synkek-root",
          name: "Renamed root",
          mimeType: "application/vnd.google-apps.folder",
        };
        fake.state.metadata["child-folder"] = {
          id: "child-folder",
          name: "Folder",
          mimeType: "application/vnd.google-apps.folder",
          parents: ["synkek-root"],
          driveId: "shared",
        };
        fake.state.listRequests.push({ files: [] });
        const before = fake.calls.length;
        const page = yield* service.listChildren({
          ...input,
          parentId: "child-folder",
          path: ["child-folder"],
        });
        expect(page.rootFile?.name).toBe("Renamed root");
        expect(fake.calls).toHaveLength(before + 3);
        expect((yield* service.getBinding({ fileId: "synkek-root" })).binding?.file.name).toBe(
          "Launch brief",
        );
        expect(
          yield* service.getBindings({ fileIds: ["synkek-root", "child-folder", "synkek-root"] }),
        ).toMatchObject({ bindings: [{ file: { id: "synkek-root" } }] });
        expect(fake.calls).toHaveLength(before + 3);
      }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect.each([
    "shortcut",
    "wrong-parent",
    "missing-parents",
    "trashed",
    "cycle",
    "duplicate",
    "deep",
    "wrong-end",
  ] as const)("refuses %s paths without a listing", (invalid) =>
    Effect.gen(function* () {
      const { service, fake, input } = yield* browseSetup;
      fake.state.metadata["child-folder"] = {
        id: "child-folder",
        name: "Folder",
        mimeType:
          invalid === "shortcut"
            ? "application/vnd.google-apps.shortcut"
            : "application/vnd.google-apps.folder",
        ...(invalid === "missing-parents"
          ? {}
          : { parents: [invalid === "wrong-parent" ? "outside" : "synkek-root"] }),
        ...(invalid === "trashed" ? { trashed: true } : {}),
      };
      const path =
        invalid === "cycle"
          ? ["synkek-root", "child-folder"]
          : invalid === "duplicate"
            ? ["child-folder", "child-folder"]
            : invalid === "deep"
              ? Array.from({ length: 17 }, (_, index) => `folder-${index}`)
              : ["child-folder"];
      const before = fake.calls.length;
      const error = yield* service
        .listChildren({
          ...input,
          parentId: invalid === "wrong-end" ? "different" : path.at(-1)!,
          path,
        })
        .pipe(Effect.flip);
      expect(error.kind).toBe(
        invalid === "shortcut" || invalid === "missing-parents"
          ? "unsupported"
          : invalid === "trashed"
            ? "not-found"
            : "invalid-input",
      );
      expect(
        fake.calls.slice(before).filter((call) => call.url.pathname.endsWith("/files")),
      ).toHaveLength(0);
      if (["cycle", "duplicate", "deep", "wrong-end"].includes(invalid))
        expect(fake.calls).toHaveLength(before);
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect(
    "pages metadata without binding descendants, fetching bodies or writing relationships",
    () =>
      Effect.gen(function* () {
        const { service, fake, input, store } = yield* browseSetup;
        const sql = yield* SqlClient.SqlClient;
        const firstFiles = Array.from({ length: 20 }, (_, index) => ({
          id: `child-${index}`,
          name: "Same name",
          mimeType: "text/plain",
        }));
        fake.state.listRequests.push(
          { files: firstFiles, nextPageToken: "provider-next" },
          {
            files: [
              firstFiles[19],
              { id: "shared", name: "Same name", mimeType: "text/plain", driveId: "shared-drive" },
            ],
          },
          { files: [] },
        );
        const before = fake.calls.length;
        const counter = Option.getOrThrow(yield* Stream.runHead(store.changes));
        const configs = yield* sql`SELECT * FROM workspace_project_config`;
        expect(configs).toHaveLength(1);
        expect(yield* service.getBinding({ fileId: "child-0" })).toEqual({});
        expect((yield* service.readFile({ fileId: "child-0" }).pipe(Effect.flip)).kind).toBe(
          "connection-required",
        );
        expect(fake.calls).toHaveLength(before);
        const first = yield* service.listChildren(input);
        expect(first.files).toHaveLength(20);
        expect(first.nextCursor).toBeTruthy();
        expect(first.nextCursor).not.toContain("provider-next");
        const second = yield* service.listChildren({ ...input, cursor: first.nextCursor! });
        const collected = new Map([...first.files, ...second.files].map((file) => [file.id, file]));
        expect([...collected.keys()]).toEqual([...firstFiles.map((file) => file.id), "shared"]);
        expect(second.files.at(-1)?.owners).toBeUndefined();
        expect(second.nextCursor).toBeUndefined();
        expect((yield* service.listChildren(input)).files).toEqual([]);
        const browseCalls = fake.calls.slice(before);
        expect(browseCalls).toHaveLength(6);
        expect(browseCalls.filter((call) => call.url.pathname.endsWith("/files"))).toHaveLength(3);
        expect(
          browseCalls.filter((call) => call.url.pathname.endsWith("/files/synkek-root")),
        ).toHaveLength(3);
        expect(
          browseCalls.every(
            (call) =>
              call.method === "GET" &&
              !call.url.pathname.endsWith("/export") &&
              !call.url.searchParams.has("alt"),
          ),
        ).toBe(true);
        expect(yield* sql`SELECT file_id FROM drive_file_bindings`).toEqual([
          { file_id: "synkek-root" },
        ]);
        expect(yield* sql`SELECT link_id FROM workspace_links`).toEqual([{ link_id: rootLinkId }]);
        expect(Option.getOrThrow(yield* Stream.runHead(store.changes))).toBe(counter);
        expect(yield* sql`SELECT * FROM workspace_project_config`).toEqual(configs);
        expect(yield* service.getBinding({ fileId: "child-0" })).toEqual({});
        const readsBefore = fake.calls.length;
        expect((yield* service.readFile({ fileId: "child-0" }).pipe(Effect.flip)).kind).toBe(
          "connection-required",
        );
        expect(fake.calls).toHaveLength(readsBefore);
      }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect("rejects a continuation after root clear before any Google request", () =>
    Effect.gen(function* () {
      const { service, fake, input } = yield* browseSetup;
      fake.state.listRequests.push({ files: [], nextPageToken: "next" });
      const first = yield* service.listChildren(input);
      const before = fake.calls.length;
      yield* service.setProjectRoot({ projectId, root: null });
      expect(
        (yield* service.listChildren({ ...input, cursor: first.nextCursor! }).pipe(Effect.flip))
          .kind,
      ).toBe("conflict");
      expect(fake.calls).toHaveLength(before);
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect(
    "retains an unavailable designation when stored root metadata is no longer a folder",
    () =>
      Effect.gen(function* () {
        const { service, fake, root, input } = yield* browseSetup;
        const sql = yield* SqlClient.SqlClient;
        yield* sql`UPDATE drive_file_bindings SET file_json=${encodeJson({ id: root.fileId, name: "Changed", mimeType: "text/plain", url: "https://drive.google.com/file/d/synkek-root/view" })} WHERE file_id=${root.fileId}`;
        expect(yield* service.getProjectRoot({ projectId })).toMatchObject({
          root,
          state: "unavailable",
        });
        const before = fake.calls.length;
        expect((yield* service.listChildren(input).pipe(Effect.flip)).kind).toBe("unavailable");
        expect(fake.calls).toHaveLength(before);
      }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
});
describe("Drive read-only account and file lifecycle", () => {
  it.effect("retains unavailable designations through unlink, rebind, disconnect and restart", () =>
    Effect.gen(function* () {
      const { fake, oauth, service, store, connection, signIn } = yield* setup;
      const sign = yield* signIn;
      yield* oauth.complete(sign.flow.flowId, sign.returned.href);
      yield* seedRootLink;
      expect((yield* service.getProjectRoot({ projectId })).state).toBe("unconfigured");
      const initialSql = yield* SqlClient.SqlClient;
      const beforeClear = fake.calls.length;
      yield* service.setProjectRoot({ projectId, root: null });
      expect(yield* initialSql`SELECT * FROM workspace_project_config`).toEqual([]);
      expect(fake.calls).toHaveLength(beforeClear);
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
    "ref-only",
    "key-only",
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
        const nextFile = {
          type: "file" as const,
          provider: "google-drive" as const,
          fileId: "replacement",
        };
        const nextId = "wl_00000000-0000-0000-0000-000000000002";
        yield* sql`INSERT INTO workspace_links(link_id,key_a,key_b,ref_a_json,ref_b_json,status,source_json,created_at,updated_at) SELECT ${nextId},${workspaceItemKey(nextFile)},key_b,${encodeJson(nextFile)},ref_b_json,status,source_json,created_at,updated_at FROM workspace_links WHERE link_id=${rootLinkId}`;
        yield* service.bindFile({ connectionId: connection.id, fileId: nextFile.fileId });
        const next = { linkId: nextId, connectionId: connection.id, fileId: nextFile.fileId };
        if (invalid === "suggested" || invalid === "dismissed")
          yield* sql`UPDATE workspace_links SET status=${invalid} WHERE link_id=${nextId}`;
        if (invalid === "foreign" || invalid === "key-only")
          yield* sql`UPDATE workspace_links SET key_b='project:other' WHERE link_id=${nextId}`;
        if (invalid === "foreign" || invalid === "ref-only")
          yield* sql`UPDATE workspace_links SET ref_b_json=${encodeJson({ type: "project", projectId: "other" })} WHERE link_id=${nextId}`;
        if (invalid === "non-folder") fake.state.mimeType = "text/plain";
        if (invalid === "missing-binding")
          yield* sql`DELETE FROM drive_file_bindings WHERE file_id=${next.fileId}`;
        if (invalid === "mismatched-binding")
          yield* sql`UPDATE drive_file_bindings SET connection_id='other' WHERE file_id=${next.fileId}`;
        if (invalid === "deleted-project")
          yield* sql`UPDATE projection_projects SET deleted_at='2026-10-14T00:00:00Z'`;
        if (invalid === "removed-connection") yield* store.disconnect(connection.id, true);
        const before = yield* sql`SELECT * FROM workspace_project_config`;
        const bindings = yield* sql`SELECT * FROM drive_file_bindings`;
        const links = yield* sql`SELECT * FROM workspace_links`;
        const calls = fake.calls.length;
        const tokenCalls = fake.state.tokenCalls;
        const error = yield* service.setProjectRoot({ projectId, root: next }).pipe(Effect.flip);
        const expectedKind =
          invalid === "missing-binding" || invalid === "mismatched-binding"
            ? "connection-required"
            : invalid === "deleted-project"
              ? "not-found"
              : invalid === "removed-connection"
                ? "auth-required"
                : "invalid-input";
        expect(error.kind).toBe(expectedKind);
        expect(fake.state.tokenCalls).toBe(tokenCalls);
        expect(fake.calls).toHaveLength(calls + (invalid === "non-folder" ? 1 : 0));
        expect(before[0]!.drive_root_json).toBe(encodeJson(root));
        if (invalid !== "deleted-project")
          expect((yield* service.getProjectRoot({ projectId })).root).toEqual(root);
        expect(yield* sql`SELECT * FROM workspace_project_config`).toEqual(before);
        expect(yield* sql`SELECT * FROM drive_file_bindings`).toEqual(bindings);
        expect(yield* sql`SELECT * FROM workspace_links`).toEqual(links);
      }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect.each([
    "disconnect",
    "reconnect",
    "rebind",
    "unlink",
    "delete-project",
    "storage-error",
    "storage-read-error",
  ] as const)("rechecks %s after a pending metadata read before saving a root", (change) =>
    Effect.gen(function* () {
      const { fake, oauth, service, store, connection, signIn } = yield* setup;
      const sign = yield* signIn;
      yield* oauth.complete(sign.flow.flowId, sign.returned.href);
      yield* seedRootLink;
      fake.state.mimeType = "application/vnd.google-apps.folder";
      yield* service.bindFile({ connectionId: connection.id, fileId: "synkek-root" });
      const generation = (yield* store.get(connection.id)).generation;
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
      if (change === "disconnect" || change === "reconnect") yield* store.disconnect(connection.id);
      if (change === "reconnect") {
        const reconnect = yield* signIn;
        yield* oauth.complete(reconnect.flow.flowId, reconnect.returned.href);
        expect((yield* store.get(connection.id)).connected).toBe(true);
        expect((yield* store.get(connection.id)).generation).toBe(generation + 1);
      }
      if (change === "storage-error")
        yield* sql`UPDATE drive_file_bindings SET file_json='broken' WHERE file_id='synkek-root'`;
      if (change === "storage-read-error")
        yield* sql`ALTER TABLE workspace_links RENAME TO unavailable_links`;
      if (change === "rebind") yield* sql`UPDATE drive_file_bindings SET connection_id='other'`;
      if (change === "unlink") yield* sql`UPDATE workspace_links SET status='dismissed'`;
      if (change === "delete-project")
        yield* sql`UPDATE projection_projects SET deleted_at='2026-10-14T00:00:00Z'`;
      yield* Deferred.succeed(release, undefined);
      expect((yield* Fiber.join(pending)).kind).toBe(
        change === "storage-error" || change === "storage-read-error" ? "unavailable" : "conflict",
      );
      expect(yield* sql`SELECT * FROM workspace_project_config`).toHaveLength(0);
    }).pipe(Effect.scoped, Effect.provide(testLayer())),
  );
  it.effect("keeps a root designation separate from links and legacy settings saves", () =>
    Effect.gen(function* () {
      const { fake, oauth, service, store, connection, signIn } = yield* setup;
      const sign = yield* signIn;
      yield* oauth.complete(sign.flow.flowId, sign.returned.href);
      yield* seedRootLink;
      fake.state.mimeType = "application/vnd.google-apps.folder";
      yield* service.bindFile({ connectionId: connection.id, fileId: "synkek-root" });
      const root = { linkId: rootLinkId, connectionId: connection.id, fileId: "synkek-root" };
      const beforeSet = Option.getOrThrow(yield* Stream.runHead(store.changes));
      expect((yield* service.setProjectRoot({ projectId, root })).state).toBe("available");
      const afterSet = Option.getOrThrow(yield* Stream.runHead(store.changes));
      expect(afterSet).toBe(beforeSet + 1);
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
      expect(Option.getOrThrow(yield* Stream.runHead(store.changes))).toBe(afterSet + 1);
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
