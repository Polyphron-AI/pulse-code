import { PulseMcpError, type PulseMcpConnectionInput } from "@t3tools/contracts";
import * as Effect from "effect/Effect";

import type {
  PulseMcpConfigServiceShape,
  PulseMcpStoredConnection,
  PulseMcpStoredValue,
} from "./PulseMcpConfigService.ts";

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
export function pulseMcpHandlers(service: PulseMcpConfigServiceShape) {
  return {
    list: () =>
      redactFailure(
        service.listConnections.pipe(Effect.map((items) => items.map(publicConnection))),
      ),
    upsert: (input: PulseMcpConnectionInput) =>
      redactFailure(service.upsertConnection(input).pipe(Effect.map(publicConnection))),
    remove: ({ id }: { readonly id: string }) => redactFailure(service.removeConnection(id)),
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
  };
}
