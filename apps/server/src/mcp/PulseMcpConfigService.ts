// @effect-diagnostics preferSchemaOverJson:off -- The private versioned file and secret blobs are validated at this module seam.
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Semaphore from "effect/Semaphore";

import type { ProviderInstanceId } from "@t3tools/contracts";
import type { ThreadId } from "@t3tools/contracts";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import {
  makePulseMcpTurnPreflight,
  type PulseMcpPreflightDependencies,
  type PulseMcpTurnInput,
} from "./PulseMcpPreflight.ts";

const CONFIG_FILE = "pulse-mcp.json";
const SECRET_PREFIX = "pulse-mcp-connection-";
const CONNECTION_ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const ENVIRONMENT_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export interface PulseMcpSecretInput {
  readonly type: "secret";
  readonly value: string;
}

export interface PulseMcpLiteralInput {
  readonly type: "literal";
  readonly value: string;
}

export type PulseMcpValueInput = PulseMcpSecretInput | PulseMcpLiteralInput;

export interface PulseMcpHttpInput {
  readonly transport: "http";
  readonly url: string;
  readonly headers?: Readonly<Record<string, PulseMcpValueInput>>;
}

export interface PulseMcpStdioInput {
  readonly transport: "stdio";
  readonly command: string;
  readonly args?: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, PulseMcpValueInput>>;
}

export interface PulseMcpConnectionInput {
  readonly id: string;
  readonly name: string;
  readonly config: PulseMcpHttpInput | PulseMcpStdioInput;
}

export interface PulseMcpSecretReference {
  readonly type: "secret-ref";
  readonly secretRef: string;
  readonly key: string;
}

export type PulseMcpStoredValue = PulseMcpLiteralInput | PulseMcpSecretReference;

export interface PulseMcpStoredConnection {
  readonly id: string;
  readonly name: string;
  readonly config:
    | {
        readonly transport: "http";
        readonly url: string;
        readonly headers: Readonly<Record<string, PulseMcpStoredValue>>;
      }
    | {
        readonly transport: "stdio";
        readonly command: string;
        readonly args: readonly string[];
        readonly cwd?: string;
        readonly env: Readonly<Record<string, PulseMcpStoredValue>>;
      };
}

export interface PulseMcpResolvedConnection {
  readonly id: string;
  readonly name: string;
  readonly config:
    | {
        readonly transport: "http";
        readonly url: string;
        readonly headers: Readonly<Record<string, string>>;
      }
    | {
        readonly transport: "stdio";
        readonly command: string;
        readonly args: readonly string[];
        readonly cwd?: string;
        readonly env: Readonly<Record<string, string>>;
      };
}

interface PulseMcpPersistedState {
  readonly version: 1;
  readonly connections: Readonly<Record<string, PulseMcpStoredConnection>>;
  readonly providerDefaults: Readonly<Record<string, readonly string[]>>;
  readonly threadOverrides: Readonly<Record<string, readonly string[]>>;
}

export interface PulseMcpTurnPreparation {
  readonly connections: readonly PulseMcpResolvedConnection[];
  readonly preflight: ReturnType<typeof makePulseMcpTurnPreflight>;
}

export class PulseMcpConfigError extends Error {
  readonly _tag = "PulseMcpConfigError";
  readonly operation: string;
  override readonly cause: unknown;

  constructor(operation: string, message: string, cause?: unknown) {
    super(message);
    this.operation = operation;
    this.cause = cause;
  }
}

export interface PulseMcpConfigServiceShape {
  readonly listConnections: Effect.Effect<readonly PulseMcpStoredConnection[], PulseMcpConfigError>;
  readonly upsertConnection: (
    input: PulseMcpConnectionInput,
  ) => Effect.Effect<PulseMcpStoredConnection, PulseMcpConfigError>;
  readonly removeConnection: (id: string) => Effect.Effect<void, PulseMcpConfigError>;
  readonly setProviderDefault: (
    providerInstanceId: ProviderInstanceId,
    connectionIds: readonly string[],
  ) => Effect.Effect<void, PulseMcpConfigError>;
  readonly setThreadOverride: (
    threadId: ThreadId,
    connectionIds: readonly string[],
  ) => Effect.Effect<void, PulseMcpConfigError>;
  readonly resetThreadOverride: (threadId: ThreadId) => Effect.Effect<void, PulseMcpConfigError>;
  readonly prepareTurn: (
    input: {
      readonly turnId: string;
      readonly provider: string;
      readonly providerInstanceId: ProviderInstanceId;
      readonly threadId: ThreadId;
    },
    dependencies: PulseMcpPreflightDependencies,
  ) => Effect.Effect<PulseMcpTurnPreparation, PulseMcpConfigError>;
}

