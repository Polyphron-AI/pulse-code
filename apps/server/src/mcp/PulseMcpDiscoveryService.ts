// @effect-diagnostics nodeBuiltinImport:off runEffectInsideEffect:off -- Promise serialization bridges the existing Effect-backed config store.
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as NodeFsp from "node:fs/promises";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import { PulseMcpError } from "@t3tools/contracts";

import type {
  PulseMcpConfigServiceShape,
  PulseMcpStoredConnection,
} from "./PulseMcpConfigService.ts";
import {
  discoveredMcpInput,
  parseCodexMcpServers,
  parseJsonMcpServers,
  publicMcpDiscoveryCandidate,
  type PulseMcpDiscoveryCandidate,
  type PulseMcpDiscoverySource,
  defaultMcpDiscoveryPaths,
} from "./PulseMcpDiscovery.ts";

interface DiscoveryFile {
  readonly source: PulseMcpDiscoverySource;
  readonly read: (signal: AbortSignal) => Promise<string | undefined>;
}

export interface PulseMcpDiscoveryService {
  readonly discover: () => Effect.Effect<readonly PulseMcpDiscoveryCandidate[], PulseMcpError>;
  readonly import: (input: {
    readonly source: PulseMcpDiscoverySource;
    readonly name: string;
  }) => Effect.Effect<
    PulseMcpStoredConnection,
    PulseMcpError | import("./PulseMcpConfigService.ts").PulseMcpConfigError
  >;
  readonly setFollow: (input: {
    readonly source: PulseMcpDiscoverySource;
    readonly followNew: boolean;
  }) => Effect.Effect<void, PulseMcpError>;
  readonly syncFollowed: () => Effect.Effect<void, PulseMcpError>;
}

