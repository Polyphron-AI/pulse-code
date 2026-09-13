import * as NodeAssert from "node:assert/strict";
import { ProviderInstanceId } from "@t3tools/contracts";
import { describe, it } from "@effect/vitest";

import * as PulseMcpPreparation from "./PulseMcpPreparation.ts";

describe("PulseMcpPreparation", () => {
  it("detects only conflicting stdio environment values", () => {
    const conflicts = PulseMcpPreparation.findConflictingStdioConnections([
      { id: "a", name: "A", transport: "stdio", command: "a", args: [], env: { KEY: "one" } },
      { id: "b", name: "B", transport: "stdio", command: "b", args: [], env: { KEY: "two" } },
      { id: "c", name: "C", transport: "stdio", command: "c", args: [], env: { OTHER: "ok" } },
    ]);
    NodeAssert.deepStrictEqual([...conflicts].sort(), ["a", "b"]);
  });

  it("changes the opaque fingerprint when resolved secrets rotate", () => {
    const base = {
      providerInstanceId: ProviderInstanceId.make("codex"),
      cwd: "/project",
      runtimeMode: "full-access" as const,
      modelSelection: undefined,
    };
    const first = PulseMcpPreparation.fingerprint({
      ...base,
      servers: [
        {
          id: "a",
          name: "A",
          transport: "http",
          url: "https://mcp",
          headers: { Authorization: "one" },
        },
      ],
    });
    const second = PulseMcpPreparation.fingerprint({
      ...base,
      servers: [
        {
          id: "a",
          name: "A",
          transport: "http",
          url: "https://mcp",
          headers: { Authorization: "two" },
        },
      ],
    });
    NodeAssert.notEqual(first, second);
  });

  it("does not infer readiness from a missing native startup status", () => {
    NodeAssert.deepStrictEqual(
      PulseMcpPreparation.publicStatuses(
        [{ id: "a", name: "A", transport: "http", url: "https://mcp", headers: {} }],
        [],
      ),
      [{ connectionId: "a", name: "A", status: "unknown" }],
    );
  });
});
