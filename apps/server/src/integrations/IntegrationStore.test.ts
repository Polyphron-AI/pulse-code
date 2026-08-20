import {
  EnvironmentId,
  IntegrationConnectionId,
  IntegrationProviderId,
  IntegrationProviderProjectId,
  IntegrationProviderWorkspaceId,
  ProjectId,
} from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { migrationManifest, runMigrations } from "../persistence/Migrations.ts";
import * as NodeSqliteClient from "../persistence/NodeSqliteClient.ts";
import {
  IntegrationStore,
  type StoredIntegrationConnection,
  layer as integrationStoreLayer,
} from "./IntegrationStore.ts";

const environmentOne = EnvironmentId.make("environment-1");
const environmentTwo = EnvironmentId.make("environment-2");
const connectionId = IntegrationConnectionId.make("connection-1");
const providerId = IntegrationProviderId.make("pulse");
const projectId = ProjectId.make("project-1");

const connection = (
  environmentId: EnvironmentId,
  endpointHint: string,
): StoredIntegrationConnection => ({
  environmentId,
  connectionId,
  providerId,
  accountHint: "engineering@example.test",
  endpointHint,
  secretRef: `integration/${environmentId}/pulse`,
  state: "degraded",
  capabilities: ["work.read", "work.write", "workspace.read"],
  health: {
    state: "degraded",
    lastCheckedAt: "2026-08-19T19:00:00.000Z",
    lastSuccessfulAt: "2026-08-19T18:00:00.000Z",
    failure: {
      reason: "permission",
      detail: "Write permission is missing.",
      retryable: false,
      requiredCapabilities: ["work.write"],
    },
  },
  updatedAt: "2026-08-19T19:00:00.000Z",
});

const mapping = (providerProjectName: string) => ({
  projectId,
  providerWorkspaceId: IntegrationProviderWorkspaceId.make("workspace-1"),
  providerProjectId: IntegrationProviderProjectId.make("provider-project-1"),
  providerProjectName,
  sourceUrl: `https://pulse.example.test/projects/${providerProjectName.toLowerCase()}`,
  updatedAt: "2026-08-19T19:00:00.000Z",
});

const migrationLayer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

migrationLayer("042_Integrations migration", (it) => {
  it.effect("upgrades the prior schema without changing existing Issue history", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 41 });
      yield* sql`
        INSERT INTO pulse_issue_thread_links(
          project_id,
          pulse_project_id,
          issue_id,
          thread_id,
          created_at,
          updated_at
        )
        VALUES (
          'legacy-project',
          'legacy-pulse-project',
          'legacy-issue',
          'legacy-thread',
          '2026-08-19T18:00:00.000Z',
          '2026-08-19T18:00:00.000Z'
        )
      `;

      yield* runMigrations({ toMigrationInclusive: 42 });

      const tables = yield* sql<{ readonly name: string }>`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name LIKE 'integration_%'
        ORDER BY name ASC
      `;
      const columns = yield* sql<{ readonly name: string }>`
        PRAGMA table_info(integration_connections)
      `;
      const issueLinks = yield* sql<{ readonly threadId: string }>`
        SELECT thread_id AS "threadId"
        FROM pulse_issue_thread_links
        WHERE issue_id = 'legacy-issue'
      `;

      assert.deepEqual(
        tables.map((table) => table.name),
        [
          "integration_connection_capabilities",
          "integration_connections",
          "integration_health_required_capabilities",
          "integration_project_mappings",
        ],
      );
      assert.equal(
        columns.some((column) => column.name === "secret_ref"),
        true,
      );
      assert.equal(
        columns.some((column) => /token|password|credential/.test(column.name)),
        false,
      );
      assert.deepEqual(issueLinks, [{ threadId: "legacy-thread" }]);
      assert.deepEqual(migrationManifest.at(-1), [42, "Integrations"]);
    }),
  );
});

const storeLayer = it.layer(
  Layer.mergeAll(
    integrationStoreLayer.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    SqlitePersistenceMemory,
  ),
);

