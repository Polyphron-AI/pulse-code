import {
  DEFAULT_SERVER_SETTINGS,
  type ProjectScopedServerSettingKey,
  type ServerSettings,
  type UnifiedSettings,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useCallback, useMemo } from "react";

import {
  mergeEnvironmentSettings,
  persistClientSettingsPatch,
  useClientSettings,
} from "../../hooks/useSettings";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { toastManager } from "../ui/toast";
import { useOptionalSettingsScope, useSettingsScope } from "./SettingsScopeContext";
import {
  persistScopedSettingsPatch,
  planProjectOverridesClear,
  planScopedSettingsClear,
  planScopedSettingsPatch,
  scopedSettingsAreMixed,
  scopedSettingsSource,
  type ProjectOverrideEntry,
  type ScopedSettingsPatch,
} from "./scopedSettings";

/** Effective settings for the representative target: project overrides applied on top of its environment. */
export function useScopedSettings<T = UnifiedSettings>(
  selector?: (settings: UnifiedSettings) => T,
): T {
  const { target } = useSettingsScope();
  const clientSettings = useClientSettings();
  const serverSettings = target?.settings ?? DEFAULT_SERVER_SETTINGS;
  const settings = useMemo(
    () => mergeEnvironmentSettings(serverSettings, clientSettings),
    [clientSettings, serverSettings],
  );
  return useMemo(() => (selector ? selector(settings) : (settings as T)), [selector, settings]);
}

export function useScopedSettingsMixed(keys: readonly (keyof ServerSettings)[]): boolean {
  const { targets } = useSettingsScope();
  return scopedSettingsAreMixed(targets, keys);
}

/** Where the keys' effective values come from across the selected targets. */
export function useScopedSettingSource(keys: readonly (keyof ServerSettings)[]) {
  const { targets } = useSettingsScope();
  return scopedSettingsSource(targets, keys);
}

type WorkspaceDisplaySetting = "workspaceDisplayTimeZone" | "workspaceOwnerProfile";
function useRunScopedPlan(
  onError?: (error: unknown) => void,
  onUnsupportedSetting?: (key: WorkspaceDisplaySetting) => void,
) {
  const persistServer = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  return useCallback(
    async (plan: ReturnType<typeof planScopedSettingsPatch>) => {
      if (plan.unavailableReason) {
        toastManager.add({
          type: "warning",
          title: "Setting not saved",
          description: plan.unavailableReason,
        });
        return false;
      }
      const inlineFailures = new Set<string>();
      const { failedEnvironments, savedEnvironmentCount } = await persistScopedSettingsPatch(
        plan,
        async (input) => {
          const result = await persistServer(input);
          if (result._tag === "Failure") onError?.(squashAtomCommandFailure(result));
          else {
            const patch = input.input.patch;
            const saved = result.value;
            const zone = patch.workspaceDisplayTimeZone;
            const owner =
              patch.workspaceOwnerProfile === undefined || patch.workspaceOwnerProfile === null
                ? patch.workspaceOwnerProfile
                : {
                    displayName: patch.workspaceOwnerProfile.displayName.normalize("NFC").trim(),
                    initials: patch.workspaceOwnerProfile.initials.normalize("NFC").trim(),
                  };
            const unsupported: WorkspaceDisplaySetting[] = [];
            if (
              zone !== undefined &&
              (zone === null
                ? saved.workspaceDisplayTimeZone === null
                : saved.workspaceDisplayTimeZone !== zone)
            )
              unsupported.push("workspaceDisplayTimeZone");
            if (
              owner !== undefined &&
              (owner === null
                ? saved.workspaceOwnerProfile !== null
                : saved.workspaceOwnerProfile?.displayName !== owner.displayName ||
                  saved.workspaceOwnerProfile?.initials !== owner.initials)
            )
              unsupported.push("workspaceOwnerProfile");
            if (unsupported.length) {
              for (const key of unsupported) onUnsupportedSetting?.(key);
              if (onUnsupportedSetting) inlineFailures.add(input.environmentId);
              return { _tag: "Failure" as const };
            }
          }
          return result;
        },
        persistClientSettingsPatch,
      );
      if (failedEnvironments.length === 0) return true;
      const toastFailures = failedEnvironments.filter(
        (environment) => !inlineFailures.has(environment.environmentId),
      );
      if (toastFailures.length === 0) return false;
      toastManager.add({
        type: "error",
        title:
          savedEnvironmentCount > 0 ? "Setting saved on some environments" : "Setting not saved",
        description: `Could not update ${toastFailures.map((environment) => environment.label).join(", ")}.${savedEnvironmentCount > 0 ? " The other selected environments saved the change." : ""}`,
      });
      return false;
    },
    [persistServer, onError, onUnsupportedSetting],
  );
}

export function useUpdateScopedSettings(options?: {
  readonly onError?: (error: unknown) => void;
  readonly onUnsupportedSetting?: (key: WorkspaceDisplaySetting) => void;
}) {
  const { scope, environments } = useSettingsScope();
  const run = useRunScopedPlan(options?.onError, options?.onUnsupportedSetting);
  return useCallback(
    (patch: ScopedSettingsPatch) => run(planScopedSettingsPatch(scope, environments, patch)),
    [environments, run, scope],
  );
}

/**
 * Drop the project overrides for `keys` so the selected checkouts inherit
 * again. Rows also render outside the settings layout (provider cards,
 * dialogs), where there is no scope and nothing to clear.
 */
export function useClearScopedSettings() {
  const context = useOptionalSettingsScope();
  const run = useRunScopedPlan();
  return useCallback(
    (keys: readonly ProjectScopedServerSettingKey[]) => {
      if (context === null) return;
      run(planScopedSettingsClear(context.scope, context.environments, keys));
    },
    [context, run],
  );
}

/** Clear `keys` on specific project entries, from an environment scope's chain popover. */
export function useClearProjectOverrides() {
  const context = useOptionalSettingsScope();
  const run = useRunScopedPlan();
  return useCallback(
    (entries: readonly ProjectOverrideEntry[], keys: readonly ProjectScopedServerSettingKey[]) => {
      if (context === null) return;
      run(planProjectOverridesClear(context.environments, entries, keys));
    },
    [context, run],
  );
}
