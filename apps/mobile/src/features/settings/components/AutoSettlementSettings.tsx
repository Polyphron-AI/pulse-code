import { useAtomValue } from "@effect/atom-react";
import {
  sharedServerSettingsWrites,
  supportsSharedSettingsSync,
} from "@t3tools/client-runtime/state/shared-settings";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEnvironments } from "../../../state/environments";
import { serverEnvironment } from "../../../state/server";
import { useAtomCommand } from "../../../state/use-atom-command";
import { SettingsSwitchRow } from "./SettingsSwitchRow";

export function EnvironmentAutoSettleSwitch({
  environmentId,
  label,
  connected,
}: {
  environmentId: EnvironmentId;
  label: string;
  connected: boolean;
}) {
  const settings = useAtomValue(serverEnvironment.settingsValueAtom(environmentId));
  const { environments } = useEnvironments();
  const updateSettings = useAtomCommand(
    serverEnvironment.updateSettings,
    "auto-settlement preference",
  );
  return (
    <SettingsSwitchRow
      icon="arrow.triangle.branch"
      label={`Auto-settle merged threads ? ${label}`}
      subtitle="Applies to all connected supported environments, including when clients are closed."
      value={settings?.sidebarAutoSettleOnMerge ?? true}
      disabled={!connected || settings === null}
      onValueChange={(enabled) => {
        if (!connected || settings === null) return;
        for (const write of sharedServerSettingsWrites(
          { sidebarAutoSettleOnMerge: enabled },
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

export function AutoSettlementSettings() {
  const { environments } = useEnvironments();
  return environments
    .filter(
      (environment) =>
        environment.serverConfig?.environment.capabilities.threadAutoSettlement === true,
    )
    .map((environment) => (
      <EnvironmentAutoSettleSwitch
        key={environment.environmentId}
        environmentId={environment.environmentId}
        label={environment.label}
        connected={environment.connection.phase === "connected"}
      />
    ));
}
