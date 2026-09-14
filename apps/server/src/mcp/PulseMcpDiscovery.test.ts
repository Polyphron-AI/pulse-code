import { describe, expect, it } from "@effect/vitest";

import {
  discoveredMcpInput,
  parseCodexMcpServers,
  parseJsonMcpServers,
  publicMcpDiscoveryCandidate,
} from "./PulseMcpDiscovery.ts";

describe("Pulse MCP discovery", () => {
  it("parses Claude stdio config without exposing environment values", () => {
    const [candidate] = parseJsonMcpServers(
      "claude",
      JSON.stringify({
        mcpServers: { github: { command: "npx", args: ["server"], env: { TOKEN: "secret" } } },
      }),
    );
    expect(publicMcpDiscoveryCandidate(candidate!)).toEqual({
      id: "github",
      name: "github",
      source: "claude",
      transport: "stdio",
      importable: true,
    });
    expect(JSON.stringify(publicMcpDiscoveryCandidate(candidate!))).not.toContain("secret");
    expect(discoveredMcpInput(candidate!)).toMatchObject({
      createOnly: true,
      config: { env: { TOKEN: { type: "secret", value: "secret" } } },
    });
  });

  it("parses Codex stdio and HTTP server tables", () => {
    const candidates = parseCodexMcpServers(`
      [mcp_servers.local]
      command = "uvx"
      args = ["demo", "--flag"]
      [mcp_servers.remote]
      url = "https://example.test/mcp"
    `);
    expect(candidates.map(publicMcpDiscoveryCandidate)).toEqual([
      { id: "local", name: "local", source: "codex", transport: "stdio", importable: true },
      { id: "remote", name: "remote", source: "codex", transport: "http", importable: true },
    ]);
  });

  it("accepts OpenCode JSONC and explains unsupported transports", () => {
    const candidates = parseJsonMcpServers(
      "opencode",
      `{
      // user configuration
      "mcp": { "events": { "type": "sse", "url": "ftp://example.test" }, },
    }`,
    );
    expect(candidates.map(publicMcpDiscoveryCandidate)).toEqual([
      {
        id: "events",
        name: "events",
        source: "opencode",
        transport: "http",
        importable: false,
        reason: "URL must use HTTP or HTTPS.",
      },
    ]);
  });
});
