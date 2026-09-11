import type { PulseClientSettings } from "@t3tools/contracts/settings";
import type { SettingsSearchItem } from "./settingsSearch";

type PulseSearchContribution = SettingsSearchItem & {
  readonly settingKeys: readonly (keyof PulseClientSettings)[];
};

export const PULSE_SETTINGS_SEARCH = {
  dictation: {
    id: "dictation",
    title: "Dictation, microphone, shortcut, Parakeet and meeting transcription",
    to: "/settings/dictation",
    settingKeys: ["voiceShortcut", "voiceGlobalShortcutEnabled", "voiceHoverEnabled"],
  },
  voice: {
    id: "voice-capture",
    title: "Voice capture, Parakeet, microphone, shortcut and hover mode",
    to: "/settings/general",
    settingKeys: ["voiceShortcut", "voiceGlobalShortcutEnabled", "voiceHoverEnabled"],
  },
  mail: {
    id: "mail-alpha",
    title: "Show Mail alpha on this device",
    to: "/settings/integrations",
    settingKeys: ["mailAlphaEnabled"],
  },
  composer: {
    id: "messages-while-working",
    title: "Messages while working",
    to: "/settings/general",
    settingKeys: ["composerBusyBehavior"],
  },
} as const satisfies Record<string, PulseSearchContribution>;
