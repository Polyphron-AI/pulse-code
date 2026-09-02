import { type ModelSelection, type OmpSettings, TextGenerationError } from "@t3tools/contracts";
import { sanitizeBranchFragment, sanitizeFeatureBranchName } from "@t3tools/shared/git";
import { extractJsonObject } from "@t3tools/shared/schemaJson";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import { ChildProcessSpawner } from "effect/unstable/process";

import {
  applyOmpAcpTextGenerationModelSelection,
  makeOmpAcpRuntimeForPurpose,
  resolveOmpTextGenerationRunPaths,
  type OmpTextGenerationRunPaths,
} from "../provider/acp/OmpAcpSupport.ts";
import * as TextGeneration from "./TextGeneration.ts";
import {
  buildBranchNamePrompt,
  buildCommitMessagePrompt,
  buildPrContentPrompt,
  buildThreadTitlePrompt,
} from "./TextGenerationPrompts.ts";
import {
  sanitizeCommitSubject,
  sanitizePrTitle,
  sanitizeThreadTitle,
} from "./TextGenerationUtils.ts";

export const OMP_TEXT_GENERATION_TIMEOUT_MS = 180_000;

const isTextGenerationError = Schema.is(TextGenerationError);

type OmpTextGenerationOperation =
  | "generateCommitMessage"
  | "generatePrContent"
  | "generateBranchName"
  | "generateThreadTitle";

type OmpTextGenerationSettings = Pick<OmpSettings, "binaryPath">;

export interface OmpTextGenerationOptions {
  readonly ompSettings: OmpTextGenerationSettings | null | undefined;
  readonly textGenerationDir: string;
  readonly environment: NodeJS.ProcessEnv;
}

function configurationErrorDetail(step: "set-mode" | "set-model" | "set-thinking"): string {
  switch (step) {
    case "set-mode":
      return "Failed to set the OMP ACP default mode for text generation.";
    case "set-model":
      return "Failed to set the exact OMP ACP model for text generation.";
    case "set-thinking":
      return "Failed to set the OMP ACP thinking level for text generation.";
  }
}

