import { type EnvironmentId, type MeetingDetail, WS_METHODS } from "@t3tools/contracts";
import type { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "./runtime.ts";

/**
 * Meeting reads and commands for one client runtime. The server publishes a bare revision on
 * every meeting change, so reads refetch from it instead of receiving transcripts over the stream.
 */
export function createMeetingEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const revisions = createEnvironmentRpcSubscriptionAtomFamily(runtime, {
    label: "environment-data:pulse-meetings:revisions",
    tag: WS_METHODS.pulseMeetingsRevisions,
  });
  const refreshTrigger = ({ environmentId }: { readonly environmentId: EnvironmentId }) =>
    revisions({ environmentId, input: {} });
  return {
    revisions,
    list: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:pulse-meetings:list",
      tag: WS_METHODS.pulseMeetingsList,
      staleTimeMs: 30_000,
      idleTtlMs: 60_000,
      refreshTrigger,
    }),
    detail: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:pulse-meetings:detail",
      tag: WS_METHODS.pulseMeetingsGet,
      staleTimeMs: 30_000,
      idleTtlMs: 60_000,
      refreshTrigger,
    }),
    create: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:pulse-meetings:create",
      tag: WS_METHODS.pulseMeetingsCreate,
    }),
    appendSegments: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:pulse-meetings:append-segments",
      tag: WS_METHODS.pulseMeetingsAppendSegments,
    }),
    finish: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:pulse-meetings:finish",
      tag: WS_METHODS.pulseMeetingsFinish,
    }),
    summarize: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:pulse-meetings:summarize",
      tag: WS_METHODS.pulseMeetingsSummarize,
    }),
    rename: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:pulse-meetings:rename",
      tag: WS_METHODS.pulseMeetingsRename,
    }),
    delete: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:pulse-meetings:delete",
      tag: WS_METHODS.pulseMeetingsDelete,
    }),
  };
}

/** Formats a millisecond offset as mm:ss, letting minutes exceed 59. */
export function formatMeetingOffset(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** A short human duration such as "42s", "12 min" or "1 h 05 min". */
export function formatMeetingDuration(ms: number | null): string | null {
  if (ms === null) return null;
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours} h ${String(totalMinutes % 60).padStart(2, "0")} min`;
}

/** Keeps a meeting handed to a thread well inside what a provider turn can take. */
export const MEETING_THREAD_PROMPT_MAX_CHARS = 48_000;

/**
 * The composer text for continuing a meeting in a thread: title, summary, then the transcript in
 * a fenced block. The summary takes at most a third of `maxChars`, and the transcript is cut to
 * fit the rest, keeping whole lines from the start.
 */
export function buildMeetingThreadPrompt(
  meeting: Pick<MeetingDetail, "title" | "summary" | "segments">,
  maxChars: number = MEETING_THREAD_PROMPT_MAX_CHARS,
): string {
  const lines = meeting.segments
    .filter((segment) => segment.text.trim().length > 0)
    .map((segment) => `[${formatMeetingOffset(segment.startMs)}] ${segment.text.trim()}`);
  const longestTick = lines.reduce(
    (longest, line) => Math.max(longest, longestBacktickRun(line)),
    0,
  );
  const fence = "`".repeat(Math.max(3, longestTick + 1));
  const fullSummary = meeting.summary?.trim() ?? "";
  const summaryCap = Math.floor(maxChars / 3);
  const summary =
    fullSummary.length > summaryCap ? `${fullSummary.slice(0, summaryCap)}...` : fullSummary;
  const head = [
    `Meeting: ${meeting.title}`,
    ...(summary.length > 0 ? ["", "Summary:", summary] : []),
    "",
    "Transcript:",
    `${fence}text`,
  ].join("\n");
  if (lines.length === 0) return `${head}\n(no transcript)\n${fence}`;

  const truncationNote = (omitted: number) =>
    `[${omitted} more ${omitted === 1 ? "line" : "lines"} omitted]`;
  // Reserve room for the closing fence and the longest possible omission note.
  const budget = maxChars - head.length - fence.length - truncationNote(lines.length).length - 3;
  const kept: Array<string> = [];
  let used = 0;
  for (const line of lines) {
    if (used + line.length + 1 > budget) break;
    kept.push(line);
    used += line.length + 1;
  }
  const omitted = lines.length - kept.length;
  const body = omitted === 0 ? kept : [...kept, truncationNote(omitted)];
  return `${head}\n${body.join("\n")}\n${fence}`;
}

function longestBacktickRun(text: string): number {
  let longest = 0;
  for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  return longest;
}
