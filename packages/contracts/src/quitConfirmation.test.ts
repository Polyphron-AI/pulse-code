import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { ClientSettingsSchema, ClientSettingsPatch } from "./settings.ts";

const decode = Schema.decodeUnknownSync(ClientSettingsSchema);
const encode = Schema.encodeSync(ClientSettingsSchema);
const decodePatch = Schema.decodeUnknownSync(ClientSettingsPatch);

describe("quit confirmation compatibility", () => {
  it("defaults to hold", () => expect(decode({}).confirmQuit).toBe("hold"));
  it.each(["direct", "hold", "double-click"] as const)("round-trips %s", (mode) => {
    expect(encode(decode({ confirmQuit: mode })).confirmQuit).toBe(mode);
    expect(decodePatch({ confirmQuit: mode }).confirmQuit).toBe(mode);
  });
  it.each([
    [true, "hold"],
    [false, "direct"],
  ] as const)("migrates %s to %s", (legacy, mode) => {
    expect(encode(decode({ confirmQuit: legacy })).confirmQuit).toBe(mode);
  });
  it("requires a canonical mode for new patches", () => {
    expect(() => decodePatch({ confirmQuit: true })).toThrow();
  });
});
