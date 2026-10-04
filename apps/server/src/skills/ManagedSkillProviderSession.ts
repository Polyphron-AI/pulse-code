import {
  PulseSkillsError,
  type PulseSkillSelection,
  type ProviderDriverKind,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { ManagedSkills } from "./ManagedSkillRpc.ts";
import type { ProviderResolvedSkill } from "../provider/PulseProviderTypes.ts";

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

export const resolveManagedProviderSkills = Effect.fn("resolveManagedProviderSkills")(function* (
  threadId: ThreadId,
  driver: ProviderDriverKind,
  selection: ReadonlyArray<PulseSkillSelection>,
) {
  const library = yield* Effect.serviceOption(ManagedSkills);
  const fail = (message: string) => new PulseSkillsError({ message });
  const descriptors =
    selection.length === 0
      ? []
      : Option.isSome(library)
        ? yield* Effect.tryPromise({
            try: () => library.value.resolveSelection(selection),
            catch: () => fail("Managed skill selection could not be resolved."),
          })
        : yield* fail("Managed skill library is unavailable.");
  if (descriptors.length > 0 && !["codex", "claudeAgent", "opencode"].includes(driver))
    return yield* fail("This provider does not support managed skill invocation.");
  const providerKey = driver as "codex" | "claudeAgent" | "opencode";
  const skills: ProviderResolvedSkill[] = [];
  for (const skill of descriptors) {
    if (skill.invocation.userInvocable === false)
      return yield* fail(`Managed skill '${skill.id}' is not user-invocable.`);
    const variant = skill.variantSkillPaths?.[providerKey];
    if (skill.skillFamily && !skill.genericFallback && variant === undefined)
      return yield* fail(`Managed skill '${skill.id}' has no variant for this provider.`);
    const path = variant ?? skill.skillPath;
    skills.push({
      id: skill.id,
      name: skill.name,
      path,
      directory: path.slice(0, -"SKILL.md".length).replace(/[\\/]$/, ""),
      revision: skill.revision,
      ...(skill.invocation.userInvocationOnly ? { userInvocationOnly: true } : {}),
    });
  }
  if (
    driver === "claudeAgent" &&
    skills.some((skill) => skill.userInvocationOnly) &&
    skills.length !== 1
  )
    return yield* fail(
      "A user-invocation-only managed skill must be the only selected skill in Claude.",
    );
  setManagedProviderSkills(threadId, skills);
  return skills;
});
