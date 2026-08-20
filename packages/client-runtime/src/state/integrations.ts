import {
  type EnvironmentId,
  type ExecutionEnvironmentDescriptor,
  IssueId,
  type IntegrationAuditReceipt,
  type IntegrationConnectionId,
  type IntegrationConnectionSnapshot,
  type IntegrationIssueContext,
  type IntegrationIssueContextReadInput,
  type IntegrationIssueStatusActionPreview,
  type IntegrationIssueStatusConfirmInput,
  type IntegrationIssueStatusPreviewInput,
  IntegrationOperationError,
  type IntegrationProviderProjectId,
  type ProjectId,
  WS_METHODS,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import type { EnvironmentSupervisor } from "../connection/supervisor.ts";
import { request } from "../rpc/client.ts";
import {
  type AtomCommand,
  createAtomCommandScheduler,
  createEnvironmentCommand,
  createEnvironmentQueryAtomFamily,
} from "./runtime.ts";

export interface IntegrationEnvironmentTarget<Input> {
  readonly descriptor: ExecutionEnvironmentDescriptor;
  readonly input: Input;
}

interface EnvironmentCommandTarget<Input> {
  readonly environmentId: EnvironmentId;
  readonly input: Input;
}

export interface IntegrationDisconnectInput {
  readonly connectionId: IntegrationConnectionId;
}

export interface IntegrationProjectMappingSetInput extends IntegrationDisconnectInput {
  readonly projectId: ProjectId;
  readonly providerProjectId: IntegrationProviderProjectId;
}

export interface IntegrationProjectMappingRemoveInput extends IntegrationDisconnectInput {
  readonly projectId: ProjectId;
}

/** Injectable for focused tests; production uses {@link integrationRpcOperations}. */
export interface IntegrationEnvironmentOperations<R, E> {
  readonly listConnections: () => Effect.Effect<
    ReadonlyArray<IntegrationConnectionSnapshot>,
    E,
    EnvironmentSupervisor | R
  >;
  readonly readIssueContext: (
    input: IntegrationIssueContextReadInput,
  ) => Effect.Effect<IntegrationIssueContext, E, EnvironmentSupervisor | R>;
  readonly disconnect: (
    input: IntegrationDisconnectInput,
  ) => Effect.Effect<IntegrationConnectionSnapshot, E, EnvironmentSupervisor | R>;
  readonly setProjectMapping: (
    input: IntegrationProjectMappingSetInput,
  ) => Effect.Effect<IntegrationConnectionSnapshot, E, EnvironmentSupervisor | R>;
  readonly removeProjectMapping: (
    input: IntegrationProjectMappingRemoveInput,
  ) => Effect.Effect<IntegrationConnectionSnapshot, E, EnvironmentSupervisor | R>;
  readonly previewIssueStatus: (
    input: IntegrationIssueStatusPreviewInput,
  ) => Effect.Effect<IntegrationIssueStatusActionPreview, E, EnvironmentSupervisor | R>;
  readonly confirmIssueStatus: (
    input: IntegrationIssueStatusConfirmInput,
  ) => Effect.Effect<IntegrationAuditReceipt, E, EnvironmentSupervisor | R>;
}

/** The only production transport: the authenticated session for the target environment. */
export const integrationRpcOperations = {
  listConnections: () => request(WS_METHODS.integrationsListConnections, {}),
  readIssueContext: (input: IntegrationIssueContextReadInput) =>
    request(WS_METHODS.integrationsIssueContext, input),
  disconnect: (input: IntegrationDisconnectInput) =>
    request(WS_METHODS.integrationsDisconnect, input),
  setProjectMapping: (input: IntegrationProjectMappingSetInput) =>
    request(WS_METHODS.integrationsSetProjectMapping, input),
  removeProjectMapping: (input: IntegrationProjectMappingRemoveInput) =>
    request(WS_METHODS.integrationsRemoveProjectMapping, input),
  previewIssueStatus: (input: IntegrationIssueStatusPreviewInput) =>
    request(WS_METHODS.integrationsIssuePreviewStatus, input),
  confirmIssueStatus: (input: IntegrationIssueStatusConfirmInput) =>
    request(WS_METHODS.integrationsIssueConfirmStatus, input),
};

export const supportsIntegrations = (descriptor: ExecutionEnvironmentDescriptor): boolean =>
  descriptor.capabilities.integrations === true;

export type IntegrationEnvironmentLoadResult<E> =
  | {
      readonly _tag: "success";
      readonly environmentId: EnvironmentId;
      readonly connections: ReadonlyArray<IntegrationConnectionSnapshot>;
    }
  | {
      readonly _tag: "unsupported";
      readonly environmentId: EnvironmentId;
    }
  | {
      readonly _tag: "failure";
      readonly environmentId: EnvironmentId;
      readonly error: E;
    };

export interface IntegrationConnectionAggregate<E> {
  readonly connections: ReadonlyArray<IntegrationConnectionSnapshot>;
  readonly unavailable: ReadonlyArray<
    | { readonly environmentId: EnvironmentId; readonly reason: "unsupported" }
    | { readonly environmentId: EnvironmentId; readonly reason: "failure"; readonly error: E }
  >;
}

/** Keeps successful environments visible when another environment is unavailable. */
export function aggregateIntegrationConnections<E>(
  results: ReadonlyArray<IntegrationEnvironmentLoadResult<E>>,
): IntegrationConnectionAggregate<E> {
  const connections: Array<IntegrationConnectionSnapshot> = [];
  const unavailable: Array<IntegrationConnectionAggregate<E>["unavailable"][number]> = [];
  for (const result of results) {
    if (result._tag === "success") {
      connections.push(...result.connections);
    } else if (result._tag === "unsupported") {
      unavailable.push({ environmentId: result.environmentId, reason: "unsupported" });
    } else {
      unavailable.push({
        environmentId: result.environmentId,
        reason: "failure",
        error: result.error,
      });
    }
  }
  return { connections, unavailable };
}

const unsupportedOperationError = (operation: string) =>
  new IntegrationOperationError({
    operation,
    reason: "unsupported_capability",
    detail: "This environment does not advertise integration lifecycle support.",
    retryable: false,
  });

function capabilityGatedCommand<Input, A, E>(
  command: AtomCommand<EnvironmentCommandTarget<Input>, A, E>,
  operation: string,
): AtomCommand<IntegrationEnvironmentTarget<Input>, A, E | IntegrationOperationError> {
  return {
    label: command.label,
    run: (registry, target) =>
      supportsIntegrations(target.descriptor)
        ? command.run(registry, {
            environmentId: target.descriptor.environmentId,
            input: target.input,
          })
        : Promise.resolve(AsyncResult.failure(Cause.fail(unsupportedOperationError(operation)))),
  };
}

export type IntegrationConnectionListInput = Record<string, never>;

export function createIntegrationEnvironmentAtoms<R, ER, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, ER>,
  operations: IntegrationEnvironmentOperations<R, E>,
) {
  const scheduler = createAtomCommandScheduler();
  const serialPerEnvironment = {
    mode: "serial",
    key: ({ environmentId }: EnvironmentCommandTarget<unknown>) => environmentId,
  } as const;

  const connectionsQuery = createEnvironmentQueryAtomFamily(runtime, {
    label: "environment-data:integrations:connections",
    staleTimeMs: 15_000,
    execute: (_input: IntegrationConnectionListInput) => operations.listConnections(),
  });
  const contextQuery = createEnvironmentQueryAtomFamily(runtime, {
    label: "environment-data:integrations:issue-context",
    staleTimeMs: 15_000,
    execute: operations.readIssueContext,
  });

  const connections = (target: IntegrationEnvironmentTarget<IntegrationConnectionListInput>) =>
    supportsIntegrations(target.descriptor)
      ? connectionsQuery({ environmentId: target.descriptor.environmentId, input: target.input })
      : null;
  const issueContext = (target: IntegrationEnvironmentTarget<IntegrationIssueContextReadInput>) =>
    supportsIntegrations(target.descriptor)
      ? contextQuery({ environmentId: target.descriptor.environmentId, input: target.input })
      : null;

  const refreshConnections = (registry: AtomRegistry.AtomRegistry, environmentId: EnvironmentId) =>
    Effect.sync(() => registry.refresh(connectionsQuery({ environmentId, input: {} })));
  const refreshIssueContext = (
    registry: AtomRegistry.AtomRegistry,
    environmentId: EnvironmentId,
    input: IntegrationIssueContextReadInput,
  ) => Effect.sync(() => registry.refresh(contextQuery({ environmentId, input })));

  const mutation = <Input, A>(
    label: string,
    operation: string,
    execute: (
      input: Input,
      registry: AtomRegistry.AtomRegistry,
      environmentId: EnvironmentId,
    ) => Effect.Effect<A, E, EnvironmentSupervisor | R>,
  ) =>
    capabilityGatedCommand(
      createEnvironmentCommand(runtime, {
        label,
        scheduler,
        concurrency: serialPerEnvironment,
        execute,
      }),
      operation,
    );

  const disconnect = mutation(
    "environment-data:integrations:disconnect",
    "disconnect",
    (input: IntegrationDisconnectInput, registry, environmentId) =>
      operations
        .disconnect(input)
        .pipe(Effect.ensuring(refreshConnections(registry, environmentId))),
  );
  const setProjectMapping = mutation(
    "environment-data:integrations:set-project-mapping",
    "set-project-mapping",
    (input: IntegrationProjectMappingSetInput, registry, environmentId) =>
      operations
        .setProjectMapping(input)
        .pipe(Effect.ensuring(refreshConnections(registry, environmentId))),
  );
  const removeProjectMapping = mutation(
    "environment-data:integrations:remove-project-mapping",
    "remove-project-mapping",
    (input: IntegrationProjectMappingRemoveInput, registry, environmentId) =>
      operations
        .removeProjectMapping(input)
        .pipe(Effect.ensuring(refreshConnections(registry, environmentId))),
  );
  const previewIssueStatus = mutation(
    "environment-data:integrations:issue-status-preview",
    "issue-status-preview",
    (input: IntegrationIssueStatusPreviewInput) => operations.previewIssueStatus(input),
  );
  const confirmIssueStatus = mutation(
    "environment-data:integrations:issue-status-confirm",
    "issue-status-confirm",
    (input: IntegrationIssueStatusConfirmInput, registry, environmentId) =>
      operations.confirmIssueStatus(input).pipe(
        Effect.tap((receipt) => {
          if (
            receipt.projectId === null ||
            receipt.resourceKind !== "issue" ||
            receipt.resourceId === null
          ) {
            return Effect.void;
          }
          const base = {
            connectionId: receipt.connectionId,
            projectId: receipt.projectId,
            issueId: IssueId.make(receipt.resourceId),
          };
          return Effect.all(
            [
              refreshIssueContext(registry, environmentId, { ...base, detailLevel: "summary" }),
              refreshIssueContext(registry, environmentId, { ...base, detailLevel: "detail" }),
              refreshConnections(registry, environmentId),
            ],
            { discard: true },
          );
        }),
      ),
  );

  return {
    connections,
    issueContext,
    disconnect,
    setProjectMapping,
    removeProjectMapping,
    previewIssueStatus,
    confirmIssueStatus,
    refresh: {
      connections: refreshConnections,
      issueContext: (
        registry: AtomRegistry.AtomRegistry,
        target: IntegrationEnvironmentTarget<IntegrationIssueContextReadInput>,
      ) => {
        if (!supportsIntegrations(target.descriptor)) return;
        registry.refresh(
          contextQuery({ environmentId: target.descriptor.environmentId, input: target.input }),
        );
      },
    },
  };
}

/** Production convenience: bind the capability-gated atoms to typed environment RPCs. */
export function createIntegrationRpcEnvironmentAtoms<R, ER>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, ER>,
) {
  return createIntegrationEnvironmentAtoms(runtime, integrationRpcOperations);
}
