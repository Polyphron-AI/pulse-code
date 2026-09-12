import {
  type MentionKind,
  formatMention,
  mentionKindLabel,
  parseMentionOccurrences,
} from "@t3tools/contracts";

/**
 * argoMissionMentions.logic - the caret arithmetic and filtering behind the
 * `@` picker in the Argo mission editor, kept out of the component so it can
 * be tested without a DOM.
 *
 * The mission is stored as plain text with `@[kind:id]` tokens; the server
 * expands them at cycle time. The editor never stores a display name, so
 * renaming a project does not leave a stale mission behind.
 *
 * @module argoMissionMentions.logic
 */

/** One record the picker can offer, flattened from the environment's atoms. */
export interface MissionMentionOption {
  readonly kind: MentionKind;
  readonly id: string;
  readonly label: string;
  /** Second line in the picker row, such as the project a thread sits in. */
  readonly detail: string | null;
}

/** An open `@` query: where it starts and what the user has typed after it. */
export interface MissionMentionQuery {
  /** Index of the `@` that opened the picker. */
  readonly start: number;
  /** Index one past the last typed character, always the caret. */
  readonly end: number;
  readonly text: string;
}

/**
 * The `@` query the caret sits in, or null when the picker should be closed.
 * A query runs from an `@` that follows whitespace or the start of the text
 * up to the caret, and a space or a newline closes it, so prose like
 * "email me@example.com" never opens the picker.
 */
export function findMissionMentionQuery(
  mission: string,
  caret: number,
): MissionMentionQuery | null {
  if (caret < 0 || caret > mission.length) return null;
  for (let index = caret - 1; index >= 0; index -= 1) {
    const char = mission[index]!;
    if (char === " " || char === "\n" || char === "\t") return null;
    if (char !== "@") continue;
    const before = index === 0 ? null : mission[index - 1];
    if (before !== null && before !== " " && before !== "\n" && before !== "\t") return null;
    // A completed token is not a query; the caret is just sitting after one.
    if (mission[index + 1] === "[") return null;
    return { start: index, end: caret, text: mission.slice(index + 1, caret) };
  }
  return null;
}

const MENTION_KIND_ORDER: ReadonlyArray<MentionKind> = ["project", "thread", "schedule", "manager"];

/**
 * Options matching the query, best first. An empty query lists everything so
 * a user who types `@` alone still sees what there is to pick.
 */
export function filterMissionMentionOptions(
  options: ReadonlyArray<MissionMentionOption>,
  query: string,
  limit = 8,
): ReadonlyArray<MissionMentionOption> {
  const needle = query.trim().toLowerCase();
  const scored: Array<{ option: MissionMentionOption; score: number; index: number }> = [];
  options.forEach((option, index) => {
    const label = option.label.toLowerCase();
    let score: number;
    if (needle.length === 0) score = 1;
    else if (label.startsWith(needle)) score = 0;
    else if (label.includes(needle)) score = 1;
    else if (option.id.toLowerCase().includes(needle)) score = 2;
    else if (mentionKindLabel(option.kind).toLowerCase().startsWith(needle)) score = 3;
    else return;
    scored.push({ option, score, index });
  });
  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    const kindDelta =
      MENTION_KIND_ORDER.indexOf(a.option.kind) - MENTION_KIND_ORDER.indexOf(b.option.kind);
    if (kindDelta !== 0) return kindDelta;
    return a.index - b.index;
  });
  return scored.slice(0, limit).map((entry) => entry.option);
}

export interface MissionMentionInsertion {
  readonly mission: string;
  /** Where the caret goes once the token is in, always just past it. */
  readonly caret: number;
}

/** Swaps the open query for a token and leaves one trailing space to type on. */
export function insertMissionMention(
  mission: string,
  query: MissionMentionQuery,
  option: MissionMentionOption,
): MissionMentionInsertion {
  const token = formatMention(option.kind, option.id);
  const trailing = mission[query.end] === " " ? "" : " ";
  const next = `${mission.slice(0, query.start)}${token}${trailing}${mission.slice(query.end)}`;
  return { mission: next, caret: query.start + token.length + trailing.length };
}

export type MissionPreviewPart =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "chip";
      readonly kind: MentionKind;
      readonly id: string;
      /** The record's name, or null when nothing in the environment has that id. */
      readonly label: string | null;
    };

/**
 * The mission split for the read-only preview: prose as text, every token as
 * a chip. A chip with a null label is a record this client cannot see, which
 * is how a user notices a deleted or out-of-scope mention before a cycle
 * renders it as missing.
 */
export function buildMissionPreview(
  mission: string,
  options: ReadonlyArray<MissionMentionOption>,
): ReadonlyArray<MissionPreviewPart> {
  const occurrences = parseMentionOccurrences(mission);
  if (occurrences.length === 0) {
    return mission.length === 0 ? [] : [{ type: "text", text: mission }];
  }
  const byKey = new Map(options.map((option) => [`${option.kind}:${option.id}`, option.label]));
  const parts: MissionPreviewPart[] = [];
  let cursor = 0;
  for (const occurrence of occurrences) {
    if (occurrence.start > cursor) {
      parts.push({ type: "text", text: mission.slice(cursor, occurrence.start) });
    }
    parts.push({
      type: "chip",
      kind: occurrence.kind,
      id: occurrence.id,
      label: byKey.get(`${occurrence.kind}:${occurrence.id}`) ?? null,
    });
    cursor = occurrence.end;
  }
  if (cursor < mission.length) parts.push({ type: "text", text: mission.slice(cursor) });
  return parts;
}

/** Chip text: the record's name, or its raw id when the record is unknown. */
export function missionChipLabel(part: Extract<MissionPreviewPart, { type: "chip" }>): string {
  return part.label ?? `${mentionKindLabel(part.kind)} ${part.id}`;
}

/** Keeps the highlighted row inside the list as it shrinks under a query. */
export function clampMentionHighlight(highlight: number, count: number): number {
  if (count === 0) return 0;
  return Math.max(0, Math.min(highlight, count - 1));
}

/** Wraps at both ends so the arrow keys never dead-end. */
export function moveMentionHighlight(highlight: number, count: number, delta: 1 | -1): number {
  if (count === 0) return 0;
  return (highlight + delta + count) % count;
}
