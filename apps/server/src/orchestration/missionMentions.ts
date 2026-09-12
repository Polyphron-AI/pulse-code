import {
  MENTION_DEPTH_CAP,
  MENTION_SIZE_CAP,
  type MentionKind,
  type OrchestrationReadModel,
  mentionKindLabel,
  parseMentionOccurrences,
  parseMentions,
} from "@t3tools/contracts";

/**
 * missionMentions - turns the `@[kind:id]` tokens a user typed in an Argo
 * mission into text a manager can act on. Pure over the read model, so the
 * same mission and the same snapshot always expand the same way.
 *
 * Inline, every mention becomes a pointer the manager can quote back: the
 * record's display name plus its exact id. Underneath, each mentioned record
 * gets one section. A record that carries a body (notes and SOPs, when those
 * land) prints its body in full; everything else prints its one-line pointer,
 * because the manager only needs the handle.
 *
 * See docs/plans/2026-09-11-agent-roles-design.md section 3 (Mentions in the
 * mission).
 *
 * @module missionMentions
 */

export const MENTION_TRUNCATION_MARKER = "[mission mentions truncated: 64 KB limit reached]";

interface MentionRecord {
  readonly kind: MentionKind;
  readonly id: string;
  readonly displayName: string;
  /**
   * Text printed in full under the record's heading, whose own mentions
   * expand one level deeper. Null for pointer-only records. Today only an
   * Argo mission fills this; note and SOP bodies join it with their
   * contracts.
   */
  readonly expandedBody: string | null;
}

function threadRecord(readModel: OrchestrationReadModel, id: string): MentionRecord | null {
  const thread = readModel.threads.find((entry) => entry.id === id);
  if (thread === undefined) return null;
  return { kind: "thread", id, displayName: thread.title, expandedBody: null };
}

function projectRecord(readModel: OrchestrationReadModel, id: string): MentionRecord | null {
  const project = readModel.projects.find((entry) => entry.id === id);
  if (project === undefined) return null;
  return { kind: "project", id, displayName: project.title, expandedBody: null };
}

function scheduleRecord(readModel: OrchestrationReadModel, id: string): MentionRecord | null {
  const schedule = (readModel.schedules ?? []).find((entry) => entry.id === id);
  if (schedule === undefined) return null;
  // A schedule has no name, only its prompt, so the first line stands in.
  const firstLine = schedule.prompt.split(/\r?\n/, 1)[0]!.trim();
  const displayName = firstLine.length > 60 ? `${firstLine.slice(0, 59)}…` : firstLine;
  return { kind: "schedule", id, displayName, expandedBody: null };
}

function managerRecord(readModel: OrchestrationReadModel, id: string): MentionRecord | null {
  const manager = (readModel.managers ?? []).find((entry) => entry.id === id);
  if (manager === undefined) return null;
  // A mentioned Argo is the one record whose own text keeps expanding: its
  // mission is what the mentioning Argo actually wants to read.
  return {
    kind: "manager",
    id,
    displayName: manager.name,
    expandedBody: manager.mission.trim().length > 0 ? manager.mission : null,
  };
}

function lookupRecord(
  readModel: OrchestrationReadModel,
  kind: MentionKind,
  id: string,
): MentionRecord | null {
  switch (kind) {
    case "thread":
      return threadRecord(readModel, id);
    case "project":
      return projectRecord(readModel, id);
    case "schedule":
      return scheduleRecord(readModel, id);
    case "manager":
      return managerRecord(readModel, id);
  }
}

/** The inline replacement and the section heading share one line of text. */
function pointerLine(record: MentionRecord): string {
  return `${mentionKindLabel(record.kind)} "${record.displayName}" (${record.kind} ${record.id})`;
}

function missingLine(kind: MentionKind, id: string): string {
  return `(missing ${kind} ${id})`;
}

/** Replaces every occurrence, so a record mentioned twice reads right twice. */
function replaceTokens(text: string, render: (kind: MentionKind, id: string) => string): string {
  const occurrences = parseMentionOccurrences(text);
  if (occurrences.length === 0) return text;
  let out = "";
  let cursor = 0;
  for (const occurrence of occurrences) {
    out += text.slice(cursor, occurrence.start) + render(occurrence.kind, occurrence.id);
    cursor = occurrence.end;
  }
  return out + text.slice(cursor);
}

export interface ExpandMissionMentionsInput {
  readonly mission: string;
  readonly readModel: OrchestrationReadModel;
  /** Levels of expansion to run. Clamped to `MENTION_DEPTH_CAP`. */
  readonly depth?: number;
  /**
   * The manager whose mission this is, when there is one. Naming it makes a
   * mention loop back to the owner read "already expanded above" instead of
   * printing the mission the manager is already looking at.
   */
  readonly selfManagerId?: string;
}

export interface ExpandedMission {
  readonly text: string;
  /** True when the size cap cut the sections short. */
  readonly truncated: boolean;
}

/**
 * The mission with its mentions resolved: pointers inline, one section per
 * mentioned record beneath. A record reached twice is marked "already
 * expanded above" rather than printed again, which is also what stops a
 * mention cycle between two Argos.
 */
export function expandMissionMentions(input: ExpandMissionMentionsInput): ExpandedMission {
  const maxDepth = Math.min(input.depth ?? MENTION_DEPTH_CAP, MENTION_DEPTH_CAP);
  const head = replaceTokens(input.mission, (kind, id) => {
    const record = lookupRecord(input.readModel, kind, id);
    return record === null ? missingLine(kind, id) : pointerLine(record);
  });

  if (maxDepth < 1 || parseMentions(input.mission).length === 0) {
    return { text: head, truncated: false };
  }

  const expanded = new Set<string>();
  if (input.selfManagerId !== undefined) expanded.add(`manager:${input.selfManagerId}`);
  const sections: string[] = [];
  let budget = MENTION_SIZE_CAP - head.length;
  let truncated = false;

  const push = (section: string): boolean => {
    const cost = section.length + 2;
    if (cost > budget) {
      truncated = true;
      return false;
    }
    budget -= cost;
    sections.push(section);
    return true;
  };

  const walk = (text: string, depth: number): void => {
    if (truncated || depth > maxDepth) return;
    for (const mention of parseMentions(text)) {
      if (truncated) return;
      const key = `${mention.kind}:${mention.id}`;
      const record = lookupRecord(input.readModel, mention.kind, mention.id);
      if (record === null) {
        if (expanded.has(key)) continue;
        expanded.add(key);
        push(`### ${missingLine(mention.kind, mention.id)}`);
        continue;
      }
      const heading = `### ${pointerLine(record)}`;
      if (expanded.has(key)) {
        push(`${heading}\n\nAlready expanded above.`);
        continue;
      }
      expanded.add(key);

      const bodyText = record.expandedBody;
      if (bodyText === null) {
        if (!push(heading)) return;
        continue;
      }
      // Nested text keeps its own tokens readable as pointers, and its
      // records expand one level deeper if the cap allows.
      const rendered = replaceTokens(bodyText.trim(), (kind, id) => {
        const target = lookupRecord(input.readModel, kind, id);
        return target === null ? missingLine(kind, id) : pointerLine(target);
      });
      if (!push(`${heading}\n\n${rendered}`)) return;
      walk(bodyText, depth + 1);
    }
  };

  walk(input.mission, 1);

  if (sections.length === 0 && !truncated) {
    return { text: head, truncated: false };
  }
  const parts = [head, "## Mentioned records", ...sections];
  if (truncated) parts.push(MENTION_TRUNCATION_MARKER);
  return { text: parts.join("\n\n"), truncated };
}
