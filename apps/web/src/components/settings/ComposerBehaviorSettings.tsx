import type { ComposerBusyBehavior } from "@t3tools/contracts";
import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";
import { usePrimarySettings, useUpdatePrimarySettings } from "../../hooks/useSettings";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { SettingResetButton, SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const COMPOSER_BUSY_BEHAVIOR_LABELS: Record<ComposerBusyBehavior, string> = {
  queue: "Queue",
  steer: "Steer",
};

export function ComposerBehaviorSettings() {
  const composerBusyBehavior = usePrimarySettings((settings) => settings.composerBusyBehavior);
  const updateSettings = useUpdatePrimarySettings();
  return (
    <SettingsRow
      {...searchableSetting("messages-while-working")}
      description="Queue starts a follow-up turn. Steer adjusts the turn already in progress."
      resetAction={
        composerBusyBehavior !== DEFAULT_UNIFIED_SETTINGS.composerBusyBehavior ? (
          <SettingResetButton
            label="messages while working"
            onClick={() =>
              updateSettings({
                composerBusyBehavior: DEFAULT_UNIFIED_SETTINGS.composerBusyBehavior,
              })
            }
          />
        ) : null
      }
      control={
        <Select
          value={composerBusyBehavior}
          onValueChange={(value) => {
            if (value === "queue" || value === "steer") {
              updateSettings({ composerBusyBehavior: value });
            }
          }}
        >
          <SelectTrigger className="w-full sm:w-40" aria-label="Messages while working">
            <SelectValue>{COMPOSER_BUSY_BEHAVIOR_LABELS[composerBusyBehavior]}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            <SelectItem hideIndicator value="queue">
              {COMPOSER_BUSY_BEHAVIOR_LABELS.queue}
            </SelectItem>
            <SelectItem hideIndicator value="steer">
              {COMPOSER_BUSY_BEHAVIOR_LABELS.steer}
            </SelectItem>
          </SelectPopup>
        </Select>
      }
    />
  );
}
