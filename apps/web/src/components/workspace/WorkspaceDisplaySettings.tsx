import {
  type EnvironmentId,
  ServerSettingsError,
  WorkspaceDisplayTimeZone,
  WorkspaceOwnerProfile,
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
const decodeOwnerProfile = Schema.decodeUnknownSync(WorkspaceOwnerProfile);
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
        Select one environment to set its workspace timezone and owner display profile.
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
  const [ownerDraft, setOwnerDraft] = useState<{ displayName: string; initials: string } | null>(
    null,
  );
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const update = useUpdateScopedSettings({
    onUnsupportedSetting(key) {
      if (key === "workspaceDisplayTimeZone")
        setError("This server does not support the workspace timezone yet.");
      else setOwnerError("This server does not support the owner profile yet.");
    },
    onError(error) {
      if (isServerSettingsError(error) && error.operation === "validate-workspace-timezone")
        setError(error.message);
      if (isServerSettingsError(error) && error.operation === "validate-workspace-owner-profile")
        setOwnerError(error.message);
    },
  });
  const zone = draft ?? settings.workspaceDisplayTimeZone ?? "";
  const owner = ownerDraft ?? settings.workspaceOwnerProfile ?? { displayName: "", initials: "" };
  const disabled = busy || !canOperate || !ready;
  const saveOwner = async (profile: typeof owner | null) => {
    if (disabled) return;
    let workspaceOwnerProfile;
    try {
      workspaceOwnerProfile =
        profile === null
          ? null
          : decodeOwnerProfile({
              displayName: profile.displayName.normalize("NFC"),
              initials: profile.initials.normalize("NFC"),
            });
      if (
        workspaceOwnerProfile !== null &&
        (!/^(?:[\p{L}\p{N}]\p{M}*){1,3}$/u.test(workspaceOwnerProfile.initials) ||
          /[\p{Cc}\p{Zl}\p{Zp}]|(?![\u200c\u200d])\p{Cf}/u.test(
            workspaceOwnerProfile.displayName +
              workspaceOwnerProfile.initials +
              (profile?.displayName ?? "") +
              (profile?.initials ?? ""),
          ))
      )
        throw new RangeError("Invalid owner profile");
    } catch {
      setOwnerError(
        "Enter an owner name of 1 to 80 characters and initials of 1 to 3 letters or digits.",
      );
      return;
    }
    setBusy(true);
    setOwnerError(null);
    try {
      if (await update({ workspaceOwnerProfile })) setOwnerDraft(null);
      else setOwnerError((reason) => reason ?? "The owner profile could not be saved. Try again.");
    } catch {
      setOwnerError("The owner profile could not be saved. Try again.");
    } finally {
      setBusy(false);
    }
  };
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
    <div className="space-y-6">
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
          Task dates use this environment's timezone on every device. Reset uses the server's
          current timezone.
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
        {ready &&
        draft !== null &&
        isTimeZoneName(zone.trim()) &&
        !isDisplayTimeZone(zone.trim()) ? (
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
      <form
        aria-label="Environment owner"
        className="space-y-2"
        onSubmit={async (event) => {
          event.preventDefault();
          await saveOwner(owner);
        }}
      >
        <h3 className="text-sm font-medium">Environment owner</h3>
        <p className="text-xs text-muted-foreground">
          A display label for tasks assigned to Me on this environment. It does not identify a
          signed-in person or grant access.
        </p>
        <label className="block space-y-1 text-sm">
          <span>Display name</span>
          <Input
            aria-label="Owner display name"
            maxLength={80}
            value={owner.displayName}
            disabled={disabled}
            onChange={(event) => setOwnerDraft({ ...owner, displayName: event.target.value })}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Initials</span>
          <Input
            aria-label="Owner initials"
            value={owner.initials}
            disabled={disabled}
            onChange={(event) => setOwnerDraft({ ...owner, initials: event.target.value })}
          />
        </label>
        <div className="flex gap-2">
          <Button size="sm" type="submit" disabled={disabled}>
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            type="button"
            disabled={disabled}
            onClick={() => saveOwner(null)}
          >
            Clear
          </Button>
        </div>
        {ownerError ? (
          <p role="alert" className="text-sm text-destructive">
            {ownerError}
          </p>
        ) : null}
      </form>
    </div>
  );
}
