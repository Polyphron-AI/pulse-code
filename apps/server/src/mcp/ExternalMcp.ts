import {
  isMcpEnabled,
  type McpConnection,
  type ServerSettings,
  type ThreadId,
} from "@t3tools/contracts";
import * as NodeCrypto from "node:crypto";

export type Connections = Readonly<Record<string, McpConnection>>;
const connections = new Map<ThreadId, Connections>();
const empty: Connections = {};

export function selectMcpConnections(
  settings: ServerSettings,
  instanceId: string,
  threadId: string,
): Connections {
  return Object.fromEntries(
    Object.entries(settings.mcpServers).flatMap(([id, server]) =>
      server.connection &&
      isMcpEnabled(server, instanceId, settings.threadMcpOverrides[threadId]?.[id])
        ? [[id, server.connection]]
        : [],
    ),
  );
}
export function setExternalMcp(threadId: ThreadId, value: Connections) {
  connections.set(threadId, value);
}
export function readExternalMcp(threadId: ThreadId): Connections {
  return connections.get(threadId) ?? empty;
}
export function clearExternalMcp(threadId: ThreadId) {
  connections.delete(threadId);
}
export function clearAllExternalMcp() {
  connections.clear();
}
export function mcpFingerprint(value: Connections): string {
  const canonical = (item: unknown): unknown =>
    Array.isArray(item)
      ? item.map(canonical)
      : item !== null && typeof item === "object"
        ? Object.fromEntries(
            Object.entries(item)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, child]) => [key, canonical(child)]),
          )
        : item;
  return NodeCrypto.createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

export function acpMcpServers(value: Connections) {
  return Object.entries(value).map(([name, connection]) =>
    connection.type === "http"
      ? {
          type: "http" as const,
          name,
          url: connection.url,
          headers: Object.entries(connection.headers ?? {}).map(([name, value]) => ({
            name,
            value,
          })),
        }
      : {
          name,
          command: connection.command,
          args: [...(connection.args ?? [])],
          env: Object.entries(connection.env ?? {}).map(([name, value]) => ({ name, value })),
        },
  );
}

export function claudeMcpServers(value: Connections) {
  return Object.fromEntries(
    Object.entries(value).map(([name, connection]) => [
      name,
      connection.type === "http"
        ? { ...connection, headers: { ...connection.headers } }
        : { ...connection, args: [...(connection.args ?? [])], env: { ...connection.env } },
    ]),
  );
}

// TOML string values use JSON-compatible basic-string escaping. Credentials go
// through the process environment, never through Codex's command-line arguments.
export const STDIO_BRIDGE = `const { spawn } = require("node:child_process");
const key = process.argv[1];
const config = JSON.parse(process.env[key]);
const env = { ...process.env, ...config.env };
delete env[key];
const child = spawn(config.command, config.args || [], { stdio: "inherit", env });
child.on("error", () => { process.stderr.write("MCP command could not start. Check its command and dependencies.\\n"); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));`;

export function codexMcpOptions(value: Connections) {
  const args: string[] = [];
  const environment: Record<string, string> = {};
  for (const [name, connection] of Object.entries(value)) {
    const prefix = `mcp_servers.${JSON.stringify(name)}`;
    const add = (key: string, val: string | readonly string[]) =>
      args.push("-c", `${prefix}.${key}=${JSON.stringify(val)}`);
    if (connection.type === "stdio") {
      const envNames = Object.keys(connection.env ?? {});
      if (envNames.length) {
        const ref = `PULSE_MCP_STDIO_${Buffer.from(name).toString("hex").toUpperCase()}`;
        environment[ref] = JSON.stringify(connection);
        // The bridge gives each stdio child its own environment, even when
        // two MCPs use the same credential variable with different values.
        add("command", process.execPath);
        add("args", ["-e", STDIO_BRIDGE, ref]);
        add("env_vars", [ref]);
      } else {
        add("command", connection.command);
        add("args", connection.args ?? []);
      }
    } else {
      add("url", connection.url);
      for (const [key, val] of Object.entries(connection.headers ?? {})) {
        const ref = `PULSE_MCP_${Buffer.from(name + ":" + key)
          .toString("hex")
          .toUpperCase()}`;
        environment[ref] = val;
        add(`env_http_headers.${JSON.stringify(key)}`, ref);
      }
    }
  }
  return { args, environment };
}
