import type { MeetingId } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { describe, expect, it } from "vite-plus/test";

import {
  buildMeetingThreadPrompt,
  formatMeetingDuration,
  formatMeetingOffset,
  meetingRevisionFor,
} from "./meetings.ts";

const meetingA = "meeting-a" as MeetingId;
const meetingB = "meeting-b" as MeetingId;

describe("meetingRevisionFor", () => {
  it("moves only for changes to its own meeting", () => {
    const change = (revision: number, meetingId: MeetingId) =>
      AsyncResult.success({ revision, meetingId });
    expect(meetingRevisionFor(change(7, meetingA), meetingA, 3)).toBe(7);
    expect(meetingRevisionFor(change(8, meetingB), meetingA, 7)).toBe(7);
    expect(meetingRevisionFor(AsyncResult.initial(), meetingA, 7)).toBe(7);
  });
});

const segment = (index: number, text: string) => ({
  index,
  startMs: index * 65_000,
  endMs: index * 65_000 + 1_000,
  text,
});

describe("meeting text", () => {
  it("formats offsets as mm:ss past the first hour", () => {
    expect(formatMeetingOffset(0)).toBe("00:00");
    expect(formatMeetingOffset(65_400)).toBe("01:05");
    expect(formatMeetingOffset(3_725_000)).toBe("62:05");
  });

  it("formats durations at a readable precision", () => {
    expect(formatMeetingDuration(null)).toBeNull();
    expect(formatMeetingDuration(42_000)).toBe("42s");
    expect(formatMeetingDuration(12 * 60_000)).toBe("12 min");
    expect(formatMeetingDuration(65 * 60_000)).toBe("1 h 05 min");
  });

  it("builds a prompt with the summary and a fenced, timestamped transcript", () => {
    const prompt = buildMeetingThreadPrompt({
      title: "Release sync",
      summary: "- Ship Friday",
      segments: [segment(0, "We ship Friday."), segment(1, "  "), segment(2, "Ana owns notes.")],
    });
    expect(prompt).toBe(
      [
        "Meeting: Release sync",
        "",
        "Summary:",
        "- Ship Friday",
        "",
        "Transcript:",
        "```text",
        "[00:00] We ship Friday.",
        "[02:10] Ana owns notes.",
        "```",
      ].join("\n"),
    );
  });

  it("lengthens the fence past backticks inside the transcript", () => {
    const prompt = buildMeetingThreadPrompt({
      title: "Code review",
      summary: null,
      segments: [segment(0, "run ```vp test``` first")],
    });
    expect(prompt.startsWith("Meeting: Code review\n\nTranscript:\n````text\n")).toBe(true);
    expect(prompt.endsWith("\n````")).toBe(true);
  });

  it("cuts a long transcript to whole lines and says how much was left out", () => {
    const segments = Array.from({ length: 200 }, (_, index) => segment(index, "x".repeat(40)));
    const prompt = buildMeetingThreadPrompt({ title: "Long", summary: null, segments }, 2_000);
    expect(prompt.length).toBeLessThanOrEqual(2_000);
    expect(prompt).toMatch(/\[\d+ more lines omitted\]\n```$/);
    const kept = prompt.split("\n").filter((line) => line.endsWith("x".repeat(40)));
    const omitted = Number(/\[(\d+) more/.exec(prompt)?.[1]);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length + omitted).toBe(200);
  });
});
