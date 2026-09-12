import type {
  ManagerId,
  OrchestrationReadModel,
  OrchestrationShellSnapshot,
  OrchestrationShellStreamEvent,
} from "@t3tools/contracts";

export function attachActiveManagers(
  snapshot: OrchestrationShellSnapshot,
  readModel: OrchestrationReadModel,
): OrchestrationShellSnapshot {
  return {
    ...snapshot,
    managers: (readModel.managers ?? []).filter((manager) => manager.deletedAt === null),
  };
}

export function managerShellStreamEvent(
  readModel: OrchestrationReadModel,
  managerId: ManagerId,
  sequence: number,
): OrchestrationShellStreamEvent {
  const manager = (readModel.managers ?? []).find(
    (candidate) => candidate.id === managerId && candidate.deletedAt === null,
  );
  return manager === undefined
    ? { kind: "manager-removed", sequence, managerId }
    : { kind: "manager-upserted", sequence, manager };
}
