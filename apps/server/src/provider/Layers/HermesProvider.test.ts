import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { HermesSettings } from "@t3tools/contracts";

import {
  buildHermesDiscoveredModelsFromSessionModelState,
  buildInitialHermesProviderSnapshot,
  checkHermesProviderStatus,
  isLegacyHermesModel,
  isVettedHermesModel,
  parseHermesContextCompressionPercent,
  withHermesContextOption,
} from "./HermesProvider.ts";

const decodeHermesSettings = Schema.decodeSync(HermesSettings);

describe("buildInitialHermesProviderSnapshot", () => {
  it.effect("returns a disabled snapshot when settings.enabled is false", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialHermesProviderSnapshot(
        decodeHermesSettings({ enabled: false }),
      );
      expect(snapshot.enabled).toBe(false);
      expect(snapshot.status).toBe("disabled");
      expect(snapshot.installed).toBe(false);
      expect(snapshot.message).toContain("disabled");
    }),
  );

  it.effect("returns a pending snapshot by default", () =>
    Effect.gen(function* () {
      const snapshot = yield* buildInitialHermesProviderSnapshot(decodeHermesSettings({}));
      expect(snapshot.enabled).toBe(true);
      expect(snapshot.installed).toBe(true);
      expect(snapshot.status).toBe("warning");
      expect(snapshot.version).toBeNull();
      expect(snapshot.message).toContain("Checking Hermes");
      expect(snapshot.models.map((model) => model.slug)).toEqual(["hermes-default"]);
    }),
  );
});

describe("isVettedHermesModel", () => {
  it("keeps the connection's own model family on subscription routes", () => {
    expect(isVettedHermesModel("anthropic:claude-opus-4-6")).toBe(true);
    expect(isVettedHermesModel("anthropic:anthropic/claude-opus-5")).toBe(true);
    expect(isVettedHermesModel("anthropic:~anthropic/claude-opus-latest")).toBe(true);
    expect(isVettedHermesModel("openai-codex:gpt-5.3-codex")).toBe(true);
  });

  it("drops catalog noise the connection cannot actually serve", () => {
    expect(isVettedHermesModel("anthropic:google/gemini-2.5-pro")).toBe(false);
    expect(isVettedHermesModel("anthropic:mistralai/mistral-large")).toBe(false);
    expect(isVettedHermesModel("openai-codex:meta-llama/llama-4-scout")).toBe(false);
  });

  it("drops batch-only and non-chat modalities on every route", () => {
    expect(isVettedHermesModel("anthropic:anthropic/claude-opus-5:batch")).toBe(false);
    expect(isVettedHermesModel("openrouter:google/gemini-2.5-flash-image")).toBe(false);
    expect(isVettedHermesModel("openrouter:google/lyria-3-pro-preview")).toBe(false);
    expect(isVettedHermesModel("openrouter:meta-llama/llama-guard-4-12b")).toBe(false);
  });

  it("passes pay-per-use routes and unknown routes through", () => {
    expect(isVettedHermesModel("openrouter:deepseek/deepseek-chat")).toBe(true);
    expect(isVettedHermesModel("opencode-free:nemotron-3-ultra-free")).toBe(true);
    expect(isVettedHermesModel("some-future-route:whatever-model")).toBe(true);
  });
});

describe("isLegacyHermesModel", () => {
  it("groups pre-5 Claude generations as legacy", () => {
    expect(isLegacyHermesModel("anthropic:anthropic/claude-opus-4.6")).toBe(true);
    expect(isLegacyHermesModel("anthropic:anthropic/claude-sonnet-4.5")).toBe(true);
    expect(isLegacyHermesModel("anthropic:anthropic/claude-opus-5")).toBe(false);
    expect(isLegacyHermesModel("anthropic:anthropic/claude-fable-5")).toBe(false);
    expect(isLegacyHermesModel("anthropic:~anthropic/claude-opus-latest")).toBe(false);
  });

  it("groups pre-5 GPT generations as legacy and leaves other families current", () => {
    expect(isLegacyHermesModel("anthropic:openai/gpt-3.5-turbo")).toBe(true);
    expect(isLegacyHermesModel("openai-codex:gpt-5.3-codex")).toBe(false);
    expect(isLegacyHermesModel("openrouter:deepseek/deepseek-chat")).toBe(false);
  });
});

