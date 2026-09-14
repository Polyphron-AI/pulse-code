// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { discoveryFileIdentity, makePulseMcpDiscoveryService } from "./PulseMcpDiscoveryService.ts";
import type { PulseMcpConfigServiceShape } from "./PulseMcpConfigService.ts";
import { PulseMcpConfigError } from "./PulseMcpConfigService.ts";

describe("PulseMcpDiscoveryService", () => {
  it("uses physical file identity while preserving case on case-sensitive platforms", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOs.tmpdir(), "pulse-mcp-identity-"));
    try {
      const targetDir = NodePath.join(root, "target");
      const aliasDir = NodePath.join(root, "alias");
      await NodeFSP.mkdir(targetDir);
      const target = NodePath.join(targetDir, "Target.json");
      await NodeFSP.writeFile(target, "{}");
      await NodeFSP.symlink(targetDir, aliasDir, "junction");
      expect(await discoveryFileIdentity(NodePath.join(aliasDir, "Target.json"))).toBe(
        await discoveryFileIdentity(target),
      );
      expect(await discoveryFileIdentity(NodePath.join(root, "Case.json"), "linux")).not.toBe(
        await discoveryFileIdentity(NodePath.join(root, "case.json"), "linux"),
      );
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });
  it("records the reviewed baseline and imports only later additions", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOs.tmpdir(), "pulse-mcp-follow-"));
    try {
      let raw = JSON.stringify({ mcpServers: { reviewed: { command: "one" } } });
      const imports: string[] = [];
      const config = {
        upsertConnection: (connection: { readonly id: string }) =>
          Effect.sync(() => {
            imports.push(connection.id);
            return connection as never;
          }),
      } as unknown as PulseMcpConfigServiceShape;
      const service = makePulseMcpDiscoveryService({
        config,
        approvalsPath: NodePath.join(root, "approvals.json"),
        files: [{ source: "claude", read: async () => raw }],
      });
      await Effect.runPromise(service.setFollow({ source: "claude", followNew: true }));
      await Effect.runPromise(service.syncFollowed());
      expect(imports).toEqual([]);
      raw = JSON.stringify({
        mcpServers: { reviewed: { command: "changed" }, later: { command: "two" } },
      });
      await Effect.runPromise(service.syncFollowed());
      await Effect.runPromise(service.syncFollowed());
      expect(imports).toEqual(["later"]);
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });

  it("keeps valid sources visible when another source is malformed", async () => {
    const config = {} as PulseMcpConfigServiceShape;
    const service = makePulseMcpDiscoveryService({
      config,
      files: [
        { source: "claude", read: async () => '{"mcpServers":{"ok":{"command":"npx"}}}' },
        { source: "opencode", read: async () => "{" },
      ],
    });
    const result = await Effect.runPromise(service.discover());
    expect(result.map(({ name, importable }) => [name, importable])).toEqual([
      ["ok", true],
      ["opencode user configuration", false],
    ]);
  });

  it("retries transient imports, preserves seen tombstones, and recovers its mutation queue", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOs.tmpdir(), "pulse-mcp-retry-"));
    try {
      let raw = JSON.stringify({ mcpServers: { skipped: { command: "one" } } });
      let attempts = 0;
      const service = makePulseMcpDiscoveryService({
        approvalsPath: NodePath.join(root, "approvals.json"),
        files: [{ source: "claude", read: async () => raw }],
        config: {
          upsertConnection: (connection: { readonly id: string }) =>
            Effect.suspend(() => {
              attempts += 1;
              return attempts === 1 ? Effect.die("temporary") : Effect.succeed(connection as never);
            }),
        } as unknown as PulseMcpConfigServiceShape,
      });
      await Effect.runPromise(service.setFollow({ source: "claude", followNew: true }));
      await Effect.runPromise(service.setFollow({ source: "claude", followNew: false }));
      raw = JSON.stringify({
        mcpServers: { skipped: { command: "one" }, later: { command: "two" } },
      });
      await Effect.runPromise(service.setFollow({ source: "claude", followNew: true }));
      raw = JSON.stringify({
        mcpServers: {
          skipped: { command: "one" },
          later: { command: "two" },
          retry: { command: "three" },
        },
      });
      await Effect.runPromise(service.syncFollowed());
      await Effect.runPromise(service.syncFollowed());
      expect(attempts).toBe(2);
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });

  it("reconciles an existing create-only import after an approvals write crash", async () => {
    const root = await NodeFSP.mkdtemp(NodePath.join(NodeOs.tmpdir(), "pulse-mcp-crash-"));
    const approvalsPath = NodePath.join(root, "approvals.json");
    const approval = JSON.stringify({
      version: 1,
      sources: { claude: { followNew: true, seen: [] } },
    });
    try {
      await NodeFSP.writeFile(approvalsPath, approval);
      let stored = false;
      const service = makePulseMcpDiscoveryService({
        approvalsPath,
        files: [
          {
            source: "claude",
            read: async () => JSON.stringify({ mcpServers: { later: { command: "one" } } }),
          },
        ],
        config: {
          upsertConnection: () =>
            Effect.tryPromise({
              try: async () => {
                if (stored)
                  throw new PulseMcpConfigError(
                    "validate",
                    "An MCP connection with this ID already exists.",
                  );
                stored = true;
                await NodeFSP.rm(approvalsPath);
                await NodeFSP.mkdir(approvalsPath);
                return {} as never;
              },
              catch: (error) => error as PulseMcpConfigError,
            }),
        } as unknown as PulseMcpConfigServiceShape,
      });
      await expect(Effect.runPromise(service.syncFollowed())).rejects.toBeDefined();
      await NodeFSP.rm(approvalsPath, { recursive: true });
      await NodeFSP.writeFile(approvalsPath, approval);
      await Effect.runPromise(service.syncFollowed());
      const saved = JSON.parse(await NodeFSP.readFile(approvalsPath, "utf8"));
      expect(saved.sources.claude.seen).toEqual(["later"]);
    } finally {
      await NodeFSP.rm(root, { recursive: true, force: true });
    }
  });
});
