import type { OmpSettings } from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import {
  buildFailedOmpProviderSnapshot,
  buildInitialOmpProviderSnapshot,
  parseOmpModelsJson,
} from "./OmpProvider.ts";

const enabledSettings: OmpSettings = {
  enabled: true,
  binaryPath: "omp",
};
const encodeUnknownJson = Schema.encodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

describe("parseOmpModelsJson", () => {
  it.effect("preserves selectors and maps reasoning metadata per model", () =>
    Effect.gen(function* () {
      const models = yield* parseOmpModelsJson(
        encodeUnknownJson({
          models: [
            {
              provider: "anthropic",
              id: "claude-opus-4-6",
              selector: "anthropic/claude-opus-4-6",
              name: "Claude Opus 4.6",
              contextWindow: 200_000,
              maxTokens: 32_000,
              reasoning: true,
              thinking: ["minimal", "xhigh"],
              input: ["text", "image"],
              cost: {},
            },
            {
              provider: "openrouter",
              id: "deepseek/deepseek-r1:free",
              selector: "openrouter/deepseek/deepseek-r1:free",
              name: "DeepSeek R1 Free",
              contextWindow: null,
              maxTokens: null,
              reasoning: false,
              thinking: null,
              input: ["text"],
              cost: {},
            },
            {
              provider: "example",
              id: "reasoning-without-efforts",
              selector: "Example/Reasoning:Exact",
              name: "Reasoning Without Efforts",
              contextWindow: null,
              maxTokens: null,
              reasoning: true,
              thinking: null,
              input: ["text"],
              cost: {},
            },
          ],
        }),
      );

      expect(models).toEqual([
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
                options: [
                  { id: "off", label: "Off" },
                  { id: "auto", label: "Auto" },
                  { id: "minimal", label: "minimal" },
                  { id: "xhigh", label: "xhigh" },
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
        {
          slug: "Example/Reasoning:Exact",
          name: "Reasoning Without Efforts",
          isCustom: false,
          capabilities: createModelCapabilities({
            optionDescriptors: [
              {
                id: "reasoning",
                label: "Thinking",
                type: "select",
                options: [
                  { id: "off", label: "Off" },
                  { id: "auto", label: "Auto" },
                ],
              },
            ],
          }),
        },
      ]);
    }),
  );

  it.effect("rejects malformed catalogs and publishes no fallback models", () =>
    Effect.gen(function* () {
      expect(yield* parseOmpModelsJson('{"models":').pipe(Effect.flip)).toBeDefined();
      expect(yield* parseOmpModelsJson('{"models":[]}')).toEqual([]);
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
