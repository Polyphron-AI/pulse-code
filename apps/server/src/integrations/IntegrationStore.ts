import type {
  EnvironmentId,
  IntegrationCapability,
  IntegrationConnectionHealth,
  IntegrationConnectionId,
  IntegrationConnectionState,
  IntegrationHealthFailureReason,
  IntegrationProjectMapping,
  IntegrationProviderId,
  ProjectId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { type PersistenceSqlError, toPersistenceSqlError } from "../persistence/Errors.ts";

export interface IntegrationConnectionTarget {
  readonly environmentId: EnvironmentId;
  readonly connectionId: IntegrationConnectionId;
}

/** Server-internal lifecycle metadata. `secretRef` names a ServerSecretStore entry, never a token. */
export interface StoredIntegrationConnection extends IntegrationConnectionTarget {
  readonly providerId: IntegrationProviderId;
  readonly accountHint: string | null;
  readonly endpointHint: string | null;
  readonly secretRef: string | null;
  readonly state: IntegrationConnectionState;
  readonly capabilities: ReadonlyArray<IntegrationCapability>;
  readonly health: IntegrationConnectionHealth;
  readonly updatedAt: string;
}

export interface IntegrationMappingTarget extends IntegrationConnectionTarget {
  readonly projectId: ProjectId;
}

export interface UpsertIntegrationMappingInput extends IntegrationConnectionTarget {
  readonly mapping: IntegrationProjectMapping;
}

export class IntegrationStore extends Context.Service<
  IntegrationStore,
  {
    readonly listConnections: (
      environmentId: EnvironmentId,
    ) => Effect.Effect<ReadonlyArray<StoredIntegrationConnection>, PersistenceSqlError>;
    readonly getConnection: (
      target: IntegrationConnectionTarget,
    ) => Effect.Effect<Option.Option<StoredIntegrationConnection>, PersistenceSqlError>;
    readonly upsertConnection: (
      input: StoredIntegrationConnection,
    ) => Effect.Effect<StoredIntegrationConnection, PersistenceSqlError>;
    readonly disconnect: (
      target: IntegrationConnectionTarget,
    ) => Effect.Effect<boolean, PersistenceSqlError>;
    readonly listMappings: (
      target: IntegrationConnectionTarget,
    ) => Effect.Effect<ReadonlyArray<IntegrationProjectMapping>, PersistenceSqlError>;
    readonly getMapping: (
      target: IntegrationMappingTarget,
    ) => Effect.Effect<Option.Option<IntegrationProjectMapping>, PersistenceSqlError>;
    readonly upsertMapping: (
      input: UpsertIntegrationMappingInput,
    ) => Effect.Effect<Option.Option<IntegrationProjectMapping>, PersistenceSqlError>;
    readonly removeMapping: (
      target: IntegrationMappingTarget,
    ) => Effect.Effect<boolean, PersistenceSqlError>;
  }
>()("t3/integrations/IntegrationStore") {}

interface ConnectionRow {
  readonly environmentId: EnvironmentId;
  readonly connectionId: IntegrationConnectionId;
  readonly providerId: IntegrationProviderId;
  readonly accountHint: string | null;
  readonly endpointHint: string | null;
  readonly secretRef: string | null;
  readonly state: IntegrationConnectionState;
  readonly healthState: IntegrationConnectionState;
  readonly healthLastCheckedAt: string | null;
  readonly healthLastSuccessfulAt: string | null;
  readonly healthFailureReason: IntegrationHealthFailureReason | null;
  readonly healthFailureDetail: string | null;
  readonly healthFailureRetryable: number | null;
  readonly updatedAt: string;
}

interface CapabilityRow {
  readonly connectionId: IntegrationConnectionId;
  readonly capability: IntegrationCapability;
}

type MappingRow = IntegrationProjectMapping;

const firstOption = <A>(rows: ReadonlyArray<A>): Option.Option<A> =>
  rows[0] === undefined ? Option.none() : Option.some(rows[0]);

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const connectionSelect = sql<ConnectionRow>`
    SELECT
      environment_id AS "environmentId",
      connection_id AS "connectionId",
      provider_id AS "providerId",
      account_hint AS "accountHint",
      endpoint_hint AS "endpointHint",
      secret_ref AS "secretRef",
      state,
      health_state AS "healthState",
      health_last_checked_at AS "healthLastCheckedAt",
      health_last_successful_at AS "healthLastSuccessfulAt",
      health_failure_reason AS "healthFailureReason",
      health_failure_detail AS "healthFailureDetail",
      health_failure_retryable AS "healthFailureRetryable",
      updated_at AS "updatedAt"
    FROM integration_connections
  `;

  const loadConnections = Effect.fn("IntegrationStore.loadConnections")(function* (
    environmentId: EnvironmentId,
    connectionId?: IntegrationConnectionId,
  ) {
    const rows = yield* connectionId === undefined
      ? sql<ConnectionRow>`
          ${connectionSelect}
          WHERE environment_id = ${environmentId}
          ORDER BY updated_at DESC, connection_id ASC
        `
      : sql<ConnectionRow>`
          ${connectionSelect}
          WHERE environment_id = ${environmentId} AND connection_id = ${connectionId}
        `;
    if (rows.length === 0) return [];

    const capabilities = yield* sql<CapabilityRow>`
      SELECT connection_id AS "connectionId", capability
      FROM integration_connection_capabilities
      WHERE environment_id = ${environmentId}
      ORDER BY capability ASC
    `;
    const requiredCapabilities = yield* sql<CapabilityRow>`
      SELECT connection_id AS "connectionId", capability
      FROM integration_health_required_capabilities
      WHERE environment_id = ${environmentId}
      ORDER BY capability ASC
    `;

    return rows.map((row): StoredIntegrationConnection => {
      const connectionCapabilities = capabilities
        .filter((capability) => capability.connectionId === row.connectionId)
        .map((capability) => capability.capability);
      const required = requiredCapabilities
        .filter((capability) => capability.connectionId === row.connectionId)
        .map((capability) => capability.capability);
      const failure =
        row.healthFailureReason === null
          ? null
          : {
              reason: row.healthFailureReason,
              detail: row.healthFailureDetail!,
              retryable: row.healthFailureRetryable === 1,
              ...(required.length === 0 ? {} : { requiredCapabilities: required }),
            };
      return {
        environmentId: row.environmentId,
        connectionId: row.connectionId,
        providerId: row.providerId,
        accountHint: row.accountHint,
        endpointHint: row.endpointHint,
        secretRef: row.secretRef,
        state: row.state,
        capabilities: connectionCapabilities,
        health: {
          state: row.healthState,
          lastCheckedAt: row.healthLastCheckedAt,
          lastSuccessfulAt: row.healthLastSuccessfulAt,
          failure,
        },
        updatedAt: row.updatedAt,
      };
    });
  });

  const listConnections: IntegrationStore["Service"]["listConnections"] = (environmentId) =>
    loadConnections(environmentId).pipe(
      Effect.mapError(toPersistenceSqlError("IntegrationStore.listConnections")),
    );

  const getConnection: IntegrationStore["Service"]["getConnection"] = ({
    environmentId,
    connectionId,
  }) =>
    loadConnections(environmentId, connectionId).pipe(
      Effect.map(firstOption),
      Effect.mapError(toPersistenceSqlError("IntegrationStore.getConnection")),
    );

  const upsertConnection: IntegrationStore["Service"]["upsertConnection"] = Effect.fn(
    "IntegrationStore.upsertConnection",
  )(
    function* (input) {
      const failure = input.health.failure;
      yield* sql.withTransaction(
        Effect.gen(function* () {
          yield* sql`
          INSERT INTO integration_connections(
            environment_id,
            connection_id,
            provider_id,
            account_hint,
            endpoint_hint,
            secret_ref,
            state,
            health_state,
            health_last_checked_at,
            health_last_successful_at,
            health_failure_reason,
            health_failure_detail,
            health_failure_retryable,
            updated_at
          )
          VALUES (
            ${input.environmentId},
            ${input.connectionId},
            ${input.providerId},
            ${input.accountHint},
            ${input.endpointHint},
            ${input.secretRef},
            ${input.state},
            ${input.health.state},
            ${input.health.lastCheckedAt},
            ${input.health.lastSuccessfulAt},
            ${failure?.reason ?? null},
            ${failure?.detail ?? null},
            ${failure === null ? null : failure.retryable ? 1 : 0},
            ${input.updatedAt}
          )
          ON CONFLICT(environment_id, connection_id)
          DO UPDATE SET
            provider_id = excluded.provider_id,
            account_hint = excluded.account_hint,
            endpoint_hint = excluded.endpoint_hint,
            secret_ref = excluded.secret_ref,
            state = excluded.state,
            health_state = excluded.health_state,
            health_last_checked_at = excluded.health_last_checked_at,
            health_last_successful_at = excluded.health_last_successful_at,
            health_failure_reason = excluded.health_failure_reason,
            health_failure_detail = excluded.health_failure_detail,
            health_failure_retryable = excluded.health_failure_retryable,
            updated_at = excluded.updated_at
        `;

          yield* sql`
          DELETE FROM integration_connection_capabilities
          WHERE environment_id = ${input.environmentId} AND connection_id = ${input.connectionId}
        `;
          yield* Effect.forEach(
            input.capabilities,
            (capability) => sql`
            INSERT INTO integration_connection_capabilities(environment_id, connection_id, capability)
            VALUES (${input.environmentId}, ${input.connectionId}, ${capability})
          `,
            { discard: true },
          );

          yield* sql`
          DELETE FROM integration_health_required_capabilities
          WHERE environment_id = ${input.environmentId} AND connection_id = ${input.connectionId}
        `;
          yield* Effect.forEach(
            failure?.requiredCapabilities ?? [],
            (capability) => sql`
            INSERT INTO integration_health_required_capabilities(
              environment_id,
              connection_id,
              capability
            )
            VALUES (${input.environmentId}, ${input.connectionId}, ${capability})
          `,
            { discard: true },
          );
        }),
      );
      return input;
    },
    Effect.mapError(toPersistenceSqlError("IntegrationStore.upsertConnection")),
  );

  const disconnect: IntegrationStore["Service"]["disconnect"] = ({ environmentId, connectionId }) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          yield* sql`
            DELETE FROM integration_project_mappings
            WHERE environment_id = ${environmentId} AND connection_id = ${connectionId}
          `;
          yield* sql`
            DELETE FROM integration_health_required_capabilities
            WHERE environment_id = ${environmentId} AND connection_id = ${connectionId}
          `;
          yield* sql`
            DELETE FROM integration_connection_capabilities
            WHERE environment_id = ${environmentId} AND connection_id = ${connectionId}
          `;
          const removed = yield* sql<{ readonly connectionId: IntegrationConnectionId }>`
            DELETE FROM integration_connections
            WHERE environment_id = ${environmentId} AND connection_id = ${connectionId}
            RETURNING connection_id AS "connectionId"
          `;
          return removed.length > 0;
        }),
      )
      .pipe(Effect.mapError(toPersistenceSqlError("IntegrationStore.disconnect")));

  const mappingSelect = sql<MappingRow>`
    SELECT
      project_id AS "projectId",
      provider_workspace_id AS "providerWorkspaceId",
      provider_project_id AS "providerProjectId",
      provider_project_name AS "providerProjectName",
      source_url AS "sourceUrl",
      updated_at AS "updatedAt"
    FROM integration_project_mappings
  `;

  const listMappings: IntegrationStore["Service"]["listMappings"] = ({
    environmentId,
    connectionId,
  }) =>
    sql<MappingRow>`
      ${mappingSelect}
      WHERE environment_id = ${environmentId} AND connection_id = ${connectionId}
      ORDER BY project_id ASC
    `.pipe(Effect.mapError(toPersistenceSqlError("IntegrationStore.listMappings")));

  const getMapping: IntegrationStore["Service"]["getMapping"] = ({
    environmentId,
    connectionId,
    projectId,
  }) =>
    sql<MappingRow>`
      ${mappingSelect}
      WHERE environment_id = ${environmentId}
        AND connection_id = ${connectionId}
        AND project_id = ${projectId}
    `.pipe(
      Effect.map(firstOption),
      Effect.mapError(toPersistenceSqlError("IntegrationStore.getMapping")),
    );

  const upsertMapping: IntegrationStore["Service"]["upsertMapping"] = Effect.fn(
    "IntegrationStore.upsertMapping",
  )(
    function* ({ environmentId, connectionId, mapping }) {
      return yield* sql.withTransaction(
        Effect.gen(function* () {
          const connection = yield* sql<{ readonly connectionId: IntegrationConnectionId }>`
          SELECT connection_id AS "connectionId"
          FROM integration_connections
          WHERE environment_id = ${environmentId} AND connection_id = ${connectionId}
        `;
          if (connection.length === 0) return Option.none<IntegrationProjectMapping>();

          yield* sql`
          INSERT INTO integration_project_mappings(
            environment_id,
            connection_id,
            project_id,
            provider_workspace_id,
            provider_project_id,
            provider_project_name,
            source_url,
            updated_at
          )
          VALUES (
            ${environmentId},
            ${connectionId},
            ${mapping.projectId},
            ${mapping.providerWorkspaceId},
            ${mapping.providerProjectId},
            ${mapping.providerProjectName},
            ${mapping.sourceUrl},
            ${mapping.updatedAt}
          )
          ON CONFLICT(environment_id, connection_id, project_id)
          DO UPDATE SET
            provider_workspace_id = excluded.provider_workspace_id,
            provider_project_id = excluded.provider_project_id,
            provider_project_name = excluded.provider_project_name,
            source_url = excluded.source_url,
            updated_at = excluded.updated_at
        `;
          return Option.some(mapping);
        }),
      );
    },
    Effect.mapError(toPersistenceSqlError("IntegrationStore.upsertMapping")),
  );

  const removeMapping: IntegrationStore["Service"]["removeMapping"] = ({
    environmentId,
    connectionId,
    projectId,
  }) =>
    sql<{ readonly projectId: ProjectId }>`
      DELETE FROM integration_project_mappings
      WHERE environment_id = ${environmentId}
        AND connection_id = ${connectionId}
        AND project_id = ${projectId}
      RETURNING project_id AS "projectId"
    `.pipe(
      Effect.map((rows) => rows.length > 0),
      Effect.mapError(toPersistenceSqlError("IntegrationStore.removeMapping")),
    );

  return IntegrationStore.of({
    listConnections,
    getConnection,
    upsertConnection,
    disconnect,
    listMappings,
    getMapping,
    upsertMapping,
    removeMapping,
  });
});

export const layer = Layer.effect(IntegrationStore, make);
