import { query, type SDKUserMessage, type Options } from "@anthropic-ai/claude-agent-sdk";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { TextGenerationError } from "@t3tools/contracts";
import type { ThreadHandoffGenerationInput } from "./TextGeneration.ts";
import { buildThreadHandoffPrompt } from "./TextGenerationPrompts.ts";

const Resume = Schema.Struct({
  resume: Schema.optionalKey(Schema.String),
  sessionId: Schema.optionalKey(Schema.String),
});
const Output = Schema.Struct({ summary: Schema.String });
const isResume = Schema.is(Resume);
const decodeExport = Schema.decodeUnknownEffect(Output);

/** /compact and readable export run in one ephemeral fork, with no executable tools. */
export const compactCopiedClaudeSession = Effect.fn("compactCopiedClaudeSession")(function* (
  input: ThreadHandoffGenerationInput,
  options: Options,
  runQuery: typeof query = query,
) {
  if (!isResume(input.source?.resumeCursor)) return undefined;
  const resume = input.source.resumeCursor.resume ?? input.source.resumeCursor.sessionId;
  if (!resume) return undefined;
  const abortController = new AbortController();
  let requestExport: (() => void) | undefined;
  const compacted = new Promise<void>((resolve) => {
    requestExport = resolve;
  });
  const userMessage = (content: string): SDKUserMessage => ({
    type: "user",
    session_id: "",
    parent_tool_use_id: null,
    message: { role: "user", content },
  });
  const { prompt } = buildThreadHandoffPrompt({
    phase: "compact",
    threadTitle: input.threadTitle,
    threadContext:
      "Export the copied session's compacted continuation state. Supplementary visible source snapshot:\n" +
      input.threadContext,
  });
  const messages = async function* () {
    yield userMessage(
      "/compact Preserve the exact unfinished action, settled decisions, completed work and remaining verification.",
    );
    await compacted;
    if (!abortController.signal.aborted) yield userMessage(prompt);
  };
  const runtime = yield* Effect.acquireRelease(
    Effect.try({
      try: () =>
        runQuery({
          prompt: messages(),
          options: {
            ...options,
            resume,
            forkSession: true,
            persistSession: false,
            abortController,
            tools: [],
            mcpServers: {},
            strictMcpConfig: true,
            settingSources: [],
            permissionMode: "dontAsk",
            settings: {
              ...(typeof options.settings === "object" ? options.settings : {}),
              disableAllHooks: true,
            },
            canUseTool: async () => ({
              behavior: "deny",
              message: "Tools are disabled during source compaction.",
            }),
          },
        }),
      catch: (cause) =>
        new TextGenerationError({
          operation: "generateThreadHandoff",
          detail: "Failed to start an isolated source session copy.",
          cause,
        }),
    }),
    (runtime) =>
      Effect.sync(() => {
        abortController.abort();
        requestExport?.();
        runtime.close();
      }),
  );
  const output = yield* Effect.tryPromise({
    try: async () => {
      let receivedCompaction = false;
      for await (const message of runtime) {
        if (message.session_id === resume)
          throw new Error("The provider did not create an isolated source session copy.");
        if (message.type === "system" && message.subtype === "compact_boundary") {
          receivedCompaction = true;
          requestExport?.();
        }
        if (message.type === "result") {
          if (message.subtype !== "success") throw new Error(message.errors.join("; "));
          if (receivedCompaction && message.structured_output !== undefined) {
            return message.structured_output;
          }
        }
      }
      throw new Error(
        "The copied source session ended before readable compaction export completed.",
      );
    },
    catch: (cause) =>
      new TextGenerationError({
        operation: "generateThreadHandoff",
        detail: cause instanceof Error ? cause.message : "Source compaction failed.",
        cause,
      }),
  });
  const decoded = yield* decodeExport(output).pipe(
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
    summary: decoded.summary,
    usedNativeContext: true,
    capabilityNotice:
      "The source provider compacted an isolated session copy and exported readable continuation state before the destination structured the brief.",
  };
});
