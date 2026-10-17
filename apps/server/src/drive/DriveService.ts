import {
  DriveError,
  type DriveReadResult,
  type ProjectId,
  type WorkspaceDriveRoot,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { sliceUtf8 } from "../mail/MailImapRead.ts";
import { DriveApi } from "./DriveApi.ts";
import { DriveOAuth } from "./DriveOAuth.ts";
import { DriveStore } from "./DriveStore.ts";
export const make = Effect.gen(function* () {
  const store = yield* DriveStore;
  const oauth = yield* DriveOAuth;
  const api = yield* DriveApi;
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
    getProjectRoot: ({ projectId }: { projectId: ProjectId }) => store.getProjectRoot(projectId),
    setProjectRoot: ({
      projectId,
      root,
    }: {
      projectId: ProjectId;
      root: WorkspaceDriveRoot | null;
    }) =>
      Effect.gen(function* () {
        if (root === null) return yield* store.saveProjectRoot(projectId, null);
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
