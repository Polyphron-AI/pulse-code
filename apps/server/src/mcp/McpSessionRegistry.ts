import { ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SynchronizedRef from "effect/SynchronizedRef";
import { HttpServer } from "effect/unstable/http";

import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as McpInvocationContext from "./McpInvocationContext.ts";
import * as McpProviderSession from "./McpProviderSession.ts";

export interface McpCredentialRequest {
  readonly threadId: ThreadId;
  readonly providerInstanceId: ProviderInstanceId;
  readonly capabilities?: ReadonlySet<McpInvocationContext.McpCapability>;
}

export interface McpIssuedCredential {
  readonly config: McpProviderSession.McpProviderSessionConfig;
}

export interface McpSessionRegistryShape {
  readonly issue: (request: McpCredentialRequest) => Effect.Effect<McpIssuedCredential>;
  readonly resolve: (
    rawToken: string,
  ) => Effect.Effect<McpInvocationContext.McpInvocationScope | undefined>;
  /**
   * Records a sign of life for every credential bound to `threadId`. Provider
   * turns call this so that a session which is plainly alive keeps its
   * credential even when it goes a long time without touching an MCP tool.
   */
  readonly touch: (threadId: ThreadId) => Effect.Effect<void>;
  readonly beginAttempt: (
    threadId: ThreadId,
    providerInstanceId: ProviderInstanceId,
  ) => Effect.Effect<string | undefined>;
  readonly bindAttempt: (
    threadId: ThreadId,
    attemptId: string,
    turnId: string,
  ) => Effect.Effect<void>;
  readonly endAttempt: (threadId: ThreadId, attemptId: string) => Effect.Effect<void>;
  readonly endTurn: (
    threadId: ThreadId,
    providerInstanceId: ProviderInstanceId,
    turnId?: string,
  ) => Effect.Effect<void>;
  readonly revokeProviderSession: (providerSessionId: string) => Effect.Effect<void>;
  readonly revokeThread: (threadId: ThreadId) => Effect.Effect<void>;
  readonly revokeAll: Effect.Effect<void>;
}

export class McpSessionRegistry extends Context.Service<
  McpSessionRegistry,
  McpSessionRegistryShape
>()("t3/mcp/McpSessionRegistry") {}

interface CredentialRecord {
  readonly tokenHash: string;
  readonly scope: McpInvocationContext.McpInvocationScope;
  readonly lastAliveAt: number;
  readonly attempt?: {
    readonly id: string;
    readonly controller: AbortController;
    readonly turnId?: string;
  };
}

interface RegistryState {
  readonly records: ReadonlyMap<string, CredentialRecord>;
}

export interface McpSessionRegistryOptions {
  readonly livenessWindowMs?: number;
  readonly now?: () => number;
}

/**
 * How long a credential outlives the last sign of life from its provider
 * session.
 *
 * Liveness is refreshed both by MCP traffic and by `touch` on every provider
 * turn, so a session that is still doing work never expires no matter how long
 * it goes between browser tool calls. This window therefore only bounds
 * credentials whose session died without a clean stop — the normal paths
 * (`stopSession`, `stopAll`) revoke eagerly and do not wait for it.
 *
 * The bound matters because `/mcp` is mounted outside the environment auth
 * stack and is reachable on whatever host the server binds to, so this token is
 * the only thing guarding the preview toolkit on a remote-reachable server.
 */
const DEFAULT_LIVENESS_WINDOW_MS = 24 * 60 * 60 * 1_000;

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const tokenFromBytes = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");

const getHttpMcpEndpointHost = (hostname: string): string => {
  const normalized = hostname.toLowerCase();
  const endpointHostname =
    normalized === "0.0.0.0" || normalized === "::" || normalized === "[::]"
      ? "127.0.0.1"
      : hostname;
  return endpointHostname.includes(":") && !endpointHostname.startsWith("[")
    ? `[${endpointHostname}]`
    : endpointHostname;
};

const makeWithOptions = Effect.fn("McpSessionRegistry.make")(function* (
  options: McpSessionRegistryOptions = {},
) {
  const crypto = yield* Crypto.Crypto;
  const environment = yield* ServerEnvironment.ServerEnvironment;
  const environmentId = yield* environment.getEnvironmentId;
  const httpServer = yield* HttpServer.HttpServer;
  const state = yield* SynchronizedRef.make<RegistryState>({ records: new Map() });
  const currentTimeMillis = options.now ? Effect.sync(options.now) : Clock.currentTimeMillis;
  const livenessWindowMs = options.livenessWindowMs ?? DEFAULT_LIVENESS_WINDOW_MS;
  const endpoint =
    httpServer.address._tag === "TcpAddress"
      ? `http://${getHttpMcpEndpointHost(httpServer.address.hostname)}:${httpServer.address.port}/mcp`
      : "http://127.0.0.1/mcp";

  const hashToken = (token: string) =>
    crypto
      .digest("SHA-256", new TextEncoder().encode(token))
      .pipe(Effect.map(bytesToHex), Effect.orDie);

  const pruneDead = (records: ReadonlyMap<string, CredentialRecord>, timestamp: number) => {
    const next = new Map(
      Array.from(records).filter(([, record]) => {
        if (timestamp - record.lastAliveAt <= livenessWindowMs) return true;
        record.attempt?.controller.abort();
        return false;
      }),
    );
    return next.size === records.size ? records : next;
  };

  const issue: McpSessionRegistryShape["issue"] = Effect.fn("McpSessionRegistry.issue")(
    function* (request) {
      const issuedAt = yield* currentTimeMillis;
      const providerSessionId = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
      const rawToken = yield* crypto.randomBytes(32).pipe(Effect.map(tokenFromBytes), Effect.orDie);
      const tokenHash = yield* hashToken(rawToken);
      const scope: McpInvocationContext.McpInvocationScope = {
        environmentId,
        threadId: ThreadId.make(request.threadId),
        providerSessionId,
        providerInstanceId: ProviderInstanceId.make(request.providerInstanceId),
        capabilities: new Set(request.capabilities ?? ["preview"]),
        issuedAt,
      };
      yield* SynchronizedRef.update(state, ({ records }) => {
        const next = new Map(pruneDead(records, issuedAt));
        next.set(tokenHash, { tokenHash, scope, lastAliveAt: issuedAt });
        return { records: next };
      });
      return {
        config: {
          environmentId,
          threadId: scope.threadId,
          providerSessionId,
          providerInstanceId: scope.providerInstanceId,
          endpoint,
          authorizationHeader: `Bearer ${rawToken}`,
        },
      };
    },
  );

  const resolve: McpSessionRegistryShape["resolve"] = Effect.fn("McpSessionRegistry.resolve")(
    function* (rawToken) {
      if (rawToken.length === 0) return undefined;
      const tokenHash = yield* hashToken(rawToken);
      const timestamp = yield* currentTimeMillis;
      return yield* SynchronizedRef.modify(state, ({ records }) => {
        const current = pruneDead(records, timestamp);
        const record = current.get(tokenHash);
        if (!record) return [undefined, { records: current }] as const;
        const next = new Map(current);
        next.set(tokenHash, { ...record, lastAliveAt: timestamp });
        return [
          {
            ...record.scope,
            ...(record.attempt
              ? {
                  wardenAttempt: {
                    id: record.attempt.id,
                    signal: record.attempt.controller.signal,
                  },
                }
              : {}),
          },
          { records: next },
        ] as const;
      });
    },
  );

  const touch: McpSessionRegistryShape["touch"] = Effect.fn("McpSessionRegistry.touch")(
    function* (threadId) {
      const timestamp = yield* currentTimeMillis;
      yield* SynchronizedRef.update(state, ({ records }) => {
        const current = pruneDead(records, timestamp);
        const next = new Map(current);
        for (const [tokenHash, record] of current) {
          if (record.scope.threadId === threadId) {
            next.set(tokenHash, { ...record, lastAliveAt: timestamp });
          }
        }
        return { records: next };
      });
    },
  );

  const revokeWhere = (predicate: (record: CredentialRecord) => boolean) =>
    SynchronizedRef.update(state, ({ records }) => ({
      records: new Map(
        Array.from(records).filter(([, record]) => {
          if (!predicate(record)) return true;
          record.attempt?.controller.abort();
          return false;
        }),
      ),
    }));

  const updateAttempts = (update: (record: CredentialRecord) => CredentialRecord) =>
    SynchronizedRef.update(state, ({ records }) => ({
      records: new Map(Array.from(records, ([key, record]) => [key, update(record)])),
    }));
  const clearAttempt = (record: CredentialRecord): CredentialRecord => {
    record.attempt?.controller.abort();
    const { attempt: _attempt, ...rest } = record;
    return rest;
  };
  const beginAttempt: McpSessionRegistryShape["beginAttempt"] = Effect.fn(
    "McpSessionRegistry.beginAttempt",
  )(function* (threadId, providerInstanceId) {
    const id = yield* crypto.randomUUIDv4.pipe(Effect.orDie);
    let activated = false;
    yield* updateAttempts((record) => {
      if (
        record.scope.threadId !== threadId ||
        record.scope.providerInstanceId !== providerInstanceId ||
        !record.scope.capabilities.has("warden")
      )
        return record;
      activated = true;
      record.attempt?.controller.abort();
      return { ...record, attempt: { id, controller: new AbortController() } };
    });
    return activated ? id : undefined;
  });
  const bindAttempt: McpSessionRegistryShape["bindAttempt"] = (threadId, attemptId, turnId) =>
    updateAttempts((record) =>
      record.scope.threadId === threadId && record.attempt?.id === attemptId
        ? { ...record, attempt: { ...record.attempt, turnId } }
        : record,
    );
  const endAttempt: McpSessionRegistryShape["endAttempt"] = (threadId, attemptId) =>
    updateAttempts((record) =>
      record.scope.threadId === threadId && record.attempt?.id === attemptId
        ? clearAttempt(record)
        : record,
    );
  const endTurn: McpSessionRegistryShape["endTurn"] = (threadId, providerInstanceId, turnId) =>
    updateAttempts((record) =>
      record.scope.threadId === threadId &&
      record.scope.providerInstanceId === providerInstanceId &&
      (turnId === undefined ||
        record.attempt?.turnId === undefined ||
        record.attempt.turnId === turnId)
        ? clearAttempt(record)
        : record,
    );

  return McpSessionRegistry.of({
    issue,
    resolve,
    touch,
    beginAttempt,
    bindAttempt,
    endAttempt,
    endTurn,
    revokeProviderSession: Effect.fn("McpSessionRegistry.revokeProviderSession")(
      function* (providerSessionId) {
        yield* revokeWhere((record) => record.scope.providerSessionId === providerSessionId);
      },
    ),
    revokeThread: Effect.fn("McpSessionRegistry.revokeThread")(function* (threadId) {
      yield* revokeWhere((record) => record.scope.threadId === threadId);
    }),
    revokeAll: revokeWhere(() => true),
  });
});

let activeMcpSessionRegistry: McpSessionRegistryShape | undefined;

const make = Effect.acquireRelease(
  makeWithOptions().pipe(
    Effect.tap((registry) =>
      Effect.sync(() => {
        activeMcpSessionRegistry = registry;
      }),
    ),
  ),
  (registry) =>
    Effect.sync(() => {
      if (activeMcpSessionRegistry === registry) {
        activeMcpSessionRegistry = undefined;
      }
    }),
);

export const layer = Layer.effect(McpSessionRegistry, make);

export const issueActiveMcpCredential = (
  request: McpCredentialRequest,
): Effect.Effect<McpIssuedCredential | undefined> =>
  activeMcpSessionRegistry
    ? activeMcpSessionRegistry
        .revokeThread(request.threadId)
        .pipe(Effect.andThen(activeMcpSessionRegistry.issue(request)))
    : Effect.sync((): McpIssuedCredential | undefined => undefined);

/**
 * Refreshes the liveness of a thread's MCP credential. Called on every provider
 * turn so an active session is never mistaken for an abandoned one.
 */
export const touchActiveMcpThread = (threadId: ThreadId): Effect.Effect<void> =>
  activeMcpSessionRegistry ? activeMcpSessionRegistry.touch(threadId) : Effect.void;

export const revokeActiveMcpThread = (threadId: ThreadId): Effect.Effect<void> =>
  activeMcpSessionRegistry ? activeMcpSessionRegistry.revokeThread(threadId) : Effect.void;

export const revokeAllActiveMcpCredentials = (): Effect.Effect<void> =>
  activeMcpSessionRegistry ? activeMcpSessionRegistry.revokeAll : Effect.void;

/** Exposed for tests. */
export const __testing = {
  make: makeWithOptions,
};

export const beginActiveWardenAttempt = (
  threadId: ThreadId,
  providerInstanceId: ProviderInstanceId,
) =>
  activeMcpSessionRegistry
    ? activeMcpSessionRegistry.beginAttempt(threadId, providerInstanceId)
    : Effect.succeed<string | undefined>(undefined);
export const bindActiveWardenAttempt = (threadId: ThreadId, attemptId: string, turnId: string) =>
  activeMcpSessionRegistry
    ? activeMcpSessionRegistry.bindAttempt(threadId, attemptId, turnId)
    : Effect.void;
export const endActiveWardenAttempt = (threadId: ThreadId, attemptId: string) =>
  activeMcpSessionRegistry ? activeMcpSessionRegistry.endAttempt(threadId, attemptId) : Effect.void;
export const endActiveWardenTurn = (
  threadId: ThreadId,
  providerInstanceId: ProviderInstanceId,
  turnId?: string,
) =>
  activeMcpSessionRegistry
    ? activeMcpSessionRegistry.endTurn(threadId, providerInstanceId, turnId)
    : Effect.void;

/** Separate CLI credential carries no preview capability and does not replace the MCP credential. */
export const issueActiveWardenCliCredential = (
  request: McpCredentialRequest,
): Effect.Effect<McpIssuedCredential | undefined> =>
  activeMcpSessionRegistry
    ? activeMcpSessionRegistry.issue({ ...request, capabilities: new Set(["warden"]) })
    : Effect.succeed(undefined);
export const revokeActiveMcpProviderSession = (providerSessionId: string) =>
  activeMcpSessionRegistry
    ? activeMcpSessionRegistry.revokeProviderSession(providerSessionId)
    : Effect.void;
