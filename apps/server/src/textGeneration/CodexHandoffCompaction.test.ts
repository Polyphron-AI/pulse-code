import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import type * as CodexClient from "effect-codex-app-server/client";
import { CodexAppServerRequestError } from "effect-codex-app-server/errors";
import { expect } from "vite-plus/test";
import { ProviderInstanceId } from "@t3tools/contracts";
import { compactCopiedCodexThread } from "./CodexHandoffCompaction.ts";

const input = {
  cwd: process.cwd(),
  threadContext: "Continue the exact next step",
  phase: "compact" as const,
  modelSelection: { instanceId: ProviderInstanceId.make("source"), model: "gpt-6-astra" },
  source: {
    modelSelection: { instanceId: ProviderInstanceId.make("source"), model: "gpt-6-astra" },
    resumeCursor: { threadId: "original" },
    nativeEligible: true,
  },
};

function fakeClient(fail = false, exportText = '{"summary":"Continue exact next step"}') {
  const calls: Array<{ method: string; params: unknown }> = [];
  const handlers = new Map<string, (event: unknown) => Effect.Effect<void>>();
  const emit = (method: string, event: unknown) => handlers.get(method)?.(event) ?? Effect.void;
  const client = {
    handleServerNotification: (method: string, handler: (event: unknown) => Effect.Effect<void>) =>
      Effect.sync(() => {
        handlers.set(method, handler);
      }),
    handleUnknownServerRequest: () => Effect.void,
    request: (method: string, params: unknown) =>
      Effect.gen(function* () {
        calls.push({ method, params });
        if (method === "config/read") return { config: { mcp_servers: { secret: {} } } };
        if (method === "thread/fork") return { thread: { id: "copy" } };
        if (method === "thread/compact/start") {
          if (fail)
            return yield* new CodexAppServerRequestError({
              code: 401,
              errorMessage: "Authentication expired",
            });
          yield* emit("item/completed", {
            threadId: "original",
            item: { type: "contextCompaction" },
          });
          yield* emit("item/completed", { threadId: "copy", item: { type: "contextCompaction" } });
          yield* emit("turn/completed", {
            threadId: "copy",
            turn: { id: "compact", status: "completed" },
          });
          return undefined;
        }
        if (method === "turn/start") {
          yield* emit("turn/completed", {
            threadId: "copy",
            turn: { id: "compact", status: "completed" },
          });
          yield* emit("item/completed", {
            threadId: "copy",
            turnId: "other",
            item: { type: "agentMessage", text: "wrong turn text" },
          });
          yield* emit("item/completed", {
            threadId: "original",
            item: { type: "agentMessage", text: "private unrelated text" },
          });
          yield* emit("item/completed", {
            threadId: "copy",
            turnId: "export",
            item: { type: "agentMessage", text: exportText },
          });
          yield* emit("turn/completed", {
            threadId: "copy",
            turn: { id: "export", status: "completed" },
          });
          return { turn: { id: "export" } };
        }
        return undefined;
      }),
  } as unknown as CodexClient.CodexAppServerClient["Service"];
  return { client, calls };
}

it.effect(
  "exports readable state after the copied compaction receipt and ignores the source's events",
  () =>
    Effect.gen(function* () {
      const { client, calls } = fakeClient();
      const result = yield* compactCopiedCodexThread(client, input);
      expect(result?.summary).toBe("Continue exact next step");
      expect(result?.usedNativeContext).toBe(true);
      expect(calls.map((call) => call.method)).toEqual([
        "config/read",
        "thread/fork",
        "thread/compact/start",
        "turn/start",
      ]);
      expect(calls[1]?.params).toMatchObject({
        threadId: "original",
        ephemeral: true,
        model: "gpt-6-astra",
        config: { "features.shell_tool": false, "mcp_servers.secret.enabled": false },
      });
      expect(
        calls.slice(2).every((call) => (call.params as { threadId: string }).threadId === "copy"),
      ).toBe(true);
    }),
);

it.effect(
  "propagates source authentication failure without exporting or silently falling back",
  () =>
    Effect.gen(function* () {
      const { client, calls } = fakeClient(true);
      const result = yield* compactCopiedCodexThread(client, input).pipe(Effect.result);
      expect(Result.isFailure(result)).toBe(true);
      expect(calls.some((call) => call.method === "turn/start")).toBe(false);
    }),
);

for (const text of ["not readable JSON", '{"summary":""}', ""]) {
  it.effect(`returns native unavailable after successful unreadable export (${text})`, () =>
    Effect.gen(function* () {
      const { client } = fakeClient(false, text);
      expect(yield* compactCopiedCodexThread(client, input)).toBeUndefined();
    }),
  );
}
