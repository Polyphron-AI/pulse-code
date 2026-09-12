import { describe, expect, it } from "vite-plus/test";

import {
  type MissionMentionOption,
  buildMissionPreview,
  clampMentionHighlight,
  filterMissionMentionOptions,
  findMissionMentionQuery,
  insertMissionMention,
  missionChipLabel,
  moveMentionHighlight,
} from "./argoMissionMentions.logic";

const options: ReadonlyArray<MissionMentionOption> = [
  { kind: "project", id: "prj_a", label: "Pulse Code", detail: "/repo/pulse" },
  { kind: "project", id: "prj_b", label: "Pulse Mail", detail: "/repo/mail" },
  { kind: "thread", id: "thr_a", label: "Fix the sidebar", detail: "Pulse Code" },
  { kind: "schedule", id: "sch_a", label: "Sweep stale branches", detail: "Daily 09:00" },
  { kind: "manager", id: "mgr_a", label: "Release Argo", detail: "Watching" },
];

describe("findMissionMentionQuery", () => {
  it("opens on an @ at the start of the mission", () => {
    expect(findMissionMentionQuery("@pul", 4)).toEqual({ start: 0, end: 4, text: "pul" });
  });

  it("opens on an @ after whitespace", () => {
    expect(findMissionMentionQuery("Watch @rel", 10)).toEqual({ start: 6, end: 10, text: "rel" });
  });

  it("opens on a bare @ with an empty query", () => {
    expect(findMissionMentionQuery("Watch @", 7)).toEqual({ start: 6, end: 7, text: "" });
  });

  it("opens after a newline", () => {
    expect(findMissionMentionQuery("Line one\n@x", 11)).toEqual({ start: 9, end: 11, text: "x" });
  });

  it("stays closed inside an email address", () => {
    expect(findMissionMentionQuery("mail me@example", 15)).toBeNull();
  });

  it("stays closed once a space ends the query", () => {
    expect(findMissionMentionQuery("Watch @rel now", 14)).toBeNull();
  });

  it("stays closed when there is no @ at all", () => {
    expect(findMissionMentionQuery("Keep CI green", 13)).toBeNull();
  });

  it("stays closed when the caret sits after a finished token", () => {
    const mission = "Watch @[project:prj_a]";
    expect(findMissionMentionQuery(mission, mission.length)).toBeNull();
  });

  it("reads the query up to the caret, not to the end of the text", () => {
    expect(findMissionMentionQuery("@pulse code", 3)).toEqual({ start: 0, end: 3, text: "pu" });
  });
});

describe("filterMissionMentionOptions", () => {
  it("lists everything for an empty query", () => {
    expect(filterMissionMentionOptions(options, "")).toHaveLength(options.length);
  });

  it("puts a prefix match ahead of a substring match", () => {
    const results = filterMissionMentionOptions(options, "pulse");
    expect(results.map((option) => option.id)).toEqual(["prj_a", "prj_b"]);
  });

  it("matches case insensitively", () => {
    expect(filterMissionMentionOptions(options, "RELEASE").map((o) => o.id)).toEqual(["mgr_a"]);
  });

  it("matches on the id so a pasted id resolves", () => {
    expect(filterMissionMentionOptions(options, "thr_a").map((o) => o.id)).toEqual(["thr_a"]);
  });

  it("matches on the kind label so typing argo finds Argos", () => {
    expect(filterMissionMentionOptions(options, "argo").map((o) => o.id)).toEqual(["mgr_a"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(filterMissionMentionOptions(options, "zzz")).toEqual([]);
  });

  it("honours the limit", () => {
    expect(filterMissionMentionOptions(options, "", 2)).toHaveLength(2);
  });

  it("orders equal scores by kind: projects, threads, schedules, Argos", () => {
    expect(filterMissionMentionOptions(options, "").map((o) => o.kind)).toEqual([
      "project",
      "project",
      "thread",
      "schedule",
      "manager",
    ]);
  });
});

describe("insertMissionMention", () => {
  it("replaces the query with a token and a trailing space", () => {
    const mission = "Watch @pul";
    const query = findMissionMentionQuery(mission, mission.length)!;
    expect(insertMissionMention(mission, query, options[0]!)).toEqual({
      mission: "Watch @[project:prj_a] ",
      caret: 23,
    });
  });

  it("keeps the text after the caret", () => {
    const mission = "Watch @pul closely";
    const query = findMissionMentionQuery(mission, 10)!;
    expect(insertMissionMention(mission, query, options[0]!).mission).toBe(
      "Watch @[project:prj_a] closely",
    );
  });

  it("does not add a second space when one already follows", () => {
    const mission = "Watch @pul closely";
    const query = findMissionMentionQuery(mission, 10)!;
    const result = insertMissionMention(mission, query, options[0]!);
    expect(result.mission).toBe("Watch @[project:prj_a] closely");
    expect(result.caret).toBe(22);
  });

  it("fills a bare @ with the token", () => {
    const query = findMissionMentionQuery("@", 1)!;
    expect(insertMissionMention("@", query, options[4]!).mission).toBe("@[manager:mgr_a] ");
  });
});

describe("buildMissionPreview", () => {
  it("returns nothing for an empty mission", () => {
    expect(buildMissionPreview("", options)).toEqual([]);
  });

  it("returns one text part when there are no tokens", () => {
    expect(buildMissionPreview("Keep CI green", options)).toEqual([
      { type: "text", text: "Keep CI green" },
    ]);
  });

  it("splits prose and chips in order", () => {
    expect(buildMissionPreview("Watch @[project:prj_a] daily", options)).toEqual([
      { type: "text", text: "Watch " },
      { type: "chip", kind: "project", id: "prj_a", label: "Pulse Code" },
      { type: "text", text: " daily" },
    ]);
  });

  it("chips a record this client cannot see with a null label", () => {
    expect(buildMissionPreview("@[thread:thr_gone]", options)).toEqual([
      { type: "chip", kind: "thread", id: "thr_gone", label: null },
    ]);
  });

  it("chips every occurrence, including a repeat", () => {
    const parts = buildMissionPreview("@[thread:thr_a] @[thread:thr_a]", options);
    expect(parts.filter((part) => part.type === "chip")).toHaveLength(2);
  });
});

describe("missionChipLabel", () => {
  it("uses the record name when it is known", () => {
    expect(
      missionChipLabel({ type: "chip", kind: "project", id: "prj_a", label: "Pulse Code" }),
    ).toBe("Pulse Code");
  });

  it("falls back to the kind and the raw id", () => {
    expect(missionChipLabel({ type: "chip", kind: "manager", id: "mgr_x", label: null })).toBe(
      "Argo mgr_x",
    );
  });
});

describe("highlight movement", () => {
  it("clamps a highlight past the end of a shrinking list", () => {
    expect(clampMentionHighlight(5, 2)).toBe(1);
    expect(clampMentionHighlight(-1, 2)).toBe(0);
    expect(clampMentionHighlight(3, 0)).toBe(0);
  });

  it("wraps at both ends", () => {
    expect(moveMentionHighlight(2, 3, 1)).toBe(0);
    expect(moveMentionHighlight(0, 3, -1)).toBe(2);
    expect(moveMentionHighlight(0, 0, 1)).toBe(0);
  });
});
