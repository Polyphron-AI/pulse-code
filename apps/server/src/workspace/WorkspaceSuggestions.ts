import * as NodeCrypto from "node:crypto";
import {
  workspaceItemKey,
  WorkspaceLinksError,
  type WorkspaceLinkEndpoint,
  type WorkspaceSuggestionState,
} from "@t3tools/contracts";
import { isModelSelectionProviderEnabled } from "@t3tools/shared/serverSettings";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { ServerSettingsService } from "../serverSettings.ts";
import { ServerConfig } from "../config.ts";
import { WorkspaceLinksRepository } from "../persistence/WorkspaceLinks.ts";
import { makeKeyedSerialExecutor } from "../orchestration-v2/KeyedSerialExecutor.ts";
import { TextGeneration } from "../textGeneration/TextGeneration.ts";
import { WorkspaceSuggestionsOutput } from "../textGeneration/TextGenerationPrompts.ts";
import { WorkspaceLinks } from "./WorkspaceLinks.ts";
import { WorkspaceSuggestionCandidates } from "./WorkspaceSuggestionCandidates.ts";

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const validateOutput = Schema.decodeUnknownEffect(WorkspaceSuggestionsOutput);
const failure = (message: string) => new WorkspaceLinksError({ kind: "unavailable", message });

export const make = Effect.gen(function* () {
  const settings = yield* ServerSettingsService;
  const config = yield* ServerConfig;
  const generation = yield* TextGeneration;
  const candidates = yield* WorkspaceSuggestionCandidates;
  const repository = yield* WorkspaceLinksRepository;
  const links = yield* WorkspaceLinks;
  const serial = yield* makeKeyedSerialExecutor<string>();
  const suggest = (input: { readonly item: WorkspaceLinkEndpoint; readonly refresh?: boolean }) =>
    serial
      .withLock(
        workspaceItemKey(input.item.ref),
        Effect.gen(function* (): Effect.fn.Return<WorkspaceSuggestionState, WorkspaceLinksError> {
          const current = yield* settings.getSettings.pipe(
            Effect.mapError(() => failure("Text generation settings could not be loaded.")),
          );
          const selection = current.textGenerationModelSelection;
          if (!selection.model.trim() || !isModelSelectionProviderEnabled(current, selection))
            return {
              status: "no-model",
              message: "Set up a text generation model in Settings to see suggestions.",
              cached: false,
              incomplete: false,
            };
          const model = `${selection.instanceId}: ${selection.model}`;
          const modelKey = encodeJson({ version: 1, selection });
          const source = yield* candidates
            .source(input.item)
            .pipe(
              Effect.mapError(() =>
                failure("This source is unavailable for suggestions. Reconnect it or retry."),
              ),
            );
          const revision = NodeCrypto.createHash("sha256")
            .update(encodeJson(source.revision))
            .digest("hex");
          const cached = input.refresh
            ? Option.none()
            : yield* repository
                .suggestionsCached(workspaceItemKey(input.item.ref), revision, modelKey)
                .pipe(
                  Effect.mapError(() => failure("Suggestions could not be loaded. Try again.")),
                );
          if (Option.isSome(cached))
            return {
              status: "ready",
              model,
              cached: true,
              incomplete: cached.value.incomplete,
              ...(cached.value.incomplete
                ? {
                    message:
                      "Discovery was bounded; some mail sources or older results were not searched.",
                  }
                : {}),
            };
          const found = yield* candidates
            .candidates(source.metadata)
            .pipe(
              Effect.mapError(() =>
                failure("Suggestion candidates could not be loaded. Try again."),
              ),
            );
          const result =
            found.items.length === 0
              ? { suggestions: [] }
              : yield* generation
                  .generateWorkspaceSuggestions({
                    cwd: config.cwd,
                    modelSelection: selection,
                    source: { ...source.metadata, snippet: source.snippet.slice(0, 2048) },
                    candidates: found.items.map((candidate) => candidate.metadata),
                  })
                  .pipe(
                    Effect.flatMap(validateOutput),
                    Effect.mapError(() =>
                      failure(
                        "The text generation model could not produce valid suggestions. Retry or check Settings.",
                      ),
                    ),
                  );
          const known = new Map(
            found.items.map((candidate) => [candidate.metadata.key, candidate.item]),
          );
          const seen = new Set<string>();
          const suggestions: Array<{ item: WorkspaceLinkEndpoint; reason: string }> = [];
          for (const suggestion of result.suggestions) {
            const item = known.get(suggestion.key);
            if (!item || seen.has(suggestion.key) || !suggestion.reason.trim())
              return yield* failure(
                "The model returned an unknown, repeated or invalid suggestion. Retry to generate a new result.",
              );
            seen.add(suggestion.key);
            suggestions.push({ item, reason: suggestion.reason.trim() });
          }
          yield* links.saveSuggestions({
            item: source.item,
            suggestions,
            model,
            modelKey,
            revision,
            incomplete: found.incomplete,
          });
          return {
            status: "ready",
            model,
            cached: false,
            incomplete: found.incomplete,
            ...(found.incomplete
              ? {
                  message:
                    "Discovery was bounded; some mail sources or older results were not searched.",
                }
              : {}),
          };
        }),
      )
      .pipe(
        Effect.catch((error) =>
          Effect.succeed<WorkspaceSuggestionState>({
            status: "failed",
            message: error.message,
            cached: false,
            incomplete: false,
          }),
        ),
      );
  return { suggest: suggest };
});
export class WorkspaceSuggestions extends Context.Service<
  WorkspaceSuggestions,
  Effect.Success<typeof make>
>()("t3/workspace/WorkspaceSuggestions") {}
export const layer = Layer.effect(WorkspaceSuggestions, make);
