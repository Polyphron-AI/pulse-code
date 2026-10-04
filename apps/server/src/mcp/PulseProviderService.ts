import {
  PulseMcpError,
  ProviderSessionId,
  type ModelSelection,
  type ProjectId,
  type ProviderInstanceId,
  type PulseMcpPrepareTurnInput,
  type PulseMcpPrepareTurnResult,
  type PulseMcpPreparationId,
  type RuntimeMode,
  type ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeUtil from "node:util";
import * as ProviderAdapterRegistry from "../orchestration-v2/ProviderAdapterRegistry.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ProviderSessionManager from "../orchestration-v2/ProviderSessionManager.ts";
import * as ProjectService from "../project/ProjectService.ts";
import type { ProviderNativeMcpStatus } from "../provider/PulseProviderTypes.ts";
import * as McpProviderSession from "./McpProviderSession.ts";
import * as PulseMcpConfig from "./PulseMcpConfigService.ts";
import * as Preparation from "./PulseMcpPreparation.ts";

export interface ConsumeInput {
  readonly threadId: ThreadId;
  readonly providerInstanceId: ProviderInstanceId;
  readonly commandId: string;
  readonly preparationId?: PulseMcpPreparationId;
  readonly projectId?: ProjectId;
  readonly runtimeMode: RuntimeMode;
  readonly modelSelection: ModelSelection | undefined;
  readonly desiredCwd?: string;
  readonly selectedConnectionIds?: ReadonlyArray<string>;
  readonly runtimeStartup?: boolean;
}

export interface PulseProviderServiceShape {
  readonly preparePulseMcp: (
    input: PulseMcpPrepareTurnInput,
  ) => Effect.Effect<PulseMcpPrepareTurnResult, PulseMcpError>;
  readonly consumePulseMcpPreparation: (input: ConsumeInput) => Effect.Effect<void, PulseMcpError>;
  readonly readNativeMcpInventory: (input: {
    readonly threadId: ThreadId;
    readonly providerInstanceId: ProviderInstanceId;
  }) => Effect.Effect<ReadonlyArray<ProviderNativeMcpStatus> | null, PulseMcpError>;
}

export class PulseProviderService extends Context.Service<
  PulseProviderService,
  PulseProviderServiceShape
>()("t3/mcp/PulseProviderService") {}

const failure = (message: string) => new PulseMcpError({ message });

export const make = Effect.gen(function* () {
  const config = yield* PulseMcpConfig.PulseMcpConfigService;
  const adapters = yield* ProviderAdapterRegistry.ProviderAdapterRegistryV2;
  const projection = yield* Effect.serviceOption(ProjectionStore.ProjectionStoreV2);
  const projects = yield* Effect.serviceOption(ProjectService.ProjectService);
  const sessions = yield* Effect.serviceOption(ProviderSessionManager.ProviderSessionManagerV2);
  const preparations = Preparation.make();

  const threadContext = Effect.fn("PulseProviderService.threadContext")(function* (
    threadId: ThreadId,
  ) {
    if (Option.isNone(projection)) return undefined;
    return yield* projection.value
      .getThread(threadId)
      .pipe(Effect.option, Effect.map(Option.getOrUndefined));
  });
  const cwdFor = Effect.fn("PulseProviderService.cwdFor")(function* (input: {
    readonly projectId?: ProjectId;
    readonly cwd?: string;
  }) {
    if (input.cwd !== undefined) return input.cwd;
    if (input.projectId !== undefined && Option.isSome(projects)) {
      const project = yield* projects.value.getById(input.projectId).pipe(Effect.orDie);
      if (Option.isSome(project)) return project.value.workspaceRoot;
    }
    return process.cwd();
  });

  const preparePulseMcp = Effect.fn("PulseProviderService.preparePulseMcp")(function* (
    input: PulseMcpPrepareTurnInput,
    runtimeStartup = false,
  ) {
    return yield* preparations.withThreadLock(
      input.threadId,
      Effect.gen(function* () {
        const thread = yield* threadContext(input.threadId);
        const instanceId =
          input.providerSession.providerInstanceId ??
          input.providerSession.modelSelection?.instanceId ??
          thread?.providerInstanceId;
        if (instanceId === undefined)
          return yield* failure("Select a provider before preparing MCP connections.");
        const resolution = yield* config
          .resolveTurnConnections({
            providerInstanceId: instanceId,
            threadId: input.threadId,
            ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
            ...(input.connectionIds === undefined ? {} : { connectionIds: input.connectionIds }),
            ...(input.excludedConnectionIds === undefined
              ? {}
              : { excludedConnectionIds: input.excludedConnectionIds }),
          })
          .pipe(Effect.mapError(() => failure("Managed MCP credentials could not be resolved.")));
        const servers = resolution.connections.map((connection) => ({
          id: connection.id,
          name: connection.name,
          ...connection.config,
        }));
        const selectedConnectionIds = [
          ...servers.map((server) => server.id),
          ...resolution.failures.map((entry) => entry.connectionId),
        ];
        if (resolution.failures.length > 0)
          return {
            status: "failed" as const,
            selectedConnectionIds,
            connections: [
              ...servers.map((server) => ({
                connectionId: server.id,
                name: server.name,
                status: "unknown" as const,
              })),
              ...resolution.failures.map((entry) => ({ ...entry, status: "failed" as const })),
            ],
          };
        if (
          !runtimeStartup &&
          Option.isSome(projection) &&
          (servers.length > 0 ||
            McpProviderSession.readManagedMcpServers(input.threadId).length > 0)
        ) {
          const state = yield* projection.value
            .getThreadRecords(input.threadId, ["runs"])
            .pipe(Effect.option);
          if (
            Option.isSome(state) &&
            state.value.runs.some((run) =>
              ["preparing", "starting", "running", "waiting"].includes(run.status),
            )
          )
            return { status: "active-turn" as const };
        }
        const adapter = yield* adapters
          .get(instanceId)
          .pipe(Effect.mapError(() => failure("The selected provider is unavailable.")));
        if (servers.length > 0 && !["codex", "claudeAgent", "opencode"].includes(adapter.driver))
          return { status: "unsupported-provider" as const, selectedConnectionIds };
        const cwd = yield* cwdFor({
          ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
          ...(input.providerSession.cwd === undefined ? {} : { cwd: input.providerSession.cwd }),
        });
        const modelSelection = input.providerSession.modelSelection ?? thread?.modelSelection;
        const runtimeMode = input.providerSession.runtimeMode;
        const fingerprint = Preparation.fingerprint({
          providerInstanceId: instanceId,
          cwd,
          runtimeMode,
          modelSelection,
          servers,
        });
        const previous = McpProviderSession.readManagedMcpServers(input.threadId);
        McpProviderSession.setManagedMcpServers(input.threadId, servers);
        const conflicting =
          adapter.driver === "codex"
            ? Preparation.findConflictingStdioConnections(servers)
            : new Set<string>();
        const statuses =
          conflicting.size > 0
            ? servers.map((server) => ({
                id: server.id,
                status: "failed" as const,
                message:
                  "Selected stdio connections assign different values to the same environment variable.",
              }))
            : servers.length === 0
              ? []
              : yield* Effect.scoped(
                  Effect.gen(function* () {
                    if (modelSelection === undefined)
                      return yield* failure("Select a model before preparing MCP connections.");
                    const runtimePolicy = { runtimeMode, interactionMode: "default" as const, cwd };
                    const runtime = yield* adapter
                      .openSession({
                        threadId: input.threadId,
                        providerSessionId: ProviderSessionId.make(
                          `pulse-preflight-${input.threadId}`,
                        ),
                        modelSelection,
                        runtimePolicy,
                      })
                      .pipe(
                        Effect.mapError(() =>
                          failure("The provider could not prepare managed MCP connections."),
                        ),
                      );
                    if (runtime.prepareManagedMcp === undefined)
                      return servers.map((server) => ({
                        id: server.id,
                        status: "failed" as const,
                        message: "The provider does not support managed MCP readiness checks.",
                      }));
                    const providerThread = yield* runtime
                      .ensureThread({ threadId: input.threadId, modelSelection, runtimePolicy })
                      .pipe(
                        Effect.mapError(() =>
                          failure("The provider could not prepare its conversation."),
                        ),
                      );
                    return yield* runtime
                      .prepareManagedMcp({
                        threadId: input.threadId,
                        providerThread,
                        servers,
                        modelSelection,
                        runtimePolicy,
                      })
                      .pipe(
                        Effect.mapError(() =>
                          failure("The provider could not confirm MCP readiness."),
                        ),
                      );
                  }),
                ).pipe(
                  Effect.onError(() =>
                    Effect.sync(() =>
                      McpProviderSession.setManagedMcpServers(input.threadId, previous),
                    ),
                  ),
                );
        const connections = Preparation.publicStatuses(servers, statuses);
        if (connections.some((connection) => connection.status !== "ready")) {
          McpProviderSession.setManagedMcpServers(input.threadId, previous);
          return { status: "failed" as const, selectedConnectionIds, connections };
        }
        const preparationId = preparations.issueId(input.threadId);
        preparations.records.set(input.threadId, {
          id: preparationId,
          providerInstanceId: instanceId,
          fingerprint,
          cwd,
          selectedConnectionIds,
          runtimeMode,
          modelSelection,
          projectId: input.projectId,
          expiresAt: (yield* Clock.currentTimeMillis) + 5 * 60_000,
        });
        preparations.appliedFingerprints.set(input.threadId, fingerprint);
        return { status: "ready" as const, preparationId, selectedConnectionIds, connections };
      }),
    );
  });

  const consumePulseMcpPreparation = Effect.fn("PulseProviderService.consumePulseMcpPreparation")(
    function* (input: ConsumeInput) {
      if (input.preparationId === undefined) {
        const resolution = yield* config
          .resolveTurnConnections({
            providerInstanceId: input.providerInstanceId,
            threadId: input.threadId,
            ...(input.selectedConnectionIds === undefined
              ? {}
              : { connectionIds: input.selectedConnectionIds }),
            ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
          })
          .pipe(Effect.mapError(() => failure("Managed MCP credentials could not be resolved.")));
        if (resolution.failures.length > 0)
          return yield* failure("A managed MCP credential is unavailable.");
        const selected = resolution.connections.map((connection) => ({
          id: connection.id,
          name: connection.name,
          ...connection.config,
        }));
        if (
          selected.length === 0 &&
          McpProviderSession.readManagedMcpServers(input.threadId).length === 0
        )
          return;
        const prepared = yield* preparePulseMcp(
          {
            threadId: input.threadId,
            ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
            ...(input.selectedConnectionIds === undefined
              ? {}
              : { connectionIds: input.selectedConnectionIds }),
            providerSession: {
              threadId: input.threadId,
              providerInstanceId: input.providerInstanceId,
              modelSelection: input.modelSelection,
              runtimeMode: input.runtimeMode,
              ...(input.desiredCwd === undefined ? {} : { cwd: input.desiredCwd }),
            },
          },
          input.runtimeStartup,
        );
        if (prepared.status !== "ready")
          return yield* failure(
            "Managed MCP connections are not ready. Retry or manage the connections.",
          );
        input = { ...input, preparationId: prepared.preparationId };
      }
      yield* preparations.withThreadLock(
        input.threadId,
        Effect.gen(function* () {
          const record = preparations.records.get(input.threadId);
          const now = yield* Clock.currentTimeMillis;
          if (
            !record ||
            record.id !== input.preparationId ||
            record.expiresAt <= now ||
            record.providerInstanceId !== input.providerInstanceId ||
            record.runtimeMode !== input.runtimeMode ||
            !NodeUtil.isDeepStrictEqual(record.modelSelection, input.modelSelection) ||
            (record.consumedBy !== undefined && record.consumedBy !== input.commandId)
          )
            return yield* failure("Managed MCP preparation changed or expired. Retry the send.");
          const resolution = yield* config
            .resolveTurnConnections({
              providerInstanceId: input.providerInstanceId,
              threadId: input.threadId,
              connectionIds: record.selectedConnectionIds,
              ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
            })
            .pipe(Effect.mapError(() => failure("Managed MCP credentials could not be resolved.")));
          if (resolution.failures.length > 0)
            return yield* failure("A managed MCP credential is unavailable.");
          const servers = resolution.connections.map((connection) => ({
            id: connection.id,
            name: connection.name,
            ...connection.config,
          }));
          const cwd = yield* cwdFor({
            ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
            ...(input.desiredCwd === undefined ? {} : { cwd: input.desiredCwd }),
          });
          if (
            Preparation.fingerprint({
              providerInstanceId: input.providerInstanceId,
              cwd,
              runtimeMode: input.runtimeMode,
              modelSelection: input.modelSelection,
              servers,
            }) !== record.fingerprint
          )
            return yield* failure(
              "Managed MCP preparation no longer matches this turn. Retry the send.",
            );
          record.consumedBy = input.commandId;
          McpProviderSession.setManagedMcpServers(input.threadId, servers);
        }),
      );
    },
  );

  const readNativeMcpInventory = Effect.fn("PulseProviderService.readNativeMcpInventory")(
    function* (input: {
      readonly threadId: ThreadId;
      readonly providerInstanceId: ProviderInstanceId;
    }) {
      if (Option.isNone(projection) || Option.isNone(sessions)) return null;
      const records = yield* projection.value
        .getThreadRecords(input.threadId, ["providerThreads"])
        .pipe(Effect.mapError(() => failure("The provider conversation could not be read.")));
      const providerThread = records.providerThreads.find(
        (thread) =>
          thread.providerInstanceId === input.providerInstanceId && thread.status !== "closed",
      );
      if (!providerThread || providerThread.providerSessionId === null) return null;
      const runtime = yield* sessions.value
        .get(providerThread.providerSessionId)
        .pipe(Effect.mapError(() => failure("The provider session could not be read.")));
      if (Option.isNone(runtime) || runtime.value.readNativeMcpInventory === undefined) return null;
      return yield* runtime.value
        .readNativeMcpInventory({ threadId: input.threadId, providerThread })
        .pipe(Effect.mapError(() => failure("Native MCP status could not be read.")));
    },
  );
  return PulseProviderService.of({
    preparePulseMcp,
    consumePulseMcpPreparation,
    readNativeMcpInventory,
  });
});

export const layer = Layer.effect(PulseProviderService, make);