describe("buildHermesDiscoveredModelsFromSessionModelState", () => {
  const state = (currentModelId: string, modelIds: ReadonlyArray<string>) =>
    ({
      currentModelId,
      availableModels: modelIds.map((modelId) => ({ modelId, name: modelId })),
    }) as never;

  it("filters unvetted models, keeps the active model, and flags legacy ones", () => {
    const models = buildHermesDiscoveredModelsFromSessionModelState(
      state("anthropic:claude-opus-4-6", [
        "anthropic:claude-opus-4-6",
        "anthropic:anthropic/claude-opus-5",
        "anthropic:anthropic/claude-opus-4.6",
        "anthropic:anthropic/claude-opus-5:batch",
        "anthropic:google/gemini-2.5-pro",
      ]),
    );
    expect(models.map((model) => model.slug)).toEqual([
      "anthropic:claude-opus-4-6",
      "anthropic:anthropic/claude-opus-5",
      "anthropic:anthropic/claude-opus-4.6",
    ]);
    expect(models.map((model) => model.isLegacy === true)).toEqual([true, false, true]);
  });

  it("collapses -fast variants into a Fast Mode toggle on the base model", () => {
    const models = buildHermesDiscoveredModelsFromSessionModelState(
      state("anthropic:anthropic/claude-opus-5", [
        "anthropic:anthropic/claude-opus-5",
        "anthropic:anthropic/claude-opus-5-fast",
        "anthropic:anthropic/claude-fable-5",
      ]),
    );
    expect(models.map((model) => model.slug)).toEqual([
      "anthropic:anthropic/claude-opus-5",
      "anthropic:anthropic/claude-fable-5",
    ]);
    const opus = models[0]!;
    expect(opus.capabilities?.optionDescriptors?.map((descriptor) => descriptor.id)).toEqual([
      "fastMode",
    ]);
    const fable = models[1]!;
    expect(fable.capabilities?.optionDescriptors ?? []).toEqual([]);
  });

  it("keeps a -fast slug when it is the active model", () => {
    const models = buildHermesDiscoveredModelsFromSessionModelState(
      state("anthropic:anthropic/claude-opus-5-fast", [
        "anthropic:anthropic/claude-opus-5",
        "anthropic:anthropic/claude-opus-5-fast",
      ]),
    );
    expect(models.map((model) => model.slug)).toEqual([
      "anthropic:anthropic/claude-opus-5",
      "anthropic:anthropic/claude-opus-5-fast",
    ]);
  });

  it("leaves a lone -fast model in place with no toggle", () => {
    const models = buildHermesDiscoveredModelsFromSessionModelState(
      state("anthropic:anthropic/claude-opus-5", ["anthropic:anthropic/claude-opus-5-fast"]),
    );
    expect(models.map((model) => model.slug)).toEqual(["anthropic:anthropic/claude-opus-5-fast"]);
    expect(models[0]!.capabilities?.optionDescriptors ?? []).toEqual([]);
  });
});

describe("parseHermesContextCompressionPercent", () => {
  it("accepts whole percents, percent signs, and fractions", () => {
    expect(parseHermesContextCompressionPercent("50")).toBe(50);
    expect(parseHermesContextCompressionPercent("75%")).toBe(75);
    expect(parseHermesContextCompressionPercent("0.5")).toBe(50);
    expect(parseHermesContextCompressionPercent(" 1 ")).toBe(100);
  });

  it("rejects empty, non-numeric, and out-of-range values", () => {
    expect(parseHermesContextCompressionPercent("")).toBeUndefined();
    expect(parseHermesContextCompressionPercent(undefined)).toBeUndefined();
    expect(parseHermesContextCompressionPercent("abc")).toBeUndefined();
    expect(parseHermesContextCompressionPercent("0")).toBeUndefined();
    expect(parseHermesContextCompressionPercent("150")).toBeUndefined();
    expect(parseHermesContextCompressionPercent("-20")).toBeUndefined();
  });
});

