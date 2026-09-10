import { EnvironmentId } from "@t3tools/contracts";
import { TokenStore } from "@t3tools/client-runtime/authorization";
import {
  RelayConnectionTarget,
  BearerConnectionCredential,
} from "@t3tools/client-runtime/connection";
import { putRemoteDpopTokenInCatalog } from "@t3tools/client-runtime/platform";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { vi } from "vite-plus/test";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

vi.mock("expo-secure-store", () => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

import {
  CONNECTION_CATALOG_KEY,
  LEGACY_CONNECTION_CATALOG_KEY,
  LEGACY_CONNECTIONS_KEY,
  make,
} from "./catalog-store";
import { MobileSecureStorage } from "../persistence/mobile-secure-storage";

function makeStorage(initial: Readonly<Record<string, string>>) {
  const values = new Map(Object.entries(initial));
  const deleted: Array<string> = [];
  const storage = MobileSecureStorage.of({
    getItem: (key) => Effect.sync(() => values.get(key) ?? null),
    setItem: (key, value) =>
      Effect.sync(() => {
        values.set(key, value);
      }),
    removeItem: (key) =>
      Effect.sync(() => {
        deleted.push(key);
        values.delete(key);
      }),
  });
  return { deleted, storage, values };
}

describe("mobile connection catalog storage", () => {
  it.effect("recovers from a corrupt current catalog", () =>
    Effect.gen(function* () {
      const memory = makeStorage({
        [CONNECTION_CATALOG_KEY]: "{not-json",
      });
      const catalog = yield* make().pipe(
        Effect.provideService(MobileSecureStorage, memory.storage),
      );

      expect((yield* catalog.read).targets).toEqual([]);
      expect(memory.deleted).toEqual([CONNECTION_CATALOG_KEY]);
    }),
  );

  it.effect(
    "replaces a corrupt oldest-format catalog without deleting the compatibility copy",
    () =>
      Effect.gen(function* () {
        const memory = makeStorage({
          [LEGACY_CONNECTIONS_KEY]: JSON.stringify({ connections: [{ invalid: true }] }),
        });
        const catalog = yield* make().pipe(
          Effect.provideService(MobileSecureStorage, memory.storage),
        );

        expect((yield* catalog.read).targets).toEqual([]);
        expect(memory.deleted).toEqual([]);
        expect(memory.values.has(CONNECTION_CATALOG_KEY)).toBe(true);
        expect(memory.values.has(LEGACY_CONNECTION_CATALOG_KEY)).toBe(true);
      }),
  );

  it.effect("falls back to valid legacy data when the current catalog is corrupt", () =>
    Effect.gen(function* () {
      const memory = makeStorage({
        [CONNECTION_CATALOG_KEY]: "{not-json",
        [LEGACY_CONNECTIONS_KEY]: JSON.stringify({
          connections: [
            {
              environmentId: "legacy-environment",
              environmentLabel: "Legacy",
              pairingUrl: "https://legacy.example.test/pair",
              displayUrl: "https://legacy.example.test",
              httpBaseUrl: "https://legacy.example.test",
              wsBaseUrl: "wss://legacy.example.test",
              bearerToken: "legacy-token",
              authenticationMethod: "bearer",
            },
          ],
        }),
      });
      const catalog = yield* make().pipe(
        Effect.provideService(MobileSecureStorage, memory.storage),
      );

      expect((yield* catalog.read).targets).toHaveLength(1);
      expect(memory.deleted).toEqual([CONNECTION_CATALOG_KEY]);

      yield* catalog.update((document) => document);
      expect(memory.values.has(CONNECTION_CATALOG_KEY)).toBe(true);
      expect(memory.values.has(LEGACY_CONNECTION_CATALOG_KEY)).toBe(true);
      expect(memory.values.has(LEGACY_CONNECTIONS_KEY)).toBe(true);
    }),
  );

  it.effect("copies the versioned Pulse Code catalog forward and keeps it synchronized", () =>
    Effect.gen(function* () {
      const legacyCatalog = JSON.stringify({
        schemaVersion: 1,
        targets: [],
        profiles: [],
        credentials: [],
        remoteDpopTokens: [],
      });
      const memory = makeStorage({ [LEGACY_CONNECTION_CATALOG_KEY]: legacyCatalog });
      const catalog = yield* make().pipe(
        Effect.provideService(MobileSecureStorage, memory.storage),
      );

      expect((yield* catalog.read).targets).toEqual([]);
      expect(memory.values.get(CONNECTION_CATALOG_KEY)).toBe(legacyCatalog);

      yield* catalog.update((document) => document);
      expect(memory.values.get(CONNECTION_CATALOG_KEY)).toBe(
        memory.values.get(LEGACY_CONNECTION_CATALOG_KEY),
      );
      expect(memory.deleted).toEqual([]);
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

it.effect("persists a refreshed token without replacing other secure-store secrets", () =>
  Effect.gen(function* () {
    const memory = makeStorage({ [CONNECTION_CATALOG_KEY]: JSON.stringify(refreshCatalog) });
    const catalog = yield* make().pipe(Effect.provideService(MobileSecureStorage, memory.storage));
    yield* catalog.update((document) => putRemoteDpopTokenInCatalog(document, refreshToken));
    const reopened = yield* make().pipe(Effect.provideService(MobileSecureStorage, memory.storage));
    const restored = yield* reopened.read;
    expect(restored.credentials).toEqual(refreshCatalog.credentials);
    expect(restored.remoteDpopTokens).toEqual([refreshToken]);
  }),
);
