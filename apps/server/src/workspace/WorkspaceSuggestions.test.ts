import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import {
  DEFAULT_SERVER_SETTINGS,
  ProjectId,
  ThreadId,
  workspaceItemKey,
  TextGenerationError,
  type WorkspaceLinkEndpoint,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as ServerConfig from "../config.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as Repository from "../persistence/WorkspaceLinks.ts";
import * as Links from "./WorkspaceLinks.ts";
import { WorkspaceSuggestionCandidates } from "./WorkspaceSuggestionCandidates.ts";
import * as Suggestions from "./WorkspaceSuggestions.ts";
import {
  TextGeneration,
  type WorkspaceSuggestionsGenerationInput,
  type WorkspaceSuggestionsGenerationResult,
} from "../textGeneration/TextGeneration.ts";

const source: WorkspaceLinkEndpoint = {
  ref: { type: "thread", threadId: ThreadId.make("suggestion-source") },
  title: "Launch review",
};
const target: WorkspaceLinkEndpoint = {
  ref: { type: "project", projectId: ProjectId.make("launch") },
  title: "Launch",
};
const metadata = { key: workspaceItemKey(source.ref), title: source.title!, type: "thread" };
const targetMetadata = { key: workspaceItemKey(target.ref), title: target.title!, type: "project" };
const testLayer = () =>
  Layer.mergeAll(
    Links.layer.pipe(
      Layer.provideMerge(Repository.layer),
      Layer.provideMerge(SqlitePersistenceMemory),
    ),
    ServerConfig.layerTest(process.cwd(), { prefix: "suggestions-test-" }),
  ).pipe(Layer.provideMerge(NodeServices.layer));
const harness = Effect.gen(function* () {
  let revision = "first";
  let enabled = true;
  let model = "chosen-model";
  let output: WorkspaceSuggestionsGenerationResult = { suggestions: [] };
  let modelFails = false;
  let discoveryCount = 0;
  const calls: WorkspaceSuggestionsGenerationInput[] = [];
  const service = yield* Suggestions.make.pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.mock(ServerSettingsService)({
          getSettings: Effect.sync(() => ({
            ...DEFAULT_SERVER_SETTINGS,
            providerInstances: {},
            providers: {
              ...DEFAULT_SERVER_SETTINGS.providers,
              codex: { ...DEFAULT_SERVER_SETTINGS.providers.codex, enabled },
            },
            textGenerationModelSelection: {
              ...DEFAULT_SERVER_SETTINGS.textGenerationModelSelection,
              model,
            },
          })),
        }),
        Layer.mock(WorkspaceSuggestionCandidates)({
          source: (item) =>
            Effect.succeed({
              item,
              metadata,
              snippet: "Inert source ".repeat(1000),
              revision: { ...metadata, date: revision },
            }),
          candidates: () =>
            Effect.sync(() => {
              discoveryCount += 1;
              return { items: [{ item: target, metadata: targetMetadata }], incomplete: true };
            }),
        }),
        Layer.mock(TextGeneration)({
          generateWorkspaceSuggestions: (input) =>
            Effect.suspend(() => {
              calls.push(input);
              return modelFails
                ? Effect.fail(
                    new TextGenerationError({
                      operation: "generateWorkspaceSuggestions",
                      detail: "fixture failure",
                    }),
                  )
                : Effect.succeed(output);
            }),
        }),
      ),
    ),
  );
  return {
    service,
    calls,
    discoveryCount: () => discoveryCount,
    changeRevision: () => {
      revision = "changed";
    },
    changeModel: () => {
      model = "different-model";
    },
    disable: () => {
      enabled = false;
    },
    output: (next: WorkspaceSuggestionsGenerationResult) => {
      output = next;
    },
    fail: () => {
      modelFails = true;
    },
  };
});

describe("workspace suggestions", () => {
  it.effect(
    "caches empty results across service recreation and recomputes only for revision/model/manual refresh",
    () =>
      Effect.gen(function* () {
        const h = yield* harness;
        expect(yield* h.service.suggest({ item: source })).toMatchObject({
          status: "ready",
          cached: false,
          incomplete: true,
        });
        expect(yield* h.service.suggest({ item: source })).toMatchObject({
          status: "ready",
          cached: true,
          incomplete: true,
        });
        expect(h.calls).toHaveLength(1);
        expect(h.discoveryCount()).toBe(1);
        const restarted = yield* harness;
        expect(yield* restarted.service.suggest({ item: source })).toMatchObject({ cached: true });
        expect(restarted.calls).toHaveLength(0);
        h.changeRevision();
        yield* h.service.suggest({ item: source });
        h.changeModel();
        yield* h.service.suggest({ item: source });
        yield* h.service.suggest({ item: source, refresh: true });
        expect(h.calls).toHaveLength(4);
        expect(h.calls[0]?.modelSelection.model).toBe("chosen-model");
        expect(h.calls[0]?.source.snippet.length).toBeLessThanOrEqual(2048);
        expect(h.calls[0]?.candidates).toEqual([targetMetadata]);
      }).pipe(Effect.provide(testLayer()), Effect.scoped),
  );

  it.effect.each(["unknown", "duplicate", "too-many", "multiline", "long"])(
    "rejects %s output without creating a link or a successful cache",
    (mode) =>
      Effect.gen(function* () {
        const h = yield* harness;
        const valid = { key: targetMetadata.key, reason: "Same launch" };
        h.output({
          suggestions:
            mode === "unknown"
              ? [{ ...valid, key: "unknown" }]
              : mode === "duplicate"
                ? [valid, valid]
                : mode === "too-many"
                  ? [valid, valid, valid, valid]
                  : [
                      {
                        ...valid,
                        reason: mode === "multiline" ? "First\nSecond" : "x".repeat(241),
                      },
                    ],
        });
        expect((yield* h.service.suggest({ item: source })).status).toBe("failed");
        const links = yield* Links.WorkspaceLinks;
        expect((yield* links.list(source.ref)).suggested).toHaveLength(0);
        expect(
          (yield* links.contextFor({ threadId: ThreadId.make("suggestion-source") })).items,
        ).toHaveLength(0);
        h.output({ suggestions: [] });
        expect((yield* h.service.suggest({ item: source })).cached).toBe(false);
        expect(h.calls).toHaveLength(2);
      }).pipe(Effect.provide(testLayer()), Effect.scoped),
  );

  it.effect(
    "keeps manual linking usable with no model or a failed model and creates no suggestion context",
    () =>
      Effect.gen(function* () {
        const h = yield* harness;
        h.disable();
        expect((yield* h.service.suggest({ item: source })).status).toBe("no-model");
        expect(h.calls).toHaveLength(0);
        const links = yield* Links.WorkspaceLinks;
        yield* links.link({ a: source, b: target });
        expect(
          Option.isSome(
            yield* links.resolveLinked(
              { threadId: ThreadId.make("suggestion-source") },
              targetMetadata.key,
            ),
          ),
        ).toBe(true);
        const failing = yield* harness;
        failing.fail();
        expect((yield* failing.service.suggest({ item: source })).status).toBe("failed");
        expect((yield* links.list(source.ref)).linked).toHaveLength(1);
      }).pipe(Effect.provide(testLayer()), Effect.scoped),
  );
});
