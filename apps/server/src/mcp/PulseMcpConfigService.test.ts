// @effect-diagnostics preferSchemaOverJson:off -- Tests intentionally construct malformed private persistence documents.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PlatformError from "effect/PlatformError";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import * as PulseMcpConfig from "./PulseMcpConfigService.ts";

const configLayer = ServerConfig.layerTest(process.cwd(), { prefix: "pulse-mcp-config-test-" });
const secretLayer = ServerSecretStore.layer.pipe(Layer.provide(configLayer));
const pulseLayer = PulseMcpConfig.layer.pipe(
  Layer.provide(secretLayer),
  Layer.provide(configLayer),
);
const testLayer = Layer.mergeAll(configLayer, secretLayer, pulseLayer).pipe(
  Layer.provideMerge(NodeServices.layer),
);

const fileSystemFailure = (method: string, path: string) =>
  PlatformError.systemError({
    _tag: "PermissionDenied",
    module: "FileSystem",
    method,
    pathOrDescriptor: path,
    description: `Injected ${method} failure.`,
  });

const layerWithPulseFileSystem = (fileSystem: FileSystem.FileSystem) => {
  const pulse = PulseMcpConfig.layer.pipe(
    Layer.provide(secretLayer),
    Layer.provide(configLayer),
    Layer.provide(Layer.succeed(FileSystem.FileSystem, fileSystem)),
  );
  return Layer.mergeAll(configLayer, secretLayer, pulse).pipe(
    Layer.provideMerge(NodeServices.layer),
  );
};

const readiness = {
  supportsProvider: (provider: string) => provider === "codex" || provider === "claudeAgent",
  checkConnection: async () => ({ status: "unknown" as const }),
};

const addFixtures = Effect.fn(function* () {
  const service = yield* PulseMcpConfig.PulseMcpConfigService;
  yield* service.upsertConnection({
    id: "github",
    name: "GitHub",
    config: {
      transport: "http",
      url: "https://mcp.example.test/github",
      headers: {
        Authorization: { type: "secret", value: "Bearer private-token" },
        "X-Pulse": { type: "literal", value: "enabled" },
      },
    },
  });
  yield* service.upsertConnection({
    id: "local_docs",
    name: "Local docs",
    config: {
      transport: "stdio",
      command: "docs-mcp",
      args: ["--stdio"],
      env: { DOCS_TOKEN: { type: "secret", value: "private-docs-token" } },
    },
  });
  return service;
});

