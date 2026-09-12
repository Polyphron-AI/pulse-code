import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { ChatAttachment, ModelSelection, ProviderInstanceId } from "@t3tools/contracts";
import { TextGenerationError } from "@t3tools/contracts";

import * as ProviderInstanceRegistry from "../provider/Services/ProviderInstanceRegistry.ts";
import type { ProviderInstance } from "../provider/ProviderDriver.ts";
import type { TextGenerationPolicy } from "./TextGenerationPolicy.ts";

export type TextGenerationProvider =
  | "codex"
  | "claudeAgent"
  | "cursor"
  | "grok"
  | "omp"
  | "opencode";

export interface CommitMessageGenerationInput {
  cwd: string;
  branch: string | null;
  stagedSummary: string;
  stagedPatch: string;
  /** When true, the model also returns a semantic branch name for the change. */
  includeBranch?: boolean;
  policy?: TextGenerationPolicy | undefined;
  /** What model and provider to use for generation. */
  modelSelection: ModelSelection;
}

export interface CommitMessageGenerationResult {
  subject: string;
  body: string;
  /** Only present when `includeBranch` was set on the input. */
  branch?: string | undefined;
}

export interface PrContentGenerationInput {
  cwd: string;
  baseBranch: string;
  headBranch: string;
  commitSummary: string;
  diffSummary: string;
  diffPatch: string;
  changeRequestTemplate?: string | undefined;
  policy?: TextGenerationPolicy | undefined;
  /** What model and provider to use for generation. */
  modelSelection: ModelSelection;
}

export interface PrContentGenerationResult {
  title: string;
  body: string;
}

export interface BranchNameGenerationInput {
  cwd: string;
  message: string;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  /** What model and provider to use for generation. */
  modelSelection: ModelSelection;
}

export interface BranchNameGenerationResult {
  branch: string;
}

export interface ThreadTitleGenerationInput {
  cwd: string;
  message: string;
  /** Present when replacing an existing title from the current thread history. */
  previousTitle?: string | undefined;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  /** What model and provider to use for generation. */
  modelSelection: ModelSelection;
}

export interface ThreadTitleGenerationResult {
  title: string;
}

export interface ThreadHandoffSummaryGenerationInput {
  cwd: string;
  /** Plain-text transcript of the messages being summarized, oldest first. */
  transcript: string;
  /** Human label of the provider and model that produced the transcript. */
  sourceLabel: string;
  /** What model and provider to use for generation. This is the destination
      model of the switch, so the summary is written for its own consumption. */
  modelSelection: ModelSelection;
}

export interface ThreadHandoffSummaryGenerationResult {
  /** Markdown under the fixed handoff headings. */
  summary: string;
}

export interface WatchdogDecisionGenerationInput {
  cwd: string;
  /** User-authored rules the watchdog must follow. */
  rules: string;
  /** Plain-text description of the pending approval or user-input gate. */
  pendingRequest: string;
  /** What model and provider to use for the decision. */
  modelSelection: ModelSelection;
}

export interface WatchdogDecisionGenerationResult {
  /** One of "approve" | "deny" | "answer" | "escalate", unvalidated model output. */
  decision: string;
  /** Answer text when decision is "answer"; empty otherwise. */
  answer: string;
  /** Reason text when decision is "escalate"; empty otherwise. */
  reason: string;
}

export interface TextGenerationService {
  generateCommitMessage(
    input: CommitMessageGenerationInput,
  ): Promise<CommitMessageGenerationResult>;
  generatePrContent(input: PrContentGenerationInput): Promise<PrContentGenerationResult>;
  generateBranchName(input: BranchNameGenerationInput): Promise<BranchNameGenerationResult>;
  generateThreadTitle(input: ThreadTitleGenerationInput): Promise<ThreadTitleGenerationResult>;
  generateThreadHandoffSummary(
    input: ThreadHandoffSummaryGenerationInput,
  ): Promise<ThreadHandoffSummaryGenerationResult>;
  generateWatchdogDecision(
    input: WatchdogDecisionGenerationInput,
  ): Promise<WatchdogDecisionGenerationResult>;
}

/**
 * TextGeneration - Service tag for commit and change request text generation.
 */