export const makeOmpTextGeneration = Effect.fn("makeOmpTextGeneration")(function* (
  options: OmpTextGenerationOptions,
) {
  const crypto = yield* Crypto.Crypto;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const commandSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const acquireRunPaths = Effect.fn("OmpTextGeneration.acquireRunPaths")(function* () {
    yield* fileSystem.makeDirectory(options.textGenerationDir, { recursive: true });
    const runRoot = yield* fileSystem.makeTempDirectoryScoped({
      directory: options.textGenerationDir,
      prefix: "run-",
    });
    const paths = resolveOmpTextGenerationRunPaths(path, runRoot);
    yield* Effect.forEach(
      [
        paths.cwd,
        paths.agentDir,
        paths.sessionDir,
        paths.homeDir,
        paths.configDir,
        paths.dataDir,
        paths.cacheDir,
        paths.stateDir,
        paths.appDataDir,
        paths.localAppDataDir,
        paths.tempDir,
      ],
      (directory) => fileSystem.makeDirectory(directory, { recursive: true }),
      { concurrency: "unbounded", discard: true },
    );
    return paths;
  });

  const runOmpJson = <S extends Schema.Top>({
    operation,
    prompt,
    outputSchemaJson,
    modelSelection,
  }: {
    operation: OmpTextGenerationOperation;
    prompt: string;
    outputSchemaJson: S;
    modelSelection: ModelSelection;
  }): Effect.Effect<S["Type"], TextGenerationError, S["DecodingServices"]> =>
    Effect.gen(function* () {
      const paths: OmpTextGenerationRunPaths = yield* acquireRunPaths();
      const outputRef = yield* Ref.make("");
      const runtime = yield* makeOmpAcpRuntimeForPurpose({
        ompSettings: options.ompSettings,
        environment: options.environment,
        purpose: { type: "text-generation", paths },
        childProcessSpawner: commandSpawner,
        clientInfo: { name: "t3-code-git-text", version: "0.0.0" },
      }).pipe(Effect.provideService(Crypto.Crypto, crypto));

      yield* runtime.handleRequestPermission(() =>
        Effect.succeed({ outcome: { outcome: "cancelled" } }),
      );
      yield* runtime.handleElicitation(() => Effect.succeed({ action: { action: "cancel" } }));
      yield* runtime.handleExtRequest("elicitation/create", Schema.Unknown, () =>
        Effect.succeed({ action: "cancel" as const }),
      );
      yield* runtime.handleSessionUpdate((notification) => {
        const update = notification.update;
        if (update.sessionUpdate !== "agent_message_chunk") {
          return Effect.void;
        }
        const content = update.content;
        if (content.type !== "text") {
          return Effect.void;
        }
        return Ref.update(outputRef, (current) => current + content.text);
      });

      const promptResult = yield* Effect.gen(function* () {
        yield* runtime.start();
        yield* applyOmpAcpTextGenerationModelSelection({
          runtime,
          modelSelection,
          mapError: ({ cause, step }) =>
            new TextGenerationError({
              operation,
              detail: configurationErrorDetail(step),
              cause,
            }),
        });
        return yield* runtime.prompt({
          prompt: [{ type: "text", text: prompt }],
        });
      }).pipe(
        Effect.timeoutOption(OMP_TEXT_GENERATION_TIMEOUT_MS),
        Effect.flatMap(
          Option.match({
            onNone: () =>
              Effect.fail(
                new TextGenerationError({
                  operation,
                  detail: "OMP ACP request timed out.",
                }),
              ),
            onSome: Effect.succeed,
          }),
        ),
        Effect.mapError((cause) =>
          isTextGenerationError(cause)
            ? cause
            : new TextGenerationError({
                operation,
                detail: "OMP ACP request failed.",
                cause,
              }),
        ),
      );

      if (promptResult.stopReason === "cancelled") {
        return yield* new TextGenerationError({
          operation,
          detail: "OMP ACP request was cancelled.",
        });
      }

      const rawResult = (yield* Ref.get(outputRef)).trim();
      if (!rawResult) {
        return yield* new TextGenerationError({
          operation,
          detail: "OMP returned empty output.",
        });
      }

      const decodeOutput = Schema.decodeEffect(Schema.fromJsonString(outputSchemaJson));
      return yield* decodeOutput(extractJsonObject(rawResult)).pipe(
        Effect.catchTags({
          SchemaError: (cause) =>
            Effect.fail(
              new TextGenerationError({
                operation,
                detail: "OMP returned invalid structured output.",
                cause,
              }),
            ),
        }),
      );
    }).pipe(
      Effect.mapError((cause) =>
        isTextGenerationError(cause)
          ? cause
          : new TextGenerationError({
              operation,
              detail: "OMP ACP text generation failed.",
              cause,
            }),
      ),
      Effect.scoped,
    );

  const generateCommitMessage: TextGeneration.TextGeneration["Service"]["generateCommitMessage"] =
    Effect.fn("OmpTextGeneration.generateCommitMessage")(function* (input) {
      const { prompt, outputSchema } = buildCommitMessagePrompt({
        branch: input.branch,
        stagedSummary: input.stagedSummary,
        stagedPatch: input.stagedPatch,
        includeBranch: input.includeBranch === true,
        policy: input.policy,
      });
      const generated = yield* runOmpJson({
        operation: "generateCommitMessage",
        prompt,
        outputSchemaJson: outputSchema,
        modelSelection: input.modelSelection,
      });
      return {
        subject: sanitizeCommitSubject(generated.subject),
        body: generated.body.trim(),
        ...("branch" in generated && typeof generated.branch === "string"
          ? { branch: sanitizeFeatureBranchName(generated.branch) }
          : {}),
      };
    });

  const generatePrContent: TextGeneration.TextGeneration["Service"]["generatePrContent"] =
    Effect.fn("OmpTextGeneration.generatePrContent")(function* (input) {
      const { prompt, outputSchema } = buildPrContentPrompt({
        baseBranch: input.baseBranch,
        headBranch: input.headBranch,
        commitSummary: input.commitSummary,
        diffSummary: input.diffSummary,
        diffPatch: input.diffPatch,
        policy: input.policy,
        changeRequestTemplate: input.changeRequestTemplate,
      });
      const generated = yield* runOmpJson({
        operation: "generatePrContent",
        prompt,
        outputSchemaJson: outputSchema,
        modelSelection: input.modelSelection,
      });
      return {
        title: sanitizePrTitle(generated.title),
        body: generated.body.trim(),
      };
    });

  const generateBranchName: TextGeneration.TextGeneration["Service"]["generateBranchName"] =
    Effect.fn("OmpTextGeneration.generateBranchName")(function* (input) {
      const { prompt, outputSchema } = buildBranchNamePrompt({
        message: input.message,
        attachments: input.attachments,
      });
      const generated = yield* runOmpJson({
        operation: "generateBranchName",
        prompt,
        outputSchemaJson: outputSchema,
        modelSelection: input.modelSelection,
      });
      return { branch: sanitizeBranchFragment(generated.branch) };
    });

  const generateThreadTitle: TextGeneration.TextGeneration["Service"]["generateThreadTitle"] =
    Effect.fn("OmpTextGeneration.generateThreadTitle")(function* (input) {
      const { prompt, outputSchema } = buildThreadTitlePrompt({
        message: input.message,
        previousTitle: input.previousTitle,
        attachments: input.attachments,
      });
      const generated = yield* runOmpJson({
        operation: "generateThreadTitle",
        prompt,
        outputSchemaJson: outputSchema,
        modelSelection: input.modelSelection,
      });
      return {
        title: sanitizeThreadTitle(generated.title),
      } satisfies TextGeneration.ThreadTitleGenerationResult;
    });

  return {
    generateCommitMessage,
    generatePrContent,
    generateBranchName,
    generateThreadTitle,
  } satisfies TextGeneration.TextGeneration["Service"];
});
