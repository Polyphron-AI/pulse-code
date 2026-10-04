import {
  OrchestrationGenerateThreadHandoffError,
  type OrchestrationGenerateThreadHandoffInput,
  type OrchestrationGenerateThreadHandoffResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as ProjectService from "../project/ProjectService.ts";
import * as TextGeneration from "../textGeneration/TextGeneration.ts";
import * as ThreadManagement from "./ThreadManagementService.ts";
import { formatThreadHandoffContext } from "./threadHandoffContext.ts";

export class ThreadHandoffService extends Context.Service<
  ThreadHandoffService,
  {
    readonly generate: (
      input: OrchestrationGenerateThreadHandoffInput,
    ) => Effect.Effect<
      OrchestrationGenerateThreadHandoffResult,
      OrchestrationGenerateThreadHandoffError
    >;
  }
>()("t3/orchestration-v2/ThreadHandoffService") {}

export const layer = Layer.effect(
  ThreadHandoffService,
  Effect.gen(function* () {
    const threads = yield* ThreadManagement.ThreadManagementService;
    const projects = yield* ProjectService.ProjectService;
    const generation = yield* TextGeneration.TextGeneration;
    return ThreadHandoffService.of({
      generate: Effect.fn("ThreadHandoffService.generate")(
        function* (input) {
          const projection = yield* threads.getThreadProjection(input.threadId);
          const thread = projection.thread;
          const transcript = formatThreadHandoffContext(projection.messages);
          if (transcript.context.length === 0) {
            return yield* new OrchestrationGenerateThreadHandoffError({
              message: "This thread has no conversation to summarize yet.",
            });
          }
          const project = yield* projects.getById(thread.projectId);
          const cwd =
            thread.worktreePath ?? Option.getOrUndefined(project)?.workspaceRoot ?? process.cwd();
          const nativeThread = projection.providerThreads.find(
            (candidate) => candidate.id === thread.activeProviderThreadId,
          );
          const nativeId = nativeThread?.nativeThreadRef?.nativeId;
          const sourceTurns = projection.providerTurns.filter(
            (turn) => turn.providerThreadId === nativeThread?.id,
          );
          const lastTurn = sourceTurns.toSorted((a, b) => b.ordinal - a.ordinal)[0];
          const active = projection.runs.some((run) =>
            ["pending", "preparing", "queued", "starting", "running", "waiting"].includes(
              run.status,
            ),
          );
          const generated = yield* generation.generateThreadHandoff({
            cwd,
            threadContext: `Workspace: ${cwd}\nBranch: ${thread.branch ?? "unspecified"}\nThread: ${thread.id}\nProject: ${thread.projectId}\nSource provider instance: ${thread.modelSelection.instanceId}\n\n${transcript.context}`,
            threadTitle: thread.title,
            ...(transcript.attachments.length > 0 ? { attachments: transcript.attachments } : {}),
            modelSelection: input.destination ?? thread.modelSelection,
            useSummaryModel: input.destination !== undefined,
            ...(input.destination
              ? {
                  source: {
                    modelSelection: thread.modelSelection,
                    resumeCursor:
                      nativeId &&
                      nativeThread?.providerInstanceId === thread.modelSelection.instanceId
                        ? nativeThread.driver === "codex"
                          ? { threadId: nativeId }
                          : nativeThread.driver === "claudeAgent"
                            ? { resume: nativeId }
                            : undefined
                        : undefined,
                    nativeEligible:
                      !active &&
                      lastTurn?.status === "completed" &&
                      !projection.messages.some(
                        (message) =>
                          message.streaming || (message.role === "user" && message.runId === null),
                      ),
                    lastTurnId: lastTurn?.nativeTurnRef?.nativeId ?? undefined,
                  },
                }
              : {}),
          });
          const current = yield* threads.getThreadProjection(input.threadId);
          if (
            DateTime.toEpochMillis(current.updatedAt) !==
              DateTime.toEpochMillis(projection.updatedAt) ||
            current.messages.length !== projection.messages.length ||
            current.messages.some(
              (message, index) =>
                DateTime.toEpochMillis(message.updatedAt) !==
                DateTime.toEpochMillis(projection.messages[index]!.updatedAt),
            )
          ) {
            return yield* new OrchestrationGenerateThreadHandoffError({
              message:
                "The source thread changed while preparing the handoff. Wait for its turn to finish and retry.",
            });
          }
          if (generated.summary.trim().length === 0) {
            return yield* new OrchestrationGenerateThreadHandoffError({
              message: "The provider returned an empty summary.",
            });
          }
          return {
            summary: generated.summary,
            ...(generated.capabilityNotice ? { capabilityNotice: generated.capabilityNotice } : {}),
            truncated: generated.usedNativeContext ? false : transcript.truncated,
          };
        },
        Effect.mapError((cause) =>
          Schema.is(OrchestrationGenerateThreadHandoffError)(cause)
            ? cause
            : new OrchestrationGenerateThreadHandoffError({
                message:
                  cause._tag === "TextGenerationError"
                    ? cause.detail
                    : "Failed to prepare the thread handoff",
                cause,
              }),
        ),
      ),
    });
  }),
);