export class TextGeneration extends Context.Service<
  TextGeneration,
  {
    /**
     * Generate a commit message from staged change context.
     */
    readonly generateCommitMessage: (
      input: CommitMessageGenerationInput,
    ) => Effect.Effect<CommitMessageGenerationResult, TextGenerationError>;

    /**
     * Generate change request title/body from branch and diff context.
     */
    readonly generatePrContent: (
      input: PrContentGenerationInput,
    ) => Effect.Effect<PrContentGenerationResult, TextGenerationError>;

    /**
     * Generate a concise branch name from a user message.
     */
    readonly generateBranchName: (
      input: BranchNameGenerationInput,
    ) => Effect.Effect<BranchNameGenerationResult, TextGenerationError>;

    /** Generate a concise thread title from a first message or thread history. */
    readonly generateThreadTitle: (
      input: ThreadTitleGenerationInput,
    ) => Effect.Effect<ThreadTitleGenerationResult, TextGenerationError>;

    /** Summarize the omitted middle of a thread for a provider switch. */
    readonly generateThreadHandoffSummary: (
      input: ThreadHandoffSummaryGenerationInput,
    ) => Effect.Effect<ThreadHandoffSummaryGenerationResult, TextGenerationError>;

    /** Ask the model to decide a pending approval or user-input gate on the watchdog's behalf. */
    readonly generateWatchdogDecision: (
      input: WatchdogDecisionGenerationInput,
    ) => Effect.Effect<WatchdogDecisionGenerationResult, TextGenerationError>;
  }
>()("t3/textGeneration/TextGeneration") {}

/** @deprecated Use `TextGeneration["Service"]`. */
export type TextGenerationShape = TextGeneration["Service"];

type TextGenerationOp =
  | "generateCommitMessage"
  | "generatePrContent"
  | "generateBranchName"
  | "generateThreadTitle"
  | "generateThreadHandoffSummary"
  | "generateWatchdogDecision";

const resolveInstance = (
  registry: ProviderInstanceRegistry.ProviderInstanceRegistry["Service"],
  operation: TextGenerationOp,
  instanceId: ProviderInstanceId,
): Effect.Effect<ProviderInstance["textGeneration"], TextGenerationError> =>
  registry.getInstance(instanceId).pipe(
    Effect.flatMap((instance) =>
      instance
        ? Effect.succeed(instance.textGeneration)
        : Effect.fail(
            new TextGenerationError({
              operation,
              detail: `No provider instance registered for id '${instanceId}'.`,
            }),
          ),
    ),
  );

export const makeTextGenerationFromRegistry = (
  registry: ProviderInstanceRegistry.ProviderInstanceRegistry["Service"],
): TextGeneration["Service"] =>
  TextGeneration.of({
    generateCommitMessage: (input) =>
      resolveInstance(registry, "generateCommitMessage", input.modelSelection.instanceId).pipe(
        Effect.flatMap((textGeneration) => textGeneration.generateCommitMessage(input)),
      ),
    generatePrContent: (input) =>
      resolveInstance(registry, "generatePrContent", input.modelSelection.instanceId).pipe(
        Effect.flatMap((textGeneration) => textGeneration.generatePrContent(input)),
      ),
    generateBranchName: (input) =>
      resolveInstance(registry, "generateBranchName", input.modelSelection.instanceId).pipe(
        Effect.flatMap((textGeneration) => textGeneration.generateBranchName(input)),
      ),
    generateThreadTitle: (input) =>
      resolveInstance(registry, "generateThreadTitle", input.modelSelection.instanceId).pipe(
        Effect.flatMap((textGeneration) => textGeneration.generateThreadTitle(input)),
      ),
    generateThreadHandoffSummary: (input) =>
      resolveInstance(
        registry,
        "generateThreadHandoffSummary",
        input.modelSelection.instanceId,
      ).pipe(
        Effect.flatMap((textGeneration) => textGeneration.generateThreadHandoffSummary(input)),
      ),
    generateWatchdogDecision: (input) =>
      resolveInstance(registry, "generateWatchdogDecision", input.modelSelection.instanceId).pipe(
        Effect.flatMap((textGeneration) => textGeneration.generateWatchdogDecision(input)),
      ),
  });

export const make = Effect.gen(function* () {
  const registry = yield* ProviderInstanceRegistry.ProviderInstanceRegistry;
  return makeTextGenerationFromRegistry(registry);
});

export const layer = Layer.effect(TextGeneration, make);
