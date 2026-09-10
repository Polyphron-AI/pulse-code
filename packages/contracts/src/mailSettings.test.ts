import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { ClientSettingsPatch, ClientSettingsSchema } from "./settings.ts";

const decodeSettings = Schema.decodeUnknownSync(ClientSettingsSchema);
const decodePatch = Schema.decodeUnknownSync(ClientSettingsPatch);

describe("Mail alpha opt-in", () => {
  it("leaves existing clients on production defaults until they opt in", () => {
    expect(decodeSettings({}).mailAlphaEnabled).toBe(false);
    expect(decodeSettings({ mailAlphaEnabled: true }).mailAlphaEnabled).toBe(true);
    expect(decodePatch({ mailAlphaEnabled: false })).toEqual({ mailAlphaEnabled: false });
  });
});