storeLayer("IntegrationStore", (it) => {
  it.effect("round-trips non-secret lifecycle, health, capability, and mapping metadata", () =>
    Effect.gen(function* () {
      const store = yield* IntegrationStore;
      const input = connection(environmentOne, "https://pulse-one.example.test");
      const projectMapping = mapping("Storefront");

      yield* store.upsertConnection(input);
      const storedMapping = yield* store.upsertMapping({
        environmentId: environmentOne,
        connectionId,
        mapping: projectMapping,
      });

      assert.deepEqual(Option.getOrNull(yield* store.getConnection(input)), input);
      assert.deepEqual(yield* store.listConnections(environmentOne), [input]);
      assert.deepEqual(Option.getOrNull(storedMapping), projectMapping);
      assert.deepEqual(
        Option.getOrNull(
          yield* store.getMapping({ environmentId: environmentOne, connectionId, projectId }),
        ),
        projectMapping,
      );
      assert.deepEqual(yield* store.listMappings({ environmentId: environmentOne, connectionId }), [
        projectMapping,
      ]);
    }),
  );

  it.effect("isolates colliding connection and project IDs by owning environment", () =>
    Effect.gen(function* () {
      const store = yield* IntegrationStore;
      const first = connection(environmentOne, "https://pulse-one.example.test");
      const second = connection(environmentTwo, "https://pulse-two.example.test");

      yield* store.upsertConnection(first);
      yield* store.upsertConnection(second);
      yield* store.upsertMapping({
        environmentId: environmentOne,
        connectionId,
        mapping: mapping("First"),
      });
      yield* store.upsertMapping({
        environmentId: environmentTwo,
        connectionId,
        mapping: mapping("Second"),
      });

      assert.equal(
        Option.getOrNull(
          yield* store.getConnection({ environmentId: environmentOne, connectionId }),
        )?.endpointHint,
        "https://pulse-one.example.test",
      );
      assert.equal(
        Option.getOrNull(
          yield* store.getConnection({ environmentId: environmentTwo, connectionId }),
        )?.endpointHint,
        "https://pulse-two.example.test",
      );
      assert.equal(
        Option.getOrNull(
          yield* store.getMapping({ environmentId: environmentOne, connectionId, projectId }),
        )?.providerProjectName,
        "First",
      );
      assert.equal(
        Option.getOrNull(
          yield* store.getMapping({ environmentId: environmentTwo, connectionId, projectId }),
        )?.providerProjectName,
        "Second",
      );
      assert.equal(
        Option.isNone(
          yield* store.upsertMapping({
            environmentId: EnvironmentId.make("environment-without-connection"),
            connectionId,
            mapping: mapping("Rejected"),
          }),
        ),
        true,
      );
    }),
  );

  it.effect("disconnect removes one environment's active records and preserves history", () =>
    Effect.gen(function* () {
      const store = yield* IntegrationStore;
      const sql = yield* SqlClient.SqlClient;

      yield* store.upsertConnection(connection(environmentOne, "https://one.example.test"));
      yield* store.upsertConnection(connection(environmentTwo, "https://two.example.test"));
      yield* store.upsertMapping({
        environmentId: environmentOne,
        connectionId,
        mapping: mapping("First"),
      });
      yield* store.upsertMapping({
        environmentId: environmentTwo,
        connectionId,
        mapping: mapping("Second"),
      });
      yield* sql`
        INSERT OR REPLACE INTO pulse_issue_thread_links(
          project_id,
          pulse_project_id,
          issue_id,
          thread_id,
          created_at,
          updated_at
        )
        VALUES (
          'project-history',
          'pulse-project-history',
          'issue-history',
          'thread-history',
          '2026-08-19T18:00:00.000Z',
          '2026-08-19T18:00:00.000Z'
        )
      `;

      assert.equal(yield* store.disconnect({ environmentId: environmentOne, connectionId }), true);
      assert.equal(
        Option.isNone(yield* store.getConnection({ environmentId: environmentOne, connectionId })),
        true,
      );
      assert.deepEqual(
        yield* store.listMappings({ environmentId: environmentOne, connectionId }),
        [],
      );
      assert.equal(
        Option.isSome(yield* store.getConnection({ environmentId: environmentTwo, connectionId })),
        true,
      );
      assert.equal(
        (yield* store.listMappings({ environmentId: environmentTwo, connectionId })).length,
        1,
      );
      const history = yield* sql<{ readonly issueId: string }>`
        SELECT issue_id AS "issueId"
        FROM pulse_issue_thread_links
        WHERE thread_id = 'thread-history'
      `;
      assert.deepEqual(history, [{ issueId: "issue-history" }]);
    }),
  );
});
