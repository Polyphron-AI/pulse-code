import {
  EnvironmentId,
  IntegrationActionActorId,
  IntegrationActionConfirmationToken,
  IntegrationActionPreviewId,
  IntegrationAuditReceiptId,
  IntegrationConnectionId,
  type IntegrationConnectionSnapshot,
  IntegrationProviderId,
  IntegrationProviderProjectId,
  IntegrationProviderWorkspaceId,
  IssueId,
  ProjectId,
  type ExecutionEnvironmentDescriptor,
  type IntegrationIssueContextReadInput,
  type IntegrationIssueStatusPreviewInput,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { AsyncResult, Atom, AtomRegistry } from "effect/unstable/reactivity";

import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
  type PreparedConnection,
  type SupervisorConnectionState,
} from "../connection/model.ts";
import * as EnvironmentRegistry from "../connection/registry.ts";
import * as EnvironmentSupervisor from "../connection/supervisor.ts";
import type { RpcSession } from "../rpc/session.ts";
import {
  aggregateIntegrationConnections,
  createIntegrationEnvironmentAtoms,
  supportsIntegrations,
  type IntegrationEnvironmentOperations,
} from "./integrations.ts";

const environmentOne = EnvironmentId.make("environment-1");
const environmentTwo = EnvironmentId.make("environment-2");
const connectionId = IntegrationConnectionId.make("connection-1");
const providerId = IntegrationProviderId.make("pulse");
const providerProjectId = IntegrationProviderProjectId.make("provider-project-1");
const projectId = ProjectId.make("project-1");
const issueId = IssueId.make("ISSUE-1");
const previewId = IntegrationActionPreviewId.make("preview-1");
const confirmationToken = IntegrationActionConfirmationToken.make("confirmation-1");

const descriptor = (
  environmentId: EnvironmentId,
  integrations: boolean | undefined,
): ExecutionEnvironmentDescriptor => ({
  environmentId,
  label: "Environment " + environmentId,
  platform: { os: "windows", arch: "x64" },
  serverVersion: "0.0.33",
  capabilities: {
    repositoryIdentity: true,
    ...(integrations === undefined ? {} : { integrations }),
  },
});

const snapshot = (environmentId: EnvironmentId): IntegrationConnectionSnapshot => ({
  connectionId,
  environmentId,
  providerId,
  state: "connected",
  accountHint: "engineering@example.test",
  endpointHint: "https://pulse.example.test",
  credentialConfigured: true,
  capabilities: ["work.read", "work.write", "workspace.read"],
  health: {
    state: "connected",
    lastCheckedAt: "2026-08-19T20:00:00.000Z",
    lastSuccessfulAt: "2026-08-19T20:00:00.000Z",
    failure: null,
  },
  mappings: [],
  updatedAt: "2026-08-19T20:00:00.000Z",
});

const operations = (input: {
  readonly onList?: Effect.Effect<void>;
  readonly onDisconnect?: Effect.Effect<void>;
  readonly onSetMapping?: Effect.Effect<void>;
}): IntegrationEnvironmentOperations<never, never> => ({
  listConnections: () => (input.onList ?? Effect.void).pipe(Effect.as([snapshot(environmentOne)])),
  readIssueContext: (contextInput: IntegrationIssueContextReadInput) =>
    Effect.succeed({
      provenance: {
        connectionId: contextInput.connectionId,
        environmentId: environmentOne,
        projectId: contextInput.projectId,
        providerId,
        providerWorkspaceId: IntegrationProviderWorkspaceId.make("workspace-1"),
        providerProjectId,
        resourceKind: "issue",
        resourceId: contextInput.issueId,
        sourceUrl: "https://pulse.example.test/issues/ISSUE-1",
        fetchedAt: "2026-08-19T20:00:00.000Z",
        detailLevel: contextInput.detailLevel,
        stale: false,
      },
      resource: {
        kind: "issue",
        id: contextInput.issueId,
        ref: "ISSUE-1",
        title: "Typed integration context",
        descriptionExcerpt: "Context returned through the owning environment.",
        status: "in_progress",
        severity: "high",
        version: 3,
        updatedAt: "2026-08-19T20:00:00.000Z",
        truncated: false,
        detail: null,
      },
    }),
  disconnect: () =>
    (input.onDisconnect ?? Effect.void).pipe(
      Effect.as({ ...snapshot(environmentOne), state: "disconnected" as const }),
    ),
  setProjectMapping: () =>
    (input.onSetMapping ?? Effect.void).pipe(Effect.as(snapshot(environmentOne))),
  removeProjectMapping: () => Effect.succeed(snapshot(environmentOne)),
  previewIssueStatus: (action: IntegrationIssueStatusPreviewInput) =>
    Effect.succeed({
      preview: {
        previewId,
        connectionId: action.connectionId,
        environmentId: environmentOne,
        projectId: action.projectId,
        providerId,
        capability: "work.write",
        operation: "issue.status.update",
        resourceKind: "issue",
        resourceId: action.issueId,
        summary: "Move issue to " + action.status,
        changes: [{ field: "status", before: "in_progress", after: action.status }],
        expiresAt: "2026-08-19T20:10:00.000Z",
        requiresConfirmation: true,
      },
      confirmationToken,
    }),
  confirmIssueStatus: (action) =>
    Effect.succeed({
      receiptId: IntegrationAuditReceiptId.make("receipt-1"),
      connectionId,
      environmentId: environmentOne,
      projectId,
      providerId,
      actorId: action.actorId,
      capability: "work.write",
      operation: "issue.status.update",
      resourceKind: "issue",
      resourceId: issueId,
      status: "succeeded",
      reason: null,
      occurredAt: "2026-08-19T20:00:00.000Z",
    }),
});

