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
});
