import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { PulseClientSettingsSchema, PulseClientSettingsPatch } from "./pulseClientSettings.ts";
import { ClientSettingsSchema, ClientSettingsPatch } from "./settings.ts";

const decodePulse = Schema.decodeUnknownSync(PulseClientSettingsSchema);
const decodePulsePatch = Schema.decodeUnknownSync(PulseClientSettingsPatch);
const decodeClient = Schema.decodeUnknownSync(ClientSettingsSchema);
const decodePatch = Schema.decodeUnknownSync(ClientSettingsPatch);
const encodeClient = Schema.encodeSync(ClientSettingsSchema);

describe("Pulse settings composition", () => {
  it("keeps the published defaults and flat keys", () => {
    const expected = {
      voiceShortcut: "ctrl+shift+space",
      voiceGlobalShortcutEnabled: false,
      voiceHoverEnabled: false,
      mailAlphaEnabled: false,
      composerBusyBehavior: "queue",
    };
    expect(decodePulse({})).toEqual(expected);
    expect(decodeClient({})).toMatchObject(expected);
  });
  it("does not inject defaults into omitted patches", () => {
    expect(decodePulsePatch({})).toEqual({});
    expect(decodePatch({})).toEqual({});
    expect(decodePatch({ voiceHoverEnabled: true })).toEqual({
      voiceHoverEnabled: true,
    });
  });
  it("round trips values and rejects invalid behavior", () => {
    const values = {
      voiceShortcut: "alt+space",
      voiceGlobalShortcutEnabled: true,
      voiceHoverEnabled: true,
      mailAlphaEnabled: true,
      composerBusyBehavior: "steer" as const,
    };
    const decoded = decodeClient(values);
    expect(encodeClient(decoded)).toMatchObject(values);
    expect(() => decodePatch({ composerBusyBehavior: "invalid" })).toThrow();
    expect(() => decodePatch({ voiceHoverEnabled: "true" })).toThrow();
  });
});
