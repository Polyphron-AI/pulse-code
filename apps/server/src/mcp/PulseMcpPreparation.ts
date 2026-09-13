import type {
  ModelSelection,
  ProjectId,
  ProviderInstanceId,
  PulseMcpPreparationId,
  RuntimeMode,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Semaphore from "effect/Semaphore";

import type {
  ProviderManagedMcpServer,
  ProviderManagedMcpStatus,
} from "../provider/Services/ProviderAdapter.ts";

export interface Record {
  readonly id: PulseMcpPreparationId;
  readonly providerInstanceId: ProviderInstanceId;
  readonly fingerprint: string;
  readonly cwd: string | null;
  readonly selectedConnectionIds: ReadonlyArray<string>;
  readonly runtimeMode: RuntimeMode;
  readonly modelSelection: ModelSelection | undefined;
  readonly projectId: ProjectId | undefined;
  readonly expiresAt: number;
  consumedBy?: string;
}

export const fingerprint = (input: {
  readonly providerInstanceId: ProviderInstanceId;
  readonly cwd: string | null;
  readonly runtimeMode: RuntimeMode;
  readonly modelSelection: ModelSelection | undefined;
  readonly servers: ReadonlyArray<ProviderManagedMcpServer>;
}) =>
  JSON.stringify({
    instanceId: input.providerInstanceId,
    cwd: input.cwd,
    runtimeMode: input.runtimeMode,
    modelSelection: input.modelSelection ?? null,
    servers: input.servers,
  });

export const findConflictingStdioConnections = (
  servers: ReadonlyArray<ProviderManagedMcpServer>,
) => {
  const owners = new Map<string, { readonly value: string; readonly id: string }>();
  const conflicts = new Set<string>();
  for (const server of servers) {
    if (server.transport !== "stdio") continue;
    for (const [name, value] of Object.entries(server.env)) {
      const owner = owners.get(name);
      if (owner && owner.value !== value) {
        conflicts.add(owner.id);
        conflicts.add(server.id);
      } else {
        owners.set(name, { value, id: server.id });
      }
    }
  }
  return conflicts;
};

export const publicStatuses = (
  servers: ReadonlyArray<ProviderManagedMcpServer>,
  statuses: ReadonlyArray<ProviderManagedMcpStatus>,
) =>
  servers.map((server) => {
    const status = statuses.find((candidate) => candidate.id === server.id) ?? {
      id: server.id,
      status: "unknown" as const,
    };
    return status.status === "failed"
      ? {
          connectionId: server.id,
          name: server.name,
          status: "failed" as const,
          message: status.message ?? "The provider could not start this MCP server.",
        }
      : { connectionId: server.id, name: server.name, status: status.status };
  });

/** Server-scoped preparation records and same-thread serialization. */
export const make = () => {
  const records = new Map<ThreadId, Record>();
  const locks = new Map<ThreadId, Semaphore.Semaphore>();
  let sequence = 0;

  const withThreadLock = <A, E, R>(threadId: ThreadId, effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      let lock = locks.get(threadId);
      if (!lock) {
        lock = yield* Semaphore.make(1);
        locks.set(threadId, lock);
      }
      return yield* lock.withPermits(1)(effect);
    });

  const issueId = (threadId: ThreadId) =>
    `${String(threadId)}-${++sequence}` as PulseMcpPreparationId;

  return { records, withThreadLock, issueId } as const;
};
