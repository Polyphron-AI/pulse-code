import type { ThreadId } from "@t3tools/contracts";
import type { ProviderResolvedSkill } from "../provider/Services/ProviderAdapter.ts";

const selections = new Map<ThreadId, readonly ProviderResolvedSkill[]>();

export function readManagedProviderSkills(threadId: ThreadId): readonly ProviderResolvedSkill[] {
  return selections.get(threadId) ?? [];
}

export function setManagedProviderSkills(
  threadId: ThreadId,
  skills: readonly ProviderResolvedSkill[],
): void {
  selections.set(threadId, skills);
}

export function clearManagedProviderSkills(threadId: ThreadId): void {
  selections.delete(threadId);
}
