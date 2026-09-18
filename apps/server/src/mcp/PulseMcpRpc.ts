import {
  PulseMcpError,
  PulseMcpWardenError,
  type PulseMcpConnectionInput,
  type PulseMcpPrepareTurnInput,
  type PulseMcpWardenCredential,
  type PulseMcpWardenSettingsInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type { ProviderNativeMcpStatus } from "../provider/Services/ProviderAdapter.ts";

import type {
  PulseMcpConfigError,
  PulseMcpConfigServiceShape,
  PulseMcpStoredConnection,
  PulseMcpStoredValue,
} from "./PulseMcpConfigService.ts";
import {
  makePulseWardenClient,
  PulseWardenError,
  wardenArray,
  type PulseWardenAccess,
  type PulseWardenClientShape,
} from "./PulseWardenClient.ts";
import type { ProviderServiceShape } from "../provider/Services/ProviderService.ts";
import type { PulseMcpDiscoveryService } from "./PulseMcpDiscoveryService.ts";

const publicValue = (value: PulseMcpStoredValue) =>
  value.type === "literal"
    ? value
    : value.type === "warden-ref"
      ? ({ type: "warden", credentialRef: value.credentialRef } as const)
      : ({ type: "secret", configured: true } as const);

const publicConnection = (connection: PulseMcpStoredConnection) => ({
  id: connection.id,
  name: connection.name,
  config:
    connection.config.transport === "http"
      ? {
          transport: "http" as const,
          url: connection.config.url,
          headers: Object.fromEntries(
            Object.entries(connection.config.headers).map(([key, value]) => [
              key,
              publicValue(value),
            ]),
          ),
        }
      : {
          transport: "stdio" as const,
          command: connection.config.command,
          args: connection.config.args,
          ...(connection.config.cwd === undefined ? {} : { cwd: connection.config.cwd }),
          env: Object.fromEntries(
            Object.entries(connection.config.env).map(([key, value]) => [key, publicValue(value)]),
          ),
        },
});

const rpcFailure = () =>
  new PulseMcpError({
    message: "Pulse MCP configuration operation failed. Check the connection details and retry.",
  });

const redactFailure = <A, E>(effect: Effect.Effect<A, E>) =>
  effect.pipe(
    Effect.mapError(rpcFailure),
    Effect.catchDefect(() => Effect.fail(rpcFailure())),
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const toWardenError = (error: PulseWardenError | PulseMcpConfigError) =>
  error instanceof PulseWardenError
    ? new PulseMcpWardenError({ kind: error.kind, message: error.message })
    : rpcFailure();

const decodePrincipal = (value: unknown) =>
  isRecord(value) &&
  isRecord(value.principal) &&
  typeof value.principal.id === "string" &&
  typeof value.principal.name === "string"
    ? { id: value.principal.id, name: value.principal.name }
    : undefined;

/**
 * Grant state for the settings list. Unlike the release path, which only cares about
 * active grants, the UI also shows pending ones so the user knows a grant is awaiting
 * acceptance in Pulse Go.
 */
const decodeGrantStates = (value: unknown) => {
  const byScope = new Map<string, { status: "active" | "pending"; expiresAt?: string }>();
  for (const entry of wardenArray(value, "grants")) {
    if (!isRecord(entry) || typeof entry.scope !== "string") continue;
    if (entry.status !== "active" && entry.status !== "pending") continue;
    if (byScope.has(entry.scope)) continue;
    byScope.set(entry.scope, {
      status: entry.status,
      ...(entry.status === "active" && typeof entry.expiresAt === "string"
        ? { expiresAt: entry.expiresAt }
        : {}),
    });
  }
  return byScope;
};

/** Joins Pulse Go's credential list with its grant list so the UI can show grant state. */
const decodeCredentials = (value: unknown, grantsValue: unknown) => {
  const byScope = decodeGrantStates(grantsValue);
  return wardenArray(value, "credentials").flatMap((entry): PulseMcpWardenCredential[] => {
    if (
      !isRecord(entry) ||
      typeof entry.credentialRef !== "string" ||
      typeof entry.resourceRef !== "string"
    )
      return [];
    const grant = byScope.get(entry.credentialRef);
    return [
      {
        credentialRef: entry.credentialRef,
        resourceRef: entry.resourceRef,
        available: entry.available === true,
        grant: grant === undefined ? { status: "none" as const } : grant,
      },
    ];
  });
};

/** Config-only RPC handlers. The caller must share one service instance across all connections. */
export function pulseMcpHandlers(
  service: PulseMcpConfigServiceShape,
  providerService?: ProviderServiceShape,
  discovery?: PulseMcpDiscoveryService,
  options: { readonly wardenClient?: (access: PulseWardenAccess) => PulseWardenClientShape } = {},
) {
  const wardenClient = options.wardenClient ?? ((access) => makePulseWardenClient(access));
  const withWarden = <A>(
    use: (client: PulseWardenClientShape) => Effect.Effect<A, PulseWardenError>,
  ) =>
    service.readWardenAccess.pipe(
      Effect.flatMap((access) =>
        Option.isNone(access)
          ? Effect.fail(
              new PulseWardenError(
                "not-configured",
                "Configure Pulse Go Warden in Settings > MCP.",
              ),
            )
          : use(wardenClient(access.value)),
      ),
      Effect.mapError(toWardenError),
      Effect.catchDefect(() => Effect.fail(rpcFailure())),
    );
  return {
    list: () =>
      redactFailure(
        service.listConnections.pipe(Effect.map((items) => items.map(publicConnection))),
      ),
    upsert: (input: PulseMcpConnectionInput) =>
      redactFailure(service.upsertConnection(input).pipe(Effect.map(publicConnection))),
    remove: ({ id }: { readonly id: string }) => redactFailure(service.removeConnection(id)),
    discover: () =>
      discovery === undefined ? Effect.fail(rpcFailure()) : redactFailure(discovery.discover()),
    importDiscovered: (input: {
      readonly source: "claude" | "codex" | "opencode";
      readonly name: string;
    }) =>
      discovery === undefined
        ? Effect.fail(rpcFailure())
        : redactFailure(discovery.import(input).pipe(Effect.map(publicConnection))),
    nativeInventory: (input: {
      readonly threadId: import("@t3tools/contracts").ThreadId;
      readonly providerInstanceId: import("@t3tools/contracts").ProviderInstanceId;
    }): Effect.Effect<
      | { readonly status: "unavailable" }
      | { readonly status: "available"; readonly servers: readonly ProviderNativeMcpStatus[] },
      PulseMcpError
    > => {
      if (providerService?.readNativeMcpInventory === undefined)
        return Effect.succeed({ status: "unavailable" as const });
      return redactFailure(providerService.readNativeMcpInventory(input)).pipe(
        Effect.map((servers) =>
          servers === null
            ? { status: "unavailable" as const }
            : { status: "available" as const, servers },
        ),
      );
    },
    setDiscoveryFollow: (input: {
      readonly source: "claude" | "codex" | "opencode";
      readonly followNew: boolean;
    }) =>
      discovery === undefined
        ? Effect.fail(rpcFailure())
        : redactFailure(discovery.setFollow(input)),
    getProviderDefault: ({
      providerInstanceId,
    }: Parameters<PulseMcpConfigServiceShape["getProviderDefault"]>[0] extends infer Id
      ? { readonly providerInstanceId: Id }
      : never) =>
      redactFailure(
        service
          .getProviderDefault(providerInstanceId)
          .pipe(
            Effect.map((connectionIds) => (connectionIds === undefined ? {} : { connectionIds })),
          ),
      ),
    setProviderDefault: ({
      providerInstanceId,
      connectionIds,
    }: {
      readonly providerInstanceId: Parameters<PulseMcpConfigServiceShape["setProviderDefault"]>[0];
      readonly connectionIds: readonly string[];
    }) =>
      redactFailure(
        service
          .setProviderDefault(providerInstanceId, connectionIds)
          .pipe(Effect.as({ connectionIds })),
      ),
    getProjectDefault: ({
      projectId,
      providerInstanceId,
    }: {
      readonly projectId: Parameters<PulseMcpConfigServiceShape["getProjectDefault"]>[0];
      readonly providerInstanceId: Parameters<PulseMcpConfigServiceShape["getProjectDefault"]>[1];
    }) =>
      redactFailure(
        service
          .getProjectDefault(projectId, providerInstanceId)
          .pipe(
            Effect.map((connectionIds) => (connectionIds === undefined ? {} : { connectionIds })),
          ),
      ),
    setProjectDefault: ({
      projectId,
      providerInstanceId,
      connectionIds,
    }: {
      readonly projectId: Parameters<PulseMcpConfigServiceShape["setProjectDefault"]>[0];
      readonly providerInstanceId: Parameters<PulseMcpConfigServiceShape["setProjectDefault"]>[1];
      readonly connectionIds: readonly string[];
    }) =>
      redactFailure(
        service
          .setProjectDefault(projectId, providerInstanceId, connectionIds)
          .pipe(Effect.as({ connectionIds })),
      ),
    resetProjectDefault: ({
      projectId,
      providerInstanceId,
    }: {
      readonly projectId: Parameters<PulseMcpConfigServiceShape["resetProjectDefault"]>[0];
      readonly providerInstanceId: Parameters<PulseMcpConfigServiceShape["resetProjectDefault"]>[1];
    }) =>
      redactFailure(service.resetProjectDefault(projectId, providerInstanceId).pipe(Effect.as({}))),
    getThreadOverride: ({
      threadId,
    }: Parameters<PulseMcpConfigServiceShape["getThreadOverride"]>[0] extends infer Id
      ? { readonly threadId: Id }
      : never) =>
      redactFailure(
        service
          .getThreadOverride(threadId)
          .pipe(
            Effect.map((connectionIds) => (connectionIds === undefined ? {} : { connectionIds })),
          ),
      ),
    setThreadOverride: ({
      threadId,
      connectionIds,
    }: {
      readonly threadId: Parameters<PulseMcpConfigServiceShape["setThreadOverride"]>[0];
      readonly connectionIds: readonly string[];
    }) =>
      redactFailure(
        service.setThreadOverride(threadId, connectionIds).pipe(Effect.as({ connectionIds })),
      ),
    resetThreadOverride: ({
      threadId,
    }: Parameters<PulseMcpConfigServiceShape["resetThreadOverride"]>[0] extends infer Id
      ? { readonly threadId: Id }
      : never) => redactFailure(service.resetThreadOverride(threadId).pipe(Effect.as({}))),
    prepareTurn: (input: PulseMcpPrepareTurnInput) =>
      providerService?.preparePulseMcp === undefined
        ? Effect.fail(rpcFailure())
        : redactFailure(providerService.preparePulseMcp(input)),
    wardenGet: () => redactFailure(service.getWardenSettings),
    wardenSet: (input: PulseMcpWardenSettingsInput) =>
      redactFailure(service.setWardenSettings(input)),
    wardenTest: () =>
      withWarden((client) =>
        client.callTool("warden_capabilities", {}).pipe(
          Effect.flatMap((raw) => {
            const principal = decodePrincipal(raw);
            return principal === undefined
              ? Effect.fail(
                  new PulseWardenError("protocol", "Pulse Go did not report a principal."),
                )
              : Effect.succeed(principal);
          }),
        ),
      ).pipe(
        Effect.tap((principal) => redactFailure(service.recordWardenPrincipal(principal))),
        Effect.map((principal) => ({ principal })),
      ),
    wardenListCredentials: () =>
      withWarden((client) =>
        Effect.all(
          [
            client.callTool("warden_credentials_list", {}),
            client.callTool("warden_grants_list", {}),
          ],
          { concurrency: 2 },
        ).pipe(
          Effect.flatMap(([credentials, grants]) =>
            Effect.try({
              try: () => decodeCredentials(credentials, grants),
              catch: (cause) =>
                cause instanceof PulseWardenError
                  ? cause
                  : new PulseWardenError("protocol", "Pulse Go credentials could not be decoded."),
            }),
          ),
        ),
      ),
  };
}
