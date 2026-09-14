// @effect-diagnostics nodeBuiltinImport:off -- Pure path calculation is shared by the bounded Node config reader.
import * as NodePath from "node:path";
import * as Predicate from "effect/Predicate";
import { parse as parseJsoncDocument, type ParseError } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";

export type PulseMcpDiscoverySource = "claude" | "codex" | "opencode";

export interface PulseMcpDiscoveryCandidate {
  readonly id: string;
  readonly name: string;
  readonly source: PulseMcpDiscoverySource;
  readonly transport: "stdio" | "http" | "unsupported";
  readonly importable: boolean;
  readonly reason?: string;
  readonly following?: boolean;
}

type DiscoveredConfig =
  | {
      readonly transport: "stdio";
      readonly command: string;
      readonly args?: readonly string[];
      readonly cwd?: string;
      readonly env?: Readonly<Record<string, string>>;
    }
  | {
      readonly transport: "http";
      readonly url: string;
      readonly headers?: Readonly<Record<string, string>>;
    };

export interface InternalCandidate extends PulseMcpDiscoveryCandidate {
  readonly config?: DiscoveredConfig;
}

const strings = (value: unknown): readonly string[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined;

const stringRecord = (value: unknown): Readonly<Record<string, string>> | undefined =>
  Predicate.isReadonlyObject(value) &&
  !Array.isArray(value) &&
  Object.values(value).every((item) => typeof item === "string")
    ? (value as Record<string, string>)
    : undefined;

const expandVariables = (
  source: PulseMcpDiscoverySource,
  value: string,
  environment: Readonly<Record<string, string | undefined>>,
) => {
  const missing = new Set<string>();
  let expanded = value;
  if (source === "claude")
    expanded = expanded.replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g,
      (_, name, fallback) => {
        const resolved = environment[name] ?? fallback;
        if (resolved === undefined) {
          missing.add(name);
          return "";
        }
        return resolved;
      },
    );
  if (source === "opencode")
    expanded = expanded.replace(/\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name) => {
      const resolved = environment[name];
      if (resolved === undefined) {
        missing.add(name);
        return "";
      }
      return resolved;
    });
  return { expanded, missing: [...missing] };
};

const candidateId = (name: string) => {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return /^[a-z]/.test(normalized) ? normalized.slice(0, 64) : `mcp-${normalized}`.slice(0, 64);
};