const makeHarness = Effect.gen(function* () {
  const listReceipts = yield* Queue.unbounded<number>();
  const listCount = yield* Ref.make(0);
  const disconnectCount = yield* Ref.make(0);
  const mappingCount = yield* Ref.make(0);
  const state: SupervisorConnectionState = {
    ...AVAILABLE_CONNECTION_STATE,
    desired: true,
    network: "online",
    phase: "connected",
    attempt: 1,
    generation: 1,
  };
  const stateRef = yield* SubscriptionRef.make(state);
  const target = new PrimaryConnectionTarget({
    environmentId: environmentOne,
    label: "Test environment",
    httpBaseUrl: "https://environment.example.test",
    wsBaseUrl: "wss://environment.example.test",
  });
  const supervisor = EnvironmentSupervisor.EnvironmentSupervisor.of({
    target,
    state: stateRef,
    session: yield* SubscriptionRef.make(Option.none<RpcSession>()),
    prepared: yield* SubscriptionRef.make(Option.none<PreparedConnection>()),
    connect: Effect.void,
    disconnect: Effect.void,
    retryNow: Effect.void,
  } satisfies EnvironmentSupervisor.EnvironmentSupervisor["Service"]);
  const run: EnvironmentRegistry.EnvironmentRegistry["Service"]["run"] = (_environmentId, effect) =>
    Effect.provideService(effect, EnvironmentSupervisor.EnvironmentSupervisor, supervisor);
  const followStream: EnvironmentRegistry.EnvironmentRegistry["Service"]["followStream"] = (
    _environmentId,
    stream,
  ) => Stream.provideService(stream, EnvironmentSupervisor.EnvironmentSupervisor, supervisor);
  const environmentRegistry = EnvironmentRegistry.EnvironmentRegistry.of({
    run,
    followStream,
  } as unknown as EnvironmentRegistry.EnvironmentRegistry["Service"]);
  const runtime = Atom.runtime(
    Layer.succeed(EnvironmentRegistry.EnvironmentRegistry, environmentRegistry),
  );
  const atoms = createIntegrationEnvironmentAtoms(
    runtime,
    operations({
      onList: Ref.updateAndGet(listCount, (count) => count + 1).pipe(
        Effect.tap((count) => Queue.offer(listReceipts, count)),
        Effect.asVoid,
      ),
      onDisconnect: Ref.update(disconnectCount, (count) => count + 1),
      onSetMapping: Ref.update(mappingCount, (count) => count + 1),
    }),
  );
  return { atoms, stateRef, listReceipts, disconnectCount, mappingCount };
});

