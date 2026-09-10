import { describe, expect, it, assert } from "@effect/vitest";
import { ProviderDriverKind, type ServerProviderModel } from "@t3tools/contracts";
import {
  applyManifestDefault,
  type ModelManifestData,
  BUNDLED_MODEL_MANIFEST,
  classifyModels,
  decodeModelManifest,
  resolveProviderCatalog,
} from "./ModelManifest.ts";

const model = (overrides: Partial<ServerProviderModel>): ServerProviderModel => ({
  slug: "gpt-test",
  name: "GPT Test",
  isCustom: false,
  capabilities: null,
  ...overrides,
});

describe("applyManifestDefault", () => {
  it("moves the default flag and its aliases to the manifest's chat default", () => {
    const driver = ProviderDriverKind.make("antigravity");
    const manifest: ModelManifestData = {
      version: 1,
      currentModels: {},
      providers: {
        antigravity: {
          defaults: { chat: "gemini-new" },
          profiles: {},
          models: [{ slug: "gemini-new", name: "New", status: "current" }],
        },
      },
    };
    const models = [
      model({ slug: "gemini-old", isDefault: true, aliases: ["antigravity-default"] }),
      model({ slug: "gemini-new" }),
    ];
    assert.deepStrictEqual(applyManifestDefault(models, manifest, driver), [
      model({ slug: "gemini-old" }),
      model({ slug: "gemini-new", isDefault: true, aliases: ["antigravity-default"] }),
    ]);
    // The account does not offer the manifest default: keep the runtime's choice.
    assert.deepStrictEqual(
      applyManifestDefault(models.slice(0, 1), manifest, driver),
      models.slice(0, 1),
    );
  });
});

const fixture = () => ({
  version: 1,
  currentModels: {},
  providers: {
    claudeAgent: {
      defaults: { chat: "synthetic" },
      profiles: { balanced: { capabilities: { optionDescriptors: [] } } },
      models: [
        {
          slug: "synthetic",
          name: "Synthetic",
          aliases: ["alias"],
          status: "current",
          profile: "balanced",
        },
      ],
    },
  },
});

describe("bundled model catalog validation", () => {
  it("resolves presentation, aliases, defaults and profile capabilities", () => {
    const result = resolveProviderCatalog(
      decodeModelManifest(fixture()),
      ProviderDriverKind.make("claudeAgent"),
    );
    expect(result?.defaults.chat).toBe("synthetic");
    expect(result?.models[0]?.model).toMatchObject({
      slug: "synthetic",
      aliases: ["alias"],
      isDefault: true,
      capabilities: { optionDescriptors: [] },
    });
  });

  it("rejects an unknown model profile", () => {
    const input = fixture();
    input.providers.claudeAgent.models[0]!.profile = "missing";
    expect(() => decodeModelManifest(input)).toThrow();
  });

  it("rejects duplicate slugs and dangling defaults", () => {
    const input = fixture();
    input.providers.claudeAgent.models.push({ ...input.providers.claudeAgent.models[0]! });
    expect(() => decodeModelManifest(input)).toThrow();
    const invalidDefault = fixture();
    invalidDefault.providers.claudeAgent.defaults.chat = "missing";
    expect(() => decodeModelManifest(invalidDefault)).toThrow();
  });

  it("preserves custom models and providers absent from the catalog, including OMP", () => {
    const models = [
      { slug: "my-model", name: "My model", isCustom: true, capabilities: null },
      { slug: "omp-native", name: "Native", isCustom: false, capabilities: null },
    ];
    expect(classifyModels(models, BUNDLED_MODEL_MANIFEST, ProviderDriverKind.make("omp"))).toEqual(
      models,
    );
    expect(
      classifyModels(models.slice(0, 1), BUNDLED_MODEL_MANIFEST, ProviderDriverKind.make("codex")),
    ).toEqual(models.slice(0, 1));
  });

  it("validates Claude runtime compatibility metadata", () => {
    const input = fixture();
    Object.assign(input.providers.claudeAgent.models[0]!, {
      adapter: { claudeCode: { minVersion: "invalid" } },
    });
    expect(() => decodeModelManifest(input)).toThrow();
  });
});
