import { describe, expect, it } from "vite-plus/test";
import { PULSE_SETTINGS_SEARCH } from "./pulseSettingsSearch";
import { SETTINGS_SEARCH_ITEMS, searchableSetting } from "./settingsSearch";

describe("Pulse settings search contributions", () => {
  it("retains anchors and places each contribution once", () => {
    for (const entry of Object.values(PULSE_SETTINGS_SEARCH)) {
      expect(SETTINGS_SEARCH_ITEMS.filter((item) => item.id === entry.id)).toHaveLength(1);
      expect(searchableSetting(entry.id).title).toBe(entry.title);
    }
    const ids = SETTINGS_SEARCH_ITEMS.map((item) => item.id);
    expect(ids.indexOf("dictation")).toBeLessThan(ids.indexOf("voice-capture"));
    expect(ids.indexOf("voice-capture")).toBeLessThan(ids.indexOf("mail-alpha"));
    expect(ids.indexOf("mail-alpha")).toBeLessThan(ids.indexOf("messages-while-working"));
  });
  it("covers all contributed fields without changing their wire names", () => {
    expect(
      [
        ...new Set(Object.values(PULSE_SETTINGS_SEARCH).flatMap((entry) => [...entry.settingKeys])),
      ].sort(),
    ).toEqual([
      "composerBusyBehavior",
      "mailAlphaEnabled",
      "voiceGlobalShortcutEnabled",
      "voiceHoverEnabled",
      "voiceShortcut",
    ]);
  });
});
