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
  pulseMcpProviderDefault,
  pulseMcpThreadOverride,
  resetPulseMcpThreadOverride,
  setPulseMcpProviderDefault,
  setPulseMcpThreadOverride,
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
}

export function useManagedMcpComposer(input: {
  readonly environmentId: EnvironmentId;
  readonly provider: ProviderDriverKind;
  readonly providerInstanceId: ProviderInstanceId;
  readonly threadId: ThreadId | null;
  readonly identityKey: string;
  readonly modelKey: string;
  readonly draftConnectionIds: ReadonlyArray<string> | null;
  readonly onDraftConnectionIdsChange: (ids: ReadonlyArray<string> | null) => void;
  readonly onManage: () => void;
}) {
  const configResult = useAtomValue(
    serverEnvironment.configProjection({ environmentId: input.environmentId, input: {} }),
  );
  const projection = Option.getOrNull(AsyncResult.value(configResult));
  const capabilityReady = projection?.source === "live";
  const supported = projection?.config.pulseCapabilities?.codexManagedMcp === true;
  const session = useEnvironmentSessionState(input.environmentId);
  const scopes =
    !session.isPending && session.data?.authenticated ? session.data.scopes : undefined;
  const canRead = scopes?.includes(AuthOrchestrationReadScope) === true;
  const canOperate = scopes?.includes(AuthOrchestrationOperateScope) === true;
  const enabled =
    input.provider === "codex" && capabilityReady && supported && canRead && canOperate;
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
  const threadOverride = useEnvironmentQuery(
    enabled && input.threadId
      ? pulseMcpThreadOverride({
          environmentId: input.environmentId,
          input: { threadId: input.threadId },
        })
      : null,
  );
  const setOverride = useAtomCommand(setPulseMcpThreadOverride, { reportFailure: false });
  const resetOverride = useAtomCommand(resetPulseMcpThreadOverride, { reportFailure: false });
  const saveProviderDefault = useAtomCommand(setPulseMcpProviderDefault);
  const prepareTurn = useAtomCommand(preparePulseMcpTurn, { reportFailure: false });
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
    providerDefault.data?.connectionIds ??
    [];
  const queryFailed = Boolean(list.error || providerDefault.error || threadOverride.error);
  const loading =
    enabled &&
    !queryFailed &&
    (list.data === null ||
      providerDefault.data === null ||
      (input.threadId !== null && threadOverride.data === null));
  const entries = useMemo<ReadonlyArray<ManagedMcpEntry>>(() => {
    const loaded = (list.data ?? []).map((connection) => ({
      id: connection.id,
      name: connection.name,
      description: connection.config.transport === "http" ? connection.config.url : "Local command",
      source: "pulse" as const,
      status: "unknown" as const,
    }));
    const loadedIds = new Set(loaded.map(({ id }) => id));
    return [
      ...loaded,
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
  }, [list.data, selectedIds]);
  const blockedReason =
    input.provider !== "codex"
      ? selectedIds.length > 0
        ? "Managed MCPs can only be used with Codex. Remove them or switch providers."
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

  const accessKey = `${input.environmentId}:${input.identityKey}:${input.threadId ?? "draft"}:${input.providerInstanceId}:${input.provider}:${input.modelKey}:${capabilityReady}:${canRead}:${canOperate}:${selectedIds.join(",")}`;
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
    (threadId: ThreadId, connectionIds: ReadonlyArray<string>) => {
      const key = `${input.environmentId}:${threadId}:${connectionIds.join(",")}`;
      if (lastOverrideWriteRef.current?.key === key) return lastOverrideWriteRef.current.result;
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
      pendingRef.current = checking;
      if (options) setPending(checking);
      try {
        if (
          selectionMode === "override" &&
          !(await enqueueOverrideWrite(providerSession.threadId, selectedIds))
        ) {
          throw new Error("Could not save MCP selection");
        }
        const result = await prepareTurn({
          environmentId: input.environmentId,
          input: {
            threadId: providerSession.threadId,
            providerSession,
            ...(selectionMode === "override" ? { connectionIds: [...selectedIds] } : {}),
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
          return;
        }
        if (result.value.status === "ready") {
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
      }
    },
    [accessKey, enqueueOverrideWrite, input.environmentId, prepareTurn, selectedIds, selectionMode],
  );

  const prepare = useCallback<PrepareComposerMcp>(
    (providerSession, options): Promise<McpSubmissionPreparation> => {
      if (selectedIds.length === 0 && (input.provider !== "codex" || !supported))
        return Promise.resolve({ status: "ready" });
      if (activePromiseRef.current) return activePromiseRef.current;
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
          retryable: !blockedReason && !(options?.creatingWorktree && selectedIds.length > 0),
          error: blockedReason
            ? blockedReason
            : options?.creatingWorktree && selectedIds.length > 0
              ? "Start the thread before using managed MCP connections. New worktree setup cannot apply them yet."
              : null,
          ...(options?.projectId ? { projectId: options.projectId } : {}),
        };
        pendingRef.current = initial;
        if (initial.error) setPending(initial);
        else void runPreparation(providerSession, initial);
      });
      activePromiseRef.current = promise;
      return promise;
    },
    [blockedReason, input.provider, runPreparation, selectedIds.length, supported],
  );

  const changeSelection = useCallback(
    (ids: ReadonlyArray<string>) => {
      defaultsResetThreadKeyRef.current = null;
      input.onDraftConnectionIdsChange(ids);
    },
    [input],
  );
  const useDefaults = useCallback(async () => {
    if (!input.threadId) {
      input.onDraftConnectionIdsChange(null);
      return;
    }
    const resetAccessKey = accessKey;
    const threadId = input.threadId;
    defaultsResetThreadKeyRef.current = `${input.environmentId}:${threadId}`;
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
    if (!result || accessKeyRef.current !== resetAccessKey) return;
    if (result._tag === "Success") {
      lastOverrideWriteRef.current = null;
      setIgnoreServerOverride(true);
      input.onDraftConnectionIdsChange(null);
      threadOverride.refresh();
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
      nativeDiscovery: "unavailable" as const,
      disabled: !enabled && selectedIds.length === 0,
      loading,
      error: list.error ? "Could not load MCPs." : null,
      onChange: changeSelection,
      onUseDefaults: useDefaults,
      ...(enabled ? { onSaveDefaults: saveDefaults } : {}),
      onManage: input.onManage,
      onRetry: list.refresh,
    },
    blockedReason,
    selectedCount: selectedIds.length,
    prepare,
    pause,
  };
}
