import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerConfig,
  type ServerProvider,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveDispatchReadyOmpEntries } from "./OmpThreadDialog.logic";

function ompProvider(input: {
  readonly instanceId: string;
  readonly model?: string;
  readonly enabled?: boolean;
}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver: ProviderDriverKind.make("omp"),
    displayName: "Oh My Pi",
    enabled: input.enabled ?? true,
    installed: true,
    status: "ready",
    availability: "available",
    models: input.model
      ? [{ slug: input.model, name: input.model, isDefault: true, isCustom: false }]
      : [],
  } as unknown as ServerProvider;
}

function config(input: {
  readonly provider: ServerProvider;
  readonly configured: boolean;
  readonly enabled?: boolean;
}): Pick<ServerConfig, "providers" | "settings"> {
  return {
    providers: [input.provider],
    settings: {
      providers: {},
      providerInstances: input.configured
        ? {
            [input.provider.instanceId]: {
              driver: "omp",
              enabled: input.enabled ?? true,
            },
          }
        : {},
    },
  } as unknown as Pick<ServerConfig, "providers" | "settings">;
}

describe("deriveDispatchReadyOmpEntries", () => {
  it("excludes cached catalogs while their environment is disconnected", () => {
    const serverConfig = config({
      provider: ompProvider({ instanceId: "omp_team", model: "anthropic/claude-sonnet" }),
      configured: true,
    });

    expect(deriveDispatchReadyOmpEntries(serverConfig, false)).toEqual([]);
  });

  it("applies settings so disabled and deleted custom instances cannot dispatch", () => {
    const snapshot = ompProvider({
      instanceId: "omp_team",
      model: "anthropic/claude-sonnet",
    });

    expect(
      deriveDispatchReadyOmpEntries(
        config({ provider: snapshot, configured: true, enabled: false }),
        true,
      ),
    ).toEqual([]);
    expect(
      deriveDispatchReadyOmpEntries(config({ provider: snapshot, configured: false }), true),
    ).toEqual([]);
  });

  it("keeps same-named instances scoped to the selected environment catalog", () => {
    const first = config({
      provider: ompProvider({ instanceId: "omp_team", model: "openai/gpt-5" }),
      configured: true,
    });
    const second = config({
      provider: ompProvider({ instanceId: "omp_team", model: "anthropic/claude-sonnet" }),
      configured: true,
    });

    expect(deriveDispatchReadyOmpEntries(first, true)[0]?.models[0]?.slug).toBe("openai/gpt-5");
    expect(deriveDispatchReadyOmpEntries(second, true)[0]?.models[0]?.slug).toBe(
      "anthropic/claude-sonnet",
    );
  });
});
