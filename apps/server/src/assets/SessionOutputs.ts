import { MessageId, SessionOutputAccessError, type ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { ServerConfig } from "../config.ts";
import { ProjectionSnapshotQuery } from "../orchestration/Services/ProjectionSnapshotQuery.ts";
import {
  findSavedSessionOutput,
  outputAccessError,
  saveSessionOutput,
  sessionOutputLinks,
  sessionOutputPaths,
} from "./sessionOutputStore.ts";

const messageOutputContext = Effect.fn("SessionOutputs.messageOutputContext")(function* (
  threadId: ThreadId,
  messageId: MessageId,
) {
  const projections = yield* ProjectionSnapshotQuery;
  const message = yield* projections.getMessageById(messageId);
  if (
    Option.isNone(message) ||
    message.value.threadId !== threadId ||
    message.value.role !== "assistant" ||
    message.value.isStreaming
  ) {
    return yield* new SessionOutputAccessError({
      code: "missing",
      message:
        "Saved outputs are available from completed assistant messages in their source environment.",
    });
  }
  const thread = yield* projections.getThreadShellById(threadId);
  if (Option.isNone(thread))
    return yield* new SessionOutputAccessError({
      code: "missing",
      message: "The source thread is no longer available.",
    });
  const project = yield* projections.getProjectShellById(thread.value.projectId);
  if (Option.isNone(project))
    return yield* new SessionOutputAccessError({
      code: "missing",
      message: "The source project is no longer available.",
    });
  const cwd = thread.value.worktreePath ?? project.value.workspaceRoot;
  const config = yield* ServerConfig;
  const path = yield* Path.Path;
  return {
    message: message.value,
    cwd,
    storeRoot: path.join(path.dirname(config.attachmentsDir), "session-outputs"),
  };
});

export const saveMessageOutput = Effect.fn("SessionOutputs.saveMessageOutput")(function* (input: {
  threadId: ThreadId;
  messageId: MessageId;
  path: string;
}) {
  const context = yield* messageOutputContext(input.threadId, input.messageId);
  const links = sessionOutputLinks(context.message.text, context.cwd);
  const requested = sessionOutputPaths(`[output](<${input.path}>)`, context.cwd)[0];
  const link = links.find((candidate) => candidate.path === requested);
  if (!link && requested) {
    const saved = yield* Effect.tryPromise({
      try: () =>
        findSavedSessionOutput({
          storeRoot: context.storeRoot,
          threadId: input.threadId,
          messageId: input.messageId,
          requestedPath: requested,
          links,
        }),
      catch: outputAccessError,
    });
    if (saved) return saved;
  }
  if (!link)
    return yield* new SessionOutputAccessError({
      code: "denied",
      message:
        "This file is not linked in the selected assistant message. Ask the agent to link the completed output.",
    });
  return yield* Effect.tryPromise({
    try: () =>
      saveSessionOutput({
        storeRoot: context.storeRoot,
        threadId: input.threadId,
        messageId: input.messageId,
        turnId: context.message.turnId,
        sourcePath: link.path,
        reference: link.reference,
        cwd: context.cwd,
      }),
    catch: outputAccessError,
  });
}, Effect.mapError(outputAccessError));

export const captureMessageOutputs = Effect.fn("SessionOutputs.captureMessageOutputs")(
  function* (threadId: ThreadId, messageId: MessageId) {
    const context = yield* messageOutputContext(threadId, messageId);
    const budget = { remainingBytes: 128 * 1024 * 1024 };
    yield* Effect.forEach(
      sessionOutputLinks(context.message.text, context.cwd),
      (link) =>
        Effect.tryPromise({
          try: () =>
            saveSessionOutput({
              storeRoot: context.storeRoot,
              threadId,
              messageId,
              turnId: context.message.turnId,
              sourcePath: link.path,
              reference: link.reference,
              cwd: context.cwd,
              budget,
            }),
          catch: outputAccessError,
        }).pipe(
          Effect.catch((error) =>
            Effect.logWarning("Session output capture failed", {
              threadId,
              messageId,
              sourcePath: link.path,
              code: error.code,
            }),
          ),
        ),
      { concurrency: 1, discard: true },
    );
  },
  Effect.catch((cause) => Effect.logWarning("Session output capture unavailable", { cause })),
);
