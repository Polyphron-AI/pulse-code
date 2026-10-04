import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { ProviderDriverKind, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import * as ServerConfig from "../config.ts";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as AdapterRegistry from "../orchestration-v2/ProviderAdapterRegistry.ts";
import * as PulseMcpConfig from "./PulseMcpConfigService.ts";
import * as PulseProvider from "./PulseProviderService.ts";

const instanceId = ProviderInstanceId.make("codex_test");
const threadId = ThreadId.make("mcp-draft");
const modelSelection = { instanceId, model: "test-model" };
const configLayer = ServerConfig.layerTest(process.cwd(), { prefix: "pulse-provider-test-" });
const secrets = ServerSecretStore.layer.pipe(Layer.provide(configLayer));
const pulseConfig = PulseMcpConfig.layer.pipe(Layer.provide(secrets), Layer.provide(configLayer));
const unexpected = () => Effect.die("Empty MCP selections must not launch a provider.");
const registry = Layer.succeed(AdapterRegistry.ProviderAdapterRegistryV2, {
  list: () => Effect.succeed([instanceId]),
  get: () =>
    Effect.succeed({
      instanceId,
      driver: ProviderDriverKind.make("codex"),
      getCapabilities: unexpected,
      planSelectionTransition: unexpected,
      openSession: unexpected,
    }),
});
const service = PulseProvider.layer.pipe(Layer.provide(pulseConfig), Layer.provide(registry));
const testLayer = Layer.mergeAll(service, pulseConfig).pipe(Layer.provide(NodeServices.layer));
const prepareInput = {
  threadId,
  connectionIds: [],
  providerSession: {
    threadId,
    providerInstanceId: instanceId,
    modelSelection,
    runtimeMode: "full-access" as const,
  },
};
const consumeInput = {
  threadId,
  providerInstanceId: instanceId,
  modelSelection,
  runtimeMode: "full-access" as const,
  commandId: "first",
};

describe("Pulse provider MCP admission", () => {
  it.effect(
    "admits an explicit empty selection without launching a provider and binds it to one command",
    () =>
      Effect.gen(function* () {
        const provider = yield* PulseProvider.PulseProviderService;
        const prepared = yield* provider.preparePulseMcp(prepareInput);
        expect(prepared.status).toBe("ready");
        if (prepared.status !== "ready") return;
        yield* provider.consumePulseMcpPreparation({
          ...consumeInput,
          preparationId: prepared.preparationId,
        });
        const reused = yield* provider
          .consumePulseMcpPreparation({
            ...consumeInput,
            preparationId: prepared.preparationId,
            commandId: "other",
          })
          .pipe(Effect.result);
        expect(reused._tag).toBe("Failure");
      }).pipe(Effect.provide(testLayer)),
  );

  it.effect("rejects expired readiness before admitting a turn", () =>
    Effect.gen(function* () {
      const provider = yield* PulseProvider.PulseProviderService;
      const prepared = yield* provider.preparePulseMcp(prepareInput);
      if (prepared.status !== "ready") throw new Error("Empty selection should be ready.");
      yield* TestClock.adjust("6 minutes");
      const result = yield* provider
        .consumePulseMcpPreparation({ ...consumeInput, preparationId: prepared.preparationId })
        .pipe(Effect.result);
      expect(result._tag).toBe("Failure");
    }).pipe(Effect.provide(testLayer)),
  );

  it.effect("rejects a readiness token after the selected model changes", () =>
    Effect.gen(function* () {
      const provider = yield* PulseProvider.PulseProviderService;
      const prepared = yield* provider.preparePulseMcp(prepareInput);
      if (prepared.status !== "ready") throw new Error("Empty selection should be ready.");
      const result = yield* provider
        .consumePulseMcpPreparation({
          ...consumeInput,
          preparationId: prepared.preparationId,
          modelSelection: { ...modelSelection, model: "other-model" },
        })
        .pipe(Effect.result);
      expect(result._tag).toBe("Failure");
    }).pipe(Effect.provide(testLayer)),
  );
});
