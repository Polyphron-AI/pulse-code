import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { PulseSkillMutation, PulseSkillSelectionList } from "./pulseSkills.ts";

describe("managed skill wire input", () => {
  const decode = Schema.decodeUnknownSync(PulseSkillMutation);
  it("requires explicit Git update policy", () => {
    expect(() =>
      decode({
        operation: "import-github",
        id: "review",
        source: {
          type: "github",
          repository: "owner/repo",
          ref: "main",
          directory: "skills/review",
        },
      }),
    ).toThrow();
  });
  it("rejects arbitrary filesystem identifiers", () => {
    expect(() => decode({ operation: "remove", id: "../live" })).toThrow();
  });
  it("does not accept runtime invocation paths as mutations", () => {
    expect(() => decode({ operation: "execute", path: "C:/private/SKILL.md" })).toThrow();
  });
  it("bounds uploaded files before the store validates decoded content", () => {
    expect(() =>
      decode({
        operation: "import-upload",
        id: "review",
        files: Array.from({ length: 129 }, () => ({ path: "SKILL.md", base64: "" })),
      }),
    ).toThrow();
  });
  it("accepts explicit policy changes", () => {
    expect(decode({ operation: "set-policy", id: "review", policy: "pinned" })).toEqual({
      operation: "set-policy",
      id: "review",
      policy: "pinned",
    });
  });
});

describe("managed skill turn selections", () => {
  const decode = Schema.decodeUnknownSync(PulseSkillSelectionList);
  const revision = "a".repeat(64);

  it("accepts pinned id and revision pairs", () => {
    expect(decode([{ id: "review", revision }])).toEqual([{ id: "review", revision }]);
  });

  it("rejects duplicate ids and more than 32 selections", () => {
    expect(() =>
      decode([
        { id: "review", revision },
        { id: "review", revision },
      ]),
    ).toThrow();
    expect(() =>
      decode(Array.from({ length: 33 }, (_, index) => ({ id: `skill-${index}`, revision }))),
    ).toThrow();
  });
});
