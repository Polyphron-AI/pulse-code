import {
  DriveError,
  DriveIdentity,
  DriveFile,
  type DriveConnectionInput,
  type DriveConnection,
  type DriveBinding,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { ServerSecretStore } from "../auth/ServerSecretStore.ts";

interface Row {
  id: string;
  nickname: string;
  clientId: string;
  clientSecretConfigured: number;
  connected: number;
  removed: number;
  identityJson: string | null;
  generation: number;
  error: string | null;
}
export interface StoredDriveConnection {
  readonly id: string;
  readonly nickname: string;
  readonly clientId: string;
  readonly generation: number;
  readonly connected: boolean;
  readonly identity?: typeof DriveIdentity.Type;
}
export const DriveCredential = Schema.Struct({
  refreshToken: Schema.String,
  accessToken: Schema.optionalKey(Schema.String),
  expiresAt: Schema.optionalKey(Schema.Number),
});
export type DriveCredential = typeof DriveCredential.Type;
const identityJson = Schema.fromJsonString(DriveIdentity);
const fileJson = Schema.fromJsonString(DriveFile);
const credentialJson = Schema.fromJsonString(DriveCredential);
const decodeIdentity = Schema.decodeUnknownEffect(identityJson);
const decodeFile = Schema.decodeUnknownEffect(fileJson);
const decodeCredential = Schema.decodeUnknownEffect(credentialJson);
const encodeIdentity = Schema.encodeSync(identityJson);
const encodeFile = Schema.encodeSync(fileJson);
const encodeCredential = Schema.encodeSync(credentialJson);
const isDriveError = Schema.is(DriveError);
const fail = (kind: DriveError["kind"], message: string) => new DriveError({ kind, message });
const unavailable = () =>
  fail(
    "unavailable",
    "Drive settings or credentials could not be saved or read. Retry when server storage is available.",
  );
const missing = () =>
  fail("not-found", "This Drive connection is unavailable. Choose a connection in Settings.");
const tokenKey = (id: string) => `drive-token-${id}`;
const clientKey = (id: string) => `drive-client-${id}`;

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const secrets = yield* ServerSecretStore;
  const crypto = yield* Crypto.Crypto;
  const control = yield* Semaphore.make(1);
  const changes = yield* SubscriptionRef.make(0);
  const announce = SubscriptionRef.update(changes, (value) => value + 1);
  const safe = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.mapError((error) => (isDriveError(error) ? error : unavailable())));
  const mutate = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    control.withPermits(1)(safe(effect)).pipe(Effect.ensuring(announce));
  const columns = sql`id, nickname, client_id AS "clientId", client_secret_configured AS "clientSecretConfigured", connected, removed, identity_json AS "identityJson", generation, error`;
  const row = (id: string) =>
    sql<Row>`SELECT ${columns} FROM drive_connections WHERE id = ${id}`.pipe(
      Effect.map((rows) => rows[0]),
    );
  const requireRow = (id: string) =>
    Effect.gen(function* () {
      const found = yield* row(id);
      if (!found || found.removed) return yield* missing();
      return found;
    });
  const identity = (found: Row) =>
    found.identityJson === null ? Effect.succeed(undefined) : decodeIdentity(found.identityJson);
  const publicConnection = (found: Row) =>
    Effect.gen(function* () {
      const who = yield* identity(found);
      return {
        id: found.id,
        nickname: found.nickname,
        clientId: found.clientId,
        clientSecretConfigured: found.clientSecretConfigured === 1,
        connected: found.connected === 1,
        ...(who ? { identity: who } : {}),
        ...(found.error ? { error: found.error } : {}),
      } satisfies DriveConnection;
    });
  const get = (id: string) =>
    safe(
      Effect.gen(function* () {
        const found = yield* requireRow(id);
        const who = yield* identity(found);
        return {
          id: found.id,
          nickname: found.nickname,
          clientId: found.clientId,
          generation: found.generation,
          connected: found.connected === 1,
          ...(who ? { identity: who } : {}),
        };
      }),
    );
  const list = safe(
    sql<Row>`SELECT ${columns} FROM drive_connections WHERE removed = 0 ORDER BY nickname LIMIT 32`.pipe(
      Effect.flatMap((rows) => Effect.forEach(rows, publicConnection)),
    ),
  );
  const readCredential = (id: string) =>
    safe(
      Effect.gen(function* () {
        yield* requireRow(id);
        const secret = yield* secrets.get(tokenKey(id));
        if (Option.isNone(secret)) return Option.none<DriveCredential>();
        return Option.some(yield* decodeCredential(new TextDecoder().decode(secret.value)));
      }),
    );
  return {
    get,
    list,
    readCredential,
    upsert: (input: DriveConnectionInput) =>
      mutate(
        Effect.gen(function* () {
          const nickname = input.nickname.trim();
          const clientId = input.clientId.trim();
          if (!nickname || !clientId)
            return yield* fail(
              "invalid-input",
              "Enter a connection name and your Google client ID.",
            );
          const existingNickname =
            (yield* sql<Row>`SELECT ${columns} FROM drive_connections WHERE nickname_key = ${nickname.toLowerCase()}`)[0];
          const existing = input.id ? yield* row(input.id) : existingNickname;
          if (input.id && !existing) return yield* missing();
          if (existingNickname && existingNickname.id !== existing?.id)
            return yield* fail("conflict", "Choose a different connection name.");
          if (
            !existing &&
            (yield* sql`SELECT 1 FROM drive_connections WHERE removed = 0 LIMIT 32`).length >= 32
          )
            return yield* fail("limit-exceeded", "At most 32 Drive connections are supported.");
          const id = existing?.id ?? `drv_${yield* crypto.randomUUIDv4}`;
          const secretChanged =
            input.clearClientSecret === true || Boolean(input.clientSecret?.trim());
          const changedAuth =
            existing !== undefined &&
            (existing.clientId !== clientId || secretChanged || existing.removed === 1);
          if (changedAuth) yield* secrets.remove(tokenKey(id));
          if (input.clearClientSecret) yield* secrets.remove(clientKey(id));
          if (input.clientSecret?.trim())
            yield* secrets.set(clientKey(id), new TextEncoder().encode(input.clientSecret.trim()));
          const configured = input.clientSecret?.trim()
            ? 1
            : input.clearClientSecret
              ? 0
              : (existing?.clientSecretConfigured ?? 0);
          yield* sql`INSERT INTO drive_connections (id, nickname, nickname_key, client_id, client_secret_configured) VALUES (${id}, ${nickname}, ${nickname.toLowerCase()}, ${clientId}, ${configured}) ON CONFLICT(id) DO UPDATE SET nickname = excluded.nickname, nickname_key = excluded.nickname_key, client_id = excluded.client_id, client_secret_configured = excluded.client_secret_configured, removed = 0, error = NULL, connected = CASE WHEN ${changedAuth ? 1 : 0} = 1 THEN 0 ELSE connected END, generation = generation + ${changedAuth ? 1 : 0}`;
          return yield* publicConnection(yield* requireRow(id));
        }),
      ),
    readClientSecret: (id: string) =>
      safe(
        requireRow(id).pipe(
          Effect.andThen(secrets.get(clientKey(id))),
          Effect.map(Option.map((bytes) => new TextDecoder().decode(bytes))),
        ),
      ),
    setCredential: (
      id: string,
      generation: number,
      who: typeof DriveIdentity.Type,
      credential: DriveCredential,
    ) =>
      mutate(
        Effect.gen(function* () {
          const found = yield* requireRow(id);
          if (found.generation !== generation)
            return yield* fail("conflict", "This connection changed during sign-in. Start again.");
          const previous = yield* identity(found);
          if (previous && previous.id !== who.id)
            return yield* fail(
              "conflict",
              "This connection belongs to a different Google account. Create a new Drive connection for this account.",
            );
          yield* secrets.set(tokenKey(id), new TextEncoder().encode(encodeCredential(credential)));
          yield* sql`UPDATE drive_connections SET connected = 1, identity_json = ${encodeIdentity(who)}, error = NULL WHERE id = ${id} AND generation = ${generation}`;
          return yield* publicConnection(yield* requireRow(id));
        }),
      ),
    disconnect: (id: string, remove = false) =>
      mutate(
        Effect.gen(function* () {
          yield* requireRow(id);
          yield* sql`UPDATE drive_connections SET connected = 0, removed = ${remove ? 1 : 0}, client_secret_configured = CASE WHEN ${remove ? 1 : 0} = 1 THEN 0 ELSE client_secret_configured END, generation = generation + 1, error = NULL WHERE id = ${id}`;
          yield* secrets.remove(tokenKey(id));
          if (remove) yield* secrets.remove(clientKey(id));
        }),
      ),
    health: (id: string, generation: number, message: string, reauth = false) =>
      safe(
        sql`UPDATE drive_connections SET error = ${message}, connected = CASE WHEN ${reauth ? 1 : 0} = 1 THEN 0 ELSE connected END WHERE id = ${id} AND generation = ${generation}`.pipe(
          Effect.asVoid,
          Effect.ensuring(announce),
        ),
      ),
    binding: (fileId: string) =>
      safe(
        Effect.gen(function* () {
          const rows = yield* sql<{
            connectionId: string;
            fileJson: string;
          }>`SELECT connection_id AS "connectionId", file_json AS "fileJson" FROM drive_file_bindings WHERE file_id = ${fileId}`;
          const found = rows[0];
          return found
            ? Option.some({
                connectionId: found.connectionId,
                file: yield* decodeFile(found.fileJson),
              } satisfies DriveBinding)
            : Option.none<DriveBinding>();
        }),
      ),
    bind: (connectionId: string, generation: number, file: typeof DriveFile.Type) =>
      mutate(
        Effect.gen(function* () {
          const connection = yield* requireRow(connectionId);
          if (!connection.connected || connection.generation !== generation)
            return yield* fail(
              "conflict",
              "This connection changed. Reconnect it and choose it again.",
            );
          yield* sql`INSERT INTO drive_file_bindings (file_id, connection_id, file_json) VALUES (${file.id}, ${connectionId}, ${encodeFile(file)}) ON CONFLICT(file_id) DO UPDATE SET connection_id = excluded.connection_id, file_json = excluded.file_json`;
          return { connectionId, file } satisfies DriveBinding;
        }),
      ),
    changes: SubscriptionRef.changes(changes).pipe(Stream.filter((value) => value > 0)),
  };
});
export class DriveStore extends Context.Service<DriveStore, Effect.Success<typeof make>>()(
  "t3/drive/DriveStore",
) {}
export const layer = Layer.effect(DriveStore, make);
