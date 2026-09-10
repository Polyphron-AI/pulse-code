import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { ClientSurface } from "./baseSchemas.ts";

describe("ClientSurface", () => {
  it.each(["web", "desktop", "mobile", "cli"])("accepts the %s product surface", (surface) => {
    expect(Schema.decodeUnknownSync(ClientSurface)(surface)).toBe(surface);
  });

  it("rejects an unknown product surface", () => {
    expect(() => Schema.decodeUnknownSync(ClientSurface)("unknown")).toThrow();
  });
});