export class PulseMcpConfigService extends Context.Service<
  PulseMcpConfigService,
  PulseMcpConfigServiceShape
>()("t3/mcp/PulseMcpConfigService") {}

const emptyState = (): PulseMcpPersistedState => ({
  version: 1,
  connections: {},
  providerDefaults: {},
  threadOverrides: {},
});

const unique = (ids: readonly string[]) => [...new Set(ids)];

const validateConnectionId = (id: string): void => {
  if (!CONNECTION_ID.test(id)) {
    throw new PulseMcpConfigError("validate", `Invalid MCP connection id '${id}'.`);
  }
};

const assertKnownIds = (
  state: PulseMcpPersistedState,
  ids: readonly string[],
): readonly string[] => {
  const deduplicated = unique(ids);
  for (const id of deduplicated) {
    validateConnectionId(id);
    if (state.connections[id] === undefined) {
      throw new PulseMcpConfigError("validate", `Unknown MCP connection '${id}'.`);
    }
  }
  return deduplicated;
};

const validateInput = (input: PulseMcpConnectionInput): void => {
  validateConnectionId(input.id);
  if (input.name.trim().length === 0) {
    throw new PulseMcpConfigError("validate", "MCP connection name cannot be empty.");
  }
  if (input.config.transport === "http") {
    let url: URL;
    try {
      url = new URL(input.config.url);
    } catch (cause) {
      throw new PulseMcpConfigError("validate", "MCP HTTP URL is invalid.", cause);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new PulseMcpConfigError("validate", "MCP HTTP URL must use http or https.");
    }
    for (const name of Object.keys(input.config.headers ?? {})) {
      if (name.trim().length === 0 || /[\r\n]/.test(name)) {
        throw new PulseMcpConfigError("validate", "MCP HTTP header name is invalid.");
      }
    }
    return;
  }
  if (input.config.command.trim().length === 0) {
    throw new PulseMcpConfigError("validate", "MCP stdio command cannot be empty.");
  }
  for (const name of Object.keys(input.config.env ?? {})) {
    if (!ENVIRONMENT_NAME.test(name)) {
      throw new PulseMcpConfigError("validate", `Invalid MCP environment variable '${name}'.`);
    }
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const decodeState = (raw: string): PulseMcpPersistedState => {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      !isRecord(value.connections) ||
      !isRecord(value.providerDefaults) ||
      !isRecord(value.threadOverrides)
    ) {
      throw new Error("unsupported shape");
    }
    return value as unknown as PulseMcpPersistedState;
  } catch (cause) {
    throw new PulseMcpConfigError("read", "Failed to decode Pulse MCP configuration.", cause);
  }
};

