import type { MeetingSummaryRow } from "@t3tools/contracts";

import type { StatusTone } from "../../components/StatusPill";

/** The one status worth showing on a meeting, or null once its summary is ready. */
export function meetingStatusTone(
  meeting: Pick<MeetingSummaryRow, "status" | "summaryStatus">,
): StatusTone | null {
  if (meeting.status === "recording") {
    return { label: "Recording", pillClassName: "bg-primary/10", textClassName: "text-foreground" };
  }
  switch (meeting.summaryStatus) {
    case "pending":
      return {
        label: "Summarizing",
        pillClassName: "bg-primary/10",
        textClassName: "text-foreground-secondary",
      };
    case "failed":
      return {
        label: "Summary failed",
        pillClassName: "bg-danger",
        textClassName: "text-danger-foreground",
      };
    case "none":
      return {
        label: "No summary",
        pillClassName: "bg-warning",
        textClassName: "text-warning-foreground",
      };
    case "ready":
      return null;
  }
}

export const MEETING_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export interface MeetingSummaryBlock {
  readonly kind: "heading" | "bullet" | "paragraph";
  readonly text: string;
  /** Stable for a given summary text, for use as a React key. */
  readonly key: string;
}

/**
 * Splits a generated summary into headings, bullets and paragraphs. Summaries follow a fixed
 * shape (`## Section` headings with bullets or prose), so this covers them without pulling a
 * full markdown renderer into a settings screen. Inline emphasis markers are dropped.
 */
export function meetingSummaryBlocks(markdown: string): ReadonlyArray<MeetingSummaryBlock> {
  const blocks: Array<MeetingSummaryBlock> = [];
  let paragraph: Array<string> = [];
  const push = (kind: MeetingSummaryBlock["kind"], text: string) =>
    blocks.push({ kind, text, key: `${blocks.length}` });
  const flush = () => {
    if (paragraph.length > 0) push("paragraph", paragraph.join(" "));
    paragraph = [];
  };
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/\*\*|__/g, "");
    if (line.length === 0) {
      flush();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      push("heading", heading[1] ?? "");
      continue;
    }
    const bullet = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      flush();
      push("bullet", bullet[1] ?? "");
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}