const decodeServer = (
  source: PulseMcpDiscoverySource,
  name: string,
  value: unknown,
  environment: Readonly<Record<string, string | undefined>> = {},
): InternalCandidate => {
  const base = { id: candidateId(name), name, source } as const;
  if (!Predicate.isReadonlyObject(value) || Array.isArray(value))
    return {
      ...base,
      transport: "unsupported",
      importable: false,
      reason: "Invalid server entry.",
    };
  const openCodeCommand = source === "opencode" ? strings(value.command) : undefined;
  const command = typeof value.command === "string" ? value.command : openCodeCommand?.[0];
  const url = typeof value.url === "string" ? value.url : undefined;
  if (command) {
    const args =
      openCodeCommand?.slice(1) ?? (value.args === undefined ? undefined : strings(value.args));
    const environmentValue = value.env ?? value.environment;
    const env = environmentValue === undefined ? undefined : stringRecord(environmentValue);
    if (args === undefined && value.args !== undefined)
      return {
        ...base,
        transport: "stdio",
        importable: false,
        reason: "Arguments must be strings.",
      };
    if (env === undefined && environmentValue !== undefined)
      return {
        ...base,
        transport: "stdio",
        importable: false,
        reason: "Environment values must be strings.",
      };
    const expandedValues = [command, ...(args ?? []), ...Object.values(env ?? {})].map((item) =>
      expandVariables(source, item, environment),
    );
    const missing = [...new Set(expandedValues.flatMap((item) => item.missing))];
    if (missing.length > 0)
      return {
        ...base,
        transport: "stdio",
        importable: false,
        reason: `Missing environment variables: ${missing.join(", ")}.`,
      };
    let index = 0;
    const expandedCommand = expandedValues[index++]!.expanded;
    const expandedArgs = (args ?? []).map(() => expandedValues[index++]!.expanded);
    const expandedEnv = Object.fromEntries(
      Object.keys(env ?? {}).map((key) => [key, expandedValues[index++]!.expanded]),
    );
    return {
      ...base,
      transport: "stdio",
      importable: true,
      config: {
        transport: "stdio",
        command: expandedCommand,
        ...(args ? { args: expandedArgs } : {}),
        ...(typeof value.cwd === "string" ? { cwd: value.cwd } : {}),
        ...(env ? { env: expandedEnv } : {}),
      },
    };
  }
  if (url) {
    const headers = value.headers === undefined ? undefined : stringRecord(value.headers);
    if (headers === undefined && value.headers !== undefined)
      return {
        ...base,
        transport: "http",
        importable: false,
        reason: "Header values must be strings.",
      };
    const expandedUrl = expandVariables(source, url, environment);
    const expandedHeaders = Object.fromEntries(
      Object.entries(headers ?? {}).map(([key, item]) => [
        key,
        expandVariables(source, item, environment),
      ]),
    );
    const missing = [
      ...new Set([expandedUrl, ...Object.values(expandedHeaders)].flatMap((item) => item.missing)),
    ];
    if (missing.length > 0)
      return {
        ...base,
        transport: "http",
        importable: false,
        reason: `Missing environment variables: ${missing.join(", ")}.`,
      };
    try {
      const parsed = new URL(expandedUrl.expanded);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error();
    } catch {
      return {
        ...base,
        transport: "http",
        importable: false,
        reason: "URL must use HTTP or HTTPS.",
      };
    }
    return {
      ...base,
      transport: "http",
      importable: true,
      config: {
        transport: "http",
        url: expandedUrl.expanded,
        ...(headers
          ? {
              headers: Object.fromEntries(
                Object.entries(expandedHeaders).map(([key, item]) => [key, item.expanded]),
              ),
            }
          : {}),
      },
    };
  }
  return {
    ...base,
    transport: "unsupported",
    importable: false,
    reason: "Only stdio and HTTP servers can be imported.",
  };
};

export function parseJsonMcpServers(
  source: "claude" | "opencode",
  raw: string,
  environment: Readonly<Record<string, string | undefined>> = {},
): readonly InternalCandidate[] {
  const errors: ParseError[] = [];
  const document: unknown = parseJsoncDocument(raw, errors, { allowTrailingComma: true });
  if (errors.length > 0) throw new Error("Invalid JSON configuration.");
  if (!Predicate.isReadonlyObject(document) || Array.isArray(document)) return [];
  const servers = document.mcpServers ?? document.mcp;
  if (!Predicate.isReadonlyObject(servers) || Array.isArray(servers)) return [];
  return Object.entries(servers).map(([name, value]) =>
    decodeServer(source, name, value, environment),
  );
}

