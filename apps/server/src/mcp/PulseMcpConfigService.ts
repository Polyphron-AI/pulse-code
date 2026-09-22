// @effect-diagnostics preferSchemaOverJson:off -- The private versioned file and secret blobs are validated at this module seam.
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Semaphore from "effect/Semaphore";

import type {
  ProjectId,
  ProviderInstanceId,
  PulseMcpWardenFailureReason,
  PulseMcpWardenSettings,
  PulseMcpWardenSettingsInput,
} from "@t3tools/contracts";
import type { ThreadId } from "@t3tools/contracts";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import {
  makePulseWardenClient,
  PulseWardenError,
  type PulseWardenAccess,
  type PulseWardenClientShape,
} from "./PulseWardenClient.ts";
import {
  makeWardenGrantIndex,
  makeWardenMaterialSource,
  wardenFailure,
  type WardenMaterialSource,
} from "./PulseWardenMaterial.ts";
import {
  makePulseMcpTurnPreflight,
  type PulseMcpPreflightDependencies,
  type PulseMcpTurnInput,
} from "./PulseMcpPreflight.ts";

const CONFIG_FILE = "pulse-mcp.json";
const SECRET_PREFIX = "pulse-mcp-connection-";
const CONNECTION_ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const ENVIRONMENT_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
export const WARDEN_PAT_SECRET = "pulse-warden-pat";
const WARDEN_CREDENTIAL_REF = /^urn:pulse:[A-Za-z0-9._-]{1,64}:credential:[A-Za-z0-9._-]{1,64}$/;

export interface PulseMcpSecretInput {
  readonly type: "secret";
  readonly value: string;
}

export interface PulseMcpLiteralInput {
  readonly type: "literal";
  readonly value: string;
}

export interface PulseMcpRetainSecretInput {
  readonly type: "retain-secret";
}

export interface PulseMcpWardenInput {
  readonly type: "warden";
  readonly credentialRef: string;
}

export type PulseMcpValueInput =
  | PulseMcpSecretInput
  | PulseMcpLiteralInput
  | PulseMcpRetainSecretInput
  | PulseMcpWardenInput;

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
  readonly createOnly?: boolean;
  readonly config: PulseMcpHttpInput | PulseMcpStdioInput;
}

export interface PulseMcpSecretReference {
  readonly type: "secret-ref";
  readonly secretRef: string;
  readonly key: string;
}

/** Holds no material: the credential is released from Pulse Go at turn preparation. */
export interface PulseMcpWardenReference {
  readonly type: "warden-ref";
  readonly credentialRef: string;
}

export type PulseMcpStoredValue =
  | PulseMcpLiteralInput
  | PulseMcpSecretReference
  | PulseMcpWardenReference;

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
  readonly version: 2;
  readonly connections: Readonly<Record<string, PulseMcpStoredConnection>>;
  readonly providerDefaults: Readonly<Record<string, readonly string[]>>;
  readonly projectDefaults: Readonly<Record<string, readonly string[]>>;
  readonly threadOverrides: Readonly<Record<string, readonly string[]>>;
  readonly warden?: {
    readonly origin: string;
    readonly principal?: { readonly id: string; readonly name: string };
  };
}

export interface PulseMcpConnectionFailure {
  readonly connectionId: string;
  readonly name: string;
  readonly reason: PulseMcpWardenFailureReason;
  readonly message: string;
}

