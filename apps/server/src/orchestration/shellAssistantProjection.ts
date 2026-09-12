import type {
  AssistantId,
  OrchestrationReadModel,
  OrchestrationShellSnapshot,
  OrchestrationShellStreamEvent,
} from "@t3tools/contracts";

/**
 * Shell projection for the assistant record. There is at most one assistant
 * per environment and it is never deleted, so unlike managers there is no
 * removal event: the shell only ever learns about an upsert.
 */
export function attachActiveAssistants(
  snapshot: OrchestrationShellSnapshot,
  readModel: OrchestrationReadModel,
): OrchestrationShellSnapshot {
  return {
    ...snapshot,
    assistants: readModel.assistants ?? [],
  };
}

export function assistantShellStreamEvent(
  readModel: OrchestrationReadModel,
  assistantId: AssistantId,
  sequence: number,
): OrchestrationShellStreamEvent | null {
  const assistant = (readModel.assistants ?? []).find((candidate) => candidate.id === assistantId);
  return assistant === undefined ? null : { kind: "assistant-upserted", sequence, assistant };
}
