import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as CodexClient from "effect-codex-app-server/client";
import { TextGenerationError } from "@t3tools/contracts";
import { getModelSelectionStringOptionValue } from "@t3tools/shared/model";
import { buildThreadHandoffPrompt } from "./TextGenerationPrompts.ts";
import type { ThreadHandoffGenerationInput } from "./TextGeneration.ts";

const Resume = Schema.Struct({ threadId: Schema.String });
const isResume = Schema.is(Resume);
const isMcpServers = Schema.is(Schema.Record(Schema.String, Schema.Json));
const decodeExport = Schema.decodeEffect(
  Schema.fromJsonString(Schema.Struct({ summary: Schema.String })),
);

/** A native compaction payload is private; ask only the copied session to export readable state. */
export const compactCopiedCodexThread = Effect.fn("compactCopiedCodexThread")(function* (
  client: CodexClient.CodexAppServerClient["Service"],
  input: ThreadHandoffGenerationInput,
) {
  if (!isResume(input.source?.resumeCursor)) return undefined;
  const sourceId = input.source.resumeCursor.threadId;
  const compacted = yield* Deferred.make<void, TextGenerationError>();
  const completed = yield* Deferred.make<string, TextGenerationError>();
  let copiedId: string | undefined;
  let exportTurnId: string | undefined;
  const texts = new Map<string, string>();
  const finished = new Map<string, string | undefined>();
  const finishExport = () => {
    if (!exportTurnId || !finished.has(exportTurnId)) return Effect.void;
    const error = finished.get(exportTurnId);
    return error
      ? Deferred.fail(
          completed,
          new TextGenerationError({ operation: "generateThreadHandoff", detail: error }),
        )
      : Deferred.succeed(completed, texts.get(exportTurnId) ?? "");
  };
  yield* client.handleServerNotification("item/completed", (event) => {
    if (event.threadId !== copiedId) return Effect.void;
    if (event.item.type === "contextCompaction") return Deferred.succeed(compacted, undefined);
    if (event.item.type === "agentMessage")
      texts.set(event.turnId, (texts.get(event.turnId) ?? "") + event.item.text);
    return Effect.void;
  });
  yield* client.handleServerNotification("turn/completed", (event) => {
    if (event.threadId !== copiedId) return Effect.void;
    const error =
      event.turn.status === "completed"
        ? undefined
        : (event.turn.error?.message ??
          "The copied source session failed to export continuation state.");
    finished.set(event.turn.id, error);
    return Effect.gen(function* () {
      if (error && !exportTurnId)
        yield* Deferred.fail(
          compacted,
          new TextGenerationError({ operation: "generateThreadHandoff", detail: error }),
        );
      yield* finishExport();
    });
  });
  yield* client.handleUnknownServerRequest(() => Effect.succeed({ decision: "decline" }));
  const configuration = yield* client.request("config/read", {
    includeLayers: false,
    cwd: input.cwd,
  });
  const mcpServers = configuration.config.mcp_servers;
  const disabledMcp = isMcpServers(mcpServers)
    ? Object.fromEntries(
        Object.keys(mcpServers).map((name) => [`mcp_servers.${name}.enabled`, false]),
      )
    : {};
  const fork = yield* client.request("thread/fork", {
    threadId: sourceId,
    ephemeral: true,
    ...(input.source.lastTurnId ? { lastTurnId: input.source.lastTurnId } : {}),
    model: input.modelSelection.model,
    cwd: input.cwd,
    approvalPolicy: "never",
    sandbox: "read-only",
    developerInstructions:
      "This is an isolated continuation-state export. Do not execute the underlying task, use tools, or reopen settled decisions. Only export readable state as requested.",
    config: {
      "features.shell_tool": false,
      "features.apply_patch_freeform": false,
      "features.exec_policy": false,
      "apps._default.enabled": false,
      "tools.view_image": false,
      web_search: "disabled",
      ...disabledMcp,
      model_reasoning_effort:
        getModelSelectionStringOptionValue(input.modelSelection, "reasoningEffort") ?? "medium",
    },
  });
  copiedId = fork.thread.id;
  if (copiedId === sourceId)
    return yield* new TextGenerationError({
      operation: "generateThreadHandoff",
      detail: "The provider did not create an isolated source session copy.",
    });
  yield* client.request("thread/compact/start", { threadId: copiedId });
  yield* Deferred.await(compacted);
  const { prompt } = buildThreadHandoffPrompt({
    phase: "compact",
    threadTitle: input.threadTitle,
    threadContext:
      "Export the continuation state already in this copied, compacted session. Supplementary visible source snapshot:\n" +
      input.threadContext,
  });
  const turn = yield* client.request("turn/start", {
    threadId: copiedId,
    model: input.modelSelection.model,
    approvalPolicy: "never",
    outputSchema: {
      type: "object",
      properties: { summary: { type: "string" } },
      required: ["summary"],
      additionalProperties: false,
    },
    input: [{ type: "text", text: prompt, text_elements: [] }],
  });
  exportTurnId = turn.turn.id;
  yield* finishExport();
  const raw = yield* Deferred.await(completed);
  const summary = yield* decodeExport(raw).pipe(
    Effect.mapError(
      (cause) =>
        new TextGenerationError({
          operation: "generateThreadHandoff",
          detail: "The copied source session did not export readable continuation state.",
          cause,
        }),
    ),
  );
  return {
    summary: summary.summary,
    usedNativeContext: true,
    capabilityNotice:
      "The source provider compacted an isolated session copy and exported readable continuation state before the destination structured the brief.",
  };
});
