import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { PulseSkillMutation } from "./pulseSkills.ts";

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
