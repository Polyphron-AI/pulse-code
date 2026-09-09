// @effect-diagnostics nodeBuiltinImport:off
import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_SERVER_SETTINGS, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as NodeChildProcess from "node:child_process";
import {
  acpMcpServers,
  claudeMcpServers,
  codexMcpOptions,
  mcpFingerprint,
  selectMcpConnections,
  setExternalMcp,
  readExternalMcp,
  clearExternalMcp,
  STDIO_BRIDGE,
} from "./ExternalMcp.ts";

const codex = ProviderInstanceId.make("codex");
const http = {
  type: "http" as const,
  url: "https://example.com/mcp",
  headers: { Authorization: "Bearer private-token" },
};
describe("external MCP selection", () => {
  it("combines defaults with explicit on/off and restored defaults without leaking between threads or providers", () => {
    const settings = {
      ...DEFAULT_SERVER_SETTINGS,
      mcpServers: {
        always: { name: "Default", defaultProviders: [codex], connection: http },
        manual: { name: "Manual", defaultProviders: [], connection: http },
      },
      threadMcpOverrides: { chosen: { always: false, manual: true }, reset: { always: null } },
    };
    expect(Object.keys(selectMcpConnections(settings, codex, "other"))).toEqual(["always"]);
    expect(Object.keys(selectMcpConnections(settings, codex, "chosen"))).toEqual(["manual"]);
    expect(Object.keys(selectMcpConnections(settings, codex, "reset"))).toEqual(["always"]);
    expect(selectMcpConnections(settings, "claudeAgent", "other")).toEqual({});
  });
  it("keeps session snapshots isolated and clears them", () => {
    const a = ThreadId.make("mcp-a");
    const b = ThreadId.make("mcp-b");
    setExternalMcp(a, { tools: http });
    expect(readExternalMcp(b)).toEqual({});
    clearExternalMcp(a);
    expect(readExternalMcp(a)).toEqual({});
  });
  it("ignores key order but detects credential changes in the session fingerprint", () => {
    expect(mcpFingerprint({ a: http, b: http })).toBe(mcpFingerprint({ b: http, a: http }));
    expect(mcpFingerprint({ a: http })).not.toBe(mcpFingerprint({ a: { ...http, headers: {} } }));
  });
  it("translates HTTP and stdio for Claude and ACP", () => {
    const stdio = {
      type: "stdio" as const,
      command: "python",
      args: ["-m", "tools"],
      env: { TOKEN: "secret" },
    };
    expect(claudeMcpServers({ remote: http, local: stdio })).toEqual({
      remote: http,
      local: stdio,
    });
    expect(acpMcpServers({ local: stdio })[0]).toEqual({
      name: "local",
      command: "python",
      args: ["-m", "tools"],
      env: [{ name: "TOKEN", value: "secret" }],
    });
    expect(acpMcpServers({ remote: http })[0]).toMatchObject({
      type: "http",
      headers: [{ name: "Authorization", value: "Bearer private-token" }],
    });
  });
  it("keeps HTTP credentials out of Codex arguments", () => {
    const options = codexMcpOptions({ remote: http });
    expect(options.args.join(" ")).not.toContain("private-token");
    expect(Object.values(options.environment)).toContain("Bearer private-token");
    expect(options.args.join(" ")).toContain("env_http_headers");
  });
  it("runs stdio children with separate credentials even when variable names match", () => {
    const local = (token: string) => ({
      type: "stdio" as const,
      command: process.execPath,
      args: ["-e", "process.stdout.write(process.env.TOKEN)"],
      env: { TOKEN: token },
    });
    const options = codexMcpOptions({
      first: local("first-secret"),
      second: local("second-secret"),
    });
    expect(options.args.join(" ")).not.toContain("first-secret");
    const outputs = Object.keys(options.environment).map((key) =>
      NodeChildProcess.spawnSync(process.execPath, ["-e", STDIO_BRIDGE, key], {
        env: { ...process.env, ...options.environment },
        encoding: "utf8",
        timeout: 5000,
      }),
    );
    expect(outputs.map((result) => result.status)).toEqual([0, 0]);
    expect(outputs.map((result) => result.stdout)).toEqual(["first-secret", "second-secret"]);
  });
});
