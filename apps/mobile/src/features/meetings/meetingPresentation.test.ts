import { describe, expect, it } from "vite-plus/test";

import { meetingSummaryBlocks } from "./meetingPresentation";

describe("meetingSummaryBlocks", () => {
  it("splits a generated summary into headings, prose and bullets", () => {
    const summary = [
      "## Summary",
      "The team reviewed the release.",
      "It ships **Friday**.",
      "",
      "## Action items",
      "- Ana writes the notes",
      "2. Ben tags the build",
    ].join("\n");
    expect(meetingSummaryBlocks(summary).map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: "heading", text: "Summary" },
      { kind: "paragraph", text: "The team reviewed the release. It ships Friday." },
      { kind: "heading", text: "Action items" },
      { kind: "bullet", text: "Ana writes the notes" },
      { kind: "bullet", text: "Ben tags the build" },
    ]);
  });

  it("keeps plain text as one paragraph per blank-line block", () => {
    const blocks = meetingSummaryBlocks("First line\r\nsecond line\r\n\r\nNext");
    expect(blocks.map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: "paragraph", text: "First line second line" },
      { kind: "paragraph", text: "Next" },
    ]);
    expect(new Set(blocks.map((block) => block.key)).size).toBe(blocks.length);
  });
});
