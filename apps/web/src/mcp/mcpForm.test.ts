import { describe, expect, it } from "vite-plus/test";

import {
  connectionInputFromDraft,
  draftFromConnection,
  emptyConnectionDraft,
  validateConnectionDraft,
} from "./mcpForm";

describe("MCP connection form", () => {
  it("retains configured secrets without exposing their value", () => {
    const draft = draftFromConnection({
      id: "github",
      name: "GitHub",
      config: {
        transport: "http",
        url: "https://example.com/mcp",
        headers: { Authorization: { type: "secret", configured: true } },
      },
    });
    expect(draft.values[0]).toMatchObject({
      value: "",
      configuredSecret: true,
      replaceSecret: false,
    });
    expect(connectionInputFromDraft(draft).config).toEqual({
      transport: "http",
      url: "https://example.com/mcp",
      headers: { Authorization: { type: "retain-secret" } },
    });
    expect(JSON.stringify(draft)).not.toContain("configured: true");
  });

  it("only replaces a configured secret after an explicit replacement", () => {
    const existing = draftFromConnection({
      id: "github",
      name: "GitHub",
      config: {
        transport: "http",
        url: "https://example.com/mcp",
        headers: { Authorization: { type: "secret", configured: true } },
      },
    });
    const draft = {
      ...existing,
      values: existing.values.map((value) => ({
        ...value,
        replaceSecret: true,
        value: "new-token",
      })),
    };
    expect(connectionInputFromDraft(draft).config).toMatchObject({
      headers: { Authorization: { type: "secret", value: "new-token" } },
    });
  });

  it("serializes stdio arguments and environment values", () => {
    const draft = {
      ...emptyConnectionDraft(),
      id: "local",
      name: "Local",
      transport: "stdio" as const,
      command: "npx",
      args: '["-y", "server"]',
      cwd: " C:/repo ",
      values: [
        {
          key: "MODE",
          kind: "literal" as const,
          value: "safe",
          configuredSecret: false,
          replaceSecret: false,
        },
      ],
    };
    expect(validateConnectionDraft(draft)).toBeNull();
    expect(connectionInputFromDraft(draft)).toEqual({
      id: "local",
      name: "Local",
      config: {
        transport: "stdio",
        command: "npx",
        args: ["-y", "server"],
        cwd: "C:/repo",
        env: { MODE: { type: "literal", value: "safe" } },
      },
    });
  });

  it("round-trips stdio arguments without changing whitespace or empty values", () => {
    const connection = {
      id: "local",
      name: "Local",
      config: {
        transport: "stdio" as const,
        command: "node",
        args: ["two words", "", "line\nbreak"],
        env: {},
      },
    };
    expect(connectionInputFromDraft(draftFromConnection(connection))).toEqual(connection);
  });

  it("rejects duplicate names and blank replacement secrets", () => {
    const draft = {
      ...emptyConnectionDraft(),
      id: "valid",
      name: "Valid",
      url: "https://example.com",
      values: [
        {
          key: "Authorization",
          kind: "secret" as const,
          value: "",
          configuredSecret: true,
          replaceSecret: true,
        },
        {
          key: "Authorization",
          kind: "literal" as const,
          value: "x",
          configuredSecret: false,
          replaceSecret: false,
        },
      ],
    };
    expect(validateConnectionDraft(draft)).toBe("Header or environment names must be unique.");
    expect(validateConnectionDraft({ ...draft, values: [draft.values[0]!] })).toBe(
      "Enter a value for each new or replacement secret.",
    );
  });
});