describe("integration client runtime", () => {
  it.effect("does not mount queries or run commands for an older unsupported server", () =>
    Effect.gen(function* () {
      const disconnectCount = yield* Ref.make(0);
      const runtime = Atom.runtime(Layer.empty) as unknown as Atom.AtomRuntime<
        EnvironmentRegistry.EnvironmentRegistry,
        never
      >;
      const atoms = createIntegrationEnvironmentAtoms(
        runtime,
        operations({ onDisconnect: Ref.update(disconnectCount, (count) => count + 1) }),
      );
      const registry = AtomRegistry.make();
      const unsupported = descriptor(environmentOne, false);
      const legacy = descriptor(environmentOne, undefined);

      expect(supportsIntegrations(descriptor(environmentOne, true))).toBe(true);
      expect(supportsIntegrations(unsupported)).toBe(false);
      expect(supportsIntegrations(legacy)).toBe(false);
      expect(atoms.connections({ descriptor: unsupported, input: {} })).toBeNull();
      expect(atoms.connections({ descriptor: legacy, input: {} })).toBeNull();

      const result = yield* Effect.promise(() =>
        atoms.disconnect.run(registry, { descriptor: unsupported, input: { connectionId } }),
      );
      expect(AsyncResult.isFailure(result)).toBe(true);
      expect(yield* Ref.get(disconnectCount)).toBe(0);
      registry.dispose();
    }),
  );

  it("keys supported queries by their owning environment", () => {
    const runtime = Atom.runtime(Layer.empty) as unknown as Atom.AtomRuntime<
      EnvironmentRegistry.EnvironmentRegistry,
      never
    >;
    const atoms = createIntegrationEnvironmentAtoms(runtime, operations({}));
    const first = descriptor(environmentOne, true);
    const second = descriptor(environmentTwo, true);

    expect(atoms.connections({ descriptor: first, input: {} })).toBe(
      atoms.connections({ descriptor: first, input: {} }),
    );
    expect(atoms.connections({ descriptor: first, input: {} })).not.toBe(
      atoms.connections({ descriptor: second, input: {} }),
    );
  });

  it("retains healthy results when another environment is unsupported or offline", () => {
    const offline = new Error("offline");
    const aggregate = aggregateIntegrationConnections([
      { _tag: "success", environmentId: environmentOne, connections: [snapshot(environmentOne)] },
      { _tag: "unsupported", environmentId: environmentTwo },
      {
        _tag: "failure",
        environmentId: EnvironmentId.make("environment-3"),
        error: offline,
      },
    ]);

    expect(aggregate.connections).toEqual([snapshot(environmentOne)]);
    expect(aggregate.unavailable).toEqual([
      { environmentId: environmentTwo, reason: "unsupported" },
      { environmentId: EnvironmentId.make("environment-3"), reason: "failure", error: offline },
    ]);
  });

  it.effect("revalidates owned connection state after mutations and reconnect", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness;
        const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), (registry) =>
          Effect.sync(() => registry.dispose()),
        );
        const environment = descriptor(environmentOne, true);
        const connections = harness.atoms.connections({ descriptor: environment, input: {} })!;
        const unmount = registry.mount(connections);

        expect(
          yield* AtomRegistry.getResult(registry, connections, { suspendOnWaiting: true }),
        ).toEqual([snapshot(environmentOne)]);
        expect(yield* Queue.take(harness.listReceipts)).toBe(1);

        const disconnected = yield* Effect.promise(() =>
          harness.atoms.disconnect.run(registry, {
            descriptor: environment,
            input: { connectionId },
          }),
        );
        expect(AsyncResult.isSuccess(disconnected)).toBe(true);
        expect(yield* Queue.take(harness.listReceipts)).toBe(2);

        const mapped = yield* Effect.promise(() =>
          harness.atoms.setProjectMapping.run(registry, {
            descriptor: environment,
            input: { connectionId, projectId, providerProjectId },
          }),
        );
        expect(AsyncResult.isSuccess(mapped)).toBe(true);
        expect(yield* Queue.take(harness.listReceipts)).toBe(3);

        yield* SubscriptionRef.update(harness.stateRef, (current) => ({
          ...current,
          generation: current.generation + 1,
        }));
        expect(yield* Queue.take(harness.listReceipts)).toBe(4);
        expect(yield* Ref.get(harness.disconnectCount)).toBe(1);
        expect(yield* Ref.get(harness.mappingCount)).toBe(1);
        unmount();
      }),
    ),
  );

  it.effect("carries issue provenance through guarded previews and typed audit receipts", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const harness = yield* makeHarness;
        const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), (registry) =>
          Effect.sync(() => registry.dispose()),
        );
        const environment = descriptor(environmentOne, true);
        const contextInput = { connectionId, projectId, issueId, detailLevel: "detail" } as const;
        const contextAtom = harness.atoms.issueContext({
          descriptor: environment,
          input: contextInput,
        })!;
        const unmount = registry.mount(contextAtom);
        const context = yield* AtomRegistry.getResult(registry, contextAtom, {
          suspendOnWaiting: true,
        });

        expect(context.provenance).toMatchObject({
          environmentId: environmentOne,
          connectionId,
          resourceId: issueId,
          stale: false,
        });
        expect(context.resource).toMatchObject({ id: issueId, version: 3 });

        const preview = yield* Effect.promise(() =>
          harness.atoms.previewIssueStatus.run(registry, {
            descriptor: environment,
            input: { connectionId, projectId, issueId, expectedVersion: 3, status: "resolved" },
          }),
        );
        expect(AsyncResult.isSuccess(preview)).toBe(true);
        if (AsyncResult.isSuccess(preview)) {
          expect(preview.value.preview.requiresConfirmation).toBe(true);
          expect(preview.value.confirmationToken).toBe(confirmationToken);
        }

        const receipt = yield* Effect.promise(() =>
          harness.atoms.confirmIssueStatus.run(registry, {
            descriptor: environment,
            input: {
              previewId,
              confirmationToken,
              actorId: IntegrationActionActorId.make("user-1"),
            },
          }),
        );
        expect(AsyncResult.isSuccess(receipt)).toBe(true);
        if (AsyncResult.isSuccess(receipt)) {
          expect(receipt.value.status).toBe("succeeded");
          expect(receipt.value.environmentId).toBe(environmentOne);
        }
        unmount();
      }),
    ),
  );
});
