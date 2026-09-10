import { describe, expect, it } from "vite-plus/test";
import { voiceInsertion } from "./voiceTextTarget";

describe("dictation word boundaries", () => {
  it("separates appended speech and speech inserted between words", () => {
    expect(voiceInsertion("next steps", "Discuss", "tomorrow", true)).toBe(" next steps ");
    expect(voiceInsertion("équipe", "Bonjour", "", true)).toBe(" équipe");
  });
  it("preserves existing whitespace and punctuation", () => {
    expect(voiceInsertion("hello", "Say ", ", please", true)).toBe("hello");
    expect(voiceInsertion(", please", "Review", "", true)).toBe(", please");
  });
  it("keeps exact replacement and structured fields unchanged", () => {
    expect(voiceInsertion("example.com", "user@", "", false)).toBe("example.com");
    expect(voiceInsertion("42", "1", "", false)).toBe("42");
    expect(voiceInsertion("o", "hell", "", false)).toBe("o");
  });
});
