import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEnvironments } from "../../../state/environments";
import { serverEnvironment } from "../../../state/server";
import { useAtomCommand } from "../../../state/use-atom-command";
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
  const settings = useAtomValue(serverEnvironment.settingsValueAtom(environmentId));
  const updateSettings = useAtomCommand(
    serverEnvironment.updateSettings,
    "restart continuation setting",
  );
  return (
    <SettingsSwitchRow
      icon="arrow.clockwise"
      label={label}
      subtitle="Continue eligible active threads after this server or machine restarts."
      value={settings?.continueThreadsAfterServerUpdate === true}
      disabled={!connected}
      onValueChange={(enabled) => {
        void updateSettings({
          environmentId,
          input: { patch: { continueThreadsAfterServerUpdate: enabled } },
        });
      }}
    />
  );
}

export function RestartContinuationSettings() {
  const { environments } = useEnvironments();
  const supported = environments.filter(
    (environment) =>
      environment.serverConfig?.environment.capabilities.threadRestartContinuation === true,
  );
  if (supported.length === 0) return null;
  return (
    <SettingsSection title="Continue threads after restart">
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
