import { describe, expect, it } from "vite-plus/test";
import { voiceVirtualKeys } from "./WindowsVoice.ts";
import { matchesVoiceShortcut, parseVoiceShortcut } from "@t3tools/shared/voiceShortcut";
describe("voice shortcuts", () => {
  it("maps the default and modifier-only Windows chords", () => {
    expect(voiceVirtualKeys("ctrl+shift+space")).toEqual([17, 16, 32]);
    expect(voiceVirtualKeys("control+windows")).toEqual([17, 91]);
    expect(voiceVirtualKeys("ctrl+alt+f12")).toEqual([17, 18, 123]);
  });
  it("rejects malformed and unmodified shortcuts", () => {
    for (const shortcut of ["a", "ctrl", "ctrl+ctrl+a", "ctrl+a+b", "ctrl+", "ctrl+f25"])
      expect(parseVoiceShortcut(shortcut)).toBeNull();
  });
  it("matches space and requires exactly the configured modifiers", () => {
    const event = { key: " ", ctrlKey: true, shiftKey: true, metaKey: false, altKey: false };
    expect(matchesVoiceShortcut(event, "ctrl+shift+space")).toBe(true);
    expect(matchesVoiceShortcut({ ...event, altKey: true }, "ctrl+shift+space")).toBe(false);
    expect(
      matchesVoiceShortcut(
        { ...event, key: "Meta", metaKey: true, shiftKey: false },
        "ctrl+windows",
      ),
    ).toBe(true);
  });
});
