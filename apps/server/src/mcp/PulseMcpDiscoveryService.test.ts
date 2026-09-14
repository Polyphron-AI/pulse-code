// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFSP from "node:fs/promises";
import * as NodeOs from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { makePulseMcpDiscoveryService } from "./PulseMcpDiscoveryService.ts";
import type { PulseMcpConfigServiceShape } from "./PulseMcpConfigService.ts";

describe("PulseMcpDiscoveryService", () => {
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
});