export function parseCodexMcpServers(
  raw: string,
  environment: Readonly<Record<string, string | undefined>> = {},
): readonly InternalCandidate[] {
  const document = parseToml(raw);
  const servers =
    Predicate.isReadonlyObject(document.mcp_servers) && !Array.isArray(document.mcp_servers)
      ? document.mcp_servers
      : {};
  return Object.entries(servers).map(([name, rawValue]) => {
    if (!Predicate.isReadonlyObject(rawValue) || Array.isArray(rawValue))
      return decodeServer("codex", name, rawValue, environment);
    const value = { ...rawValue };
    const unsupported = [
      "enabled_tools",
      "disabled_tools",
      "tools",
      "tool_approvals",
      "default_tools_approval_mode",
      "oauth",
      "http_headers_helper",
    ].filter((key) => value[key] !== undefined);
    if (unsupported.length > 0)
      return {
        id: candidateId(name),
        name,
        source: "codex" as const,
        transport: typeof value.url === "string" ? ("http" as const) : ("stdio" as const),
        importable: false,
        reason: `Unsupported Codex settings: ${unsupported.join(", ")}.`,
      };
    const headers =
      Predicate.isReadonlyObject(value.http_headers) && !Array.isArray(value.http_headers)
        ? { ...value.http_headers }
        : {};
    if (
      Predicate.isReadonlyObject(value.env_http_headers) &&
      !Array.isArray(value.env_http_headers)
    ) {
      for (const [header, variable] of Object.entries(value.env_http_headers)) {
        if (typeof variable !== "string") continue;
        const resolved = environment[variable];
        if (resolved === undefined)
          return {
            id: candidateId(name),
            name,
            source: "codex" as const,
            transport: "http" as const,
            importable: false,
            reason: `Missing environment variables: ${variable}.`,
          };
        headers[header] = resolved;
      }
    }
    if (typeof value.bearer_token_env_var === "string") {
      const resolved = environment[value.bearer_token_env_var];
      if (resolved === undefined)
        return {
          id: candidateId(name),
          name,
          source: "codex" as const,
          transport: "http" as const,
          importable: false,
          reason: `Missing environment variables: ${value.bearer_token_env_var}.`,
        };
      headers.Authorization = `Bearer ${resolved}`;
    }
    value.headers = headers;
    const env =
      Predicate.isReadonlyObject(value.env) && !Array.isArray(value.env) ? { ...value.env } : {};
    if (Array.isArray(value.env_vars)) {
      for (const key of value.env_vars)
        if (typeof key === "string" && environment[key] !== undefined) env[key] = environment[key];
      const missing = value.env_vars.filter(
        (key) => typeof key === "string" && environment[key] === undefined,
      );
      if (missing.length > 0)
        return {
          id: candidateId(name),
          name,
          source: "codex" as const,
          transport: "stdio" as const,
          importable: false,
          reason: `Missing environment variables: ${missing.join(", ")}.`,
        };
    }
    value.env = env;
    return decodeServer("codex", name, value, environment);
  });
}

export const defaultMcpDiscoveryPaths = (input: {
  readonly homeDir: string;
  readonly codexHome?: string;
  readonly xdgConfigHome?: string;
}) => ({
  claude: NodePath.join(input.homeDir, ".claude.json"),
  codex: NodePath.join(input.codexHome ?? NodePath.join(input.homeDir, ".codex"), "config.toml"),
  opencode: [
    NodePath.join(
      input.xdgConfigHome ?? NodePath.join(input.homeDir, ".config"),
      "opencode",
      "opencode.json",
    ),
    NodePath.join(
      input.xdgConfigHome ?? NodePath.join(input.homeDir, ".config"),
      "opencode",
      "opencode.jsonc",
    ),
  ],
});

export const publicMcpDiscoveryCandidate = (
  candidate: InternalCandidate,
): PulseMcpDiscoveryCandidate => ({
  id: candidate.id,
  name: candidate.name,
  source: candidate.source,
  transport: candidate.transport,
  importable: candidate.importable,
  ...(candidate.reason ? { reason: candidate.reason } : {}),
});

export const discoveredMcpInput = (candidate: InternalCandidate) => {
  if (!candidate.importable || !candidate.config) return undefined;
  const config =
    candidate.config.transport === "stdio"
      ? {
          ...candidate.config,
          env: Object.fromEntries(
            Object.entries(candidate.config.env ?? {}).map(([key, value]) => [
              key,
              { type: "secret" as const, value },
            ]),
          ),
        }
      : {
          ...candidate.config,
          headers: Object.fromEntries(
            Object.entries(candidate.config.headers ?? {}).map(([key, value]) => [
              key,
              { type: "secret" as const, value },
            ]),
          ),
        };
  return { id: candidate.id, name: candidate.name, createOnly: true as const, config };
};