export interface PulseMcpTurnResolution {
  readonly connections: readonly PulseMcpResolvedConnection[];
  readonly failures: readonly PulseMcpConnectionFailure[];
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
  readonly getProviderDefault: (
    providerInstanceId: ProviderInstanceId,
  ) => Effect.Effect<readonly string[] | undefined, PulseMcpConfigError>;
  readonly setProjectDefault: (
    projectId: ProjectId,
    providerInstanceId: ProviderInstanceId,
    connectionIds: readonly string[],
  ) => Effect.Effect<void, PulseMcpConfigError>;
  readonly resetProjectDefault: (
    projectId: ProjectId,
    providerInstanceId: ProviderInstanceId,
  ) => Effect.Effect<void, PulseMcpConfigError>;
  readonly getProjectDefault: (
    projectId: ProjectId,
    providerInstanceId: ProviderInstanceId,
  ) => Effect.Effect<readonly string[] | undefined, PulseMcpConfigError>;
  readonly setThreadOverride: (
    threadId: ThreadId,
    connectionIds: readonly string[],
  ) => Effect.Effect<void, PulseMcpConfigError>;
  readonly resetThreadOverride: (threadId: ThreadId) => Effect.Effect<void, PulseMcpConfigError>;
  readonly getThreadOverride: (
    threadId: ThreadId,
  ) => Effect.Effect<readonly string[] | undefined, PulseMcpConfigError>;
  readonly prepareTurn: (
    input: {
      readonly turnId: string;
      readonly provider: string;
      readonly providerInstanceId: ProviderInstanceId;
      readonly projectId?: ProjectId;
      readonly threadId: ThreadId;
    },
    dependencies: PulseMcpPreflightDependencies,
  ) => Effect.Effect<PulseMcpTurnPreparation, PulseMcpConfigError>;
  readonly resolveTurnConnections: (input: {
    readonly providerInstanceId: ProviderInstanceId;
    readonly projectId?: ProjectId;
    readonly threadId: ThreadId;
    readonly connectionIds?: readonly string[];
    readonly excludedConnectionIds?: readonly string[];
  }) => Effect.Effect<PulseMcpTurnResolution, PulseMcpConfigError>;
  readonly getWardenSettings: Effect.Effect<PulseMcpWardenSettings, PulseMcpConfigError>;
  readonly setWardenSettings: (
    input: PulseMcpWardenSettingsInput,
  ) => Effect.Effect<PulseMcpWardenSettings, PulseMcpConfigError>;
  readonly recordWardenPrincipal: (principal: {
    readonly id: string;
    readonly name: string;
  }) => Effect.Effect<void, PulseMcpConfigError>;
  /** None when either the origin or the token is missing. */
  readonly readWardenAccess: Effect.Effect<Option.Option<PulseWardenAccess>, PulseMcpConfigError>;
}

export class PulseMcpConfigService extends Context.Service<
  PulseMcpConfigService,
  PulseMcpConfigServiceShape
>()("t3/mcp/PulseMcpConfigService") {}

const emptyState = (): PulseMcpPersistedState => ({
  version: 2,
  connections: {},
  providerDefaults: {},
  projectDefaults: {},
  threadOverrides: {},
});

const projectDefaultKey = (projectId: ProjectId, providerInstanceId: ProviderInstanceId) =>
  JSON.stringify([projectId, providerInstanceId]);

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

const validateValueInputs = (values: Readonly<Record<string, PulseMcpValueInput>>): void => {
  for (const value of Object.values(values)) {
    if (value.type === "warden" && !WARDEN_CREDENTIAL_REF.test(value.credentialRef)) {
      throw new PulseMcpConfigError(
        "validate",
        "Warden credential reference must be a Pulse credential URN.",
      );
    }
  }
};

const validateInput = (input: PulseMcpConnectionInput): void => {
  validateConnectionId(input.id);
  if (input.name.trim().length === 0) {
    throw new PulseMcpConfigError("validate", "MCP connection name cannot be empty.");
  }
  validateValueInputs(
    input.config.transport === "http" ? (input.config.headers ?? {}) : (input.config.env ?? {}),
  );
  if (input.config.transport === "http") {
    if (Object.keys(input.config.headers ?? {}).length > 128) {
      throw new PulseMcpConfigError("validate", "MCP HTTP headers exceed the supported limit.");
    }
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
  if (Object.keys(input.config.env ?? {}).length > 128) {
    throw new PulseMcpConfigError("validate", "MCP environment exceeds the supported limit.");
  }
  for (const name of Object.keys(input.config.env ?? {})) {
    if (!ENVIRONMENT_NAME.test(name)) {
      throw new PulseMcpConfigError("validate", `Invalid MCP environment variable '${name}'.`);
    }
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));

const decodeStoredValues = (
  value: unknown,
  connectionId: string,
  keyIsValid: (key: string) => boolean,
): Readonly<Record<string, PulseMcpStoredValue>> => {
  if (!isRecord(value)) throw new Error("invalid stored values");
  const decoded: Record<string, PulseMcpStoredValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!keyIsValid(key)) throw new Error("invalid stored value key");
    if (!isRecord(entry) || typeof entry.type !== "string") throw new Error("invalid value");
    if (
      entry.type === "literal" &&
      hasOnlyKeys(entry, ["type", "value"]) &&
      typeof entry.value === "string"
    ) {
      decoded[key] = { type: "literal", value: entry.value };
      continue;
    }
    if (
      entry.type === "secret-ref" &&
      hasOnlyKeys(entry, ["type", "secretRef", "key"]) &&
      typeof entry.secretRef === "string" &&
      entry.secretRef.startsWith(`${secretName(connectionId)}-`) &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        entry.secretRef.slice(secretName(connectionId).length + 1),
      ) &&
      entry.key === key
    ) {
      decoded[key] = { type: "secret-ref", secretRef: entry.secretRef, key };
      continue;
    }
    if (
      entry.type === "warden-ref" &&
      hasOnlyKeys(entry, ["type", "credentialRef"]) &&
      typeof entry.credentialRef === "string" &&
      WARDEN_CREDENTIAL_REF.test(entry.credentialRef)
    ) {
      decoded[key] = { type: "warden-ref", credentialRef: entry.credentialRef };
      continue;
    }
    throw new Error("invalid stored value");
  }
  return decoded;
};

