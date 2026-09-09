import { DEFAULT_SERVER_SETTINGS, EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";

import {
  filterSharedServerPatch,
  findSharedSettingsMismatches,
  pickSharedServerSettings,
  splitSharedServerPatch,
  supportsSharedSettingsSync,
  sharedServerSettingsWrites,
} from "./sharedSettings.ts";

const primaryId = EnvironmentId.make("env-primary");
const laptopId = EnvironmentId.make("env-laptop");
const boxId = EnvironmentId.make("env-box");
const restartCapabilities = { threadRestartContinuation: true };

describe("supportsSharedSettingsSync", () => {
  it("accepts only connected servers that advertise the shared-settings capability", () => {
    expect(
      supportsSharedSettingsSync({
        connection: { phase: "connected" },
        serverConfig: { environment: { capabilities: { threadRestartContinuation: true } } },
      }),
    ).toBe(true);
    expect(
      supportsSharedSettingsSync({
        connection: { phase: "connected" },
        serverConfig: { environment: { capabilities: {} } },
      }),
    ).toBe(false);
    expect(
      supportsSharedSettingsSync({
        connection: { phase: "reconnecting" },
        serverConfig: { environment: { capabilities: { threadRestartContinuation: true } } },
      }),
    ).toBe(false);
  });
});

describe("splitSharedServerPatch", () => {
  it("routes preference keys to the shared patch and machine keys to the local patch", () => {
    const { sharedPatch, localPatch } = splitSharedServerPatch({
      defaultThreadEnvMode: "worktree" as const,
      continueThreadsAfterServerUpdate: true,
      enableAgentBrowserAccess: false,
    });
    expect(sharedPatch).toEqual({
      defaultThreadEnvMode: "worktree" as const,
      continueThreadsAfterServerUpdate: true,
    });
    expect(localPatch).toEqual({ enableAgentBrowserAccess: false });
  });
});

describe("pickSharedServerSettings", () => {
  it("returns only the shared keys", () => {
    expect(
      Object.keys(pickSharedServerSettings(DEFAULT_SERVER_SETTINGS, restartCapabilities)).sort(),
    ).toEqual([
      "continueThreadsAfterServerUpdate",
      "defaultThreadEnvMode",
      "newWorktreesStartFromOrigin",
      "sourceControlWritingStyle",
    ]);
  });
});

describe("filterSharedServerPatch", () => {
  it.each([true, false])("preserves supported restart preference %s", (enabled) => {
    const patch = {
      continueThreadsAfterServerUpdate: enabled,
      defaultThreadEnvMode: "worktree" as const,
    };
    expect(filterSharedServerPatch(patch, restartCapabilities)).toEqual(patch);
  });

  it.each([undefined, {}, { threadRestartContinuation: false }])(
    "omits only the unsupported restart preference with capabilities %j",
    (capabilities) => {
      expect(
        filterSharedServerPatch(
          { continueThreadsAfterServerUpdate: true, defaultThreadEnvMode: "worktree" as const },
          capabilities,
        ),
      ).toEqual({ defaultThreadEnvMode: "worktree" as const });
      expect(pickSharedServerSettings(DEFAULT_SERVER_SETTINGS, capabilities)).not.toHaveProperty(
        "continueThreadsAfterServerUpdate",
      );
    },
  );
});

describe("findSharedSettingsMismatches", () => {
  const primarySettings = { ...DEFAULT_SERVER_SETTINGS, defaultThreadEnvMode: "worktree" as const };

  it.each([true, false])(
    "detects remote restart continuation drift when the preference is %s",
    (enabled) => {
      const settings = { ...primarySettings, continueThreadsAfterServerUpdate: enabled };
      const remoteSettings = { ...settings, continueThreadsAfterServerUpdate: !enabled };
      const environment = {
        environmentId: boxId,
        label: "Remote Box",
        syncEligible: true,
        settings: remoteSettings,
        capabilities: restartCapabilities,
      };
      expect(
        findSharedSettingsMismatches({
          primaryEnvironmentId: primaryId,
          primarySettings: settings,
          primaryCapabilities: restartCapabilities,
          environments: [environment],
        }),
      ).toEqual([{ environmentId: boxId, label: "Remote Box" }]);
      expect(
        findSharedSettingsMismatches({
          primaryEnvironmentId: primaryId,
          primarySettings: settings,
          primaryCapabilities: restartCapabilities,
          environments: [
            {
              ...environment,
              settings: Object.assign(
                {},
                remoteSettings,
                pickSharedServerSettings(settings, restartCapabilities),
              ),
            },
          ],
        }),
      ).toEqual([]);
    },
  );

  it.each([
    [undefined, restartCapabilities],
    [restartCapabilities, undefined],
    [undefined, undefined],
  ])(
    "ignores restart drift unless both servers support it (%j, %j)",
    (primaryCapabilities, capabilities) => {
      const environment = {
        environmentId: boxId,
        label: "Remote Box",
        syncEligible: true,
        capabilities,
        settings: { ...primarySettings, continueThreadsAfterServerUpdate: true },
      };
      const input = {
        primaryEnvironmentId: primaryId,
        primarySettings,
        primaryCapabilities,
        environments: [environment],
      };
      expect(findSharedSettingsMismatches(input)).toEqual([]);
      expect(
        findSharedSettingsMismatches({
          ...input,
          environments: [
            {
              ...environment,
              settings: { ...environment.settings, defaultThreadEnvMode: "local" as const },
            },
          ],
        }),
      ).toEqual([{ environmentId: boxId, label: "Remote Box" }]);
    },
  );

  it("lists sync-eligible environments whose shared settings differ", () => {
    const mismatches = findSharedSettingsMismatches({
      primaryEnvironmentId: primaryId,
      primarySettings,
      environments: [
        {
          environmentId: primaryId,
          label: "Desktop",
          syncEligible: true,
          settings: primarySettings,
        },
        {
          environmentId: laptopId,
          label: "Laptop",
          syncEligible: true,
          settings: primarySettings,
        },
        {
          environmentId: boxId,
          label: "Remote Box",
          syncEligible: true,
          settings: DEFAULT_SERVER_SETTINGS,
        },
      ],
    });
    expect(mismatches).toEqual([{ environmentId: boxId, label: "Remote Box" }]);
  });

  it("ignores machine-only differences", () => {
    const mismatches = findSharedSettingsMismatches({
      primaryEnvironmentId: primaryId,
      primarySettings,
      environments: [
        {
          environmentId: boxId,
          label: "Remote Box",
          syncEligible: true,
          settings: { ...primarySettings, enableAgentBrowserAccess: false },
        },
      ],
    });
    expect(mismatches).toEqual([]);
  });

  it("reports nothing until the primary environment's settings are loaded", () => {
    const environments = [
      {
        environmentId: boxId,
        label: "Remote Box",
        syncEligible: true,
        settings: primarySettings,
      },
    ];
    expect(
      findSharedSettingsMismatches({ primaryEnvironmentId: null, primarySettings, environments }),
    ).toEqual([]);
    expect(
      findSharedSettingsMismatches({
        primaryEnvironmentId: primaryId,
        primarySettings: null,
        environments,
      }),
    ).toEqual([]);
  });

  it("skips ineligible environments and environments without a loaded config", () => {
    const mismatches = findSharedSettingsMismatches({
      primaryEnvironmentId: primaryId,
      primarySettings,
      environments: [
        {
          environmentId: laptopId,
          label: "Laptop",
          syncEligible: false,
          settings: DEFAULT_SERVER_SETTINGS,
        },
        { environmentId: boxId, label: "Remote Box", syncEligible: true, settings: null },
      ],
    });
    expect(mismatches).toEqual([]);
  });
});

describe("sharedServerSettingsWrites", () => {
  it("writes only requested preferences to eligible loaded targets and preserves false", () => {
    const target = {
      environmentId: primaryId,
      label: "Desktop",
      syncEligible: true,
      settings: DEFAULT_SERVER_SETTINGS,
      capabilities: restartCapabilities,
    };
    expect(
      sharedServerSettingsWrites(
        { continueThreadsAfterServerUpdate: false, enableAgentBrowserAccess: true },
        [
          target,
          { ...target, environmentId: laptopId, syncEligible: false },
          { ...target, environmentId: boxId, settings: null },
        ],
      ),
    ).toEqual([
      { environmentId: primaryId, input: { patch: { continueThreadsAfterServerUpdate: false } } },
    ]);
    expect(
      sharedServerSettingsWrites({ continueThreadsAfterServerUpdate: true }, [
        { ...target, capabilities: {} },
      ]),
    ).toEqual([]);
    expect(sharedServerSettingsWrites({ enableAgentBrowserAccess: true }, [target])).toEqual([]);
  });
});
