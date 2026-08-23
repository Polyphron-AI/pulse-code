import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as EffectAcpErrors from "effect-acp/errors";

import {
  applyHermesAcpModelSelection,
  buildHermesAcpSpawnInput,
  requestedHermesAcpModelId,
  requestedHermesAcpModelIdForSelection,
  resolveHermesAcpBaseModelId,
} from "./HermesAcpSupport.ts";
import type { ModelSelection } from "@t3tools/contracts";

describe("resolveHermesAcpBaseModelId", () => {
  it("normalizes empty and dynamic Hermes model ids", () => {
    expect(resolveHermesAcpBaseModelId(undefined)).toBe("hermes-default");
    expect(resolveHermesAcpBaseModelId("   ")).toBe("hermes-default");
    expect(resolveHermesAcpBaseModelId("  openrouter:some/model  ")).toBe("openrouter:some/model");
  });
});

describe("requestedHermesAcpModelId", () => {
  it("never requests the placeholder default slug", () => {
    expect(requestedHermesAcpModelId(undefined)).toBeUndefined();
    expect(requestedHermesAcpModelId("hermes-default")).toBeUndefined();
    expect(requestedHermesAcpModelId("openrouter:some/model")).toBe("openrouter:some/model");
  });
});

describe("requestedHermesAcpModelIdForSelection", () => {
  const selection = (model: string, fastMode?: boolean): ModelSelection =>
    ({
      instanceId: "hermes",
      model,
      ...(fastMode === undefined ? {} : { options: [{ id: "fastMode", value: fastMode }] }),
    }) as unknown as ModelSelection;

  it("never requests the placeholder default, even with Fast Mode on", () => {
    expect(requestedHermesAcpModelIdForSelection(undefined)).toBeUndefined();
    expect(
      requestedHermesAcpModelIdForSelection(selection("hermes-default", true)),
    ).toBeUndefined();
  });

  it("maps an enabled Fast Mode toggle to the -fast variant id", () => {
    expect(requestedHermesAcpModelIdForSelection(selection("anthropic:claude-opus-5", true))).toBe(
      "anthropic:claude-opus-5-fast",
    );
  });

  it("leaves the base id alone when Fast Mode is off or unset", () => {
    expect(requestedHermesAcpModelIdForSelection(selection("anthropic:claude-opus-5", false))).toBe(
      "anthropic:claude-opus-5",
    );
    expect(requestedHermesAcpModelIdForSelection(selection("anthropic:claude-opus-5"))).toBe(
      "anthropic:claude-opus-5",
    );
  });

  it("does not double-append the suffix to an already-fast id", () => {
    expect(
      requestedHermesAcpModelIdForSelection(selection("anthropic:claude-opus-5-fast", true)),
    ).toBe("anthropic:claude-opus-5-fast");
  });
});

describe("buildHermesAcpSpawnInput", () => {
  it("spawns `hermes acp` and skips Hermes' own configured MCP servers", () => {
    const spawn = buildHermesAcpSpawnInput(
      { binaryPath: "/usr/local/bin/hermes" },
      "/tmp/project",
      {
        SOME_VAR: "kept",
      },
    );

    expect(spawn).toEqual({
      command: "/usr/local/bin/hermes",
      args: ["acp"],
      cwd: "/tmp/project",
      env: {
        SOME_VAR: "kept",
        HERMES_ACP_SKIP_CONFIGURED_MCP: "1",
      },
    });
  });

  it("falls back to the bare `hermes` binary when no path is configured", () => {
    const spawn = buildHermesAcpSpawnInput(undefined, "/tmp/project");
    expect(spawn.command).toBe("hermes");
    expect(spawn.args).toEqual(["acp"]);
  });
});

describe("applyHermesAcpModelSelection", () => {
  const makeRecordingRuntime = (failure?: EffectAcpErrors.AcpError) => {
    const modelCalls: Array<string> = [];
    const runtime = {
      setSessionModel: (modelId: string) =>
        Effect.gen(function* () {
          modelCalls.push(modelId);
          if (failure) return yield* failure;
          return {};
        }),
    };
    return { runtime, modelCalls };
  };

  it.effect("calls session/set_model when the requested model differs from current", () =>
    Effect.gen(function* () {
      const { runtime, modelCalls } = makeRecordingRuntime();
      const result = yield* applyHermesAcpModelSelection({
        runtime,
        currentModelId: "anthropic:claude-sonnet-5",
        requestedModelId: "openrouter:some/model",
        mapError: (cause) => cause.message,
      });
      expect(modelCalls).toEqual(["openrouter:some/model"]);
      expect(result).toBe("openrouter:some/model");
    }),
  );

  it.effect("skips set_model when requested matches current", () =>
    Effect.gen(function* () {
      const { runtime, modelCalls } = makeRecordingRuntime();
      const result = yield* applyHermesAcpModelSelection({
        runtime,
        currentModelId: "anthropic:claude-sonnet-5",
        requestedModelId: "anthropic:claude-sonnet-5",
        mapError: (cause) => cause.message,
      });
      expect(modelCalls).toEqual([]);
      expect(result).toBe("anthropic:claude-sonnet-5");
    }),
  );

  it.effect("skips set_model when no model is requested", () =>
    Effect.gen(function* () {
      const { runtime, modelCalls } = makeRecordingRuntime();
      const result = yield* applyHermesAcpModelSelection({
        runtime,
        currentModelId: "anthropic:claude-sonnet-5",
        requestedModelId: undefined,
        mapError: (cause) => cause.message,
      });
      expect(modelCalls).toEqual([]);
      expect(result).toBe("anthropic:claude-sonnet-5");
    }),
  );

  it.effect("propagates session/set_model failures via mapError", () =>
    Effect.gen(function* () {
      const failure = EffectAcpErrors.AcpRequestError.invalidParams("session id not known");
      const { runtime } = makeRecordingRuntime(failure);
      const error = yield* Effect.flip(
        applyHermesAcpModelSelection({
          runtime,
          currentModelId: "anthropic:claude-sonnet-5",
          requestedModelId: "openrouter:some/model",
          mapError: (cause) => cause.message,
        }),
      );
      expect(error).toBe(failure.message);
    }),
  );
});