export function makePulseMcpDiscoveryService(input: {
  readonly files: readonly DiscoveryFile[];
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly config: PulseMcpConfigServiceShape;
  readonly approvalsPath?: string;
}): PulseMcpDiscoveryService {
  type ApprovalState = {
    readonly version: 1;
    readonly sources: Partial<
      Record<
        PulseMcpDiscoverySource,
        { readonly followNew: boolean; readonly seen: readonly string[] }
      >
    >;
  };
  let mutation = Promise.resolve();
  const readApprovals = async (): Promise<ApprovalState> => {
    if (!input.approvalsPath) return { version: 1, sources: {} };
    try {
      const value: unknown = JSON.parse(await NodeFsp.readFile(input.approvalsPath, "utf8"));
      if (
        typeof value !== "object" ||
        value === null ||
        !("version" in value) ||
        value.version !== 1 ||
        !("sources" in value) ||
        typeof value.sources !== "object" ||
        value.sources === null
      )
        throw new Error();
      return value as ApprovalState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, sources: {} };
      throw new Error("MCP discovery approvals could not be read.");
    }
  };
  const writeApprovals = async (state: ApprovalState) => {
    if (!input.approvalsPath) return;
    await NodeFsp.mkdir(NodePath.dirname(input.approvalsPath), { recursive: true });
    const temporary = `${input.approvalsPath}.${process.pid}.tmp`;
    await NodeFsp.writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await NodeFsp.rename(temporary, input.approvalsPath);
  };
  const read = async (signal: AbortSignal) => {
    const candidates = [];
    for (const file of input.files) {
      try {
        const raw = await file.read(signal);
        if (raw === undefined) continue;
        const parsed =
          file.source === "codex"
            ? parseCodexMcpServers(raw, input.environment)
            : parseJsonMcpServers(file.source, raw, input.environment);
        candidates.push(...parsed);
      } catch {
        candidates.push({
          id: `${file.source}-config`,
          name: `${file.source} user configuration`,
          source: file.source,
          transport: "unsupported" as const,
          importable: false,
          reason: "Configuration could not be read or parsed.",
        });
      }
    }
    return candidates;
  };
  return {
    discover: () =>
      Effect.tryPromise({
        try: async (signal) => {
          const approvals = await readApprovals();
          return (await read(signal)).map((candidate) => ({
            ...publicMcpDiscoveryCandidate(candidate),
            following: approvals.sources[candidate.source]?.followNew === true,
          }));
        },
        catch: () => new PulseMcpError({ message: "MCP discovery failed." }),
      }),
    import: ({ source, name }) =>
      Effect.tryPromise({
        try: async (signal) => {
          const matches = (await read(signal)).filter(
            (candidate) => candidate.source === source && candidate.name === name,
          );
          if (matches.length !== 1)
            throw new PulseMcpError({
              message: matches.length
                ? "Ambiguous discovered MCP server."
                : "Discovered MCP server no longer exists.",
            });
          const connection = discoveredMcpInput(matches[0]!);
          if (!connection)
            throw new PulseMcpError({
              message: matches[0]!.reason ?? "Discovered MCP server cannot be imported.",
            });
          return connection;
        },
        catch: (cause) =>
          Schema.is(PulseMcpError)(cause)
            ? cause
            : new PulseMcpError({ message: "MCP import failed." }),
      }).pipe(Effect.flatMap(input.config.upsertConnection)),
    setFollow: ({ source, followNew }) =>
      Effect.tryPromise({
        try: () =>
          (mutation = mutation.then(async () => {
            const candidates = await read(new AbortController().signal);
            const state = await readApprovals();
            await writeApprovals({
              ...state,
              sources: {
                ...state.sources,
                [source]: {
                  followNew,
                  seen: candidates
                    .filter((candidate) => candidate.source === source)
                    .map((candidate) => candidate.name),
                },
              },
            });
          })),
        catch: () => new PulseMcpError({ message: "MCP discovery preference could not be saved." }),
      }),
    syncFollowed: () =>
      Effect.tryPromise({
        try: () =>
          (mutation = mutation.then(async () => {
            const state = await readApprovals();
            const candidates = await read(new AbortController().signal);
            let next = state;
            for (const source of ["claude", "codex", "opencode"] as const) {
              const approval = next.sources[source];
              if (!approval?.followNew) continue;
              const seen = new Set(approval.seen);
              for (const candidate of candidates.filter(
                (item) => item.source === source && !seen.has(item.name),
              )) {
                seen.add(candidate.name);
                const connection = discoveredMcpInput(candidate);
                if (connection)
                  await Effect.runPromise(input.config.upsertConnection(connection)).catch(
                    () => undefined,
                  );
              }
              next = {
                ...next,
                sources: { ...next.sources, [source]: { ...approval, seen: [...seen] } },
              };
            }
            await writeApprovals(next);
          })),
        catch: () =>
          new PulseMcpError({ message: "Followed MCP sources could not be synchronized." }),
      }),
  };
}

const MAX_CONFIG_BYTES = 2 * 1024 * 1024;

export function makeNodePulseMcpDiscoveryService(
  config: PulseMcpConfigServiceShape,
  stateDir: string,
): PulseMcpDiscoveryService {
  const paths = defaultMcpDiscoveryPaths({
    homeDir: NodeOs.homedir(),
    ...(process.env.CODEX_HOME ? { codexHome: process.env.CODEX_HOME } : {}),
    ...(process.env.XDG_CONFIG_HOME ? { xdgConfigHome: process.env.XDG_CONFIG_HOME } : {}),
  });
  const file = (source: PulseMcpDiscoverySource, path: string): DiscoveryFile => ({
    source,
    read: async (signal) => {
      try {
        const stat = await NodeFsp.stat(path);
        if (!stat.isFile() || stat.size > MAX_CONFIG_BYTES) return undefined;
        return await NodeFsp.readFile(path, { encoding: "utf8", signal });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw error;
      }
    },
  });
  return makePulseMcpDiscoveryService({
    config,
    approvalsPath: NodePath.join(stateDir, "pulse-mcp-discovery.json"),
    environment: process.env,
    files: [
      file("claude", paths.claude),
      file("codex", paths.codex),
      ...paths.opencode.map((path) => file("opencode", path)),
      ...(process.env.OPENCODE_CONFIG ? [file("opencode", process.env.OPENCODE_CONFIG)] : []),
    ],
  });
}