const decodeConnection = (key: string, value: unknown): PulseMcpStoredConnection => {
  validateConnectionId(key);
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["id", "name", "config"]) ||
    value.id !== key ||
    typeof value.name !== "string" ||
    value.name.trim().length === 0 ||
    !isRecord(value.config) ||
    typeof value.config.transport !== "string"
  ) {
    throw new Error("invalid connection");
  }
  const config = value.config;
  if (
    config.transport === "http" &&
    hasOnlyKeys(config, ["transport", "url", "headers"]) &&
    typeof config.url === "string"
  ) {
    const url = new URL(config.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("invalid url");
    return {
      id: key,
      name: value.name,
      config: {
        transport: "http",
        url: config.url,
        headers: decodeStoredValues(
          config.headers,
          key,
          (name) => name.trim().length > 0 && !/[\r\n]/.test(name),
        ),
      },
    };
  }
  if (
    config.transport === "stdio" &&
    hasOnlyKeys(config, ["transport", "command", "args", "cwd", "env"]) &&
    typeof config.command === "string" &&
    config.command.trim().length > 0 &&
    Array.isArray(config.args) &&
    config.args.every((arg) => typeof arg === "string") &&
    (config.cwd === undefined || typeof config.cwd === "string")
  ) {
    return {
      id: key,
      name: value.name,
      config: {
        transport: "stdio",
        command: config.command,
        args: config.args,
        ...(config.cwd === undefined ? {} : { cwd: config.cwd }),
        env: decodeStoredValues(config.env, key, (name) => ENVIRONMENT_NAME.test(name)),
      },
    };
  }
  throw new Error("invalid transport");
};

const decodeSelections = (
  value: Record<string, unknown>,
  connections: Readonly<Record<string, PulseMcpStoredConnection>>,
) => {
  const decoded: Record<string, readonly string[]> = {};
  for (const [key, ids] of Object.entries(value)) {
    if (key.trim().length === 0) throw new Error("invalid selection key");
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
      throw new Error("invalid selection");
    }
    for (const id of ids) {
      validateConnectionId(id);
      if (connections[id] === undefined) throw new Error("unknown selection");
    }
    if (new Set(ids).size !== ids.length) throw new Error("duplicate selection");
    decoded[key] = ids;
  }
  return decoded;
};

const decodeWarden = (value: unknown): PulseMcpPersistedState["warden"] => {
  if (value === undefined) return undefined;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["origin", "principal"]) ||
    typeof value.origin !== "string"
  ) {
    throw new Error("invalid warden settings");
  }
  if (value.principal === undefined) return { origin: value.origin };
  if (
    !isRecord(value.principal) ||
    !hasOnlyKeys(value.principal, ["id", "name"]) ||
    typeof value.principal.id !== "string" ||
    typeof value.principal.name !== "string"
  ) {
    throw new Error("invalid warden principal");
  }
  return {
    origin: value.origin,
    principal: { id: value.principal.id, name: value.principal.name },
  };
};

const decodeState = (raw: string): PulseMcpPersistedState => {
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      (value.version !== 1 && value.version !== 2) ||
      !isRecord(value.connections) ||
      !isRecord(value.providerDefaults) ||
      (value.version === 2 && !isRecord(value.projectDefaults)) ||
      !isRecord(value.threadOverrides)
    ) {
      throw new Error("unsupported shape");
    }
    if (
      !hasOnlyKeys(value, [
        "version",
        "connections",
        "providerDefaults",
        "projectDefaults",
        "threadOverrides",
        "warden",
      ])
    ) {
      throw new Error("unknown state fields");
    }
    const connections = Object.fromEntries(
      Object.entries(value.connections).map(([key, connection]) => [
        key,
        decodeConnection(key, connection),
      ]),
    );
    return {
      version: 2,
      connections,
      providerDefaults: decodeSelections(value.providerDefaults, connections),
      projectDefaults:
        value.version === 2
          ? decodeSelections(value.projectDefaults as Record<string, unknown>, connections)
          : {},
      threadOverrides: decodeSelections(value.threadOverrides, connections),
      ...(() => {
        const warden = decodeWarden(value.warden);
        return warden === undefined ? {} : { warden };
      })(),
    };
  } catch (cause) {
    throw new PulseMcpConfigError("read", "Failed to decode Pulse MCP configuration.", cause);
  }
};

