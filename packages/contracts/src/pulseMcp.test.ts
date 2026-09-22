import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  PulseMcpConnection,
  PulseMcpConnectionInput,
  PulseMcpPrepareTurnResult,
  PulseMcpWardenCredential,
  PulseMcpWardenSettings,
} from "./pulseMcp.ts";

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

  it("bounds connection values at 128 entries", () => {
    const input = (count: number) => ({
      id: "bounded",
      name: "Bounded",
      config: {
        transport: "stdio",
        command: "mcp",
        env: Object.fromEntries(
          Array.from({ length: count }, (_, index) => [
            `VALUE_${index}`,
            { type: "literal", value: `${index}` },
          ]),
        ),
      },
    });
    expect(() => Schema.decodeUnknownSync(PulseMcpConnectionInput)(input(128))).not.toThrow();
    expect(() => Schema.decodeUnknownSync(PulseMcpConnectionInput)(input(129))).toThrow();
  });
});

describe("Pulse MCP Warden contracts", () => {
  it("accepts a warden value by credential URN and rejects other URNs", () => {
    const decode = Schema.decodeUnknownSync(PulseMcpConnectionInput);
    const input = decode({
      id: "github",
      name: "GitHub",
      config: {
        transport: "http",
        url: "https://example.test/mcp",
        headers: {
          Authorization: { type: "warden", credentialRef: "urn:pulse:acme:credential:gh-token" },
        },
      },
    });
    expect(input.config.transport === "http" && input.config.headers?.Authorization).toEqual({
      type: "warden",
      credentialRef: "urn:pulse:acme:credential:gh-token",
    });
    expect(() =>
      decode({
        id: "github",
        name: "GitHub",
        config: {
          transport: "http",
          url: "https://example.test/mcp",
          headers: { Authorization: { type: "warden", credentialRef: "urn:pulse:acme:secret:x" } },
        },
      }),
    ).toThrow();
  });

  it("exposes warden values publicly by URN without a configured flag", () => {
    const connection = Schema.decodeUnknownSync(PulseMcpConnection)({
      id: "github",
      name: "GitHub",
      config: {
        transport: "http",
        url: "https://example.test/mcp",
        headers: {
          Authorization: { type: "warden", credentialRef: "urn:pulse:acme:credential:gh-token" },
        },
      },
    });
    expect(
      connection.config.transport === "http" && connection.config.headers.Authorization,
    ).toEqual({ type: "warden", credentialRef: "urn:pulse:acme:credential:gh-token" });
  });

  it("decodes warden settings, credentials, and failure reasons", () => {
    expect(
      Schema.decodeUnknownSync(PulseMcpWardenSettings)({
        origin: "https://go.example.test",
        patConfigured: true,
        principal: { id: "usr_1", name: "Ops bot" },
      }).principal?.name,
    ).toBe("Ops bot");
    expect(
      Schema.decodeUnknownSync(PulseMcpWardenCredential)({
        credentialRef: "urn:pulse:acme:credential:gh-token",
        resourceRef: "urn:pulse:acme:resource:github",
        available: true,
        grant: { status: "active", expiresAt: "2026-09-25T00:00:00.000Z" },
      }).grant.status,
    ).toBe("active");
    const result = Schema.decodeUnknownSync(PulseMcpPrepareTurnResult)({
      status: "failed",
      selectedConnectionIds: ["github"],
      connections: [
        {
          connectionId: "github",
          name: "GitHub",
          status: "failed",
          reason: "warden-grant-required",
          message: "Pulse Go has no active grant for this credential.",
        },
      ],
    });
    expect(
      result.status === "failed" &&
        result.connections[0]?.status === "failed" &&
        result.connections[0].reason,
    ).toBe("warden-grant-required");
  });
});
