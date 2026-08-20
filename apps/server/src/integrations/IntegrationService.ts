import {
  type IntegrationConnectionId,
  type IntegrationConnectionSnapshot,
  IntegrationOperationError,
  type IntegrationProviderId,
  type IntegrationProviderProjectId,
  type ProjectId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ServerEnvironment } from "../environment/ServerEnvironment.ts";
import { IssuesService } from "../issues/IssuesService.ts";
import {
  type IntegrationAdapter,
  makePulseIssuesIntegrationAdapter,
} from "./IntegrationAdapter.ts";

export interface IntegrationConnectionTarget {
  readonly connectionId: IntegrationConnectionId;
}

export interface IntegrationMappingSetInput extends IntegrationConnectionTarget {
  readonly projectId: ProjectId;
  readonly providerProjectId: IntegrationProviderProjectId;
}

export interface IntegrationMappingRemoveInput extends IntegrationConnectionTarget {
  readonly projectId: ProjectId;
}

export class IntegrationService extends Context.Service<
  IntegrationService,
  {
    readonly listConnections: () => Effect.Effect<
      ReadonlyArray<IntegrationConnectionSnapshot>,
      IntegrationOperationError
    >;
    readonly getConnection: (
      providerId: IntegrationProviderId,
    ) => Effect.Effect<IntegrationConnectionSnapshot, IntegrationOperationError>;
    readonly disconnect: (
      target: IntegrationConnectionTarget,
    ) => Effect.Effect<IntegrationConnectionSnapshot, IntegrationOperationError>;
    readonly setProjectMapping: (
      input: IntegrationMappingSetInput,
    ) => Effect.Effect<IntegrationConnectionSnapshot, IntegrationOperationError>;
    readonly removeProjectMapping: (
      input: IntegrationMappingRemoveInput,
    ) => Effect.Effect<IntegrationConnectionSnapshot, IntegrationOperationError>;
  }
>()("t3/integrations/IntegrationService") {}

const missingProvider = (providerId: IntegrationProviderId) =>
  new IntegrationOperationError({
    operation: "integration.getConnection",
    reason: "unsupported_capability",
    detail: `No integration lifecycle adapter is registered for provider '${providerId}'.`,
    retryable: false,
    providerId,
  });

const missingConnection = (operation: string, connectionId: IntegrationConnectionId) =>
  new IntegrationOperationError({
    operation,
    reason: "not_found",
    detail: `Integration connection '${connectionId}' is not registered on this environment.`,
    retryable: false,
  });

const invalidAdapterSnapshot = (adapter: IntegrationAdapter) =>
  new IntegrationOperationError({
    operation: "integration.adapter.snapshot",
    reason: "invalid_response",
    detail: `Provider '${adapter.providerId}' returned a snapshot with mismatched lifecycle identity.`,
    retryable: false,
    providerId: adapter.providerId,
  });

/** Constructible separately for focused tests and future adapter-registry discovery. */
export function makeIntegrationService(
  adapters: ReadonlyArray<IntegrationAdapter>,
): IntegrationService["Service"] {
  const byProvider = (
    providerId: IntegrationProviderId,
  ): Effect.Effect<IntegrationAdapter, IntegrationOperationError> => {
    const adapter = adapters.find((candidate) => candidate.providerId === providerId);
    return adapter === undefined
      ? Effect.fail(missingProvider(providerId))
      : Effect.succeed(adapter);
  };
  const byConnection = (
    operation: string,
    connectionId: IntegrationConnectionId,
  ): Effect.Effect<IntegrationAdapter, IntegrationOperationError> => {
    const adapter = adapters.find((candidate) => candidate.connectionId === connectionId);
    return adapter === undefined
      ? Effect.fail(missingConnection(operation, connectionId))
      : Effect.succeed(adapter);
  };
  const validate = (adapter: IntegrationAdapter, snapshot: IntegrationConnectionSnapshot) =>
    snapshot.providerId === adapter.providerId && snapshot.connectionId === adapter.connectionId
      ? Effect.succeed(snapshot)
      : Effect.fail(invalidAdapterSnapshot(adapter));
  const run = (
    adapter: IntegrationAdapter,
    operation: Effect.Effect<IntegrationConnectionSnapshot, IntegrationOperationError>,
  ) => operation.pipe(Effect.flatMap((snapshot) => validate(adapter, snapshot)));

  return IntegrationService.of({
    listConnections: () =>
      Effect.forEach(adapters, (adapter) => run(adapter, adapter.getConnection()), {
        concurrency: "unbounded",
      }),
    getConnection: (providerId) =>
      byProvider(providerId).pipe(
        Effect.flatMap((adapter) => run(adapter, adapter.getConnection())),
      ),
    disconnect: ({ connectionId }) =>
      byConnection("integration.disconnect", connectionId).pipe(
        Effect.flatMap((adapter) => run(adapter, adapter.disconnect())),
      ),
    setProjectMapping: ({ connectionId, projectId, providerProjectId }) =>
      byConnection("integration.mapping.set", connectionId).pipe(
        Effect.flatMap((adapter) =>
          run(adapter, adapter.setProjectMapping({ projectId, providerProjectId })),
        ),
      ),
    removeProjectMapping: ({ connectionId, projectId }) =>
      byConnection("integration.mapping.remove", connectionId).pipe(
        Effect.flatMap((adapter) => run(adapter, adapter.removeProjectMapping(projectId))),
      ),
  });
}

export const make = Effect.gen(function* () {
  const environment = yield* ServerEnvironment;
  const issues = yield* IssuesService;
  const environmentId = yield* environment.getEnvironmentId;
  return makeIntegrationService([makePulseIssuesIntegrationAdapter({ environmentId, issues })]);
});

export const layer = Layer.effect(IntegrationService, make);
