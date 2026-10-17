import {
  DriveBrowseInput,
  type DriveBrowsePage,
  DriveError,
  type DriveReadResult,
  type ProjectId,
  type WorkspaceDriveRoot,
} from "@t3tools/contracts";
import * as NodeCrypto from "node:crypto";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { sliceUtf8 } from "../mail/MailImapRead.ts";
import { DriveApi, validateListInput } from "./DriveApi.ts";
import { DriveOAuth } from "./DriveOAuth.ts";
import { DriveStore } from "./DriveStore.ts";
const Cursor = Schema.Struct({
  version: Schema.Literal(1),
  pageToken: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096)),
  expiresAt: Schema.Number,
  generation: Schema.Int,
  rootKey: Schema.String.check(Schema.isMaxLength(512)),
  fingerprint: Schema.String.check(Schema.isMaxLength(64)),
});
const encodeCursor = Schema.encodeSync(Schema.fromJsonString(Cursor));
const decodeCursor = Schema.decodeUnknownEffect(Schema.fromJsonString(Cursor));
const encodeInput = Schema.encodeSync(Schema.fromJsonString(DriveBrowseInput));
const decodeInput = Schema.decodeUnknownEffect(DriveBrowseInput);
const fail = (kind: DriveError["kind"], message: string) => new DriveError({ kind, message });
const scopeChanged = () =>
  fail("conflict", "The project folder, connection or browse scope changed. Refresh the folder.");
