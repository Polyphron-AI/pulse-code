import type {
  ServerProvider,
  ServerProviderSkill,
  ServerProviderSlashCommand,
} from "@t3tools/contracts";

export type ProviderSkillSourceKind = "app" | "repo" | "project" | "personal" | "system" | "other";

function titleCaseWords(value: string): string {
  const words: string[] = [];
  for (const segment of value.split(/[\s:_-]+/)) {
    if (segment.length === 0) continue;
    words.push(segment.charAt(0).toUpperCase() + segment.slice(1));
  }
  return words.join(" ");
}

function normalizePathSeparators(pathValue: string): string {
  return pathValue.replaceAll("\\", "/");
}

export function formatProviderSkillDisplayName(
  skill: Pick<ServerProviderSkill, "name" | "displayName">,
): string {
  const displayName = skill.displayName?.trim();
  if (displayName) {
    return displayName;
  }
  return titleCaseWords(skill.name);
}

export function dedupeProviderSkillsByName(
  skills: ReadonlyArray<ServerProviderSkill>,
): ServerProviderSkill[] {
  const seenNames = new Set<string>();
  return skills.filter((skill) => {
    const normalizedName = skill.name.trim().toLowerCase();
    if (seenNames.has(normalizedName)) {
      return false;
    }
    seenNames.add(normalizedName);
    return true;
  });
}

/**
 * Whether a composer pick can start this skill. A skill switched off in the
 * provider's settings will not run, and one the provider reserves for the
 * agent (Claude Code's `user-invocable: false`) rejects a user invocation.
 * Everything else, including skills the agent may not start on its own, is
 * fair game: the server dispatches the pick in the provider's native form.
 */
export function isProviderSkillUserInvocable(
  skill: Pick<ServerProviderSkill, "enabled" | "userInvocable">,
): boolean {
  return skill.enabled && skill.userInvocable !== false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function providerSkillMentionPattern(name: string): RegExp {
  return new RegExp(`(^|\\s)\\$${escapeRegExp(name)}(?=\\s|$)`);
}

export function hasProviderSkillMention(prompt: string, name: string): boolean {
  return providerSkillMentionPattern(name).test(prompt);
}

export interface ProviderSkillMentionEdit {
  readonly rangeStart: number;
  readonly rangeEnd: number;
  readonly replacement: string;
}

/**
 * Produces the smallest prompt edit that toggles one provider-native skill.
 * The invocation stays in prompt text so drafts, queued turns, transcripts and
 * provider-specific `$skill` dispatch all share the same source of truth.
 */
export function toggleProviderSkillMention(
  prompt: string,
  name: string,
  cursor: number,
): ProviderSkillMentionEdit {
  const match = providerSkillMentionPattern(name).exec(prompt);
  if (match) {
    const prefixLength = (match[1] ?? "").length;
    let rangeStart = match.index + prefixLength;
    let rangeEnd = rangeStart + name.length + 1;
    if (/[ \t]/.test(prompt[rangeEnd] ?? "")) {
      rangeEnd += 1;
    } else if (rangeStart > 0 && /[ \t]/.test(prompt[rangeStart - 1] ?? "")) {
      rangeStart -= 1;
    }
    return { rangeStart, rangeEnd, replacement: "" };
  }

  const insertionPoint = Math.max(0, Math.min(prompt.length, cursor));
  const leadingSpace =
    insertionPoint > 0 && !/\s/.test(prompt[insertionPoint - 1] ?? "") ? " " : "";
  const trailingSpace =
    insertionPoint === prompt.length || !/\s/.test(prompt[insertionPoint] ?? "") ? " " : "";
  return {
    rangeStart: insertionPoint,
    rangeEnd: insertionPoint,
    replacement: `${leadingSpace}$${name}${trailingSpace}`,
  };
}

export function getProviderSkillsForSlashMenu(
  skills: ReadonlyArray<ServerProviderSkill>,
  showSkillsInSlashMenu: boolean,
): ServerProviderSkill[] {
  return showSkillsInSlashMenu
    ? dedupeProviderSkillsByName(skills.filter(isProviderSkillUserInvocable))
    : [];
}

export function getProviderSlashCommandsForSlashMenu(
  slashCommands: ReadonlyArray<ServerProviderSlashCommand>,
  visibleSkills: ReadonlyArray<ServerProviderSkill>,
): ServerProviderSlashCommand[] {
  const skillNames = new Set(visibleSkills.map((skill) => skill.name.trim().toLowerCase()));
  return slashCommands.filter((command) => !skillNames.has(command.name.trim().toLowerCase()));
}

export function resolveProviderSkillSourceKind(
  skill: Pick<ServerProviderSkill, "path" | "scope">,
): ProviderSkillSourceKind {
  const normalizedPath = normalizePathSeparators(skill.path);
  if (normalizedPath.includes("/.codex/plugins/") || normalizedPath.includes("/.agents/plugins/")) {
    return "app";
  }

  const normalizedScope = skill.scope?.trim().toLowerCase();
  switch (normalizedScope) {
    case "repo":
    case "repository":
      return "repo";
    case "project":
    case "workspace":
    case "local":
      return "project";
    case "user":
    case "personal":
      return "personal";
    case "system":
      return "system";
    case undefined:
    case "":
      return "other";
    default:
      return "other";
  }
}

function resolveProviderWorkspaceSnapshot(
  provider: ServerProvider,
  cwd: string | null | undefined,
) {
  if (!cwd) return undefined;
  return provider.workspaceSnapshots?.find((snapshot) => snapshot.cwd === cwd);
}

export function resolveProviderSkillsForCwd(
  provider: ServerProvider,
  cwd: string | null | undefined,
): ServerProvider["skills"] {
  return resolveProviderWorkspaceSnapshot(provider, cwd)?.skills ?? provider.skills;
}

export function resolveProviderSlashCommandsForCwd(
  provider: ServerProvider,
  cwd: string | null | undefined,
): ServerProvider["slashCommands"] {
  return resolveProviderWorkspaceSnapshot(provider, cwd)?.slashCommands ?? provider.slashCommands;
}
