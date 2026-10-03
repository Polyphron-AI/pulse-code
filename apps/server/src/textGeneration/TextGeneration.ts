import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type {
  ChatAttachment,
  ModelSelection,
  ProviderInstanceId,
  ServerProvider,
} from "@t3tools/contracts";
import { TextGenerationError } from "@t3tools/contracts";

import * as ProviderInstanceRegistry from "../provider/Services/ProviderInstanceRegistry.ts";
import type { ProviderInstance } from "../provider/ProviderDriver.ts";
import * as SourceControlProviderRegistry from "../sourceControl/SourceControlProviderRegistry.ts";
import * as ThreadTitleLinks from "./ThreadTitleLinks.ts";
import type { TextGenerationPolicy } from "./TextGenerationPolicy.ts";

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
  linkedContext?: string | undefined;
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
  needsRefinement?: boolean | undefined;
}

export interface ThreadHandoffGenerationInput {
  source?: {
    modelSelection: ModelSelection;
    resumeCursor?: unknown;
    nativeEligible: boolean;
    lastTurnId?: string | undefined;
  };
  phase?: "compact" | "structure";
  /** Select a small summary model from this instance, independently of the draft model. */
  useSummaryModel?: boolean;
  cwd: string;
  /** Formatted transcript of the thread being handed off. */
  threadContext: string;
  /** The thread's title, which orients the summary even when context is truncated. */
  threadTitle?: string | undefined;
  attachments?: ReadonlyArray<ChatAttachment> | undefined;
  /** What model and provider to use for generation. */
  modelSelection: ModelSelection;
}

export interface ThreadHandoffGenerationResult {
  summary: string;
  capabilityNotice?: string;
  usedNativeContext?: boolean;
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

    /** Summarize a thread so its work can continue in a new thread on another provider. */
    readonly generateThreadHandoff: (
      input: ThreadHandoffGenerationInput,
    ) => Effect.Effect<ThreadHandoffGenerationResult, TextGenerationError>;
    /** Compact only an isolated copy; absent when safe native export is unsupported. */
    readonly compactThreadHandoff?: (
      input: ThreadHandoffGenerationInput,
    ) => Effect.Effect<ThreadHandoffGenerationResult | undefined, TextGenerationError>;
  }
>()("t3/textGeneration/TextGeneration") {}

type TextGenerationOp =
  | "generateCommitMessage"
  | "generatePrContent"
  | "generateBranchName"
  | "generateThreadTitle"
  | "generateThreadHandoff";

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

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const registry = yield* ProviderInstanceRegistry.ProviderInstanceRegistry;
  const sourceControl = yield* SourceControlProviderRegistry.SourceControlProviderRegistry;
  return TextGeneration.of({
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
        Effect.flatMap((textGeneration) =>
          Effect.gen(function* () {
            const linkedContext =
              input.linkedContext ??
              (yield* ThreadTitleLinks.resolveThreadTitleLinks(input).pipe(
                Effect.provideService(
                  SourceControlProviderRegistry.SourceControlProviderRegistry,
                  sourceControl,
                ),
              ));
            return yield* textGeneration.generateThreadTitle({ ...input, linkedContext });
          }),
        ),
      ),
    generateThreadHandoff: Effect.fn("TextGeneration.generateThreadHandoff")(function* (input) {
      if (!input.useSummaryModel) {
        const textGeneration = yield* resolveInstance(
          registry,
          "generateThreadHandoff",
          input.modelSelection.instanceId,
        );
        return yield* textGeneration.generateThreadHandoff(input);
      }
      const instance = yield* registry.getInstance(input.modelSelection.instanceId);
      if (!instance || !instance.enabled) {
        return yield* new TextGenerationError({
          operation: "generateThreadHandoff",
          detail:
            "The destination provider is no longer available. Choose another provider and retry.",
        });
      }
      const snapshot = yield* instance.snapshot.getSnapshot;
      const selection = resolveHandoffSummaryModel(snapshot, input.modelSelection);
      if (typeof selection === "string") {
        return yield* new TextGenerationError({
          operation: "generateThreadHandoff",
          detail: selection,
        });
      }
      let sourceResult: ThreadHandoffGenerationResult | undefined;
      if (input.source) {
        const source = yield* resolveInstance(
          registry,
          "generateThreadHandoff",
          input.source.modelSelection.instanceId,
        );
        const sourceInput = {
          ...input,
          useSummaryModel: false,
          phase: "compact" as const,
          modelSelection: input.source.modelSelection,
        };
        if (input.source.nativeEligible && source.compactThreadHandoff) {
          sourceResult = yield* source.compactThreadHandoff(sourceInput);
        }
        if (!sourceResult?.summary.trim()) {
          sourceResult = yield* source.generateThreadHandoff(sourceInput);
          sourceResult = {
            ...sourceResult,
            capabilityNotice: [
              "Native compaction on a safe session copy or readable export is unavailable. The source provider compacted the supplied conversation before the destination structured the brief.",
              sourceResult.capabilityNotice,
            ]
              .filter(Boolean)
              .join(" "),
          };
        }
        if (!sourceResult.summary.trim()) {
          return yield* new TextGenerationError({
            operation: "generateThreadHandoff",
            detail:
              "The source provider returned no readable continuation state. Retry the handoff.",
          });
        }
      }
      const generated = yield* instance.textGeneration.generateThreadHandoff({
        ...input,
        ...(sourceResult ? { threadContext: sourceResult.summary, attachments: undefined } : {}),
        phase: "structure",
        modelSelection: selection.modelSelection,
      });
      const capabilityNotice = [sourceResult?.capabilityNotice, selection.capabilityNotice]
        .filter(Boolean)
        .join(" ");
      return {
        ...generated,
        ...(capabilityNotice ? { capabilityNotice } : {}),
        ...(sourceResult?.usedNativeContext ? { usedNativeContext: true } : {}),
      };
    }),
  });
});

