import {
  type EnvironmentId,
  ServerSettingsError,
  WorkspaceDisplayTimeZone,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useState } from "react";
import { useSettingsScope } from "../settings/SettingsScopeContext";
import { useScopedSettings, useUpdateScopedSettings } from "../settings/useScopedSettings";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";

const isTimeZoneName = Schema.is(WorkspaceDisplayTimeZone);
const isServerSettingsError = Schema.is(ServerSettingsError);
const isDisplayTimeZone = (value: string) => {
  if (!isTimeZoneName(value)) return false;
  try {
    return (
      new Intl.DateTimeFormat(undefined, { timeZone: value }).resolvedOptions().timeZone.length > 0
    );
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return false;
  }
};

export function WorkspaceDisplaySettings() {
  const { scope, environment, connectedEnvironments } = useSettingsScope();
  if (
    scope.kind !== "environment" ||
    scope.environmentIds.length !== 1 ||
    !environment ||
    connectedEnvironments.length !== 1
  )
    return (
      <p className="text-sm text-muted-foreground">
        Select one environment to set its workspace timezone.
      </p>
    );
  return (
    <WorkspaceDisplaySettingsForm
      key={environment.environmentId}
      environmentId={environment.environmentId}
    />
  );
}

function WorkspaceDisplaySettingsForm({ environmentId }: { environmentId: EnvironmentId }) {
  const settings = useScopedSettings();
  const canOperate = useWorkspaceCanOperate(environmentId);
  const { ready } = useMailCapabilities(environmentId);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateScopedSettings({
    onError(error) {
      if (isServerSettingsError(error) && error.operation === "validate-workspace-timezone")
        setError(error.message);
    },
  });
  const zone = draft ?? settings.workspaceDisplayTimeZone ?? "";
  const disabled = busy || !canOperate || !ready;
  const save = async (timeZone: string | null) => {
    if (disabled) return;
    if (timeZone !== null && !isTimeZoneName(timeZone)) {
      setError("Enter a valid IANA timezone, such as Africa/Johannesburg.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (await update({ workspaceDisplayTimeZone: timeZone })) setDraft(null);
      else setError((reason) => reason ?? "The workspace timezone could not be saved. Try again.");
    } catch {
      setError("The workspace timezone could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        await save(zone.trim());
      }}
    >
      <label className="block space-y-1 text-sm">
        <span>Workspace timezone</span>
        <Input
          aria-label="Workspace timezone"
          value={zone}
          maxLength={64}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Task dates use this environment's timezone on every device. Reset uses the server's current
        timezone.
      </p>
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={disabled}>
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          type="button"
          disabled={disabled}
          onClick={() => save(null)}
        >
          Reset
        </Button>
      </div>
      {!ready ? (
        <p className="text-xs text-muted-foreground">Loading workspace settings...</p>
      ) : null}
      {ready && isTimeZoneName(zone.trim()) && !isDisplayTimeZone(zone.trim()) ? (
        <p className="text-xs text-muted-foreground">
          This device does not recognize this timezone. The server will validate it when you save.
        </p>
      ) : null}
      {ready &&
      (!settings.workspaceDisplayTimeZone ||
        !isDisplayTimeZone(settings.workspaceDisplayTimeZone)) ? (
        <p className="text-xs text-muted-foreground">
          Workspace timezone unavailable on this server or device. Task dates use UTC.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  );
}