describe("withHermesContextOption", () => {
  const model = {
    slug: "anthropic:anthropic/claude-opus-5",
    name: "claude-opus-5",
    isCustom: false,
    capabilities: { optionDescriptors: [] },
  } as never;

  it("appends a read-only Context descriptor showing the threshold", () => {
    const [withOption] = withHermesContextOption([model], 50);
    const descriptors = withOption!.capabilities?.optionDescriptors ?? [];
    expect(descriptors).toHaveLength(1);
    const descriptor = descriptors[0]!;
    expect(descriptor.id).toBe("contextCompression");
    expect(descriptor.readOnly).toBe(true);
    expect(descriptor.type === "select" && descriptor.currentValue).toBe("50");
    expect(descriptor.type === "select" && descriptor.options[0]?.label).toBe("Compress at 50%");
  });

  it("leaves models untouched when no threshold is known", () => {
    expect(withHermesContextOption([model], undefined)).toEqual([model]);
  });
});

/**
 * Writes a fake Hermes CLI into `dir` and returns its path. On Windows the
 * fixture is a `.cmd` batch file (spawned through cmd.exe by
 * resolveSpawnCommand); everywhere else it is a `#!/bin/sh` script.
 */
const writeFakeHermesCli = Effect.fn(function* (
  dir: string,
  output: { readonly stdout?: string; readonly stderr?: string; readonly exitCode: number },
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const isWindows = process.platform === "win32";
  const hermesPath = path.join(dir, isWindows ? "hermes.cmd" : "hermes");
  const lines = isWindows
    ? [
        "@echo off",
        ...(output.stdout !== undefined ? [`echo ${output.stdout}`] : []),
        ...(output.stderr !== undefined ? [`>&2 echo ${output.stderr}`] : []),
        `exit /b ${output.exitCode}`,
        "",
      ]
    : [
        "#!/bin/sh",
        ...(output.stdout !== undefined ? [`printf "%s\\n" "${output.stdout}"`] : []),
        ...(output.stderr !== undefined ? [`printf "%s\\n" "${output.stderr}" >&2`] : []),
        `exit ${output.exitCode}`,
        "",
      ];
  yield* fs.writeFileString(hermesPath, lines.join("\n"));
  yield* fs.chmod(hermesPath, 0o755);
  return hermesPath;
});

it.layer(NodeServices.layer)("checkHermesProviderStatus", (it) => {
  it.effect("reports the binary as missing when the binary path does not resolve", () =>
    Effect.gen(function* () {
      const snapshot = yield* checkHermesProviderStatus(
        decodeHermesSettings({
          enabled: true,
          binaryPath: "/definitely/not/installed/hermes-binary",
        }),
      );
      expect(snapshot.enabled).toBe(true);
      expect(snapshot.installed).toBe(false);
      expect(snapshot.status).toBe("error");
      expect(snapshot.message).toMatch(/not installed|not on PATH|Failed to execute/);
    }),
  );

  it.effect("reports an installed CLI as unhealthy when --version exits non-zero", () =>
    Effect.gen(function* () {
      const secretStderr = "broken hermes install: secret-token-value";
      const snapshot = yield* Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-hermes-version-" });
          const hermesPath = yield* writeFakeHermesCli(dir, { stderr: secretStderr, exitCode: 2 });

          return yield* checkHermesProviderStatus(
            decodeHermesSettings({ enabled: true, binaryPath: hermesPath }),
          );
        }),
      );

      expect(snapshot.enabled).toBe(true);
      expect(snapshot.installed).toBe(true);
      expect(snapshot.status).toBe("error");
      expect(snapshot.message).toBe("Hermes CLI is installed but failed to run.");
      expect(snapshot.message).not.toContain(secretStderr);
    }),
  );

  it.effect("reports an error when ACP model discovery is unavailable", () =>
    Effect.gen(function* () {
      const snapshot = yield* Effect.scoped(
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const dir = yield* fs.makeTempDirectoryScoped({ prefix: "t3code-hermes-success-" });
          const hermesPath = yield* writeFakeHermesCli(dir, {
            stdout: "hermes 0.0.99",
            exitCode: 0,
          });

          return yield* checkHermesProviderStatus(
            decodeHermesSettings({ enabled: true, binaryPath: hermesPath }),
          );
        }),
      );

      expect(snapshot.status).toBe("error");
      expect(snapshot.installed).toBe(true);
      expect(snapshot.models.map((model) => model.slug)).toEqual(["hermes-default"]);
      expect(snapshot.message).toContain("ACP startup");
    }),
  );
});