const secretName = (connectionId: string) => `${SECRET_PREFIX}${connectionId}`;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const decodeSecretValues = (bytes: Uint8Array) =>
  Effect.try({
    try: () => {
      const decoded: unknown = JSON.parse(textDecoder.decode(bytes));
      if (!isRecord(decoded) || Object.values(decoded).some((value) => typeof value !== "string")) {
        throw new Error("invalid secret shape");
      }
      return decoded as Readonly<Record<string, string>>;
    },
    catch: (cause) =>
      new PulseMcpConfigError("read-secret", "Failed to decode MCP secrets.", cause),
  });

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const crypto = yield* Crypto.Crypto;
  const config = yield* ServerConfig.ServerConfig;
  const secrets = yield* ServerSecretStore.ServerSecretStore;
  const lock = yield* Semaphore.make(1);
  const configPath = path.join(config.stateDir, CONFIG_FILE);

  const load = fs.exists(configPath).pipe(
    Effect.flatMap((exists) => (exists ? fs.readFileString(configPath) : Effect.void)),
    Effect.map((raw) => (raw === undefined ? emptyState() : decodeState(raw))),
    Effect.mapError((cause) =>
      cause instanceof PulseMcpConfigError
        ? cause
        : new PulseMcpConfigError("read", "Failed to read Pulse MCP configuration.", cause),
    ),
  );

  const persist = (state: PulseMcpPersistedState) =>
    Effect.gen(function* () {
      yield* fs.makeDirectory(config.stateDir, { recursive: true });
      const temporaryPath = `${configPath}.${yield* crypto.randomUUIDv4}.tmp`;
      yield* fs.writeFileString(temporaryPath, `${JSON.stringify(state, null, 2)}\n`);
      yield* fs.rename(temporaryPath, configPath);
    }).pipe(
      Effect.mapError(
        (cause) =>
          new PulseMcpConfigError("write", "Failed to persist Pulse MCP configuration.", cause),
      ),
    );

  const withWrite = <A>(
    update: (
      state: PulseMcpPersistedState,
    ) => Effect.Effect<readonly [A, PulseMcpPersistedState], PulseMcpConfigError>,
  ) =>
    lock.withPermits(1)(
      load.pipe(
        Effect.flatMap(update),
        Effect.tap(([, state]) => persist(state)),
        Effect.map(([value]) => value),
      ),
    );

  const toStoredValues = (
    values: Readonly<Record<string, PulseMcpValueInput>>,
    reference: string,
  ): readonly [Readonly<Record<string, PulseMcpStoredValue>>, Readonly<Record<string, string>>] => {
    const stored: Record<string, PulseMcpStoredValue> = {};
    const secretValues: Record<string, string> = {};
    for (const [key, value] of Object.entries(values)) {
      if (value.type === "secret") {
        secretValues[key] = value.value;
        stored[key] = { type: "secret-ref", secretRef: reference, key };
      } else stored[key] = value;
    }
    return [stored, secretValues];
  };

  const upsertConnection: PulseMcpConfigServiceShape["upsertConnection"] = (input) =>
    Effect.try({
      try: () => validateInput(input),
      catch: (cause) =>
        cause instanceof PulseMcpConfigError
          ? cause
          : new PulseMcpConfigError("validate", "Invalid MCP connection.", cause),
    }).pipe(
      Effect.flatMap(() => {
        const reference = secretName(input.id);
        const values =
          input.config.transport === "http"
            ? (input.config.headers ?? {})
            : (input.config.env ?? {});
        const [storedValues, secretValues] = toStoredValues(values, reference);
        const connection: PulseMcpStoredConnection =
          input.config.transport === "http"
            ? {
                id: input.id,
                name: input.name.trim(),
                config: { transport: "http", url: input.config.url, headers: storedValues },
              }
            : {
                id: input.id,
                name: input.name.trim(),
                config: {
                  transport: "stdio",
                  command: input.config.command,
                  args: [...(input.config.args ?? [])],
                  ...(input.config.cwd ? { cwd: input.config.cwd } : {}),
                  env: storedValues,
                },
              };
        return withWrite((state) =>
          Effect.gen(function* () {
            if (Object.keys(secretValues).length > 0) {
              yield* secrets
                .set(reference, textEncoder.encode(JSON.stringify(secretValues)))
                .pipe(
                  Effect.mapError(
                    (cause) =>
                      new PulseMcpConfigError(
                        "write-secret",
                        "Failed to store MCP secrets.",
                        cause,
                      ),
                  ),
                );
            } else {
              yield* secrets
                .remove(reference)
                .pipe(
                  Effect.mapError(
                    (cause) =>
                      new PulseMcpConfigError(
                        "remove-secret",
                        "Failed to remove MCP secrets.",
                        cause,
                      ),
                  ),
                );
            }
            return [
              connection,
              { ...state, connections: { ...state.connections, [input.id]: connection } },
            ] as const;
          }),
        );
      }),
    );

  const removeConnection: PulseMcpConfigServiceShape["removeConnection"] = (id) =>
    withWrite((state) =>
      Effect.gen(function* () {
        validateConnectionId(id);
        const { [id]: _removed, ...connections } = state.connections;
        const cleanSelections = (entries: Readonly<Record<string, readonly string[]>>) =>
          Object.fromEntries(
            Object.entries(entries).map(([key, ids]) => [key, ids.filter((value) => value !== id)]),
          );
        yield* secrets
          .remove(secretName(id))
          .pipe(
            Effect.mapError(
              (cause) =>
                new PulseMcpConfigError("remove-secret", "Failed to remove MCP secrets.", cause),
            ),
          );
        return [
          undefined,
          {
            ...state,
            connections,
            providerDefaults: cleanSelections(state.providerDefaults),
            threadOverrides: cleanSelections(state.threadOverrides),
          },
        ] as const;
      }),
    );

  const setProviderDefault: PulseMcpConfigServiceShape["setProviderDefault"] = (
    providerInstanceId,
    ids,
  ) =>
    withWrite((state) =>
      Effect.sync(
        () =>
          [
            undefined,
            {
              ...state,
              providerDefaults: {
                ...state.providerDefaults,
                [providerInstanceId]: assertKnownIds(state, ids),
              },
            },
          ] as const,
      ),
    );

  const setThreadOverride: PulseMcpConfigServiceShape["setThreadOverride"] = (threadId, ids) =>
    withWrite((state) =>
      Effect.sync(
        () =>
          [
            undefined,
            {
              ...state,
              threadOverrides: { ...state.threadOverrides, [threadId]: assertKnownIds(state, ids) },
            },
          ] as const,
      ),
    );

  const resetThreadOverride: PulseMcpConfigServiceShape["resetThreadOverride"] = (threadId) =>
    withWrite((state) =>
      Effect.sync(() => {
        const { [threadId]: _removed, ...threadOverrides } = state.threadOverrides;
        return [undefined, { ...state, threadOverrides }] as const;
      }),
    );

  const resolveValues = Effect.fn(function* (
    values: Readonly<Record<string, PulseMcpStoredValue>>,
  ) {
    const resolved: Record<string, string> = {};
    const loaded = new Map<string, Readonly<Record<string, string>>>();
    for (const [key, value] of Object.entries(values)) {
      if (value.type === "literal") {
        resolved[key] = value.value;
        continue;
      }
      let secretValues = loaded.get(value.secretRef);
      if (secretValues === undefined) {
        const bytes = yield* secrets
          .get(value.secretRef)
          .pipe(
            Effect.mapError(
              (cause) =>
                new PulseMcpConfigError("read-secret", "Failed to read MCP secrets.", cause),
            ),
          );
        if (Option.isNone(bytes)) {
          return yield* Effect.fail(
            new PulseMcpConfigError("read-secret", `Missing MCP secret '${value.secretRef}'.`),
          );
        }
        secretValues = yield* decodeSecretValues(bytes.value);
        loaded.set(value.secretRef, secretValues);
      }
      const secret = secretValues[value.key];
      if (typeof secret !== "string") {
        return yield* Effect.fail(
          new PulseMcpConfigError("read-secret", `Missing MCP secret key '${value.key}'.`),
        );
      }
      resolved[key] = secret;
    }
    return Object.freeze(resolved);
  });

  const resolveConnection = Effect.fn(function* (connection: PulseMcpStoredConnection) {
    if (connection.config.transport === "http") {
      return Object.freeze({
        id: connection.id,
        name: connection.name,
        config: Object.freeze({
          transport: "http" as const,
          url: connection.config.url,
          headers: yield* resolveValues(connection.config.headers),
        }),
      });
    }
    return Object.freeze({
      id: connection.id,
      name: connection.name,
      config: Object.freeze({
        transport: "stdio" as const,
        command: connection.config.command,
        args: Object.freeze([...connection.config.args]),
        ...(connection.config.cwd ? { cwd: connection.config.cwd } : {}),
        env: yield* resolveValues(connection.config.env),
      }),
    });
  });

  const prepareTurn: PulseMcpConfigServiceShape["prepareTurn"] = (input, dependencies) =>
    load.pipe(
      Effect.flatMap((state) => {
        const defaults = state.providerDefaults[input.providerInstanceId] ?? [];
        const override = state.threadOverrides[input.threadId];
        const turnInput: PulseMcpTurnInput = {
          turnId: input.turnId,
          provider: input.provider,
          defaultConnectionIds: defaults,
          ...(override !== undefined ? { threadConnectionIds: override } : {}),
        };
        const selected = override ?? defaults;
        return Effect.forEach(selected, (id) => {
          const connection = state.connections[id];
          return connection === undefined
            ? Effect.fail(new PulseMcpConfigError("prepare", `Unknown MCP connection '${id}'.`))
            : resolveConnection(connection);
        }).pipe(
          Effect.map((connections) =>
            Object.freeze({
              connections: Object.freeze(connections),
              preflight: makePulseMcpTurnPreflight(dependencies, turnInput),
            }),
          ),
        );
      }),
    );

  return PulseMcpConfigService.of({
    listConnections: load.pipe(
      Effect.map((state) => Object.freeze(Object.values(state.connections))),
    ),
    upsertConnection,
    removeConnection,
    setProviderDefault,
    setThreadOverride,
    resetThreadOverride,
    prepareTurn,
  });
});

export const layer = Layer.effect(PulseMcpConfigService, make);
