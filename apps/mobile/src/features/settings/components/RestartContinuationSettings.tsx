import { useAtomValue } from "@effect/atom-react";
import {
  findSharedSettingsMismatches,
  pickSharedServerSettings,
  sharedServerSettingsWrites,
  supportsSharedSettingsSync,
} from "@t3tools/client-runtime/state/shared-settings";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEnvironments } from "../../../state/environments";
import { serverEnvironment } from "../../../state/server";
import { useAtomCommand } from "../../../state/use-atom-command";
import { SettingsRow } from "./SettingsRow";
import { SettingsSection } from "./SettingsSection";
import { SettingsSwitchRow } from "./SettingsSwitchRow";

export function EnvironmentRestartSwitch({
  environmentId,
  label,
  connected,
}: {
  environmentId: EnvironmentId;
  label: string;
  connected: boolean;
}) {
  const { environments } = useEnvironments();
  const settings = useAtomValue(serverEnvironment.settingsValueAtom(environmentId));
  const updateSettings = useAtomCommand(
    serverEnvironment.updateSettings,
    "restart continuation setting",
  );
  return (
    <SettingsSwitchRow
      icon="arrow.clockwise"
      label={label}
      subtitle="Changes apply to all connected environments that support restart continuation."
      value={settings?.continueThreadsAfterServerUpdate === true}
      disabled={!connected}
      onValueChange={(enabled) => {
        if (!connected) return;
        for (const write of sharedServerSettingsWrites(
          { continueThreadsAfterServerUpdate: enabled },
          environments.map((environment) => ({
            environmentId: environment.environmentId,
            label: environment.label,
            syncEligible: supportsSharedSettingsSync(environment),
            settings: environment.serverConfig?.settings ?? null,
            capabilities: environment.serverConfig?.environment.capabilities,
          })),
        ))
          void updateSettings(write);
      }}
    />
  );
}

export function RestartContinuationSettings() {
  const { environments } = useEnvironments();
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, "shared settings update");
  const targets = environments.map((environment) => ({
    environmentId: environment.environmentId,
    label: environment.label,
    syncEligible: supportsSharedSettingsSync(environment),
    settings: environment.serverConfig?.settings ?? null,
    capabilities: environment.serverConfig?.environment.capabilities,
  }));
  const source = targets.find(
    (environment) => environment.syncEligible && environment.settings !== null,
  );
  const mismatches = findSharedSettingsMismatches({
    primaryEnvironmentId: source?.environmentId ?? null,
    primarySettings: source?.settings ?? null,
    primaryCapabilities: source?.capabilities,
    environments: targets,
  });
  const supported = environments.filter(
    (environment) =>
      environment.serverConfig?.environment.capabilities.threadRestartContinuation === true,
  );
  if (supported.length === 0) return null;
  return (
    <SettingsSection title="Continue threads after restart">
      {source && source.settings && mismatches.length > 0 ? (
        <SettingsRow
          icon="arrow.clockwise"
          label="Apply shared preferences to all"
          value={source.label}
          onPress={() => {
            if (!source.settings) return;
            for (const write of sharedServerSettingsWrites(
              pickSharedServerSettings(source.settings, source.capabilities),
              targets,
            ))
              void updateSettings(write);
          }}
        />
      ) : null}
      {supported.map((environment) => (
        <EnvironmentRestartSwitch
          key={environment.environmentId}
          environmentId={environment.environmentId}
          label={environment.label}
          connected={environment.connection.phase === "connected"}
        />
      ))}
    </SettingsSection>
  );
}
