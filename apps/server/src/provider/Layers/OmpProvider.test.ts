import type { OmpSettings } from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import type * as EffectAcpSchema from "effect-acp/schema";

import {
  buildFailedOmpProviderSnapshot,
  buildInitialOmpProviderSnapshot,
  buildOmpModelsFromConfigOptions,
  discoverOmpModelsFromRuntime,
} from "./OmpProvider.ts";

const enabledSettings: OmpSettings = {
  enabled: true,
  binaryPath: "omp",
};

const ompConfigOptions = [
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "anthropic/claude-opus-4-6",
    options: [
      {
        value: "anthropic/claude-opus-4-6",
        name: "Claude Opus 4.6",
        description: "anthropic/claude-opus-4-6",
      },
      {
        value: "openrouter/deepseek/deepseek-r1:free",
        name: "DeepSeek R1 Free",
        description: "openrouter/deepseek/deepseek-r1:free",
      },
    ],
  },
  {
    id: "thinking",
    name: "Thinking",
    category: "thought_level",
    type: "select",
    currentValue: "xhigh",
    options: [
      { value: "off", name: "Off" },
      { value: "auto", name: "Auto", description: "Auto-detect per prompt" },
      { value: "minimal", name: "minimal" },
      { value: "xhigh", name: "xhigh" },
    ],
  },
] satisfies ReadonlyArray<EffectAcpSchema.SessionConfigOption>;

describe("buildOmpModelsFromConfigOptions", () => {
  it("preserves exact ACP model ids and maps OMP thinking levels", () => {
    expect(buildOmpModelsFromConfigOptions(ompConfigOptions)).toEqual([
      {
        slug: "anthropic/claude-opus-4-6",
        name: "Claude Opus 4.6",
        isCustom: false,
        capabilities: createModelCapabilities({
          optionDescriptors: [
            {
              id: "reasoning",
              label: "Thinking",
              type: "select",
              currentValue: "xhigh",
              options: [
                { id: "off", label: "Off" },
                { id: "auto", label: "Auto", description: "Auto-detect per prompt" },
                { id: "minimal", label: "minimal" },
                { id: "xhigh", label: "xhigh", isDefault: true },
              ],
            },
          ],
        }),
      },
      {
        slug: "openrouter/deepseek/deepseek-r1:free",
        name: "DeepSeek R1 Free",
        isCustom: false,
        capabilities: createModelCapabilities({
          optionDescriptors: [],
        }),
      },
    ]);
  });

  it("does not publish fallback models when ACP reports none", () => {
    expect(buildOmpModelsFromConfigOptions([])).toEqual([]);
  });
});

describe("discoverOmpModelsFromRuntime", () => {
  it.effect("discovers thinking choices per model and restores the original model", () =>
    Effect.gen(function* () {
      const modelA = "anthropic/claude-opus-4-6";
      const modelB = "openrouter/deepseek/deepseek-r1:free";
      let currentModel = modelA;
      const modelChanges: Array<string> = [];
      const configOptionsByModel: Readonly<
        Record<string, ReadonlyArray<EffectAcpSchema.SessionConfigOption>>
      > = {
        [modelA]: ompConfigOptions,
        [modelB]: ompConfigOptions.map((option) =>
          option.id === "model"
            ? { ...option, currentValue: modelB }
            : option.id === "thinking"
              ? {
                  ...option,
                  currentValue: "medium",
                  options: [
                    { value: "off", name: "Off" },
                    { value: "low", name: "low" },
                    { value: "medium", name: "medium" },
                  ],
                }
              : option,
        ),
      };
      const runtime = {
        getConfigOptions: Effect.sync(() => configOptionsByModel[currentModel] ?? []),
        setModel: (model: string) =>
          Effect.sync(() => {
            modelChanges.push(model);
            currentModel = model;
          }),
      };

      const models = yield* discoverOmpModelsFromRuntime(runtime);
      const reasoningChoices = models.map((model) => {
        const descriptor = model.capabilities?.optionDescriptors?.find(
          (option) => option.id === "reasoning",
        );
        return descriptor?.type === "select"
          ? descriptor.options.map((option) => option.id)
          : undefined;
      });

      expect(reasoningChoices).toEqual([
        ["off", "auto", "minimal", "xhigh"],
        ["off", "low", "medium"],
      ]);
      expect(modelChanges).toEqual([modelB, modelA]);
      expect(currentModel).toBe(modelA);
    }),
  );
});

describe("OMP provider snapshots", () => {
  it.effect("starts enabled providers in a model-free pending state", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialOmpProviderSnapshot(enabledSettings);
      expect(snapshot).toMatchObject({
        enabled: true,
        installed: true,
        status: "warning",
        version: null,
        models: [],
      });
      expect(snapshot.message).toContain("Checking Oh My Pi");
    }),
  );

  it("keeps failed probes model-free", () => {
    const snapshot = buildFailedOmpProviderSnapshot({
      checkedAt: "2026-09-01T00:00:00.000Z",
      ompSettings: enabledSettings,
      installed: false,
      version: null,
      message: "OMP CLI is not installed or not on PATH.",
    });

    expect(snapshot).toMatchObject({
      enabled: true,
      installed: false,
      status: "error",
      models: [],
    });
  });
});
