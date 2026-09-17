import {
  PulseMcpError,
  type PulseMcpConnectionInput,
  type PulseMcpPrepareTurnInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type { ProviderNativeMcpStatus } from "../provider/Services/ProviderAdapter.ts";

import type {
  PulseMcpConfigServiceShape,
  PulseMcpStoredConnection,
  PulseMcpStoredValue,
} from "./PulseMcpConfigService.ts";
import type { ProviderServiceShape } from "../provider/Services/ProviderService.ts";
import type { PulseMcpDiscoveryService } from "./PulseMcpDiscoveryService.ts";

const publicValue = (value: PulseMcpStoredValue) =>
  value.type === "literal" ? value : ({ type: "secret", configured: true } as const);

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

/** Config-only RPC handlers. The caller must share one service instance across all connections. */
export function pulseMcpHandlers(
  service: PulseMcpConfigServiceShape,
  providerService?: ProviderServiceShape,
  discovery?: PulseMcpDiscoveryService,
) {
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
  };
}