function secretName(connectionId: string) {
  return `${SECRET_PREFIX}${connectionId}`;
}
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

export interface PulseMcpConfigLayerOptions {
  readonly wardenClient: (access: PulseWardenAccess) => PulseWardenClientShape;
}

const defaultOptions: PulseMcpConfigLayerOptions = {
  wardenClient: (access) => makePulseWardenClient(access),
};

const make = (options: PulseMcpConfigLayerOptions) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;
    const config = yield* ServerConfig.ServerConfig;
    const secrets = yield* ServerSecretStore.ServerSecretStore;
    const lock = yield* Semaphore.make(1);
    const configPath = path.join(config.stateDir, CONFIG_FILE);
    // The grant index and release memo live here so they survive across turns but are
    // dropped whenever the origin or token changes.
    const wardenRuntime = yield* Ref.make<
      Option.Option<{ readonly key: string; readonly source: WardenMaterialSource }>
    >(Option.none());

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
        yield* fs.makeDirectory(config.stateDir, { recursive: true, mode: 0o700 });
        yield* fs.chmod(config.stateDir, 0o700);
        const temporaryPath = `${configPath}.${yield* crypto.randomUUIDv4}.tmp`;
        yield* Effect.scoped(
          Effect.gen(function* () {
            const file = yield* fs.open(temporaryPath, { flag: "wx", mode: 0o600 });
            yield* file.writeAll(textEncoder.encode(`${JSON.stringify(state, null, 2)}\n`));
            yield* file.sync;
          }),
        ).pipe(
          Effect.flatMap(() => fs.rename(temporaryPath, configPath)),
          Effect.catch((cause) =>
            fs.remove(temporaryPath).pipe(
              Effect.ignore,
              Effect.flatMap(() => Effect.fail(cause)),
            ),
          ),
          // Rename is the commit point. Durability/permission maintenance after it
          // must never report a failed write and roll back secrets now referenced.
          Effect.tap(() => fs.chmod(configPath, 0o600).pipe(Effect.catch(() => Effect.void))),
          Effect.tap(() =>
            Effect.scoped(
              fs.open(config.stateDir, { flag: "r" }).pipe(Effect.flatMap((dir) => dir.sync)),
            ).pipe(Effect.catch(() => Effect.void)),
          ),
        );
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

    const syncDirectoryBestEffort = (directory: string) =>
      Effect.scoped(
        fs.open(directory, { flag: "r" }).pipe(Effect.flatMap((handle) => handle.sync)),
      ).pipe(
        // Windows does not support directory fsync. The unique secret file itself is synced by create.
        Effect.catch(() => Effect.void),
      );

    const storeNewSecret = (reference: string, values: Readonly<Record<string, string>>) =>
      secrets.create(reference, textEncoder.encode(JSON.stringify(values))).pipe(
        Effect.flatMap(() => syncDirectoryBestEffort(config.secretsDir)),
        Effect.mapError(
          (cause) => new PulseMcpConfigError("write-secret", "Failed to store MCP secrets.", cause),
        ),
      );

    const toStoredValues = (
      values: Readonly<Record<string, PulseMcpValueInput>>,
      reference: string,
      previous: Readonly<Record<string, PulseMcpStoredValue>>,
    ): readonly [
      Readonly<Record<string, PulseMcpStoredValue>>,
      Readonly<Record<string, string>>,
    ] => {
      const stored: Record<string, PulseMcpStoredValue> = {};
      const secretValues: Record<string, string> = {};
      for (const [key, value] of Object.entries(values)) {
        if (value.type === "secret") {
          secretValues[key] = value.value;
          stored[key] = { type: "secret-ref", secretRef: reference, key };
        } else if (value.type === "literal") stored[key] = value;
        else if (value.type === "warden") {
          stored[key] = { type: "warden-ref", credentialRef: value.credentialRef };
        } else {
          const retained = previous[key];
          if (retained?.type !== "secret-ref") {
            throw new PulseMcpConfigError(
              "validate",
              `Cannot retain an MCP secret that is not already configured for '${key}'.`,
            );
          }
          stored[key] = retained;
        }
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
          return crypto.randomUUIDv4.pipe(
            Effect.mapError(
              (cause) =>
                new PulseMcpConfigError(
                  "write-secret",
                  "Failed to create an MCP secret reference.",
                  cause,
                ),
            ),
            Effect.flatMap((uuid) => {
              const reference = `${secretName(input.id)}-${uuid}`;
              const values =
                input.config.transport === "http"
                  ? (input.config.headers ?? {})
                  : (input.config.env ?? {});
              return lock.withPermits(1)(
                load.pipe(
                  Effect.flatMap((state) =>
                    Effect.gen(function* () {
                      const previous = state.connections[input.id];
                      if (input.createOnly === true && previous !== undefined) {
                        return yield* Effect.fail(
                          new PulseMcpConfigError(
                            "validate",
                            "An MCP connection with this ID already exists.",
                          ),
                        );
                      }
                      if (previous === undefined && Object.keys(state.connections).length >= 128) {
                        return yield* Effect.fail(
                          new PulseMcpConfigError(
                            "validate",
                            "Pulse MCP connections exceed the supported limit.",
                          ),
                        );
                      }
                      const previousValues =
                        previous?.config.transport === input.config.transport
                          ? previous.config.transport === "http"
                            ? previous.config.headers
                            : previous.config.env
                          : {};
                      const [storedValues, secretValues] = yield* Effect.try({
                        try: () => toStoredValues(values, reference, previousValues),
                        catch: (cause) =>
                          cause instanceof PulseMcpConfigError
                            ? cause
                            : new PulseMcpConfigError(
                                "validate",
                                "Invalid MCP secret edit.",
                                cause,
                              ),
                      });
                      const connection: PulseMcpStoredConnection =
                        input.config.transport === "http"
                          ? {
                              id: input.id,
                              name: input.name.trim(),
                              config: {
                                transport: "http",
                                url: input.config.url,
                                headers: storedValues,
                              },
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
                      const previousReferences =
                        previous === undefined
                          ? []
                          : Object.values(
                              previous.config.transport === "http"
                                ? previous.config.headers
                                : previous.config.env,
                            ).flatMap((value) =>
                              value.type === "secret-ref" ? [value.secretRef] : [],
                            );
                      const nextState = {
                        ...state,
                        connections: { ...state.connections, [input.id]: connection },
                      };
                      yield* Effect.uninterruptibleMask(() =>
                        (Object.keys(secretValues).length > 0
                          ? storeNewSecret(reference, secretValues)
                          : Effect.void
                        ).pipe(
                          Effect.flatMap(() => persist(nextState)),
                          Effect.catch((cause) =>
                            (Object.keys(secretValues).length > 0
                              ? secrets.remove(reference)
                              : Effect.void
                            ).pipe(
                              Effect.ignore,
                              Effect.flatMap(() => Effect.fail(cause)),
                            ),
                          ),
                        ),
                      );
                      const retainedReferences = new Set(
                        Object.values(storedValues).flatMap((value) =>
                          value.type === "secret-ref" ? [value.secretRef] : [],
                        ),
                      );
                      yield* Effect.forEach(
                        new Set(
                          previousReferences.filter((value) => !retainedReferences.has(value)),
                        ),
                        (oldReference) => secrets.remove(oldReference).pipe(Effect.ignore),
                      );
                      return connection;
                    }),
                  ),
                ),
              );
            }),
          );
        }),
      );

    const removeConnection: PulseMcpConfigServiceShape["removeConnection"] = (id) =>
      lock.withPermits(1)(
        load.pipe(
          Effect.flatMap((state) =>
            Effect.gen(function* () {
              validateConnectionId(id);
              const { [id]: _removed, ...connections } = state.connections;
              const cleanSelections = (entries: Readonly<Record<string, readonly string[]>>) =>
                Object.fromEntries(
                  Object.entries(entries).map(([key, ids]) => [
                    key,
                    ids.filter((value) => value !== id),
                  ]),
                );
              const references =
                _removed === undefined
                  ? []
                  : Object.values(
                      _removed.config.transport === "http"
                        ? _removed.config.headers
                        : _removed.config.env,
                    ).flatMap((value) => (value.type === "secret-ref" ? [value.secretRef] : []));
              yield* persist({
                ...state,
                connections,
                providerDefaults: cleanSelections(state.providerDefaults),
                projectDefaults: cleanSelections(state.projectDefaults),
                threadOverrides: cleanSelections(state.threadOverrides),
              });
              yield* Effect.forEach(new Set(references), (reference) =>
                secrets.remove(reference).pipe(Effect.ignore),
              );
            }),
          ),
        ),
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
                threadOverrides: {
                  ...state.threadOverrides,
                  [threadId]: assertKnownIds(state, ids),
                },
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

    const getProviderDefault: PulseMcpConfigServiceShape["getProviderDefault"] = (
      providerInstanceId,
    ) => load.pipe(Effect.map((state) => state.providerDefaults[providerInstanceId]));

    const setProjectDefault: PulseMcpConfigServiceShape["setProjectDefault"] = (
      projectId,
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
                projectDefaults: {
                  ...state.projectDefaults,
                  [projectDefaultKey(projectId, providerInstanceId)]: assertKnownIds(state, ids),
                },
              },
            ] as const,
        ),
      );

    const resetProjectDefault: PulseMcpConfigServiceShape["resetProjectDefault"] = (
      projectId,
      providerInstanceId,
    ) =>
      withWrite((state) =>
        Effect.sync(() => {
          const key = projectDefaultKey(projectId, providerInstanceId);
          const { [key]: _removed, ...projectDefaults } = state.projectDefaults;
          return [undefined, { ...state, projectDefaults }] as const;
        }),
      );

    const getProjectDefault: PulseMcpConfigServiceShape["getProjectDefault"] = (
      projectId,
      providerInstanceId,
    ) =>
      load.pipe(
        Effect.map(
          (state) => state.projectDefaults[projectDefaultKey(projectId, providerInstanceId)],
        ),
      );

    const getThreadOverride: PulseMcpConfigServiceShape["getThreadOverride"] = (threadId) =>
      load.pipe(Effect.map((state) => state.threadOverrides[threadId]));

    const publicWarden = (
      state: PulseMcpPersistedState,
      patConfigured: boolean,
    ): PulseMcpWardenSettings => ({
      origin: state.warden?.origin ?? "",
      patConfigured,
      ...(state.warden?.principal ? { principal: state.warden.principal } : {}),
    });

    const patConfigured = secrets.get(WARDEN_PAT_SECRET).pipe(
      Effect.map(Option.isSome),
      Effect.mapError(
        (cause) =>
          new PulseMcpConfigError("read-secret", "Failed to read the Warden token.", cause),
      ),
    );

    const getWardenSettings: PulseMcpConfigServiceShape["getWardenSettings"] = Effect.all([
      load,
      patConfigured,
    ]).pipe(Effect.map(([state, configured]) => publicWarden(state, configured)));

    const setWardenSettings: PulseMcpConfigServiceShape["setWardenSettings"] = (input) =>
      Effect.gen(function* () {
        const origin = input.origin.trim().replace(/\/+$/, "");
        if (origin.length > 0 && !/^https?:\/\/[^\s/]+/.test(origin)) {
          return yield* Effect.fail(
            new PulseMcpConfigError("validate", "Warden origin must be an http(s) URL."),
          );
        }
        if (input.pat !== undefined) {
          const write =
            input.pat.length > 0
              ? secrets.set(WARDEN_PAT_SECRET, textEncoder.encode(input.pat))
              : secrets.remove(WARDEN_PAT_SECRET);
          yield* write.pipe(
            Effect.mapError(
              (cause) =>
                new PulseMcpConfigError("write-secret", "Failed to store the Warden token.", cause),
            ),
          );
        }
        yield* withWrite((state) =>
          Effect.succeed([
            undefined,
            {
              ...state,
              warden: {
                origin,
                // A new origin or token invalidates the recorded principal until the next test.
                ...(input.pat === undefined &&
                state.warden?.origin === origin &&
                state.warden.principal
                  ? { principal: state.warden.principal }
                  : {}),
              },
            },
          ] as const),
        );
        yield* Ref.set(wardenRuntime, Option.none());
        return yield* getWardenSettings;
      });

    const recordWardenPrincipal: PulseMcpConfigServiceShape["recordWardenPrincipal"] = (
      principal,
    ) =>
      withWrite((state) =>
        Effect.succeed([
          undefined,
          { ...state, warden: { origin: state.warden?.origin ?? "", principal } },
        ] as const),
      );

    const readWardenAccess: PulseMcpConfigServiceShape["readWardenAccess"] = Effect.gen(
      function* () {
        const state = yield* load;
        const origin = state.warden?.origin ?? "";
        if (origin.length === 0) return Option.none();
        const pat = yield* secrets
          .get(WARDEN_PAT_SECRET)
          .pipe(
            Effect.mapError(
              (cause) =>
                new PulseMcpConfigError("read-secret", "Failed to read the Warden token.", cause),
            ),
          );
        if (Option.isNone(pat)) return Option.none();
        return Option.some({ origin, pat: textDecoder.decode(pat.value) });
      },
    );

    const wardenSource = (access: PulseWardenAccess) =>
      Effect.gen(function* () {
        const key = `${access.origin}\n${access.pat}`;
        const current = yield* Ref.get(wardenRuntime);
        if (Option.isSome(current) && current.value.key === key) return current.value.source;
        const client = options.wardenClient(access);
        const grants = yield* makeWardenGrantIndex(client);
        const source = yield* makeWardenMaterialSource(client, grants);
        yield* Ref.set(wardenRuntime, Option.some({ key, source }));
        return source;
      });

    const resolveValues = Effect.fn(function* (
      values: Readonly<Record<string, PulseMcpStoredValue>>,
    ) {
      const resolved: Record<string, string> = {};
      const wardenKeys: Record<string, string> = {};
      const loaded = new Map<string, Readonly<Record<string, string>>>();
      for (const [key, value] of Object.entries(values)) {
        if (value.type === "literal") {
          resolved[key] = value.value;
          continue;
        }
        if (value.type === "warden-ref") {
          wardenKeys[key] = value.credentialRef;
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
      return { values: Object.freeze(resolved), wardenKeys } as const;
    });

    interface PendingConnection {
      readonly connection: PulseMcpStoredConnection;
      readonly values: Readonly<Record<string, string>>;
      readonly wardenKeys: Readonly<Record<string, string>>;
    }

    const resolvePending = Effect.fn(function* (connection: PulseMcpStoredConnection) {
      const source =
        connection.config.transport === "http" ? connection.config.headers : connection.config.env;
      const { values, wardenKeys } = yield* resolveValues(source);
      return { connection, values, wardenKeys } satisfies PendingConnection;
    });

    const finish = (
      pending: PendingConnection,
      values: Readonly<Record<string, string>>,
    ): PulseMcpResolvedConnection =>
      pending.connection.config.transport === "http"
        ? Object.freeze({
            id: pending.connection.id,
            name: pending.connection.name,
            config: Object.freeze({
              transport: "http" as const,
              url: pending.connection.config.url,
              headers: Object.freeze(values),
            }),
          })
        : Object.freeze({
            id: pending.connection.id,
            name: pending.connection.name,
            config: Object.freeze({
              transport: "stdio" as const,
              command: pending.connection.config.command,
              args: Object.freeze([...pending.connection.config.args]),
              ...(pending.connection.config.cwd ? { cwd: pending.connection.config.cwd } : {}),
              env: Object.freeze(values),
            }),
          });

    /** Resolves stored values, releases Warden material once per distinct ref, and splices it in. */
    const resolveSelection = Effect.fn(function* (
      state: PulseMcpPersistedState,
      ids: readonly string[],
    ) {
      const pendings = yield* Effect.forEach(ids, (id) => {
        const connection = state.connections[id];
        return connection === undefined
          ? Effect.fail(new PulseMcpConfigError("prepare", `Unknown MCP connection '${id}'.`))
          : resolvePending(connection);
      });
      const refs = [...new Set(pendings.flatMap((pending) => Object.values(pending.wardenKeys)))];
      const connections: PulseMcpResolvedConnection[] = [];
      const failures: PulseMcpConnectionFailure[] = [];
      if (refs.length === 0) {
        return {
          connections: pendings.map((pending) => finish(pending, pending.values)),
          failures,
        } satisfies PulseMcpTurnResolution;
      }
      const access = yield* readWardenAccess;
      const materials = Option.isNone(access)
        ? new Map(
            refs.map((ref) => [
              ref,
              { ok: false as const, ...wardenFailure(new PulseWardenError("not-configured", "")) },
            ]),
          )
        : yield* (yield* wardenSource(access.value)).resolve(refs);
      for (const pending of pendings) {
        const values: Record<string, string> = { ...pending.values };
        let failure: PulseMcpConnectionFailure | undefined;
        for (const [key, ref] of Object.entries(pending.wardenKeys)) {
          const material = materials.get(ref);
          if (material?.ok === true) {
            values[key] = material.material;
            continue;
          }
          const failed = material ?? {
            ok: false as const,
            ...wardenFailure(new PulseWardenError("protocol", "")),
          };
          failure ??= {
            connectionId: pending.connection.id,
            name: pending.connection.name,
            reason: failed.reason,
            message: failed.message,
          };
          // The credential URN is safe to log; the material and the token never are.
          yield* Effect.logWarning("pulse mcp warden release failed").pipe(
            Effect.annotateLogs({
              connectionId: pending.connection.id,
              credentialRef: ref,
              reason: failed.reason,
            }),
          );
        }
        if (failure) failures.push(failure);
        else connections.push(finish(pending, values));
      }
      return { connections, failures } satisfies PulseMcpTurnResolution;
    });

    const prepareTurn: PulseMcpConfigServiceShape["prepareTurn"] = (input, dependencies) =>
      lock
        .withPermits(1)(
          load.pipe(
            Effect.flatMap((state) => {
              const projectDefault =
                input.projectId === undefined
                  ? undefined
                  : state.projectDefaults[
                      projectDefaultKey(input.projectId, input.providerInstanceId)
                    ];
              const defaults =
                projectDefault ?? state.providerDefaults[input.providerInstanceId] ?? [];
              const override = state.threadOverrides[input.threadId];
              const turnInput: PulseMcpTurnInput = {
                turnId: input.turnId,
                provider: input.provider,
                defaultConnectionIds: defaults,
                defaultSelectionSource: projectDefault === undefined ? "global" : "project",
                ...(override !== undefined ? { threadConnectionIds: override } : {}),
              };
              const selected = override ?? defaults;
              return resolveSelection(state, unique(selected)).pipe(
                Effect.flatMap((resolution) =>
                  resolution.failures.length > 0
                    ? Effect.fail(
                        new PulseMcpConfigError("prepare", resolution.failures[0]?.message ?? ""),
                      )
                    : Effect.succeed([
                        Object.freeze(resolution.connections),
                        turnInput,
                      ] satisfies readonly [
                        readonly PulseMcpResolvedConnection[],
                        PulseMcpTurnInput,
                      ]),
                ),
              );
            }),
          ),
        )
        .pipe(
          Effect.map(([connections, turnInput]) =>
            Object.freeze({
              connections,
              preflight: makePulseMcpTurnPreflight(dependencies, turnInput),
            }),
          ),
        );

    const resolveTurnConnections: PulseMcpConfigServiceShape["resolveTurnConnections"] = (input) =>
      lock.withPermits(1)(
        load.pipe(
          Effect.flatMap((state) => {
            const selected =
              input.connectionIds ??
              state.threadOverrides[input.threadId] ??
              (input.projectId === undefined
                ? undefined
                : state.projectDefaults[
                    projectDefaultKey(input.projectId, input.providerInstanceId)
                  ]) ??
              state.providerDefaults[input.providerInstanceId] ??
              [];
            const excluded = new Set(input.excludedConnectionIds ?? []);
            return resolveSelection(
              state,
              unique(selected).filter((id) => !excluded.has(id)),
            );
          }),
        ),
      );

    return PulseMcpConfigService.of({
      listConnections: load.pipe(
        Effect.map((state) =>
          Object.freeze(
            Object.values(state.connections).map((connection) => ({
              ...connection,
              config:
                connection.config.transport === "http"
                  ? {
                      ...connection.config,
                      headers: Object.fromEntries(
                        Object.entries(connection.config.headers).map(([key, value]) => [
                          key,
                          value.type === "secret-ref"
                            ? { ...value, secretRef: "[redacted]" }
                            : value,
                        ]),
                      ),
                    }
                  : {
                      ...connection.config,
                      env: Object.fromEntries(
                        Object.entries(connection.config.env).map(([key, value]) => [
                          key,
                          value.type === "secret-ref"
                            ? { ...value, secretRef: "[redacted]" }
                            : value,
                        ]),
                      ),
                    },
            })),
          ),
        ),
      ),
      upsertConnection,
      removeConnection,
      setProviderDefault,
      getProviderDefault,
      setProjectDefault,
      resetProjectDefault,
      getProjectDefault,
      setThreadOverride,
      resetThreadOverride,
      getThreadOverride,
      prepareTurn,
      resolveTurnConnections,
      getWardenSettings,
      setWardenSettings,
      recordWardenPrincipal,
      readWardenAccess,
    });
  });

export const layer = Layer.effect(PulseMcpConfigService, make(defaultOptions));
export const layerWith = (options: Partial<PulseMcpConfigLayerOptions>) =>
  Layer.effect(PulseMcpConfigService, make({ ...defaultOptions, ...options }));
