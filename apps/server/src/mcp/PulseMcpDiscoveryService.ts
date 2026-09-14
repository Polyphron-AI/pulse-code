// @effect-diagnostics nodeBuiltinImport:off runEffectInsideEffect:off -- Promise serialization bridges the existing Effect-backed config store.
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as NodeFsp from "node:fs/promises";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import { PulseMcpError } from "@t3tools/contracts";

import {
  PulseMcpConfigError,
  type PulseMcpConfigServiceShape,
  type PulseMcpStoredConnection,
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
  readonly identity?: () => Promise<string>;
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
  const enqueue = <A>(operation: () => Promise<A>) => {
    const result = mutation.then(operation, operation);
    mutation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
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
    const identities = new Set<string>();
    for (const file of input.files) {
      try {
        if (file.identity) {
          const identity = await file.identity();
          if (identities.has(identity)) continue;
          identities.add(identity);
        }
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
          enqueue(async () => {
            const candidates = await read(new AbortController().signal);
            const state = await readApprovals();
            const previous = state.sources[source]?.seen ?? [];
            await writeApprovals({
              ...state,
              sources: {
                ...state.sources,
                [source]: {
                  followNew,
                  seen: [
                    ...new Set([
                      ...previous,
                      ...candidates
                        .filter((candidate) => candidate.source === source)
                        .map((candidate) => candidate.name),
                    ]),
                  ],
                },
              },
            });
          }),
        catch: () => new PulseMcpError({ message: "MCP discovery preference could not be saved." }),
      }),
    syncFollowed: () =>
      Effect.tryPromise({
        try: () =>
          enqueue(async () => {
            const state = await readApprovals();
            const candidates = await read(new AbortController().signal);
            let next = state;
            for (const source of ["claude", "codex", "opencode"] as const) {
              const approval = next.sources[source];
              if (!approval?.followNew) continue;
              const seen = new Set(approval.seen);
              const sourceCandidates = candidates.filter((item) => item.source === source);
              const nameCounts = new Map<string, number>();
              for (const candidate of sourceCandidates)
                nameCounts.set(candidate.name, (nameCounts.get(candidate.name) ?? 0) + 1);
              for (const candidate of sourceCandidates.filter(
                (item) => !seen.has(item.name) && nameCounts.get(item.name) === 1,
              )) {
                const connection = discoveredMcpInput(candidate);
                if (!connection) {
                  seen.add(candidate.name);
                  continue;
                }
                try {
                  await Effect.runPromise(input.config.upsertConnection(connection));
                  seen.add(candidate.name);
                } catch (error) {
                  if (
                    error instanceof PulseMcpConfigError &&
                    error.operation === "validate" &&
                    error.message === "An MCP connection with this ID already exists."
                  ) {
                    seen.add(candidate.name);
                  }
                  // Transient storage failures remain unseen so the next scheduled pass retries.
                }
              }
              next = {
                ...next,
                sources: { ...next.sources, [source]: { ...approval, seen: [...seen] } },
              };
            }
            await writeApprovals(next);
          }),
        catch: () =>
          new PulseMcpError({ message: "Followed MCP sources could not be synchronized." }),
      }),
  };
}

const MAX_CONFIG_BYTES = 2 * 1024 * 1024;

export async function discoveryFileIdentity(
  path: string,
  platform = process.platform,
): Promise<string> {
  const resolved = await NodeFsp.realpath(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return NodePath.resolve(path);
    throw error;
  });
  return platform === "win32" ? resolved.toLowerCase() : resolved;
}

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
    identity: () => discoveryFileIdentity(path),
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