export const make = Effect.gen(function* () {
  const store = yield* DriveStore;
  const oauth = yield* DriveOAuth;
  const api = yield* DriveApi;
  const cursorKey = NodeCrypto.randomBytes(32);
  const signature = (body: string) =>
    NodeCrypto.createHmac("sha256", cursorKey).update(body).digest();
  const readCursor = Effect.fnUntraced(function* (value: string) {
    const parts = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{43})$/.exec(value);
    if (!parts)
      return yield* fail("invalid-input", "Use the continuation cursor returned by this server.");
    const body = parts[1]!;
    const supplied = Buffer.from(parts[2]!, "base64url");
    if (supplied.length !== 32 || !NodeCrypto.timingSafeEqual(signature(body), supplied))
      return yield* scopeChanged();
    return yield* decodeCursor(Buffer.from(body, "base64url").toString("utf8")).pipe(
      Effect.mapError(scopeChanged),
    );
  });
  const observe = <A, R>(
    connectionId: string,
    generation: number,
    effect: Effect.Effect<A, DriveError, R>,
  ) =>
    effect.pipe(
      Effect.catch((error) =>
        error.kind === "auth-required"
          ? store.health(connectionId, generation, error.message, true).pipe(Effect.andThen(error))
          : Effect.fail(error),
      ),
    );

  return {
    listChildren: Effect.fnUntraced(function* (raw: DriveBrowseInput) {
      const decoded = yield* decodeInput(raw).pipe(
        Effect.mapError(() =>
          fail("invalid-input", "Use a valid bounded folder path and page size."),
        ),
      );
      const filters = yield* validateListInput(decoded);
      const { cursor: rawCursor, query, modifiedAfter, modifiedBefore, ...scope } = decoded;
      const normalized = {
        ...scope,
        ...(query?.trim() ? { query: query.trim() } : {}),
        ...(modifiedAfter
          ? { modifiedAfter: DateTime.formatIso(DateTime.makeUnsafe(modifiedAfter)) }
          : {}),
        ...(modifiedBefore
          ? { modifiedBefore: DateTime.formatIso(DateTime.makeUnsafe(modifiedBefore)) }
          : {}),
      };
      const fingerprint = NodeCrypto.createHash("sha256")
        .update(encodeInput(normalized))
        .digest("hex");
      const cursor = rawCursor ? yield* readCursor(rawCursor) : undefined;
      const now = DateTime.toEpochMillis(yield* DateTime.now);
      if (cursor && (cursor.fingerprint !== fingerprint || cursor.expiresAt <= now))
        return yield* scopeChanged();
      if (
        (decoded.path.length > 0 && decoded.path.at(-1) !== decoded.parentId) ||
        new Set(decoded.path).size !== decoded.path.length
      )
        return yield* fail(
          "invalid-input",
          "Use the folder path returned by navigation, without cycles.",
        );
      const getRoot = () =>
        store
          .getProjectRoot(decoded.projectId)
          .pipe(
            Effect.catchIf(
              (error) => cursor !== undefined && error.kind !== "unavailable",
              scopeChanged,
            ),
          );
      const designation = yield* getRoot();
      const root = designation.root;
      const rootKey = root ? `${root.linkId}:${root.connectionId}:${root.fileId}` : "";
      if (cursor && (cursor.rootKey !== rootKey || designation.state !== "available"))
        return yield* scopeChanged();
      if (!root || designation.state !== "available")
        return yield* fail(
          designation.state === "disconnected"
            ? "auth-required"
            : designation.state === "unconfigured"
              ? "connection-required"
              : "unavailable",
          "The designated project folder is unavailable. Check its link and Drive connection in Settings.",
        );
      if (root.connectionId !== decoded.connectionId)
        return yield* fail(
          "invalid-input",
          "Use the designated project folder's Drive connection.",
        );
      if (
        decoded.path.includes(root.fileId) ||
        (decoded.path.length === 0 && decoded.parentId !== root.fileId)
      )
        return yield* fail(
          "invalid-input",
          "Use a folder path below the designated project folder.",
        );
      const connection = yield* store.get(root.connectionId);
      if (cursor && connection.generation !== cursor.generation) return yield* scopeChanged();
      const access = yield* oauth.accessToken(root.connectionId);
      if (access.generation !== connection.generation) return yield* scopeChanged();
      const metadata = (fileId: string) =>
        observe(root.connectionId, access.generation, api.file(access.token, fileId));
      const rootFile = yield* metadata(root.fileId);
      if (rootFile.mimeType !== "application/vnd.google-apps.folder")
        return yield* fail(
          "unavailable",
          "The project folder is no longer a folder. Open it in Google Drive.",
        );
      let parent = root.fileId;
      for (const fileId of decoded.path) {
        const file = yield* metadata(fileId);
        if (file.mimeType !== "application/vnd.google-apps.folder" || file.shortcutDetails)
          return yield* fail(
            "unsupported",
            "Shortcuts and files cannot be browsed as project folders. Open them in Google Drive.",
          );
        if (!file.parents?.length)
          return yield* fail(
            "unsupported",
            "Google Drive did not provide enough folder metadata to verify this path. Open the folder in Google Drive.",
          );
        if (!file.parents.includes(parent))
          return yield* fail(
            "invalid-input",
            "This folder is outside the designated project folder path.",
          );
        parent = fileId;
      }
      const page = yield* observe(
        root.connectionId,
        access.generation,
        api.listChildren(access.token, {
          ...filters,
          ...(cursor ? { pageToken: cursor.pageToken } : {}),
        }),
      );
      const currentRoot = yield* store
        .getProjectRoot(decoded.projectId)
        .pipe(Effect.catchIf((error) => error.kind !== "unavailable", scopeChanged));
      const current = yield* store
        .get(root.connectionId)
        .pipe(Effect.catchIf((error) => error.kind !== "unavailable", scopeChanged));
      if (
        currentRoot.state !== "available" ||
        !currentRoot.root ||
        `${currentRoot.root.linkId}:${currentRoot.root.connectionId}:${currentRoot.root.fileId}` !==
          rootKey ||
        !current.connected ||
        current.generation !== access.generation
      )
        return yield* scopeChanged();
      let nextCursor: string | undefined;
      if (page.nextPageToken) {
        const body = Buffer.from(
          encodeCursor({
            version: 1,
            pageToken: page.nextPageToken,
            expiresAt: now + 600000,
            generation: access.generation,
            rootKey,
            fingerprint,
          }),
        ).toString("base64url");
        nextCursor = `${body}.${signature(body).toString("base64url")}`;
        if (nextCursor.length > 8192)
          return yield* fail(
            "unavailable",
            "Google Drive returned an oversized continuation token.",
          );
      }
      return {
        files: [...new Map(page.files.map((file) => [file.id, file])).values()],
        rootFile,
        ...(nextCursor ? { nextCursor } : {}),
        incomplete: page.incomplete,
        ...(page.incomplete
          ? { limitation: "Results may be incomplete. Refresh or open Google Drive." }
          : {}),
      } satisfies DriveBrowsePage;
    }),
    getProjectRoot: ({ projectId }: { projectId: ProjectId }) => store.getProjectRoot(projectId),
    setProjectRoot: ({
      projectId,
      root,
    }: {
      projectId: ProjectId;
      root: WorkspaceDriveRoot | null;
    }) =>
      Effect.gen(function* () {
        if (root === null) return yield* store.clearProjectRoot(projectId);
        yield* store.validateProjectRoot(projectId, root);
        const access = yield* oauth.accessToken(root.connectionId);
        const file = yield* observe(
          root.connectionId,
          access.generation,
          api.file(access.token, root.fileId),
        );
        if (file.mimeType !== "application/vnd.google-apps.folder")
          return yield* new DriveError({
            kind: "invalid-input",
            message: "Choose a Google Drive folder.",
          });
        return yield* store.saveProjectRoot(projectId, root, {
          generation: access.generation,
          file,
        });
      }),
    listConnections: store.list,
    upsertConnection: store.upsert,
    disconnectConnection: ({ connectionId }: { connectionId: string }) =>
      store.disconnect(connectionId),
    removeConnection: ({ connectionId }: { connectionId: string }) =>
      store.disconnect(connectionId, true),
    startOAuth: ({ connectionId }: { connectionId: string }) => oauth.start(connectionId),
    completeOAuth: ({ flowId, redirectUrl }: { flowId: string; redirectUrl: string }) =>
      oauth.complete(flowId, redirectUrl),
    cancelOAuth: ({ flowId }: { flowId: string }) => oauth.cancel(flowId),
    changes: store.changes,
    getBinding: ({ fileId }: { fileId: string }) =>
      store
        .binding(fileId)
        .pipe(Effect.map((binding) => (Option.isSome(binding) ? { binding: binding.value } : {}))),
    getBindings: ({ fileIds }: { fileIds: readonly string[] }) =>
      store.bindings(fileIds).pipe(Effect.map((bindings) => ({ bindings }))),
    search: ({
      connectionId,
      query,
      limit = 20,
    }: {
      connectionId: string;
      query: string;
      limit?: number;
    }) =>
      Effect.gen(function* () {
        if (
          !query.trim() ||
          query.length > 256 ||
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > 20
        )
          return yield* new DriveError({
            kind: "invalid-input",
            message: "Enter a search and a page size from 1 to 20.",
          });
        const access = yield* oauth.accessToken(connectionId);
        const result = yield* observe(
          connectionId,
          access.generation,
          api.search(access.token, query.trim(), limit),
        );
        const current = yield* store.get(connectionId);
        if (!current.connected || current.generation !== access.generation)
          return yield* new DriveError({
            kind: "conflict",
            message: "The Drive connection changed. Search again.",
          });
        return result;
      }),
    bindFile: ({ connectionId, fileId }: { connectionId: string; fileId: string }) =>
      Effect.gen(function* () {
        const access = yield* oauth.accessToken(connectionId);
        const file = yield* observe(
          connectionId,
          access.generation,
          api.file(access.token, fileId),
        );
        return yield* store.bind(connectionId, access.generation, file);
      }),
    readFile: ({ fileId, offset = 0 }: { fileId: string; offset?: number }) =>
      Effect.gen(function* () {
        const binding = yield* store.binding(fileId);
        if (Option.isNone(binding))
          return yield* new DriveError({
            kind: "connection-required",
            message: "Choose a Drive connection for this file before reading it.",
          });
        const connectionId = binding.value.connectionId;
        const access = yield* oauth.accessToken(connectionId);
        const file = yield* observe(
          connectionId,
          access.generation,
          api.file(access.token, fileId),
        );
        const content = yield* observe(
          connectionId,
          access.generation,
          api.content(access.token, file),
        );
        const current = yield* store.get(connectionId);
        if (!current.connected || current.generation !== access.generation)
          return yield* new DriveError({
            kind: "conflict",
            message: "The Drive connection changed. Read the file again.",
          });
        if (
          !Number.isSafeInteger(offset) ||
          offset < 0 ||
          offset > content.bytes.length ||
          (offset < content.bytes.length && (content.bytes[offset]! & 0xc0) === 0x80)
        )
          return yield* new DriveError({
            kind: "invalid-input",
            message: "Use the nextOffset returned by the previous read.",
          });
        const text = content.bytes.toString("utf8");
        let budget = 24000;
        let body = sliceUtf8(text, offset, budget);
        const limitation = [
          content.limitation,
          content.truncated
            ? "Reading stops at 256 KiB. Open the full file in Google Drive."
            : undefined,
        ]
          .filter(Boolean)
          .join(" ");
        const result = (): DriveReadResult => ({
          connectionId,
          file,
          body: { ...body, truncated: body.truncated || content.truncated },
          ...(limitation ? { limitation } : {}),
        });
        // @effect-diagnostics preferSchemaOverJson:off - Measures the transport's serialized result.
        while (Buffer.byteLength(JSON.stringify(result())) > 30000 && budget > 64) {
          budget = Math.floor(budget / 2);
          body = sliceUtf8(text, offset, budget);
        }
        return result();
      }),
  };
});
export class DriveService extends Context.Service<DriveService, Effect.Success<typeof make>>()(
  "t3/drive/DriveService",
) {}
export const layer = Layer.effect(DriveService, make);