export const layer = Layer.effect(TextGeneration, make);

/** Summary selection follows the destination's actual catalog, never its draft-model options. */
export function resolveHandoffSummaryModel(
  provider: ServerProvider,
  destination: ModelSelection,
): { modelSelection: ModelSelection; capabilityNotice?: string } | string {
  if (
    !provider.enabled ||
    provider.availability === "unavailable" ||
    provider.status !== "ready" ||
    provider.supportsTextGeneration === false
  ) {
    return "The destination provider is unavailable. Choose another provider and retry.";
  }
  const family =
    provider.driver === "codex" || /(?:openai[/.]|gpt-)/i.test(destination.model)
      ? "openai"
      : provider.driver === "claudeAgent" || /(?:anthropic[/.]|claude-)/i.test(destination.model)
        ? "anthropic"
        : provider.driver === "antigravity" || /(?:google[/.]|gemini-)/i.test(destination.model)
          ? "google"
          : null;
  const canUseSelectedModel = ["cursor", "grok", "opencode"].includes(provider.driver);
  const selectedModelFallback = {
    modelSelection: destination,
    capabilityNotice:
      "This provider has no supported small summary model for the selected family. Its selected model wrote the brief. Review it, then send it.",
  };
  const candidates = provider.models.filter((model) => !model.isCustom);
  const model =
    family === "openai"
      ? (candidates.find((model) => /(?:^|[./])gpt-6-luna$/.test(model.slug)) ??
        candidates.find((model) => /luna/i.test(model.slug)))
      : family === "anthropic"
        ? candidates.find((model) => /haiku/i.test(model.slug))
        : family === "google"
          ? (candidates.find((model) => /gemini.*flash.*medium/i.test(model.slug)) ??
            candidates.find((model) => /gemini.*flash/i.test(model.slug)))
          : undefined;
  if (!family)
    return {
      modelSelection: destination,
      capabilityNotice:
        "This provider has no mapped small summary model. Its selected model wrote the brief. Review it, then send it.",
    };
  if (!model)
    return canUseSelectedModel
      ? selectedModelFallback
      : "The destination has no supported small summary model available. Refresh its models or choose another provider.";
  if (provider.driver === "antigravity") {
    if (!/flash.*medium/i.test(model.slug))
      return "The destination has no Flash Medium summary model. Refresh its models or choose another provider.";
    return { modelSelection: { instanceId: provider.instanceId, model: model.slug } };
  }
  const descriptors = model.capabilities?.optionDescriptors ?? [];
  const medium = descriptors.find(
    (descriptor) =>
      descriptor.type === "select" &&
      ["reasoningEffort", "effort", "thinkingLevel", "reasoning", "variant"].includes(
        descriptor.id,
      ) &&
      descriptor.options.some((option) => option.id === "medium"),
  );
  if (medium)
    return {
      modelSelection: {
        instanceId: provider.instanceId,
        model: model.slug,
        options: [{ id: medium.id, value: "medium" }],
      },
    };
  if (
    family === "anthropic" &&
    provider.driver !== "opencode" &&
    descriptors.some((descriptor) => descriptor.id === "thinking" && descriptor.type === "boolean")
  ) {
    return {
      modelSelection: {
        instanceId: provider.instanceId,
        model: model.slug,
        options: [{ id: "thinking", value: true }],
      },
      capabilityNotice:
        "Haiku supports Thinking enabled, but Medium is unavailable. Review the brief, then send it.",
    };
  }
  return canUseSelectedModel
    ? selectedModelFallback
    : `${model.name} does not support medium thinking. Choose another provider to summarize this thread.`;
}
