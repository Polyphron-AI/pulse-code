import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  MENTION_DEPTH_CAP,
  MENTION_KINDS,
  MENTION_SIZE_CAP,
  MentionKind,
  formatMention,
  mentionKindLabel,
  parseMentionOccurrences,
  parseMentions,
} from "./mentions.ts";

const decodeKind = Schema.decodeUnknownSync(MentionKind);

describe("MentionKind", () => {
  it("accepts every listed kind and rejects an unknown one", () => {
    for (const kind of MENTION_KINDS) {
      expect(decodeKind(kind)).toBe(kind);
    }
    expect(() => decodeKind("task")).toThrow();
  });

  it("labels Argo with the product name and the rest with the record name", () => {
    expect(mentionKindLabel("manager")).toBe("Argo");
    expect(mentionKindLabel("thread")).toBe("Thread");
    expect(mentionKindLabel("project")).toBe("Project");
    expect(mentionKindLabel("schedule")).toBe("Schedule");
  });
});

describe("caps", () => {
  it("holds the design's 64 KB and depth 2", () => {
    expect(MENTION_SIZE_CAP).toBe(65536);
    expect(MENTION_DEPTH_CAP).toBe(2);
  });
});

describe("formatMention", () => {
  it("round trips through the parser", () => {
    const token = formatMention("project", "prj_1");
    expect(token).toBe("@[project:prj_1]");
    expect(parseMentions(token)).toEqual([
      { kind: "project", id: "prj_1", token, start: 0, end: token.length },
    ]);
  });
});

describe("parseMentions", () => {
  it("returns mentions in order with their positions", () => {
    const text = "Watch @[project:prj_1] and hand off to @[thread:thr_2].";
    expect(parseMentions(text)).toEqual([
      {
        kind: "project",
        id: "prj_1",
        token: "@[project:prj_1]",
        start: 6,
        end: 22,
      },
      {
        kind: "thread",
        id: "thr_2",
        token: "@[thread:thr_2]",
        start: 39,
        end: 54,
      },
    ]);
  });

  it("keeps only the first occurrence of a repeated record", () => {
    const text = "@[manager:mgr_1] then @[manager:mgr_1] again";
    const mentions = parseMentions(text);
    expect(mentions).toHaveLength(1);
    expect(mentions[0]?.start).toBe(0);
  });

  it("treats the same id under two kinds as two mentions", () => {
    expect(parseMentions("@[thread:x] @[project:x]").map((m) => m.kind)).toEqual([
      "thread",
      "project",
    ]);
  });

  it("ignores tokens that are not mentions", () => {
    expect(parseMentions("email me@example.com about @[task:t1] and @[thread:]")).toEqual([]);
    expect(parseMentions("a plain @mention and [thread:t1]")).toEqual([]);
  });

  it("finds mentions with no surrounding whitespace", () => {
    expect(parseMentions("(@[schedule:sch_1])").map((m) => m.id)).toEqual(["sch_1"]);
  });

  it("returns nothing for empty text", () => {
    expect(parseMentions("")).toEqual([]);
  });
});

describe("parseMentionOccurrences", () => {
  it("keeps repeats so a rewrite can replace each one", () => {
    const occurrences = parseMentionOccurrences("@[thread:a] @[thread:a]");
    expect(occurrences.map((m) => m.start)).toEqual([0, 12]);
  });
});
