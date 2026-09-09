import { describe, expect, it } from "vite-plus/test";
import { parseMcpConnection } from "./McpSettingsPanel";

describe("MCP config import", () => {
  it("accepts a pasted single-server stdio config", () => {
    expect(
      parseMcpConnection(
        '{"mcpServers":{"tools":{"command":"python","args":["-m","tools"],"env":{"TOKEN":"test"}}}}',
      ),
    ).toEqual({ type: "stdio", command: "python", args: ["-m", "tools"], env: { TOKEN: "test" } });
  });
  it("accepts HTTP headers", () => {
    expect(
      parseMcpConnection(
        '{"url":"https://example.com/mcp","headers":{"Authorization":"Bearer test"}}',
      ),
    ).toMatchObject({ type: "http", headers: { Authorization: "Bearer test" } });
  });
  it.each([
    "null",
    "[]",
    "{}",
    '{"mcpServers":{}}',
    '{"url":"invalid-url"}',
    '{"type":"sse","url":"https://example.com"}',
    '{"command":"python","env":{"TOKEN":42}}',
    '{"mcpServers":{"one":{"command":"a"},"two":{"command":"b"}}}',
  ])("rejects invalid or ambiguous connections: %s", (input) => {
    expect(() => parseMcpConnection(input)).toThrow();
  });
});
