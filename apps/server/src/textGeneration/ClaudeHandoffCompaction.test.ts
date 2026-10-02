import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Fiber from "effect/Fiber";
import type { query, Query, Options, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { expect } from "vite-plus/test";
import { ProviderInstanceId } from "@t3tools/contracts";
import { compactCopiedClaudeSession } from "./ClaudeHandoffCompaction.ts";

const input = {
  cwd: process.cwd(),
  threadContext: "Settled decision; next exact action",
  modelSelection: {
    instanceId: ProviderInstanceId.make("claude-source"),
    model: "claude-opus-4-6",
  },
  source: {
    modelSelection: {
      instanceId: ProviderInstanceId.make("claude-source"),
      model: "claude-opus-4-6",
    },
    resumeCursor: { resume: "original" },
    nativeEligible: true,
  },
};

function fakeQuery(
  failure = false,
  original = false,
  early = false,
  exportResult = { structured_output: { summary: "Continue exactly here" } } as {
    structured_output?: unknown;
  },
) {
  let closed = false;
  let options: Options | undefined;
  const prompts: string[] = [];
  const runQuery = ((args: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => {
    options = args.options;
    const iterator = args.prompt[Symbol.asyncIterator]();
    const stream = (async function* () {
      const compact = await iterator.next();
      prompts.push(String(compact.value?.message.content));
      if (failure) throw new Error("Authentication expired");
      if (early)
        yield {
          type: "result",
          subtype: "success",
          session_id: "copy",
          structured_output: { summary: "Premature summary" },
        };
      yield {
        type: "system",
        subtype: "compact_boundary",
        session_id: original ? "original" : "copy",
      };
      yield { type: "result", subtype: "success", session_id: "copy" };
      const exportPrompt = await iterator.next();
      prompts.push(String(exportPrompt.value?.message.content));
      yield {
        type: "result",
        subtype: "success",
        session_id: "copy",
        ...exportResult,
      };
    })();
    return Object.assign(stream, {
      close: () => {
        closed = true;
      },
    }) as unknown as Query;
  }) as typeof query;
  return { runQuery, prompts, getOptions: () => options, wasClosed: () => closed };
}

it.effect(
  "waits for copied Claude compaction before exporting, with no tools and scoped cleanup",
  () =>
    Effect.gen(function* () {
      const fake = fakeQuery();
      const result = yield* compactCopiedClaudeSession(
        input,
        { env: { CLAUDE_CONFIG_DIR: "source-home" }, model: "claude-opus-4-6" },
        fake.runQuery,
      ).pipe(Effect.scoped);
      expect(result?.summary).toBe("Continue exactly here");
      expect(fake.prompts[0]).toMatch(/^\/compact/);
      expect(fake.prompts[1]).toContain("next exact action");
      expect(fake.getOptions()).toMatchObject({
        resume: "original",
        forkSession: true,
        persistSession: false,
        tools: [],
        mcpServers: {},
        strictMcpConfig: true,
        env: { CLAUDE_CONFIG_DIR: "source-home" },
        model: "claude-opus-4-6",
      });
      expect(fake.wasClosed()).toBe(true);
    }),
);

it.effect("closes the copied runtime and propagates provider authentication failure", () =>
  Effect.gen(function* () {
    const fake = fakeQuery(true);
    const result = yield* compactCopiedClaudeSession(input, {}, fake.runQuery).pipe(
      Effect.scoped,
      Effect.result,
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) expect(result.failure.detail).toContain("Authentication expired");
    expect(fake.prompts.length).toBe(1);
    expect(fake.wasClosed()).toBe(true);
  }),
);

it.effect("rejects original session reuse and closes the runtime", () =>
  Effect.gen(function* () {
    const fake = fakeQuery(false, true);
    const result = yield* compactCopiedClaudeSession(input, {}, fake.runQuery).pipe(
      Effect.scoped,
      Effect.result,
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result))
      expect(result.failure.detail).toContain("isolated source session copy");
    expect(fake.wasClosed()).toBe(true);
  }),
);

it.effect("returns native unavailable for a successful result without a compaction receipt", () =>
  Effect.gen(function* () {
    const fake = fakeQuery(false, false, true);
    const result = yield* compactCopiedClaudeSession(input, {}, fake.runQuery).pipe(Effect.scoped);
    expect(result).toBeUndefined();
    expect(fake.wasClosed()).toBe(true);
  }),
);

it.effect("aborts and closes the copied runtime when interrupted during export", () =>
  Effect.gen(function* () {
    let startedExport = () => {};
    let releaseExport = () => {};
    const started = new Promise<void>((resolve) => {
      startedExport = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      releaseExport = resolve;
    });
    let closed = false;
    let options: Options | undefined;
    const runQuery = ((args: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => {
      options = args.options;
      const iterator = args.prompt[Symbol.asyncIterator]();
      const stream = (async function* () {
        await iterator.next();
        yield { type: "system", subtype: "compact_boundary", session_id: "copy" };
        yield { type: "result", subtype: "success", session_id: "copy" };
        await iterator.next();
        startedExport();
        await pending;
      })();
      return Object.assign(stream, {
        close: () => {
          closed = true;
          releaseExport();
        },
      }) as unknown as Query;
    }) as typeof query;
    const fiber = yield* compactCopiedClaudeSession(input, {}, runQuery).pipe(
      Effect.scoped,
      Effect.forkChild,
    );
    yield* Effect.promise(() => started);
    yield* Fiber.interrupt(fiber);
    expect(closed).toBe(true);
    expect(options?.abortController?.signal.aborted).toBe(true);
  }),
);

for (const exportResult of [
  {},
  { structured_output: { summary: "" } },
  { structured_output: { encrypted_content: "opaque" } },
]) {
  it.effect(
    `returns native unavailable and closes after successful unreadable export (${JSON.stringify(exportResult)})`,
    () =>
      Effect.gen(function* () {
        const fake = fakeQuery(false, false, false, exportResult);
        const result = yield* compactCopiedClaudeSession(input, {}, fake.runQuery).pipe(
          Effect.scoped,
        );
        expect(result).toBeUndefined();
        expect(fake.wasClosed()).toBe(true);
      }),
  );
}
