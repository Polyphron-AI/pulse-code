import type { PulseSkillRecord, PulseSkillSelection } from "@t3tools/contracts";

export const MAX_MANAGED_SKILL_SELECTIONS = 32;

export function toggleManagedSkillSelection(
  selected: ReadonlyArray<PulseSkillSelection>,
  skill: PulseSkillSelection,
): ReadonlyArray<PulseSkillSelection> {
  const exact = selected.some(
    (selection) => selection.id === skill.id && selection.revision === skill.revision,
  );
  if (exact) return selected.filter((selection) => selection.id !== skill.id);
  if (
    selected.length >= MAX_MANAGED_SKILL_SELECTIONS &&
    !selected.some((selection) => selection.id === skill.id)
  ) {
    return selected;
  }
  return [...selected.filter((selection) => selection.id !== skill.id), { ...skill }];
}

export function staleManagedSkillSelections(
  selected: ReadonlyArray<PulseSkillSelection>,
  skills: ReadonlyArray<PulseSkillRecord>,
): ReadonlyArray<PulseSkillSelection> {
  const available = new Set(skills.map((skill) => skill.id));
  return selected.filter((selection) => !available.has(selection.id));
}

export function managedSkillsBlockedReason(input: {
  readonly selected: ReadonlyArray<PulseSkillSelection>;
  readonly providerSupported: boolean;
  readonly capabilityReady: boolean;
  readonly supported: boolean;
  readonly canRead: boolean;
  readonly canOperate: boolean;
  readonly loading: boolean;
  readonly error: boolean;
  readonly skills: ReadonlyArray<PulseSkillRecord>;
}): string | null {
  if (input.selected.length === 0) return null;
  if (!input.providerSupported) {
    return "Managed skills are unavailable for this provider. Remove them or switch providers.";
  }
  if (!input.capabilityReady) return "Waiting for managed skills support from this environment.";
  if (!input.supported) return "Managed skills are not supported by this environment.";
  if (!input.canRead || !input.canOperate) {
    return "This session cannot use managed skills on this environment.";
  }
  if (input.error) return "Managed skills could not be loaded. Open Skills and try again.";
  if (input.loading) return "Managed skills are still loading.";
  if (staleManagedSkillSelections(input.selected, input.skills).length > 0) {
    return "A selected managed skill was removed. Open Skills to remove it or import it again.";
  }
  return null;
}