describe("PulseMcpConfigService", () => {
  it.effect("loads version 1 selections without inventing project defaults", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const fs = yield* FileSystem.FileSystem;
      yield* fs.makeDirectory(config.stateDir, { recursive: true });
      yield* fs.writeFileString(
        `${config.stateDir}/pulse-mcp.json`,
        JSON.stringify({
          version: 1,
          connections: {
            github: {
              id: "github",
              name: "GitHub",
              config: { transport: "http", url: "https://mcp.example.test/github", headers: {} },
            },
          },
          providerDefaults: { claude: ["github"] },
          threadOverrides: {},
        }),
      );
      const service = yield* PulseMcpConfig.PulseMcpConfigService;
      expect(yield* service.getProviderDefault(ProviderInstanceId.make("claude"))).toEqual([
        "github",
      ]);
      expect(
        yield* service.getProjectDefault(
          ProjectId.make("project"),
          ProviderInstanceId.make("claude"),
        ),
      ).toBeUndefined();
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("atomically rejects duplicate creates without replacing saved credentials", () =>
    Effect.gen(function* () {
      const service = yield* addFixtures();
      const before = yield* service.listConnections;
      const duplicate = yield* service
        .upsertConnection({
          id: "github",
          name: "Replacement",
          createOnly: true,
          config: { transport: "http", url: "https://replacement.example.test" },
        })
        .pipe(Effect.flip);
      expect(duplicate.message).toContain("already exists");
      expect(yield* service.listConnections).toEqual(before);
      const instanceId = ProviderInstanceId.make("create-check");
      yield* service.setProviderDefault(instanceId, ["github"]);
      const prepared = yield* service.prepareTurn(
        {
          turnId: "create-check",
          provider: "codex",
          providerInstanceId: instanceId,
          threadId: ThreadId.make("create-check"),
        },
        readiness,
      );
      expect(prepared.connections[0]?.config).toMatchObject({
        headers: { Authorization: "Bearer private-token" },
      });
      const create = (name: string) =>
        service
          .upsertConnection({
            id: "concurrent",
            name,
            createOnly: true,
            config: { transport: "http", url: "https://fixture.example.test" },
          })
          .pipe(Effect.option);
      const results = yield* Effect.all([create("First"), create("Second")], { concurrency: 2 });
      expect(results.filter(Option.isSome)).toHaveLength(1);
      expect(
        (yield* service.listConnections).filter((entry) => entry.id === "concurrent"),
      ).toHaveLength(1);
    }).pipe(Effect.provide(testLayer)),
  );
  it.effect(
    "keeps secrets out of durable configuration and materializes them only for a turn",
    () =>
      Effect.gen(function* () {
        const service = yield* addFixtures();
        const config = yield* ServerConfig.ServerConfig;
        const fs = yield* FileSystem.FileSystem;

        const persisted = yield* fs.readFileString(`${config.stateDir}/pulse-mcp.json`);
        expect(persisted).not.toContain("private-token");
        expect(persisted).not.toContain("private-docs-token");
        expect(persisted).toContain("pulse-mcp-connection-github");

        yield* service.setProviderDefault(ProviderInstanceId.make("codex_work"), ["github"]);
        const prepared = yield* service.prepareTurn(
          {
            turnId: "turn-1",
            provider: "codex",
            providerInstanceId: ProviderInstanceId.make("codex_work"),
            threadId: ThreadId.make("thread-1"),
          },
          readiness,
        );
        expect(prepared.connections[0]?.config).toEqual({
          transport: "http",
          url: "https://mcp.example.test/github",
          headers: { Authorization: "Bearer private-token", "X-Pulse": "enabled" },
        });
        expect(prepared.preflight.snapshot.selectionSource).toBe("global");
      }).pipe(Effect.provide(testLayer)),
  );

  it.effect("distinguishes an explicit empty override from reset to defaults", () =>
    Effect.gen(function* () {
      const service = yield* addFixtures();
      const instanceId = ProviderInstanceId.make("claude_work");
      const threadId = ThreadId.make("thread-empty");
      yield* service.setProviderDefault(instanceId, ["github"]);
      yield* service.setThreadOverride(threadId, []);

      const overridden = yield* service.prepareTurn(
        { turnId: "turn-2", provider: "claudeAgent", providerInstanceId: instanceId, threadId },
        readiness,
      );
      expect(overridden.preflight.snapshot).toMatchObject({
        selectedConnectionIds: [],
        selectionSource: "thread",
      });

      yield* service.resetThreadOverride(threadId);
      const reset = yield* service.prepareTurn(
        { turnId: "turn-3", provider: "claudeAgent", providerInstanceId: instanceId, threadId },
        readiness,
      );
      expect(reset.preflight.snapshot).toMatchObject({
        selectedConnectionIds: ["github"],
        selectionSource: "global",
      });
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("freezes different selections for concurrent threads", () =>
    Effect.gen(function* () {
      const service = yield* addFixtures();
      const instanceId = ProviderInstanceId.make("codex_parallel");
      const firstThread = ThreadId.make("thread-a");
      const secondThread = ThreadId.make("thread-b");
      yield* Effect.all(
        [
          service.setThreadOverride(firstThread, ["github"]),
          service.setThreadOverride(secondThread, ["local_docs"]),
        ],
        { concurrency: "unbounded" },
      );

      const [first, second] = yield* Effect.all(
        [
          service.prepareTurn(
            {
              turnId: "turn-a",
              provider: "codex",
              providerInstanceId: instanceId,
              threadId: firstThread,
            },
            readiness,
          ),
          service.prepareTurn(
            {
              turnId: "turn-b",
              provider: "codex",
              providerInstanceId: instanceId,
              threadId: secondThread,
            },
            readiness,
          ),
        ],
        { concurrency: "unbounded" },
      );

      expect(first.preflight.snapshot.selectedConnectionIds).toEqual(["github"]);
      expect(second.preflight.snapshot.selectedConnectionIds).toEqual(["local_docs"]);
      expect(Object.isFrozen(first.preflight.snapshot.selectedConnectionIds)).toBe(true);
      expect(Object.isFrozen(first.connections)).toBe(true);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("resolves thread, project, and global selections in order", () =>
    Effect.gen(function* () {
      const service = yield* addFixtures();
      const instanceId = ProviderInstanceId.make("claude_scoped");
      const projectId = ProjectId.make("project-scoped");
      const threadId = ThreadId.make("thread-scoped");
      yield* service.setProviderDefault(instanceId, ["github"]);

      expect(
        (yield* service.resolveTurnConnections({
          providerInstanceId: instanceId,
          threadId,
        })).map(({ id }) => id),
      ).toEqual(["github"]);

      yield* service.setProjectDefault(projectId, instanceId, ["local_docs"]);
      expect(
        (yield* service.resolveTurnConnections({
          providerInstanceId: instanceId,
          projectId,
          threadId,
        })).map(({ id }) => id),
      ).toEqual(["local_docs"]);

      yield* service.setThreadOverride(threadId, []);
      expect(
        yield* service.resolveTurnConnections({
          providerInstanceId: instanceId,
          projectId,
          threadId,
        }),
      ).toEqual([]);

      yield* service.resetThreadOverride(threadId);
      yield* service.resetProjectDefault(projectId, instanceId);
      expect(
        (yield* service.resolveTurnConnections({
          providerInstanceId: instanceId,
          projectId,
          threadId,
        })).map(({ id }) => id),
      ).toEqual(["github"]);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("does not read or rewrite the shared settings document", () =>
    Effect.gen(function* () {
      const config = yield* ServerConfig.ServerConfig;
      const fs = yield* FileSystem.FileSystem;
      const sentinel = '{"futureClientField":{"keep":true}}\n';
      yield* fs.writeFileString(config.settingsPath, sentinel);
      yield* addFixtures();
      expect(yield* fs.readFileString(config.settingsPath)).toBe(sentinel);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("rejects duplicate persisted IDs through one canonical keyed entry", () =>
    Effect.gen(function* () {
      const service = yield* PulseMcpConfig.PulseMcpConfigService;
      yield* service.upsertConnection({
        id: "same_id",
        name: "First",
        config: { transport: "http", url: "https://first.example.test" },
      });
      yield* service.upsertConnection({
        id: "same_id",
        name: "Replacement",
        config: { transport: "http", url: "https://second.example.test" },
      });
      const connections = yield* service.listConnections;
      expect(connections).toHaveLength(1);
      expect(connections[0]?.name).toBe("Replacement");
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("rejects malformed nested persisted state", () =>
    Effect.gen(function* () {
      const service = yield* PulseMcpConfig.PulseMcpConfigService;
      const config = yield* ServerConfig.ServerConfig;
      const fs = yield* FileSystem.FileSystem;
      const malformedStates = [
        {
          version: 1,
          connections: {
            github: {
              id: "different",
              name: "GitHub",
              config: { transport: "http", url: "https://example.test", headers: {} },
            },
          },
          providerDefaults: {},
          threadOverrides: {},
        },
        {
          version: 1,
          connections: {
            github: {
              id: "github",
              name: "GitHub",
              config: {
                transport: "http",
                url: "https://example.test",
                headers: {
                  Authorization: {
                    type: "secret-ref",
                    secretRef: "pulse-mcp-connection-other-version",
                    key: "Authorization",
                  },
                },
              },
            },
          },
          providerDefaults: {},
          threadOverrides: {},
        },
        {
          version: 1,
          connections: {},
          providerDefaults: { codex: ["missing"] },
          threadOverrides: {},
        },
        {
          version: 1,
          connections: {
            local: {
              id: "local",
              name: "Local",
              config: { transport: "stdio", command: "mcp", args: [1], env: {} },
            },
          },
          providerDefaults: {},
          threadOverrides: {},
        },
      ];

      for (const state of malformedStates) {
        yield* fs.writeFileString(`${config.stateDir}/pulse-mcp.json`, JSON.stringify(state));
        const exit = yield* Effect.exit(service.listConnections);
        expect(exit._tag).toBe("Failure");
      }
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("rotates owned secret references and redacts them from public lists", () =>
    Effect.gen(function* () {
      const service = yield* PulseMcpConfig.PulseMcpConfigService;
      const config = yield* ServerConfig.ServerConfig;
      const fs = yield* FileSystem.FileSystem;
      const secretStore = yield* ServerSecretStore.ServerSecretStore;
      const upsert = (value: string) =>
        service.upsertConnection({
          id: "github",
          name: "GitHub",
          config: {
            transport: "http",
            url: "https://example.test",
            headers: { Authorization: { type: "secret", value } },
          },
        });

      yield* upsert("first");
      const firstState = JSON.parse(yield* fs.readFileString(`${config.stateDir}/pulse-mcp.json`));
      const firstReference = firstState.connections.github.config.headers.Authorization.secretRef;
      expect(firstReference).toMatch(/^pulse-mcp-connection-github-/);
      expect((yield* service.listConnections)[0]?.config).toMatchObject({
        headers: { Authorization: { type: "secret-ref", secretRef: "[redacted]" } },
      });

      yield* upsert("second");
      const secondState = JSON.parse(yield* fs.readFileString(`${config.stateDir}/pulse-mcp.json`));
      const secondReference = secondState.connections.github.config.headers.Authorization.secretRef;
      expect(secondReference).not.toBe(firstReference);
      expect(Option.isNone(yield* secretStore.get(firstReference))).toBe(true);
      expect(Option.isSome(yield* secretStore.get(secondReference))).toBe(true);

      yield* service.upsertConnection({
        id: "github",
        name: "GitHub without auth",
        config: { transport: "http", url: "https://example.test" },
      });
      expect(Option.isNone(yield* secretStore.get(secondReference))).toBe(true);

      yield* upsert("third");
      const thirdState = JSON.parse(yield* fs.readFileString(`${config.stateDir}/pulse-mcp.json`));
      const thirdReference = thirdState.connections.github.config.headers.Authorization.secretRef;
      yield* service.removeConnection("github");
      expect(Option.isNone(yield* secretStore.get(thirdReference))).toBe(true);
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("holds rotation until a turn has materialized its selected secrets", () =>
    Effect.gen(function* () {
      const readStarted = yield* Deferred.make<void>();
      const releaseRead = yield* Deferred.make<void>();
      const rotationStored = yield* Deferred.make<void>();
      const values = new Map<string, Uint8Array>();
      let gateNextRead = false;
      let rotationExpected = false;
      const gatedSecrets = ServerSecretStore.ServerSecretStore.of({
        get: (name) =>
          Effect.gen(function* () {
            if (gateNextRead) {
              gateNextRead = false;
              yield* Deferred.succeed(readStarted, undefined);
              yield* Deferred.await(releaseRead);
            }
            const value = values.get(name);
            return value === undefined ? Option.none() : Option.some(Uint8Array.from(value));
          }),
        set: (name, value) => Effect.sync(() => void values.set(name, Uint8Array.from(value))),
        create: (name, value) =>
          Effect.sync(() => void values.set(name, Uint8Array.from(value))).pipe(
            Effect.tap(() =>
              rotationExpected ? Deferred.succeed(rotationStored, undefined) : Effect.void,
            ),
          ),
        getOrCreateRandom: (_name, bytes) => Effect.succeed(new Uint8Array(bytes)),
        remove: (name) => Effect.sync(() => void values.delete(name)),
      });
      const gatedSecretLayer = Layer.succeed(ServerSecretStore.ServerSecretStore, gatedSecrets);
      const gatedPulseLayer = PulseMcpConfig.layer.pipe(
        Layer.provide(gatedSecretLayer),
        Layer.provide(configLayer),
      );
      const gatedLayer = Layer.mergeAll(configLayer, gatedSecretLayer, gatedPulseLayer).pipe(
        Layer.provideMerge(NodeServices.layer),
      );

      yield* Effect.scoped(
        Effect.gen(function* () {
          const service = yield* PulseMcpConfig.PulseMcpConfigService;
          const instanceId = ProviderInstanceId.make("codex_race");
          yield* service.upsertConnection({
            id: "github",
            name: "GitHub",
            config: {
              transport: "http",
              url: "https://example.test",
              headers: { Authorization: { type: "secret", value: "first" } },
            },
          });
          yield* service.setProviderDefault(instanceId, ["github"]);
          gateNextRead = true;
          const preparing = yield* Effect.forkChild(
            service.prepareTurn(
              {
                turnId: "turn-race",
                provider: "codex",
                providerInstanceId: instanceId,
                threadId: ThreadId.make("thread-race"),
              },
              readiness,
            ),
          );
          yield* Deferred.await(readStarted);
          rotationExpected = true;
          const rotating = yield* Effect.forkChild(
            service.upsertConnection({
              id: "github",
              name: "GitHub",
              config: {
                transport: "http",
                url: "https://example.test",
                headers: { Authorization: { type: "secret", value: "second" } },
              },
            }),
          );
          expect(Option.isNone(yield* Deferred.poll(rotationStored))).toBe(true);
          yield* Deferred.succeed(releaseRead, undefined);
          const prepared = yield* Fiber.join(preparing);
          yield* Fiber.join(rotating);
          expect(prepared.connections[0]?.config).toMatchObject({
            headers: { Authorization: "first" },
          });
        }),
      ).pipe(Effect.provide(gatedLayer));
    }),
  );

  it.effect("treats rename as the commit point when post-rename chmod fails", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const failing = FileSystem.FileSystem.of({
        ...fileSystem,
        chmod: (path, mode) =>
          String(path).endsWith("pulse-mcp.json")
            ? Effect.fail(fileSystemFailure("chmod", String(path)))
            : fileSystem.chmod(path, mode),
      });

      yield* Effect.gen(function* () {
        const service = yield* PulseMcpConfig.PulseMcpConfigService;
        yield* service.upsertConnection({
          id: "committed",
          name: "Committed",
          config: {
            transport: "http",
            url: "https://example.test",
            headers: { Authorization: { type: "secret", value: "still-present" } },
          },
        });
        yield* service.setProviderDefault(ProviderInstanceId.make("codex_commit"), ["committed"]);
        const prepared = yield* service.prepareTurn(
          {
            turnId: "turn-commit",
            provider: "codex",
            providerInstanceId: ProviderInstanceId.make("codex_commit"),
            threadId: ThreadId.make("thread-commit"),
          },
          readiness,
        );
        expect(prepared.connections[0]?.config).toMatchObject({
          headers: { Authorization: "still-present" },
        });
      }).pipe(Effect.provide(layerWithPulseFileSystem(failing)));
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("finishes publishing config when interrupted after secret creation", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const renameStarted = yield* Deferred.make<void>();
      const releaseRename = yield* Deferred.make<void>();
      const gated = FileSystem.FileSystem.of({
        ...fileSystem,
        rename: (from, to) =>
          String(to).endsWith("pulse-mcp.json")
            ? Deferred.succeed(renameStarted, undefined).pipe(
                Effect.flatMap(() => Deferred.await(releaseRename)),
                Effect.flatMap(() => fileSystem.rename(from, to)),
              )
            : fileSystem.rename(from, to),
      });

      yield* Effect.scoped(
        Effect.gen(function* () {
          const service = yield* PulseMcpConfig.PulseMcpConfigService;
          const publishing = yield* Effect.forkChild(
            service.upsertConnection({
              id: "interrupted",
              name: "Interrupted",
              config: {
                transport: "http",
                url: "https://example.test",
                headers: { Authorization: { type: "secret", value: "published" } },
              },
            }),
          );
          yield* Deferred.await(renameStarted);
          const interrupting = yield* Effect.forkChild(Fiber.interrupt(publishing));
          yield* Deferred.succeed(releaseRename, undefined);
          yield* Fiber.join(interrupting);
          expect((yield* service.listConnections).map(({ id }) => id)).toContain("interrupted");
          const providerInstanceId = ProviderInstanceId.make("codex_interrupted");
          yield* service.setProviderDefault(providerInstanceId, ["interrupted"]);
          const prepared = yield* service.prepareTurn(
            {
              turnId: "turn-interrupted",
              provider: "codex",
              providerInstanceId,
              threadId: ThreadId.make("thread-interrupted"),
            },
            readiness,
          );
          expect(prepared.connections[0]?.config).toMatchObject({
            headers: { Authorization: "published" },
          });
        }),
      ).pipe(Effect.provide(layerWithPulseFileSystem(gated)));
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("removes a newly created secret when config rename fails before commit", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const failing = FileSystem.FileSystem.of({
        ...fileSystem,
        rename: (from, to) =>
          String(to).endsWith("pulse-mcp.json")
            ? Effect.fail(fileSystemFailure("rename", `${String(from)} -> ${String(to)}`))
            : fileSystem.rename(from, to),
      });

      yield* Effect.gen(function* () {
        const service = yield* PulseMcpConfig.PulseMcpConfigService;
        const config = yield* ServerConfig.ServerConfig;
        const result = yield* Effect.exit(
          service.upsertConnection({
            id: "not_committed",
            name: "Not committed",
            config: {
              transport: "http",
              url: "https://example.test",
              headers: { Authorization: { type: "secret", value: "remove-me" } },
            },
          }),
        );
        expect(result._tag).toBe("Failure");
        expect(yield* service.listConnections).toEqual([]);
        const secretFiles = yield* fileSystem.readDirectory(config.secretsDir);
        expect(secretFiles.filter((name) => name.startsWith("pulse-mcp-connection-"))).toEqual([]);
      }).pipe(Effect.provide(layerWithPulseFileSystem(failing)));
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
