import type { EnvironmentId } from "@t3tools/contracts";
import { useEnvironmentSettings, useUpdateEnvironmentSettings } from "../../hooks/useSettings";
import { useEnvironments } from "../../state/environments";
import { Switch } from "../ui/switch";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

export function RestartContinuationEnvironmentRow({
  environmentId,
  label,
  connected,
}: {
  environmentId: EnvironmentId;
  label: string;
  connected: boolean;
}) {
  const enabled = useEnvironmentSettings(
    environmentId,
    (settings) => settings.continueThreadsAfterServerUpdate,
  );
  const updateSettings = useUpdateEnvironmentSettings(environmentId);
  return (
    <SettingsRow
      title={label}
      description="Automatically continue eligible active threads after this server or machine restarts. Applies only to this environment."
      resetAction={
        enabled && connected ? (
          <SettingResetButton
            label={`restart continuation for ${label}`}
            onClick={() => updateSettings({ continueThreadsAfterServerUpdate: false })}
          />
        ) : null
      }
      control={
        <Switch
          aria-label={`Continue threads after restart on ${label}`}
          checked={enabled}
          disabled={!connected}
          onCheckedChange={(checked) =>
            updateSettings({ continueThreadsAfterServerUpdate: checked })
          }
        />
      }
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
    <div>
      <SettingsRow
        {...searchableSetting("continue-threads-after-server-restart")}
        description="Off by default. Choose which environments may continue agent work automatically."
      />
      {supported.map((environment) => (
        <RestartContinuationEnvironmentRow
          key={environment.environmentId}
          environmentId={environment.environmentId}
          label={environment.label}
          connected={environment.connection.phase === "connected"}
        />
      ))}
    </div>
  );
}
