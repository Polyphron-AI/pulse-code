import { describe, expect, it } from "vite-plus/test";

import { normalizeDesktopUpdateReleaseNotes } from "./releaseNotes.ts";

describe("normalizeDesktopUpdateReleaseNotes", () => {
  it("shows the latest eight changes while counting all changes", () => {
    const changes = Array.from({ length: 10 }, (_, index) => `Change ${index + 1}`);
    const notes = normalizeDesktopUpdateReleaseNotes(
      [
        "### Fixes",
        ...changes.map((change) => `- ${change}`),
        "## New Contributors",
        "- Contributor",
        "## Full Changelog",
      ].join("\n"),
      "0.0.40-pulse-preview.20260910.1",
    );
    expect(notes).toEqual({
      releaseNotes: [
        {
          version: "0.0.40-pulse-preview.20260910.1",
          items: changes.slice(-8).toReversed(),
          totalItems: 10,
        },
      ],
      omittedReleaseCount: 0,
    });
  });

  it("excludes HTML headings and contributor sections", () => {
    const notes = normalizeDesktopUpdateReleaseNotes(
      "<h3>Fixes</h3><ul><li>Older fix</li><li>Newer fix</li></ul><h2>New Contributors</h2><ul><li>Contributor</li></ul>",
      "1.2.3",
    );
    expect(notes.releaseNotes).toEqual([
      { version: "1.2.3", items: ["Newer fix", "Older fix"], totalItems: 2 },
    ]);
  });

  it("counts omitted releases without counting empty groups", () => {
    const groups = Array.from({ length: 8 }, (_, index) => ({
      version: `1.2.${8 - index}`,
      note: `- Change ${index}`,
    }));
    groups.splice(1, 0, { version: "empty", note: "" });
    const notes = normalizeDesktopUpdateReleaseNotes(groups, "fallback");
    expect(notes.releaseNotes.map((note) => note.version)).toEqual([
      "1.2.8",
      "1.2.7",
      "1.2.6",
      "1.2.5",
      "1.2.4",
      "1.2.3",
    ]);
    expect(notes.omittedReleaseCount).toBe(2);
  });
  it("splits a plain string note into items under the fallback version", () => {
    const notes = normalizeDesktopUpdateReleaseNotes(
      "## What's changed\n- First fix\n- Second fix",
      "1.2.3",
    );
    expect(notes).toEqual({
      releaseNotes: [{ version: "1.2.3", items: ["Second fix", "First fix"], totalItems: 2 }],
      omittedReleaseCount: 0,
    });
  });

  it("keeps per-version groups and drops empty ones", () => {
    const notes = normalizeDesktopUpdateReleaseNotes(
      [
        { version: "1.2.3", note: "- Newer change" },
        { version: "1.2.2", note: "Full changelog: https://example.com/compare/x...y" },
        { version: "1.2.1", note: "- Older change" },
      ],
      "1.2.3",
    );
    expect(notes).toEqual({
      releaseNotes: [
        { version: "1.2.3", items: ["Newer change"], totalItems: 1 },
        { version: "1.2.1", items: ["Older change"], totalItems: 1 },
      ],
      omittedReleaseCount: 0,
    });
  });

  it("decodes valid HTML entities", () => {
    const notes = normalizeDesktopUpdateReleaseNotes("- Fix &amp; polish &#128512;", "1.0.0");
    expect(notes).toEqual({
      releaseNotes: [{ version: "1.0.0", items: ["Fix & polish 😀"], totalItems: 1 }],
      omittedReleaseCount: 0,
    });
  });

  it("ignores malformed entries instead of throwing", () => {
    const notes = normalizeDesktopUpdateReleaseNotes(
      [
        { version: "1.2.3", note: "- Valid change" },
        { version: 42, note: "- Bad version type" },
        { version: "1.2.1", note: { html: "<p>object note</p>" } },
        "not an object",
        null,
      ],
      "1.2.3",
    );
    expect(notes).toEqual({
      releaseNotes: [{ version: "1.2.3", items: ["Valid change"], totalItems: 1 }],
      omittedReleaseCount: 0,
    });
  });

  it("returns non-empty groups even when preceded by many boilerplate-only groups", () => {
    const boilerplate = Array.from({ length: 7 }, (_, index) => ({
      version: `1.3.${9 - index}`,
      note: "Full changelog: https://example.com/compare/x...y",
    }));
    const notes = normalizeDesktopUpdateReleaseNotes(
      [...boilerplate, { version: "1.3.2", note: "- Older but real change" }],
      "1.3.9",
    );
    expect(notes).toEqual({
      releaseNotes: [{ version: "1.3.2", items: ["Older but real change"], totalItems: 1 }],
      omittedReleaseCount: 0,
    });
  });

  it("does not throw on out-of-range numeric entities and keeps the literal", () => {
    expect(() =>
      normalizeDesktopUpdateReleaseNotes("- Broken entity &#9999999999;", "1.0.0"),
    ).not.toThrow();
    const notes = normalizeDesktopUpdateReleaseNotes("- Broken entity &#9999999999;", "1.0.0");
    expect(notes).toEqual({
      releaseNotes: [{ version: "1.0.0", items: ["Broken entity &#9999999999;"], totalItems: 1 }],
      omittedReleaseCount: 0,
    });
  });
});
