import { useAtomValue } from "@effect/atom-react";
import {
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  type EnvironmentId,
  type ProviderDriverKind,
  type ProviderInstanceId,
  type ProjectId,
  type ProviderSessionStartInput,
  type ThreadId,
} from "@t3tools/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";

import { useAtomCommand } from "../state/use-atom-command";
import { useEnvironmentQuery } from "../state/query";
import { useEnvironmentSessionState } from "../state/session";
import { serverEnvironment } from "../state/server";
import type { ManagedMcpEntry } from "./managedMcpPickerLogic";
import { McpSendPause, type FailedMcpConnection } from "./McpSendPause";
import type { McpSubmissionPreparation, PrepareComposerMcp } from "./prepareMcpSubmission";
import {
  preparePulseMcpTurn,
  pulseMcpList,
  pulseMcpNativeInventory,
  pulseMcpProviderDefault,
  pulseMcpProjectDefault,
  pulseMcpThreadOverride,
  resetPulseMcpThreadOverride,
  resetPulseMcpProjectDefault,
  setPulseMcpProviderDefault,
  setPulseMcpProjectDefault,
  setPulseMcpThreadOverride,
  discoverPulseMcp,
} from "./mcpState";

interface PendingPreparation {
  readonly providerSession: ProviderSessionStartInput;
  readonly failed: ReadonlyArray<FailedMcpConnection>;
  readonly resolve: (outcome: McpSubmissionPreparation) => void;
  readonly excludedConnectionIds: ReadonlyArray<string>;
  readonly busy: boolean;
  readonly error: string | null;
  readonly projectId?: ProjectId;
  readonly retryable: boolean;
  readonly connectionIds: ReadonlyArray<string>;
  readonly pinnedSelection: boolean;
}

