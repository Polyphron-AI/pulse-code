import * as Schema from "effect/Schema";

/**
 * Mention tokens for free-text fields that name records, today the Argo
 * manager mission. A token is `@[kind:id]`; the server expands it at cycle
 * time so the stored text stays short and never goes stale when a record is
 * renamed.
 *
 * The boundary is the environment, not the project: an Argo spans
 * repositories, so anything mentionable is anything the environment owns.
 *
 * See docs/plans/2026-09-11-agent-roles-design.md section 3 (Mentions in the
 * mission).
 *
 * @module mentions
 */

/**
 * The record kinds a mention can name. Pulse Office kinds (task, person,
 * note, SOP) are not in this repo yet; they join this union with their
 * contracts.
 */
export const MentionKind = Schema.Literals(["thread", "project", "schedule", "manager"]);
export type MentionKind = typeof MentionKind.Type;

export const MENTION_KINDS: ReadonlyArray<MentionKind> = [
  "thread",
  "project",
  "schedule",
  "manager",
];

/** Bytes of expanded mission text before expansion stops and marks a cut. */
export const MENTION_SIZE_CAP = 64 * 1024;

/**
 * How many levels of mention expansion run. Depth 1 is the mission's own
 * mentions; depth 2 is the mentions inside a mentioned manager's mission.
 */
export const MENTION_DEPTH_CAP = 2;

export interface Mention {
  readonly kind: MentionKind;
  readonly id: string;
  /** The literal `@[kind:id]` text, so a caller can replace it exactly. */
  readonly token: string;
  /** Index of the `@` in the source text. */
  readonly start: number;
  /** Index one past the closing bracket. */
  readonly end: number;
}

/** Ids are opaque to this module; anything but a bracket or colon is fine. */
const MENTION_PATTERN = /@\[(thread|project|schedule|manager):([^\]\s:]+)\]/g;

export function formatMention(kind: MentionKind, id: string): string {
  return `@[${kind}:${id}]`;
}

/**
 * Every mention in `text`, in the order it appears, one entry per distinct
 * kind and id. A record mentioned twice expands once; the first occurrence
 * wins so positions stay usable for a picker or a preview.
 */
export function parseMentions(text: string): ReadonlyArray<Mention> {
  const seen = new Set<string>();
  const mentions: Mention[] = [];
  for (const match of text.matchAll(MENTION_PATTERN)) {
    const kind = match[1] as MentionKind;
    const id = match[2]!;
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    mentions.push({
      kind,
      id,
      token: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return mentions;
}

/** Every occurrence, including repeats. Use when rewriting the text itself. */
export function parseMentionOccurrences(text: string): ReadonlyArray<Mention> {
  return [...text.matchAll(MENTION_PATTERN)].map((match) => ({
    kind: match[1] as MentionKind,
    id: match[2]!,
    token: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
}

/** Sentence-case label for a kind, for headings and picker groups. */
export function mentionKindLabel(kind: MentionKind): string {
  switch (kind) {
    case "thread":
      return "Thread";
    case "project":
      return "Project";
    case "schedule":
      return "Schedule";
    case "manager":
      return "Argo";
  }
}
