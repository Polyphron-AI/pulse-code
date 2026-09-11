import { describe, expect, it } from "vite-plus/test";
import { dictationInsertion, dictationSendDisabledReason } from "./composerDictation";

describe("composer dictation policy", () => {
  it.each(["", "hello", "hello ", "hello\n", "hello\t"])(
    "appends to %j without losing whitespace",
    (prompt) => {
      const insertion = dictationInsertion(prompt, "world");
      expect(insertion.start).toBe(prompt.length);
      expect(insertion.end).toBe(prompt.length);
      expect(prompt + insertion.text).toBe(prompt === "hello" ? "hello world" : prompt + "world");
    },
  );
  it("gives dictation precedence without discarding the existing send restriction", () => {
    expect(dictationSendDisabledReason(true, null)).toBe("Finish dictation before sending.");
    expect(dictationSendDisabledReason(true, "Offline")).toBe("Finish dictation before sending.");
    expect(dictationSendDisabledReason(false, "Offline")).toBe("Offline");
    expect(dictationSendDisabledReason(false, null)).toBeNull();
  });
});
