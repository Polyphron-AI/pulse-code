import { describe, expect, it } from "vite-plus/test";

import { ProviderInstanceId, type ModelSelection, type ServerConfig } from "@t3tools/contracts";

import {
  buildModelOptions,
  groupByProvider,
  isModelSelectionUnavailable,
  resolveDefaultableModelSelection,
  resolveSelectableModelSelection,
  resolveNewTaskModelSelection,
  type ModelOption,
} from "./modelOptions";

describe("mobile model options", () => {
  it("resolves Antigravity aliases within the selected account before availability checks", () => {
    const selection = {
      instanceId: ProviderInstanceId.make("google_work"),
      model: "account-default",
    };
    const config = {
      providers: [
        {
          instanceId: selection.instanceId,
          driver: "antigravity",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          models: [
            {
              slug: "account-model",
              name: "Account model",
              aliases: ["account-default"],
              capabilities: null,
            },
          ],
        },
      ],
    } as unknown as ServerConfig;
    expect(resolveSelectableModelSelection(config, selection)?.model).toBe("account-model");
    expect(isModelSelectionUnavailable(config, selection)).toBe(false);
    expect(isModelSelectionUnavailable(config, { ...selection, model: "removed-model" })).toBe(
      true,
    );
  });
  it("uses the shared Oh My Pi label when the server omits a display name", () => {
    const config = {
      providers: [
        {
          instanceId: "omp",
          driver: "omp",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          models: [
            {
              slug: "anthropic/claude-sonnet-4-6",
              name: "Claude Sonnet 4.6",
              isCustom: false,
              capabilities: null,
            },
          ],
        },
      ],
    } as unknown as ServerConfig;

    expect(buildModelOptions(config, null)[0]?.providerLabel).toBe("Oh My Pi");
  });

  it("groups models by provider and flags legacy entries", () => {
    const config = {
      providers: [
        {
          instanceId: "codex",
          driver: "codex",
          displayName: "Codex",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          models: [
            {
              slug: "gpt-5.6-sol",
              name: "GPT-5.6 Sol",
              isCustom: false,
              capabilities: null,
            },
            {
              slug: "gpt-5.4",
              name: "GPT-5.4",
              isCustom: false,
              isLegacy: true,
              capabilities: null,
            },
          ],
        },
      ],
    } as unknown as ServerConfig;

    expect(groupByProvider(buildModelOptions(config, null))).toMatchObject([
      {
        providerKey: "codex",
        providerLabel: "Codex",
        models: [
          { key: "codex:gpt-5.6-sol", label: "GPT-5.6 Sol", isLegacy: false },
          { key: "codex:gpt-5.4", label: "GPT-5.4", isLegacy: true },
        ],
      },
    ]);
  });

  it("does not materialize catalog defaults for missing stored options", () => {
    const config = {
      providers: [
        {
          instanceId: "codex",
          driver: "codex",
          displayName: "Codex",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          models: [
            {
              slug: "gpt-test",
              name: "GPT Test",
              isCustom: false,
              capabilities: {
                optionDescriptors: [
                  {
                    id: "serviceTier",
                    label: "Service Tier",
                    type: "select",
                    options: [
                      { id: "default", label: "Standard", isDefault: true },
                      { id: "priority", label: "Fast" },
                    ],
                    currentValue: "default",
                  },
                ],
              },
            },
          ],
        },
      ],
    } as unknown as ServerConfig;

    const [option] = buildModelOptions(config, {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-test",
    });

    expect(option?.capabilities?.optionDescriptors?.[0]?.id).toBe("serviceTier");
    expect(option?.selection.options).toBeUndefined();

    const [explicitOption] = buildModelOptions(config, {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-test",
      options: [{ id: "serviceTier", value: "priority" }],
    });
    expect(explicitOption?.selection.options).toEqual([{ id: "serviceTier", value: "priority" }]);
  });

  it("rejects stored selections whose provider is not usable", () => {
    const config = {
      providers: [
        {
          instanceId: "codex",
          driver: "codex",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          models: [],
        },
        {
          instanceId: "claudeAgent",
          driver: "claudeAgent",
          enabled: false,
          installed: true,
          auth: { status: "authenticated" },
          models: [],
        },
      ],
    } as unknown as ServerConfig;

    const usable = {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.6-sol",
    };
    const disabled = {
      instanceId: ProviderInstanceId.make("claudeAgent"),
      model: "claude-sonnet-5",
    };
    const removed = {
      instanceId: ProviderInstanceId.make("codex_personal"),
      model: "gpt-5.6-sol",
    };

    expect(resolveSelectableModelSelection(config, usable)).toBe(usable);
    expect(resolveSelectableModelSelection(config, disabled)).toBeNull();
    expect(resolveSelectableModelSelection(config, removed)).toBeNull();
    expect(isModelSelectionUnavailable(config, disabled)).toBe(false);
    // An offline environment has no config to validate.
    expect(resolveSelectableModelSelection(null, disabled)).toBe(disabled);
  });

  describe("Antigravity selections", () => {
    const selection = {
      instanceId: ProviderInstanceId.make("google_work"),
      model: "gemini-3.1-pro-high",
      options: [{ id: "native-option", value: "saved/opaque-choice" }],
    };
    const model = {
      slug: selection.model,
      name: "Gemini 3.1 Pro High",
      subProvider: "Google",
      isCustom: false,
      isDefault: true,
      isLegacy: true,
      capabilities: {
        optionDescriptors: [
          {
            id: "native-option",
            label: "Native option",
            type: "select",
            options: [{ id: "current/default", label: "Default", isDefault: true }],
            currentValue: "current/default",
          },
        ],
      },
    };
    const config = {
      providers: [
        {
          instanceId: selection.instanceId,
          driver: "antigravity",
          displayName: "Google Work",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          models: [model],
        },
      ],
    } as unknown as ServerConfig;

    it.each([
      ["disabled", { enabled: false }],
      ["uninstalled", { installed: false }],
      ["signed out", { auth: { status: "unauthenticated" } }],
      ["unavailable", { availability: "unavailable" }],
    ] as const)("keeps a %s provider's selection and known model details", (_state, update) => {
      const unavailableConfig = {
        ...config,
        providers: config.providers.map((provider) => ({ ...provider, ...update })),
      };

      expect(resolveSelectableModelSelection(unavailableConfig, selection)).toBe(selection);
      expect(resolveDefaultableModelSelection(unavailableConfig, selection)).toBe(selection);
      expect(isModelSelectionUnavailable(unavailableConfig, selection)).toBe(true);
      expect(buildModelOptions(unavailableConfig, null)).toEqual([]);
      const [option] = buildModelOptions(unavailableConfig, selection);
      expect(option).toMatchObject({
        key: `google_work:${selection.model}`,
        label: model.name,
        subtitle: "Google",
        providerKey: "google_work",
        providerLabel: "Google Work",
        providerDriver: "antigravity",
        isDefault: false,
        isLegacy: true,
        isUnavailable: true,
        capabilities: model.capabilities,
      });
      expect(option?.selection).toBe(selection);
    });

    it("keeps an exact selection when its model leaves and returns to the catalog", () => {
      const changedConfig = {
        ...config,
        providers: config.providers.map((provider) => ({
          ...provider,
          models: provider.models.map((model) => ({ ...model, slug: "gemini-3.1-pro-low" })),
        })),
      };

      expect(resolveDefaultableModelSelection(changedConfig, selection)).toBe(selection);
      expect(isModelSelectionUnavailable(changedConfig, selection)).toBe(true);
      const options = buildModelOptions(changedConfig, selection);
      const missing = options.find((option) => option.selection.model === selection.model);
      expect(missing).toMatchObject({
        label: selection.model,
        providerLabel: "Google Work",
        providerDriver: "antigravity",
        isUnavailable: true,
        capabilities: null,
      });
      expect(missing?.selection).toBe(selection);
      expect(
        resolveNewTaskModelSelection({
          draftSelection: null,
          projectDefaultSelection: resolveDefaultableModelSelection(changedConfig, selection),
          stickySelection: null,
          modelOptions: options,
        }),
      ).toBe(selection);

      const [restored] = buildModelOptions(config, selection);
      expect(isModelSelectionUnavailable(config, selection)).toBe(false);
      expect(restored?.isUnavailable).not.toBe(true);
      expect(restored?.selection).toBe(selection);
      expect(resolveDefaultableModelSelection(config, selection)).toBe(selection);
      expect(buildModelOptions(config, null)[0]?.selection.options).toBeUndefined();
    });

    it("uses configured instance metadata when provider status is missing", () => {
      const missingStatusConfig = {
        providers: [],
        settings: {
          providerInstances: {
            [selection.instanceId]: { driver: "antigravity", displayName: "Google Work" },
          },
        },
      } as unknown as ServerConfig;

      expect(resolveDefaultableModelSelection(missingStatusConfig, selection)).toBe(selection);
      expect(isModelSelectionUnavailable(missingStatusConfig, selection)).toBe(true);
      expect(buildModelOptions(missingStatusConfig, selection)).toMatchObject([
        {
          providerDriver: "antigravity",
          providerLabel: "Google Work",
          isUnavailable: true,
          selection,
        },
      ]);
    });

    it("keeps offline selections without assuming that an unknown instance is Antigravity", () => {
      const unknownConfig = { ...config, providers: [] };

      expect(resolveDefaultableModelSelection(null, selection)).toBe(selection);
      expect(isModelSelectionUnavailable(null, selection)).toBe(false);
      expect(buildModelOptions(null, selection)[0]?.selection).toBe(selection);
      expect(buildModelOptions(null, selection)[0]?.isUnavailable).not.toBe(true);
      expect(isModelSelectionUnavailable(unknownConfig, selection)).toBe(false);
      expect(resolveSelectableModelSelection(unknownConfig, selection)).toBeNull();
    });
  });

  it("keeps legacy models out of implicit defaults", () => {
    const config = {
      providers: [
        {
          instanceId: "codex",
          driver: "codex",
          displayName: "Codex",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          models: [
            { slug: "gpt-5.6-sol", name: "GPT-5.6 Sol", isCustom: false, capabilities: null },
            {
              slug: "gpt-5.4",
              name: "GPT-5.4",
              isCustom: false,
              isLegacy: true,
              capabilities: null,
            },
          ],
        },
      ],
    } as unknown as ServerConfig;

    const current = { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.6-sol" };
    const legacy = { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" };

    expect(resolveDefaultableModelSelection(config, current)).toBe(current);
    // A legacy last-used selection falls through to the provider default.
    expect(resolveDefaultableModelSelection(config, legacy)).toBeNull();
    // Offline: nothing to validate against, selection passes through.
    expect(resolveDefaultableModelSelection(null, legacy)).toBe(legacy);
  });
});

describe("mobile model aliases", () => {
  const config = {
    providers: [
      {
        instanceId: "work",
        driver: "claudeAgent",
        enabled: true,
        installed: true,
        auth: { status: "authenticated" },
        models: [
          {
            slug: "legacy-model",
            name: "Legacy",
            aliases: ["same-alias"],
            isLegacy: true,
            isCustom: false,
            capabilities: null,
          },
          { slug: "custom-alias", name: "Custom", isCustom: true, capabilities: null },
          {
            slug: "native-model",
            name: "Native",
            aliases: ["custom-alias"],
            isCustom: false,
            capabilities: null,
          },
        ],
      },
      {
        instanceId: "personal",
        driver: "claudeAgent",
        enabled: true,
        installed: true,
        auth: { status: "authenticated" },
        models: [
          {
            slug: "current-model",
            name: "Current",
            aliases: ["same-alias"],
            isCustom: false,
            capabilities: null,
          },
        ],
      },
    ],
  } as unknown as ServerConfig;

  it("resolves aliases only within their provider instance and enforces legacy defaults", () => {
    const work = { instanceId: ProviderInstanceId.make("work"), model: "same-alias" };
    const personal = { instanceId: ProviderInstanceId.make("personal"), model: "same-alias" };
    expect(resolveSelectableModelSelection(config, work)?.model).toBe("legacy-model");
    expect(resolveDefaultableModelSelection(config, work)).toBeNull();
    expect(resolveSelectableModelSelection(config, personal)?.model).toBe("current-model");
    expect(
      buildModelOptions(config, personal).filter((option) => option.providerKey === "personal"),
    ).toHaveLength(1);
  });

  it("preserves an exact custom slug when it shadows a built-in alias", () => {
    const selection = { instanceId: ProviderInstanceId.make("work"), model: "custom-alias" };
    expect(resolveSelectableModelSelection(config, selection)).toBe(selection);
  });
});

it("resolves new tasks from draft, project, sticky, then provider defaults", () => {
  const draft = { instanceId: ProviderInstanceId.make("codex"), model: "draft" };
  const project = { instanceId: ProviderInstanceId.make("codex"), model: "project" };
  const sticky = { instanceId: ProviderInstanceId.make("codex"), model: "sticky" };
  const providerDefault = {
    selection: { instanceId: ProviderInstanceId.make("codex"), model: "default" },
    isDefault: true,
  } as ModelOption;
  const resolve = (
    draftSelection: ModelSelection | null,
    projectDefaultSelection: ModelSelection | null,
    stickySelection: ModelSelection | null,
  ) =>
    resolveNewTaskModelSelection({
      draftSelection,
      projectDefaultSelection,
      stickySelection,
      modelOptions: [providerDefault],
    });

  expect(resolve(draft, project, sticky)).toBe(draft);
  expect(resolve(null, project, sticky)).toBe(project);
  expect(resolve(null, null, sticky)).toBe(sticky);
  expect(resolve(null, null, null)).toBe(providerDefault.selection);

  const unavailable = { ...providerDefault, isUnavailable: true };
  expect(
    resolveNewTaskModelSelection({
      draftSelection: null,
      projectDefaultSelection: null,
      stickySelection: null,
      modelOptions: [unavailable],
    }),
  ).toBeNull();
});
