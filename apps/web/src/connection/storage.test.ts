import { EnvironmentId } from "@t3tools/contracts";
import { TokenStore } from "@t3tools/client-runtime/authorization";
import {
  RelayConnectionTarget,
  BearerConnectionCredential,
} from "@t3tools/client-runtime/connection";
import { putRemoteDpopTokenInCatalog } from "@t3tools/client-runtime/platform";
import { ConnectionTransientError } from "@t3tools/client-runtime/connection";
import { ConnectionCatalogDocument } from "@t3tools/client-runtime/platform";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { afterEach, vi } from "vite-plus/test";

import { makeCatalogBackend, makeCatalogStore } from "./storage";

const emptyCatalog = {
  schemaVersion: 1,
  targets: [],
  profiles: [],
  credentials: [],
  remoteDpopTokens: [],
} as const;
const decodeCatalog = Schema.decodeUnknownSync(Schema.fromJsonString(ConnectionCatalogDocument));
const encodeCatalog = Schema.encodeEffect(Schema.fromJsonString(ConnectionCatalogDocument));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("makeCatalogStore", () => {
  it.effect("quarantines malformed catalogs and starts from an empty document", () =>
    Effect.gen(function* () {
      const writes: string[] = [];
      const quarantined: string[] = [];
      const store = yield* makeCatalogStore({
        read: Effect.succeed("{not-json"),
        write: (raw) => Effect.sync(() => writes.push(raw)),
        quarantine: (raw) => Effect.sync(() => quarantined.push(raw)),
      });

      expect(yield* store.read).toEqual(emptyCatalog);
      expect(quarantined).toEqual(["{not-json"]);
      expect(writes).toHaveLength(1);
      expect(decodeCatalog(writes[0]!)).toEqual(emptyCatalog);
    }),
  );

  it.effect("does not hide catalog read failures", () =>
    Effect.gen(function* () {
      const failure = new ConnectionTransientError({
        reason: "remote-unavailable",
        detail: "permission denied",
      });
      const store = yield* makeCatalogStore({
        read: Effect.fail(failure),
        write: () => Effect.void,
      });

      expect(yield* Effect.flip(store.read)).toBe(failure);
    }),
  );
});

describe("makeCatalogBackend", () => {
  it.effect("fails writes when desktop secure storage declines the catalog", () =>
    Effect.gen(function* () {
      const setConnectionCatalog = vi.fn().mockResolvedValue(false);
      vi.stubGlobal("window", {
        desktopBridge: {
          getConnectionCatalog: vi.fn().mockResolvedValue(null),
          setConnectionCatalog,
        },
      });
      const backend = makeCatalogBackend({} as IDBDatabase);

      const error = yield* backend.write("{}").pipe(Effect.flip);

      expect(error).toBeInstanceOf(ConnectionTransientError);
      expect(error.message).toContain("Desktop secure storage is unavailable");
      expect(setConnectionCatalog).toHaveBeenCalledWith("{}");
    }),
  );
});

const refreshEnvironmentId = EnvironmentId.make("refresh-environment");
const refreshToken = new TokenStore.RemoteDpopAccessToken({
  environmentId: refreshEnvironmentId,
  accountId: "synthetic-account",
  label: "Refresh environment",
  endpoint: {
    httpBaseUrl: "https://refresh.example.test",
    wsBaseUrl: "wss://refresh.example.test",
    providerKind: "cloudflare_tunnel",
  },
  accessToken: "rotated-synthetic-token",
  expiresAtEpochMs: 1_000_000,
  dpopThumbprint: "synthetic-thumbprint",
});
const refreshCatalog = {
  schemaVersion: 1 as const,
  targets: [
    new RelayConnectionTarget({
      environmentId: refreshEnvironmentId,
      label: "Refresh environment",
    }),
  ],
  profiles: [],
  credentials: [
    {
      connectionId: "paired-connection",
      credential: new BearerConnectionCredential({ token: "unrelated-synthetic-secret" }),
    },
  ],
  remoteDpopTokens: [],
};

it.effect("persists a refreshed token without replacing other stored secrets", () =>
  Effect.gen(function* () {
    let persisted = yield* encodeCatalog(refreshCatalog);
    const backend = {
      read: Effect.sync(() => persisted),
      write: (raw: string) =>
        Effect.sync(() => {
          persisted = raw;
        }),
    };
    const catalog = yield* makeCatalogStore(backend);
    yield* catalog.update((document) => putRemoteDpopTokenInCatalog(document, refreshToken));
    const reopened = yield* makeCatalogStore(backend);
    const restored = yield* reopened.read;
    expect(restored.credentials).toEqual(refreshCatalog.credentials);
    expect(restored.remoteDpopTokens).toEqual([refreshToken]);
  }),
);
