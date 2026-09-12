import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { PulseMcpConnection, PulseMcpConnectionInput } from "./pulseMcp.ts";

describe("Pulse MCP contracts", () => {
  it("accepts the retain-secret edit sentinel but no secret references", () => {
    expect(() =>
      Schema.decodeUnknownSync(PulseMcpConnectionInput)({
        id: "github",
        name: "GitHub",
        config: {
          transport: "http",
          url: "https://example.test",
          headers: { Authorization: { type: "retain-secret" } },
        },
      }),
    ).not.toThrow();
    expect(() =>
      Schema.decodeUnknownSync(PulseMcpConnectionInput)({
        id: "github",
        name: "GitHub",
        config: {
          transport: "http",
          url: "https://example.test",
          headers: { Authorization: { type: "secret-ref", secretRef: "private" } },
        },
      }),
    ).toThrow();
  });

  it("does not encode secret values or references in public connections", () => {
    expect(() =>
      Schema.decodeUnknownSync(PulseMcpConnection)({
        id: "github",
        name: "GitHub",
        config: {
          transport: "http",
          url: "https://example.test",
          headers: { Authorization: { type: "secret", configured: true } },
        },
      }),
    ).not.toThrow();
    expect(() =>
      Schema.decodeUnknownSync(PulseMcpConnection)({
        id: "github",
        name: "GitHub",
        config: {
          transport: "http",
          url: "https://example.test",
          headers: { Authorization: { type: "secret-ref", secretRef: "private" } },
        },
      }),
    ).toThrow();
  });
});