export function useManagedMcpComposer(input: {
  readonly environmentId: EnvironmentId;
  readonly provider: ProviderDriverKind;
  readonly providerInstanceId: ProviderInstanceId;
  readonly projectId: ProjectId | null;
  readonly threadId: ThreadId | null;
  readonly identityKey: string;
  readonly modelKey: string;
  readonly providerSession: ProviderSessionStartInput | null;
  readonly draftConnectionIds: ReadonlyArray<string> | null;
  readonly onDraftConnectionIdsChange: (ids: ReadonlyArray<string> | null) => void;
  readonly onManage: () => void;
}) {
  const configResult = useAtomValue(
    serverEnvironment.configProjection({ environmentId: input.environmentId, input: {} }),
  );
  const projection = Option.getOrNull(AsyncResult.value(configResult));
  const capabilityReady = projection?.source === "live";
  const supported =
    input.provider === "codex"
      ? projection?.config.pulseCapabilities?.codexManagedMcp === true
      : input.provider === "claudeAgent"
        ? projection?.config.pulseCapabilities?.claudeManagedMcp === true
        : input.provider === "opencode"
          ? projection?.config.pulseCapabilities?.openCodeManagedMcp === true
          : false;
  const session = useEnvironmentSessionState(input.environmentId);
  const scopes =
    !session.isPending && session.data?.authenticated ? session.data.scopes : undefined;
  const canRead = scopes?.includes(AuthOrchestrationReadScope) === true;
  const canOperate = scopes?.includes(AuthOrchestrationOperateScope) === true;
  const enabled = capabilityReady && supported && canRead && canOperate;
  const list = useEnvironmentQuery(
    enabled ? pulseMcpList({ environmentId: input.environmentId, input: {} }) : null,
  );
  const providerDefault = useEnvironmentQuery(
    enabled
      ? pulseMcpProviderDefault({
          environmentId: input.environmentId,
          input: { providerInstanceId: input.providerInstanceId },
        })
      : null,
  );
  const projectDefault = useEnvironmentQuery(
    enabled && input.projectId
      ? pulseMcpProjectDefault({
          environmentId: input.environmentId,
          input: {
            projectId: input.projectId,
            providerInstanceId: input.providerInstanceId,
          },
        })
      : null,
  );
  const threadOverride = useEnvironmentQuery(
    enabled && input.threadId
      ? pulseMcpThreadOverride({
          environmentId: input.environmentId,
          input: { threadId: input.threadId },
        })
      : null,
  );
  const nativeInventorySupported =
    projection?.config.pulseCapabilities?.mcpNativeInventory === true;
  const nativeInventory = useEnvironmentQuery(
    nativeInventorySupported && canRead && input.threadId
      ? pulseMcpNativeInventory({
          environmentId: input.environmentId,
          input: { threadId: input.threadId, providerInstanceId: input.providerInstanceId },
        })
      : null,
  );
  const configuredInventory = useEnvironmentQuery(
    projection?.config.pulseCapabilities?.mcpDiscovery === true && canRead
      ? discoverPulseMcp({ environmentId: input.environmentId, input: {} })
      : null,
  );
  const setOverride = useAtomCommand(setPulseMcpThreadOverride, { reportFailure: false });
  const resetOverride = useAtomCommand(resetPulseMcpThreadOverride, { reportFailure: false });
  const saveProviderDefault = useAtomCommand(setPulseMcpProviderDefault);
  const saveProjectDefault = useAtomCommand(setPulseMcpProjectDefault);
  const resetProjectDefault = useAtomCommand(resetPulseMcpProjectDefault);
  const prepareTurn = useAtomCommand(preparePulseMcpTurn, { reportFailure: false });
  const [toggleStatuses, setToggleStatuses] = useState<
    Readonly<
      Record<string, { status: "checking" | "ready" | "inactive" | "error"; message?: string }>
    >
  >({});
  const toggleAttemptRef = useRef(0);
  const toggleRetryRef = useRef(new Map<string, { selecting: boolean }>());
  const toggleContextKey = `${input.environmentId}:${input.projectId ?? "projectless"}:${input.identityKey}:${input.provider}:${input.providerInstanceId}:${input.modelKey}:${input.providerSession?.threadId ?? "draft"}:${input.providerSession?.cwd ?? "no-cwd"}:${input.providerSession?.runtimeMode ?? "no-runtime"}:${JSON.stringify(list.data)}`;
  const toggleContextKeyRef = useRef(toggleContextKey);
  if (toggleContextKeyRef.current !== toggleContextKey) {
    toggleContextKeyRef.current = toggleContextKey;
    toggleAttemptRef.current += 1;
  }
  useEffect(() => {
    toggleRetryRef.current.clear();
    setToggleStatuses({});
  }, [toggleContextKey]);
  useEffect(() => {
    if (!Object.values(toggleStatuses).some(({ status }) => status === "ready")) return;
    // Idle provider preparations expire after five minutes. Drop the cached
    // label earlier so it cannot outlive the session it describes.
    const timer = setTimeout(() => {
      setToggleStatuses((current) =>
        Object.fromEntries(
          Object.entries(current).map(([id, value]) => [
            id,
            value.status === "ready"
              ? {
                  status: "error" as const,
                  message: "Readiness check expired. Retry to confirm the connection.",
                }
              : value,
          ]),
        ),
      );
    }, 4 * 60_000);
    return () => clearTimeout(timer);
  }, [toggleStatuses]);
  const serverOverride = threadOverride.data?.connectionIds;
  const [ignoreServerOverride, setIgnoreServerOverride] = useState(false);
  useEffect(() => {
    setIgnoreServerOverride(false);
  }, [input.environmentId, input.identityKey, input.threadId]);
  useEffect(() => {
    if (serverOverride === undefined) setIgnoreServerOverride(false);
  }, [serverOverride]);
  const effectiveServerOverride = ignoreServerOverride ? undefined : serverOverride;
  const selectionMode: "override" | "defaults" =
    input.draftConnectionIds !== null || effectiveServerOverride !== undefined
      ? "override"
      : "defaults";
  const selectedIds =
    input.draftConnectionIds ??
    effectiveServerOverride ??
    projectDefault.data?.connectionIds ??
    providerDefault.data?.connectionIds ??
    [];
  const selectionSignature = selectedIds.join("\0");
  const expectedSelectionSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    if (expectedSelectionSignatureRef.current === selectionSignature) {
      expectedSelectionSignatureRef.current = null;
      return;
    }
    toggleAttemptRef.current += 1;
    toggleRetryRef.current.clear();
    setToggleStatuses({});
  }, [selectionSignature]);
  const queryFailed = Boolean(
    list.error || providerDefault.error || projectDefault.error || threadOverride.error,
  );
  const loading =
    enabled &&
    !queryFailed &&
    (list.data === null ||
      providerDefault.data === null ||
      (input.projectId !== null && projectDefault.data === null) ||
      (input.threadId !== null && threadOverride.data === null));
  const entries = useMemo<ReadonlyArray<ManagedMcpEntry>>(() => {
    const loaded = (list.data ?? []).map((connection) => {
      const toggleStatus = toggleStatuses[connection.id];
      return {
        id: connection.id,
        name: connection.name,
        description:
          connection.config.transport === "http" ? connection.config.url : "Local command",
        source: "pulse" as const,
        status:
          toggleStatus?.status === "ready"
            ? ("available" as const)
            : toggleStatus?.status === "checking"
              ? ("checking" as const)
              : toggleStatus?.status === "error"
                ? ("error" as const)
                : ("unknown" as const),
        ...(toggleStatus?.status === "checking"
          ? { statusMessage: "Checking…" }
          : toggleStatus?.status === "ready" && selectedIds.includes(connection.id)
            ? { statusMessage: "Active · Ready" }
            : toggleStatus?.status === "inactive"
              ? { statusMessage: toggleStatus.message ?? "Off · Reconciled" }
              : toggleStatus?.message
                ? { statusMessage: toggleStatus.message }
                : {}),
      };
    });
    const loadedIds = new Set(loaded.map(({ id }) => id));
    return [
      ...loaded,
      ...(nativeInventory.data?.status === "available"
        ? nativeInventory.data.servers.map((server) => ({
            id: `native:${server.name}`,
            name: server.name,
            description: "Provider-native MCP",
            source: "provider" as const,
            status:
              server.status === "ready"
                ? ("available" as const)
                : server.status === "failed"
                  ? ("error" as const)
                  : ("unknown" as const),
            ...(server.status === "auth-required"
              ? { statusMessage: "Authentication required" }
              : {}),
          }))
        : []),
      ...(nativeInventory.data?.status !== "available"
        ? (configuredInventory.data ?? []).flatMap((candidate) => {
            const source =
              input.provider === "claudeAgent"
                ? "claude"
                : input.provider === "opencode"
                  ? "opencode"
                  : input.provider === "codex"
                    ? "codex"
                    : null;
            return source === candidate.source && candidate.transport !== "unsupported"
              ? [
                  {
                    id: `configured:${candidate.source}:${candidate.name}`,
                    name: candidate.name,
                    description: "Provider user configuration",
                    source: "provider" as const,
                    status: "unknown" as const,
                    statusMessage: "Configured; runtime not verified",
                  },
                ]
              : [];
          })
        : []),
      ...selectedIds
        .filter((id) => !loadedIds.has(id))
        .map((id) => ({
          id,
          name: id,
          source: "pulse" as const,
          status: "unsupported" as const,
          statusMessage: "Unavailable with the selected provider",
        })),
    ];
  }, [
    configuredInventory.data,
    input.provider,
    list.data,
    nativeInventory.data,
    selectedIds,
    toggleStatuses,
  ]);
  const toggleChecking = Object.values(toggleStatuses).some(({ status }) => status === "checking");
  const blockedReason = toggleChecking
    ? "Wait for the MCP readiness check to finish."
    : !supported && capabilityReady
      ? selectedIds.length > 0
        ? "Managed MCPs are unavailable for this provider. Remove them or switch providers."
        : null
      : !capabilityReady
        ? "Waiting for MCP support from this environment."
        : !supported
          ? "Managed MCPs are not supported by this environment."
          : !canRead || !canOperate
            ? "This session cannot use managed MCP connections."
            : queryFailed
              ? "MCP selection could not be loaded."
              : loading
                ? "MCP selection is still loading."
                : null;

  const accessKey = `${input.environmentId}:${input.projectId ?? "projectless"}:${input.identityKey}:${input.threadId ?? "draft"}:${input.providerInstanceId}:${input.provider}:${input.modelKey}:${capabilityReady}:${canRead}:${canOperate}:${selectedIds.join(",")}`;
  const accessKeyRef = useRef(accessKey);
  accessKeyRef.current = accessKey;
  const mountedRef = useRef(true);
  const attemptRef = useRef(0);
  const busyRef = useRef(false);
  const activePromiseRef = useRef<Promise<McpSubmissionPreparation> | null>(null);
  const [pending, setPending] = useState<PendingPreparation | null>(null);
  const pendingRef = useRef<PendingPreparation | null>(null);
  const overrideQueueRef = useRef<Promise<void>>(Promise.resolve());
  const lastOverrideWriteRef = useRef<{ key: string; result: Promise<boolean> } | null>(null);
  const defaultsResetThreadKeyRef = useRef<string | null>(null);
  const enqueueOverrideWrite = useCallback(
    (threadId: ThreadId, connectionIds: ReadonlyArray<string>, forceRetry = false) => {
      const key = `${input.environmentId}:${threadId}:${connectionIds.join(",")}`;
      if (!forceRetry && lastOverrideWriteRef.current?.key === key)
        return lastOverrideWriteRef.current.result;
      const result = overrideQueueRef.current.then(async () => {
        const write = await setOverride({
          environmentId: input.environmentId,
          input: { threadId, connectionIds: [...connectionIds] },
        });
        if (write._tag === "Success") threadOverride.refresh();
        return write._tag === "Success";
      });
      overrideQueueRef.current = result.then(
        () => undefined,
        () => undefined,
      );
      lastOverrideWriteRef.current = { key, result };
      return result;
    },
    [input.environmentId, setOverride, threadOverride],
  );
  const previousAccessKeyRef = useRef(accessKey);
  if (previousAccessKeyRef.current !== accessKey) {
    previousAccessKeyRef.current = accessKey;
    attemptRef.current += 1;
    busyRef.current = false;
    pendingRef.current?.resolve({ status: "cancelled" });
    pendingRef.current = null;
  }
  useEffect(() => {
    mountedRef.current = true;
    if (previousAccessKeyRef.current === accessKey && pendingRef.current === null) setPending(null);
    return () => {
      mountedRef.current = false;
      attemptRef.current += 1;
      pendingRef.current?.resolve({ status: "cancelled" });
    };
  }, [accessKey]);

  const runPreparation = useCallback(
    async (
      providerSession: ProviderSessionStartInput,
      pendingPreparation: PendingPreparation,
      options?: {
        readonly excludedConnectionIds?: ReadonlyArray<string>;
        readonly retry?: boolean;
      },
    ) => {
      if (busyRef.current) return;
      busyRef.current = true;
      const attempt = ++attemptRef.current;
      const excludedConnectionIds = [
        ...new Set([
          ...pendingPreparation.excludedConnectionIds,
          ...(options?.excludedConnectionIds ?? []),
        ]),
      ];
      const checking = { ...pendingPreparation, excludedConnectionIds, busy: true, error: null };
      toggleRetryRef.current.clear();
      setToggleStatuses({});
      const showReadinessFailure = (message: string) =>
        setToggleStatuses(
          Object.fromEntries(
            pendingPreparation.connectionIds.map((id) => [
              id,
              { status: "error" as const, message },
            ]),
          ),
        );
      pendingRef.current = checking;
      if (options) setPending(checking);
      try {
        if (
          !pendingPreparation.pinnedSelection &&
          selectionMode === "override" &&
          !(await enqueueOverrideWrite(
            providerSession.threadId,
            selectedIds,
            options?.retry === true,
          ))
        ) {
          throw new Error("Could not save MCP selection");
        }
        if (
          !mountedRef.current ||
          accessKeyRef.current !== accessKey ||
          attempt !== attemptRef.current
        )
          return;
        const result = await prepareTurn({
          environmentId: input.environmentId,
          input: {
            threadId: providerSession.threadId,
            providerSession,
            ...(pendingPreparation.pinnedSelection || selectionMode === "override"
              ? { connectionIds: [...pendingPreparation.connectionIds] }
              : {}),
            ...(excludedConnectionIds.length > 0 ? { excludedConnectionIds } : {}),
            ...(options?.retry ? { retry: true } : {}),
            ...(pendingPreparation.projectId ? { projectId: pendingPreparation.projectId } : {}),
          },
        });
        if (
          !mountedRef.current ||
          accessKeyRef.current !== accessKey ||
          attempt !== attemptRef.current
        )
          return;
        busyRef.current = false;
        if (result._tag === "Failure") {
          const failed = {
            ...checking,
            busy: false,
            error: "Pulse Code could not check MCP connections. Retry or manage connections.",
            retryable: true,
          };
          pendingRef.current = failed;
          setPending(failed);
          showReadinessFailure(failed.error);
          return;
        }
        if (result.value.status === "ready") {
          setToggleStatuses(
            Object.fromEntries(
              result.value.connections.flatMap((connection) =>
                connection.status === "ready"
                  ? [[connection.connectionId, { status: "ready" as const }]]
                  : [],
              ),
            ),
          );
          busyRef.current = false;
          pendingPreparation.resolve({
            status: "ready",
            preparationId: result.value.preparationId,
          });
          pendingRef.current = null;
          setPending(null);
          return;
        }
        if (result.value.status === "failed") {
          const failed = {
            ...checking,
            busy: false,
            failed: result.value.connections.flatMap((connection) =>
              connection.status === "failed"
                ? [
                    {
                      connectionId: connection.connectionId,
                      name: connection.name,
                      message: connection.message,
                    },
                  ]
                : [],
            ),
            retryable: true,
          };
          pendingRef.current = failed;
          setPending(failed);
          showReadinessFailure(
            failed.failed.map(({ name, message }) => `${name}: ${message}`).join("; ") ||
              "The provider did not confirm MCP readiness. Retry or manage connections.",
          );
          return;
        }
        const message =
          result.value.status === "active-turn"
            ? "Finish or stop the active turn, then retry."
            : "This provider cannot use Pulse-managed MCP connections.";
        const failed = {
          ...checking,
          busy: false,
          error: message,
          retryable: result.value.status === "active-turn",
        };
        pendingRef.current = failed;
        setPending(failed);
        showReadinessFailure(message);
      } catch {
        if (
          !mountedRef.current ||
          accessKeyRef.current !== accessKey ||
          attempt !== attemptRef.current
        )
          return;
        busyRef.current = false;
        const failed = {
          ...checking,
          busy: false,
          error: "Pulse Code could not check MCP connections. Retry or manage connections.",
          retryable: true,
        };
        pendingRef.current = failed;
        setPending(failed);
        showReadinessFailure(failed.error);
      }
    },
    [accessKey, enqueueOverrideWrite, input.environmentId, prepareTurn, selectedIds, selectionMode],
  );

  const prepare = useCallback<PrepareComposerMcp>(
    (providerSession, options): Promise<McpSubmissionPreparation> => {
      const preparationConnectionIds = options?.connectionIds ?? selectedIds;
      if (preparationConnectionIds.length === 0 && !supported)
        return Promise.resolve({ status: "ready" });
      if (activePromiseRef.current) return activePromiseRef.current;
      const preparationBlockedReason =
        options?.connectionIds !== undefined && !supported && capabilityReady
          ? "Managed MCPs are unavailable for this provider. Remove them or switch providers."
          : blockedReason;
      const promise = new Promise<McpSubmissionPreparation>((resolvePromise) => {
        const resolve = (outcome: McpSubmissionPreparation) => {
          activePromiseRef.current = null;
          resolvePromise(outcome);
        };
        const initial: PendingPreparation = {
          providerSession,
          resolve,
          failed: [],
          excludedConnectionIds: [],
          busy: false,
          retryable: !preparationBlockedReason,
          error: preparationBlockedReason,
          connectionIds: [...preparationConnectionIds],
          pinnedSelection: options?.connectionIds !== undefined,
          ...(options?.projectId ? { projectId: options.projectId } : {}),
        };
        pendingRef.current = initial;
        if (initial.error) {
          setPending(initial);
        } else if (options?.creatingWorktree) {
          void (async () => {
            if (
              !initial.pinnedSelection &&
              selectionMode === "override" &&
              !(await enqueueOverrideWrite(providerSession.threadId, selectedIds))
            ) {
              const failed = {
                ...initial,
                error: "Pulse Code could not save the MCP selection.",
                retryable: true,
              };
              pendingRef.current = failed;
              setPending(failed);
              return;
            }
            resolve({ status: "ready" });
          })();
        } else {
          void runPreparation(providerSession, initial);
        }
      });
      activePromiseRef.current = promise;
      return promise;
    },
    [
      blockedReason,
      capabilityReady,
      enqueueOverrideWrite,
      input.provider,
      runPreparation,
      selectedIds,
      selectionMode,
      supported,
    ],
  );

  const reconcileSelection = useCallback(
    async (ids: ReadonlyArray<string>, connectionId: string, selecting: boolean, retry = false) => {
      defaultsResetThreadKeyRef.current = null;
      if (!selecting) {
        expectedSelectionSignatureRef.current = ids.join("\0");
        input.onDraftConnectionIdsChange(ids);
      }
      const providerSession = input.providerSession;
      if (!providerSession) {
        setToggleStatuses((current) => ({
          ...current,
          [connectionId]: {
            status: selecting ? "error" : "inactive",
            message: selecting
              ? input.threadId
                ? "Create the worktree before checking the connection."
                : "Start this thread before checking the connection."
              : "Off · Pending reconciliation",
          },
        }));
        return;
      }
      const attempt = ++toggleAttemptRef.current;
      const contextKey = toggleContextKeyRef.current;
      setToggleStatuses({
        ...Object.fromEntries(ids.map((id) => [id, { status: "checking" as const }])),
        ...(!ids.includes(connectionId) ? { [connectionId]: { status: "checking" as const } } : {}),
      });
      const result = await prepareTurn({
        environmentId: input.environmentId,
        input: {
          threadId: providerSession.threadId,
          providerSession,
          connectionIds: [...ids],
          ...(input.projectId ? { projectId: input.projectId } : {}),
          ...(retry ? { retry: true } : {}),
        },
      });
      if (
        !mountedRef.current ||
        contextKey !== toggleContextKeyRef.current ||
        attempt !== toggleAttemptRef.current
      )
        return;
      const prepared = result._tag === "Success" ? result.value : null;
      const preparedConnections =
        prepared?.status === "ready" || prepared?.status === "failed" ? prepared.connections : [];
      const requestedStatuses = new Map(
        preparedConnections.map((connection) => [connection.connectionId, connection]),
      );
      const allReady =
        prepared?.status === "ready" &&
        ids.every((id) => requestedStatuses.get(id)?.status === "ready");
      if (allReady) {
        toggleRetryRef.current.delete(connectionId);
        setToggleStatuses((current) => ({
          ...current,
          ...Object.fromEntries(ids.map((id) => [id, { status: "ready" as const }])),
          [connectionId]: { status: selecting ? "ready" : "inactive" },
        }));
        if (selecting) {
          expectedSelectionSignatureRef.current = ids.join("\0");
          input.onDraftConnectionIdsChange(ids);
        }
        return;
      }
      const failedConnection =
        preparedConnections.find((connection) => connection.status !== "ready") ??
        requestedStatuses.get(connectionId);
      const message =
        (failedConnection?.status === "failed" ? failedConnection.message : undefined) ??
        (prepared?.status === "active-turn"
          ? "Finish or stop the active turn, then retry."
          : prepared?.status === "unsupported-provider"
            ? "This provider cannot use Pulse-managed MCP connections."
            : result._tag === "Failure"
              ? "Pulse Code could not check this connection. Retry or manage connections."
              : "The provider did not confirm this connection is ready. Retry or manage connections.");
      for (const id of new Set([...ids, connectionId]))
        toggleRetryRef.current.set(id, { selecting: id === connectionId ? selecting : true });
      setToggleStatuses({
        ...Object.fromEntries(
          ids.map((id) => [
            id,
            {
              status: "error" as const,
              message:
                id === failedConnection?.connectionId
                  ? message
                  : "Readiness was not retained because another connection failed.",
            },
          ]),
        ),
        [connectionId]: { status: "error", message },
      });
    },
    [input, prepareTurn],
  );
  const changeSelection = useCallback(
    (ids: ReadonlyArray<string>) => {
      const added = ids.find((id) => !selectedIds.includes(id));
      const removed = selectedIds.find((id) => !ids.includes(id));
      const changed = added ?? removed;
      if (!changed) return;
      void reconcileSelection(ids, changed, added !== undefined);
    },
    [reconcileSelection, selectedIds],
  );
  const retryConnection = useCallback(
    (connectionId: string) => {
      const target = toggleRetryRef.current.get(connectionId);
      void reconcileSelection(
        target?.selecting === false
          ? selectedIds.filter((id) => id !== connectionId)
          : [...new Set([...selectedIds, connectionId])],
        connectionId,
        target?.selecting ?? true,
        true,
      );
    },
    [reconcileSelection, selectedIds],
  );
  const useDefaults = useCallback(async () => {
    toggleAttemptRef.current += 1;
    toggleRetryRef.current.clear();
    setToggleStatuses({});
    if (!input.threadId) {
      input.onDraftConnectionIdsChange(null);
      return;
    }
    const resetAccessKey = accessKey;
    const threadId = input.threadId;
    const resetThreadKey = `${input.environmentId}:${threadId}`;
    defaultsResetThreadKeyRef.current = resetThreadKey;
    const resetOperation = overrideQueueRef.current.then(async () => {
      if (accessKeyRef.current !== resetAccessKey) return;
      return resetOverride({
        environmentId: input.environmentId,
        input: { threadId },
      });
    });
    overrideQueueRef.current = resetOperation.then(
      () => undefined,
      () => undefined,
    );
    const result = await resetOperation;
    if (!result || accessKeyRef.current !== resetAccessKey) {
      if (defaultsResetThreadKeyRef.current === resetThreadKey)
        defaultsResetThreadKeyRef.current = null;
      return;
    }
    if (result._tag === "Success") {
      lastOverrideWriteRef.current = null;
      setIgnoreServerOverride(true);
      input.onDraftConnectionIdsChange(null);
      threadOverride.refresh();
    } else if (defaultsResetThreadKeyRef.current === resetThreadKey) {
      defaultsResetThreadKeyRef.current = null;
    }
  }, [accessKey, input, resetOverride, threadOverride]);
  const saveDefaults = useCallback(async () => {
    const result = await saveProviderDefault({
      environmentId: input.environmentId,
      input: {
        providerInstanceId: input.providerInstanceId,
        connectionIds: [...selectedIds],
      },
    });
    if (result._tag === "Success") providerDefault.refresh();
  }, [
    input.environmentId,
    input.providerInstanceId,
    providerDefault,
    saveProviderDefault,
    selectedIds,
  ]);
  const saveProjectDefaults = useCallback(async () => {
    if (!input.projectId) return;
    const result = await saveProjectDefault({
      environmentId: input.environmentId,
      input: {
        projectId: input.projectId,
        providerInstanceId: input.providerInstanceId,
        connectionIds: [...selectedIds],
      },
    });
    if (result._tag === "Success") projectDefault.refresh();
  }, [
    input.environmentId,
    input.projectId,
    input.providerInstanceId,
    projectDefault,
    saveProjectDefault,
    selectedIds,
  ]);
  const resetProjectDefaults = useCallback(async () => {
    toggleAttemptRef.current += 1;
    toggleRetryRef.current.clear();
    if (!input.projectId) return;
    setToggleStatuses({});
    const result = await resetProjectDefault({
      environmentId: input.environmentId,
      input: {
        projectId: input.projectId,
        providerInstanceId: input.providerInstanceId,
      },
    });
    if (result._tag === "Success") projectDefault.refresh();
  }, [
    input.environmentId,
    input.projectId,
    input.providerInstanceId,
    projectDefault,
    resetProjectDefault,
  ]);

  useEffect(() => {
    if (input.threadId === null || input.draftConnectionIds === null) return;
    if (defaultsResetThreadKeyRef.current === `${input.environmentId}:${input.threadId}`) return;
    void enqueueOverrideWrite(input.threadId, input.draftConnectionIds);
  }, [enqueueOverrideWrite, input.threadId, input.draftConnectionIds]);

  const pause = pending ? (
    <McpSendPause
      open
      failed={pending.failed}
      error={pending.error}
      busy={pending.busy}
      retryable={pending.retryable}
      onOpenChange={(open) => {
        if (!open) {
          pending.resolve({ status: "cancelled" });
          pendingRef.current = null;
          attemptRef.current += 1;
          busyRef.current = false;
          setPending(null);
        }
      }}
      onRetry={() => void runPreparation(pending.providerSession, pending, { retry: true })}
      onContinueWithout={(excludedConnectionIds) =>
        void runPreparation(pending.providerSession, pending, { excludedConnectionIds })
      }
      onManage={input.onManage}
    />
  ) : null;

  return {
    picker: {
      entries,
      selectedIds,
      selectionMode,
      defaultScope:
        projectDefault.data?.connectionIds === undefined
          ? ("global" as const)
          : ("project" as const),
      nativeDiscovery:
        nativeInventory.data?.status === "available" || (configuredInventory.data?.length ?? 0) > 0
          ? ("available" as const)
          : ("unavailable" as const),
      disabled: false,
      selectionDisabled: !enabled || toggleChecking,
      loading,
      error: list.error ? "Could not load MCPs." : null,
      onChange: changeSelection,
      retryConnectionIds: Object.entries(toggleStatuses)
        .filter(([, value]) => value.status === "error")
        .map(([id]) => id),
      onRetryConnection: retryConnection,
      onUseDefaults: useDefaults,
      ...(enabled ? { onSaveGlobalDefaults: saveDefaults } : {}),
      ...(enabled && input.projectId ? { onSaveProjectDefaults: saveProjectDefaults } : {}),
      ...(enabled && input.projectId && projectDefault.data?.connectionIds !== undefined
        ? { onResetProjectDefaults: resetProjectDefaults }
        : {}),
      onManage: input.onManage,
      onRetry: list.refresh,
    },
    blockedReason,
    selectionReady: capabilityReady && !loading && !queryFailed && !toggleChecking,
    selectedCount: selectedIds.length,
    prepare,
    pause,
  };
}
