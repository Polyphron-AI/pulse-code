export type McpConnectionReadiness =
  | { readonly status: "available" }
  | { readonly status: "unknown" }
  | { readonly status: "failed"; readonly reason: string };

export interface PulseMcpPreflightDependencies {
  readonly supportsProvider: (provider: string) => boolean;
  readonly checkConnection: (connectionId: string) => Promise<McpConnectionReadiness>;
}

export interface PulseMcpTurnInput {
  readonly turnId: string;
  readonly provider: string;
  readonly defaultConnectionIds: readonly string[];
  /** Undefined means use defaults. An empty array is an explicit selection of none. */
  readonly threadConnectionIds?: readonly string[];
}

export interface PulseMcpTurnSnapshot {
  readonly turnId: string;
  readonly provider: string;
  readonly selectedConnectionIds: readonly string[];
  readonly selectionSource: "default" | "thread";
}

export type PulseMcpPreflightDirective =
  | {
      readonly type: "ready";
      readonly snapshot: PulseMcpTurnSnapshot;
      readonly readiness: Readonly<Record<string, "available" | "unknown">>;
    }
  | {
      readonly type: "submit";
      readonly snapshot: PulseMcpTurnSnapshot;
      readonly readiness: Readonly<Record<string, "available" | "unknown">>;
    }
  | {
      readonly type: "pause";
      readonly snapshot: PulseMcpTurnSnapshot;
      readonly reason: "unsupported-provider" | "connection-failed";
      readonly failures: Readonly<Record<string, string>>;
    }
  | { readonly type: "no-op"; readonly reason: "duplicate-action" | "turn-finalized" };

export type PulseMcpPreflightAction =
  | { readonly id: string; readonly type: "retry" }
  | { readonly id: string; readonly type: "continue-without-failed" }
  | { readonly id: string; readonly type: "fix-connection" };

const stableUnique = (ids: readonly string[]) => [...new Set(ids)];

const freezeSnapshot = (input: PulseMcpTurnInput): PulseMcpTurnSnapshot => {
  const hasOverride = input.threadConnectionIds !== undefined;
  return Object.freeze({
    turnId: input.turnId,
    provider: input.provider,
    selectedConnectionIds: Object.freeze(
      stableUnique(hasOverride ? input.threadConnectionIds : input.defaultConnectionIds),
    ),
    selectionSource: hasOverride ? "thread" : "default",
  });
};

/**
 * Owns the pre-send decisions for one turn. It never starts a provider or submits a prompt.
 * Callers execute a `submit` directive at most once and retain the saved selection themselves.
 */
export const makePulseMcpTurnPreflight = (
  dependencies: PulseMcpPreflightDependencies,
  input: PulseMcpTurnInput,
) => {
  const snapshot = freezeSnapshot(input);
  const handledActionIds = new Set<string>();
  let startRequested = false;
  let finalized = false;
  let pauseReason: "unsupported-provider" | "connection-failed" | undefined;
  let failedConnectionIds: readonly string[] = [];
  let queue = Promise.resolve();

  const serialize = <A>(operation: () => Promise<A>): Promise<A> => {
    const result = queue.then(operation, operation);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const evaluate = async (submitWhenReady: boolean): Promise<PulseMcpPreflightDirective> => {
    if (
      snapshot.selectedConnectionIds.length > 0 &&
      !dependencies.supportsProvider(snapshot.provider)
    ) {
      pauseReason = "unsupported-provider";
      return {
        type: "pause",
        snapshot,
        reason: "unsupported-provider",
        failures: Object.freeze({}),
      };
    }

    const results = await Promise.all(
      snapshot.selectedConnectionIds.map(async (connectionId) => {
        try {
          return [connectionId, await dependencies.checkConnection(connectionId)] as const;
        } catch (error) {
          return [
            connectionId,
            {
              status: "failed" as const,
              reason: error instanceof Error ? error.message : "readiness check failed",
            },
          ] as const;
        }
      }),
    );
    const failures: Record<string, string> = Object.create(null);
    const readiness: Record<string, "available" | "unknown"> = Object.create(null);
    for (const [connectionId, result] of results) {
      if (result.status === "failed") failures[connectionId] = result.reason;
      else readiness[connectionId] = result.status;
    }
    failedConnectionIds = Object.freeze(Object.keys(failures));
    if (failedConnectionIds.length > 0) {
      pauseReason = "connection-failed";
      return {
        type: "pause",
        snapshot,
        reason: "connection-failed",
        failures: Object.freeze(failures),
      };
    }
    pauseReason = undefined;
    if (submitWhenReady) finalized = true;
    return {
      type: submitWhenReady ? "submit" : "ready",
      snapshot,
      readiness: Object.freeze(readiness),
    };
  };

  const start = async (): Promise<PulseMcpPreflightDirective> => {
    if (startRequested) return { type: "no-op", reason: "duplicate-action" };
    startRequested = true;
    return serialize(() => evaluate(true));
  };

  const act = async (action: PulseMcpPreflightAction): Promise<PulseMcpPreflightDirective> => {
    if (handledActionIds.has(action.id)) return { type: "no-op", reason: "duplicate-action" };
    handledActionIds.add(action.id);
    return serialize(async () => {
      if (finalized || !startRequested) return { type: "no-op", reason: "turn-finalized" };
      if (action.type === "retry") {
        if (pauseReason !== "connection-failed") return { type: "no-op", reason: "turn-finalized" };
        return evaluate(false);
      }
      if (action.type === "fix-connection") {
        if (pauseReason === undefined) return { type: "no-op", reason: "turn-finalized" };
        return {
          type: "pause",
          snapshot,
          reason: pauseReason,
          failures: Object.freeze(Object.create(null) as Record<string, string>),
        };
      }
      if (pauseReason !== "connection-failed") {
        return { type: "no-op", reason: "turn-finalized" };
      }

      finalized = true;
      const failed = new Set(failedConnectionIds);
      const reducedSnapshot = Object.freeze({
        ...snapshot,
        selectedConnectionIds: Object.freeze(
          snapshot.selectedConnectionIds.filter((id) => !failed.has(id)),
        ),
      });
      return {
        type: "submit",
        snapshot: reducedSnapshot,
        readiness: Object.freeze(Object.create(null) as Record<string, "available" | "unknown">),
      };
    });
  };

  return Object.freeze({ snapshot, start, act });
};
