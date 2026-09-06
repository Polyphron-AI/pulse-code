/**
 * Integrations settings - preferences for surfaces Pulse Code embeds rather than
 * owns. Browser is the first section: the defaults a preview tab opens at,
 * applied to both hand-opened tabs and agent `preview_open` calls that don't
 * state their own size.
 *
 * @module IntegrationsSettings
 */
import {
  DEFAULT_BROWSER_AUTO_SHOW_FLOATING_PREVIEW,
  DEFAULT_BROWSER_VIEWPORT,
  DEFAULT_PREVIEW_APPEARANCE,
  DEFAULT_UNIFIED_SETTINGS,
  DEFAULT_PREVIEW_ZOOM_FACTOR,
  FILL_PREVIEW_VIEWPORT,
  PREVIEW_VIEWPORT_MAX_AREA,
  PREVIEW_VIEWPORT_MAX_DIMENSION,
  PREVIEW_VIEWPORT_MIN_DIMENSION,
  PREVIEW_ZOOM_LEVELS,
  type PreviewAppearancePreference,
  type PreviewViewportSetting,
  type EnvironmentId,
  type ExecutionEnvironmentCapabilities,
  type ProjectId,
  type PulseProjectId,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { PREVIEW_VIEWPORT_PRESETS } from "@t3tools/shared/previewViewport";
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  ExternalLinkIcon,
  InfoIcon,
  Link2Icon,
  LoaderCircleIcon,
  RefreshCwIcon,
  UnplugIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { ScreenRotationIcon } from "~/browser/ScreenRotationIcon";
import { isElectron } from "../../env";

import { Button } from "../ui/button";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { NumberField, NumberFieldGroup, NumberFieldInput } from "../ui/number-field";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  useClientSettings,
  usePrimarySettings,
  useUpdatePrimarySettings,
} from "~/hooks/useSettings";
import { useEnvironments } from "~/state/environments";
import { useProjects, useServerConfigs } from "~/state/entities";
import { issueEnvironment } from "~/state/issues";
import { useAtomCommand } from "~/state/use-atom-command";
import { useEnvironmentQuery } from "~/state/query";

import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { MailAlphaSetting } from "../mail/MailAlphaSetting";

const FILL_VALUE = "fill";
const RESPONSIVE_VALUE = "responsive";

/**
 * The size a "Responsive" default falls back to when the user switches away
 * from Fill and hasn't typed dimensions yet. Fill has no dimensions to carry
 * over, so the picker needs something concrete to seed the inputs with.
 */
const RESPONSIVE_SEED_SIZE = { width: 1280, height: 800 } as const;

const NO_GROUPING: Intl.NumberFormatOptions = { useGrouping: false };

const APPEARANCE_LABELS: Readonly<Record<PreviewAppearancePreference, string>> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

const zoomLabel = (zoomFactor: number) => `${Math.round(zoomFactor * 100)}%`;

const viewportSelectValue = (viewport: PreviewViewportSetting): string => {
  if (viewport._tag === "fill") return FILL_VALUE;
  if (
    viewport._tag === "preset" &&
    PREVIEW_VIEWPORT_PRESETS.some((preset) => preset.id === viewport.presetId)
  ) {
    return viewport.presetId;
  }
  return RESPONSIVE_VALUE;
};

/**
 * The trigger renders this rather than a bare `SelectValue`, which would fall
 * back to printing the raw stored value ("fill") because the options are built
 * inline instead of from an `items` map.
 */
const viewportSelectLabel = (viewport: PreviewViewportSetting): string => {
  const value = viewportSelectValue(viewport);
  if (value === FILL_VALUE) return "Fill panel";
  if (value === RESPONSIVE_VALUE) return "Responsive";
  return PREVIEW_VIEWPORT_PRESETS.find((preset) => preset.id === value)?.label ?? "Responsive";
};

const isValidDimension = (value: number) =>
  Number.isInteger(value) &&
  value >= PREVIEW_VIEWPORT_MIN_DIMENSION &&
  value <= PREVIEW_VIEWPORT_MAX_DIMENSION;

/**
 * A sized viewport with width and height swapped. Presets keep their identity
 * through a rotation — `resolvePreviewViewport` already stores rotated presets
 * as the preset id plus swapped dimensions — so a rotated iPad is still an
 * iPad, not an anonymous custom size.
 */
const rotateViewport = (
  viewport: Exclude<PreviewViewportSetting, { readonly _tag: "fill" }>,
): PreviewViewportSetting => ({
  ...viewport,
  width: viewport.height,
  height: viewport.width,
});

function BrowserViewportSetting({ disabled }: { readonly disabled: boolean }) {
  const viewport = useClientSettings((settings) => settings.browserDefaultViewport);
  const updateSettings = useUpdatePrimarySettings();

  const sized = viewport._tag === "fill" ? null : viewport;
  const presentedSize = {
    width: sized?.width ?? RESPONSIVE_SEED_SIZE.width,
    height: sized?.height ?? RESPONSIVE_SEED_SIZE.height,
  };

  const selectViewport = (value: string | null) => {
    if (value === FILL_VALUE) {
      updateSettings({ browserDefaultViewport: FILL_PREVIEW_VIEWPORT });
      return;
    }
    if (value === RESPONSIVE_VALUE) {
      updateSettings({
        browserDefaultViewport: {
          _tag: "freeform",
          width: sized?.width ?? RESPONSIVE_SEED_SIZE.width,
          height: sized?.height ?? RESPONSIVE_SEED_SIZE.height,
        },
      });
      return;
    }
    const preset = PREVIEW_VIEWPORT_PRESETS.find((candidate) => candidate.id === value);
    if (!preset) return;
    updateSettings({
      browserDefaultViewport: {
        _tag: "preset",
        width: preset.width,
        height: preset.height,
        presetId: preset.id,
      },
    });
  };

  // Committed on blur rather than per keystroke: typing "2560" passes through
  // "256", which is a legal dimension, so an onValueChange handler would
  // persist that intermediate size and churn the settings file on every key.
  const commitDimension = (axis: "width" | "height", value: number | null) => {
    if (value === null || !isValidDimension(value)) return;
    const next = { ...presentedSize, [axis]: value };
    if (next.width * next.height > PREVIEW_VIEWPORT_MAX_AREA) return;
    if (sized && next.width === sized.width && next.height === sized.height) return;
    // Typing a size means the preset no longer describes it.
    updateSettings({ browserDefaultViewport: { _tag: "freeform", ...next } });
  };

  return (
    <SettingsRow
      {...searchableSetting("browser-default-viewport")}
      description="The viewport a browser tab opens at, for both you and agents. Fill sizes the page to the panel; any other choice opens the device toolbar at that size."
      resetAction={
        !disabled && viewport._tag !== DEFAULT_BROWSER_VIEWPORT._tag ? (
          <SettingResetButton
            label="default browser viewport"
            onClick={() => updateSettings({ browserDefaultViewport: DEFAULT_BROWSER_VIEWPORT })}
          />
        ) : null
      }
      control={
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <Select
            value={viewportSelectValue(viewport)}
            onValueChange={selectViewport}
            disabled={disabled}
          >
            <SelectTrigger
              size="sm"
              className="w-full min-w-0 sm:w-44"
              aria-label="Default browser viewport"
            >
              <SelectValue>{viewportSelectLabel(viewport)}</SelectValue>
            </SelectTrigger>
            <SelectPopup align="end" alignItemWithTrigger={false} className="min-w-64">
              <SelectItem value={FILL_VALUE}>Fill panel</SelectItem>
              <SelectItem value={RESPONSIVE_VALUE}>Responsive</SelectItem>
              <SelectGroup>
                <SelectGroupLabel>Standard</SelectGroupLabel>
                {PREVIEW_VIEWPORT_PRESETS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    <span className="flex w-full items-center justify-between gap-5">
                      <span>{preset.label}</span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {preset.detail}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectPopup>
          </Select>

          {sized ? (
            <div className="flex min-w-0 items-center gap-1">
              <NumberField
                value={presentedSize.width}
                min={PREVIEW_VIEWPORT_MIN_DIMENSION}
                max={PREVIEW_VIEWPORT_MAX_DIMENSION}
                disabled={disabled}
                // Pixel counts read as raw numbers; grouping would show "1,024".
                format={NO_GROUPING}
                size="sm"
                className="w-20"
                onValueCommitted={(value) => commitDimension("width", value)}
              >
                <NumberFieldGroup>
                  <NumberFieldInput aria-label="Default viewport width" />
                </NumberFieldGroup>
              </NumberField>
              <span className="text-xs text-muted-foreground">×</span>
              <NumberField
                value={presentedSize.height}
                min={PREVIEW_VIEWPORT_MIN_DIMENSION}
                max={PREVIEW_VIEWPORT_MAX_DIMENSION}
                disabled={disabled}
                format={NO_GROUPING}
                size="sm"
                className="w-20"
                onValueCommitted={(value) => commitDimension("height", value)}
              >
                <NumberFieldGroup>
                  <NumberFieldInput aria-label="Default viewport height" />
                </NumberFieldGroup>
              </NumberField>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost-muted"
                      disabled={disabled}
                      aria-label={`Rotate to ${
                        presentedSize.height >= presentedSize.width ? "landscape" : "portrait"
                      }`}
                      onClick={() =>
                        updateSettings({ browserDefaultViewport: rotateViewport(sized) })
                      }
                    >
                      <ScreenRotationIcon />
                    </Button>
                  }
                />
                <TooltipPopup side="top">Rotate</TooltipPopup>
              </Tooltip>
            </div>
          ) : null}
        </div>
      }
    />
  );
}

function BrowserZoomSetting({ disabled }: { readonly disabled: boolean }) {
  const zoomFactor = useClientSettings((settings) => settings.browserDefaultZoomFactor);
  const updateSettings = useUpdatePrimarySettings();

  return (
    <SettingsRow
      {...searchableSetting("browser-default-zoom")}
      description="Page zoom applied to new browser tabs."
      resetAction={
        !disabled && zoomFactor !== DEFAULT_PREVIEW_ZOOM_FACTOR ? (
          <SettingResetButton
            label="default browser zoom"
            onClick={() =>
              updateSettings({ browserDefaultZoomFactor: DEFAULT_PREVIEW_ZOOM_FACTOR })
            }
          />
        ) : null
      }
      control={
        <Select
          disabled={disabled}
          value={String(zoomFactor)}
          onValueChange={(value) => {
            const next = PREVIEW_ZOOM_LEVELS.find((level) => String(level) === value);
            if (next !== undefined) updateSettings({ browserDefaultZoomFactor: next });
          }}
        >
          <SelectTrigger className="w-full sm:w-40" aria-label="Default browser zoom">
            <SelectValue>{zoomLabel(zoomFactor)}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {PREVIEW_ZOOM_LEVELS.map((level) => (
              <SelectItem hideIndicator key={level} value={String(level)}>
                {zoomLabel(level)}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}

function BrowserAppearanceSetting({ disabled }: { readonly disabled: boolean }) {
  const appearance = useClientSettings((settings) => settings.browserDefaultAppearance);
  const updateSettings = useUpdatePrimarySettings();

  return (
    <SettingsRow
      {...searchableSetting("browser-default-appearance")}
      description="The color scheme pages are told to prefer. System follows your OS setting."
      resetAction={
        !disabled && appearance !== DEFAULT_PREVIEW_APPEARANCE ? (
          <SettingResetButton
            label="default browser appearance"
            onClick={() => updateSettings({ browserDefaultAppearance: DEFAULT_PREVIEW_APPEARANCE })}
          />
        ) : null
      }
      control={
        <Select
          disabled={disabled}
          value={appearance}
          onValueChange={(value) => {
            if (value === "system" || value === "light" || value === "dark") {
              updateSettings({ browserDefaultAppearance: value });
            }
          }}
        >
          <SelectTrigger className="w-full sm:w-40" aria-label="Default browser appearance">
            <SelectValue>{APPEARANCE_LABELS[appearance]}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {Object.entries(APPEARANCE_LABELS).map(([value, label]) => (
              <SelectItem hideIndicator key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}

function AgentBrowserAccessSetting() {
  const settings = usePrimarySettings();
  const updateSettings = useUpdatePrimarySettings();

  return (
    <SettingsRow
      {...searchableSetting("agent-browser-access")}
      description="Let agents open and drive the preview browser. When off, the browser tools and the instructions describing them are withheld from agent sessions. Your own browser panel is unaffected."
      status={
        settings.enableAgentBrowserAccess
          ? undefined
          : "Applies to sessions started from now on; a running agent keeps the tools it was given."
      }
      resetAction={
        settings.enableAgentBrowserAccess !== DEFAULT_UNIFIED_SETTINGS.enableAgentBrowserAccess ? (
          <SettingResetButton
            label="agent browser access"
            onClick={() =>
              updateSettings({
                enableAgentBrowserAccess: DEFAULT_UNIFIED_SETTINGS.enableAgentBrowserAccess,
              })
            }
          />
        ) : null
      }
      control={
        <Switch
          checked={settings.enableAgentBrowserAccess}
          onCheckedChange={(checked) =>
            updateSettings({ enableAgentBrowserAccess: Boolean(checked) })
          }
          aria-label="Allow agent browser access"
        />
      }
    />
  );
}

function BrowserAutoShowFloatingPreviewSetting({ disabled }: { readonly disabled: boolean }) {
  const autoShow = useClientSettings((settings) => settings.browserAutoShowFloatingPreview);
  const updateSettings = useUpdatePrimarySettings();

  return (
    <SettingsRow
      {...searchableSetting("browser-auto-show-floating-preview")}
      description="Pop the floating preview into view when an agent opens a browser. An agent that explicitly asks to show or hide its preview still gets what it asked for."
      resetAction={
        !disabled && autoShow !== DEFAULT_BROWSER_AUTO_SHOW_FLOATING_PREVIEW ? (
          <SettingResetButton
            label="auto-show floating preview"
            onClick={() =>
              updateSettings({
                browserAutoShowFloatingPreview: DEFAULT_BROWSER_AUTO_SHOW_FLOATING_PREVIEW,
              })
            }
          />
        ) : null
      }
      control={
        <Switch
          disabled={disabled}
          checked={autoShow}
          onCheckedChange={(checked) =>
            updateSettings({ browserAutoShowFloatingPreview: Boolean(checked) })
          }
          aria-label="Auto-show floating preview"
        />
      }
    />
  );
}

/**
 * Frames the client-local preview defaults as one unavailable block.
 *
 * Disabling each control on its own left the labels and descriptions at full
 * strength, so the group still read as editable. Boxing it puts the reason at
 * the top and dims everything it covers, which is also why the explanation
 * sits outside the dimmed area — the one part that must stay readable is the
 * part saying why the rest isn't.
 *
 * Disabled rather than hidden because these are *client* settings: editing
 * them from a browser tab would write preferences belonging to a different
 * client, reading as though the desktop app had been configured when it
 * hadn't.
 */
function DesktopOnlyBrowserDefaults({ children }: { readonly children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 py-1.5">
      <div className="flex items-start gap-2 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground sm:px-4">
        <InfoIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
        <p>Only available in the desktop app.</p>
      </div>
      <div className="[&_h3]:opacity-64 [&_p]:opacity-64">{children}</div>
    </div>
  );
}

export type PulseIssuesEnvironmentSupport =
  | "provider-lifecycle"
  | "native-issues"
  | "loading"
  | "unsupported";

export function pulseIssuesEnvironmentSupport(
  capabilities: Pick<ExecutionEnvironmentCapabilities, "integrations" | "issues"> | null,
): PulseIssuesEnvironmentSupport {
  if (capabilities === null) return "loading";
  if (capabilities.issues !== true) return "unsupported";
  return capabilities.integrations === true ? "provider-lifecycle" : "native-issues";
}

export const PULSE_ISSUES_CAPABILITY_LABELS = [
  "Read Issues and Reports",
  "Update Issues",
  "Map workspaces",
] as const;

export const pulseIssuesConnectionActionLabel = (credentialConfigured: boolean) =>
  credentialConfigured ? "Reauthorize" : "Connect";

export const pulseIssuesEnvironmentCanRun = (support: PulseIssuesEnvironmentSupport) =>
  support === "provider-lifecycle" || support === "native-issues";

type IssueMutationFailure = {
  readonly message: string;
  readonly requiredOrigin?: string;
};

function readIssueMutationFailure(result: {
  readonly cause: Parameters<typeof squashAtomCommandFailure>[0]["cause"];
}): IssueMutationFailure {
  const failure = squashAtomCommandFailure(result);
  if (failure && typeof failure === "object") {
    const message =
      "detail" in failure && typeof failure.detail === "string"
        ? failure.detail
        : failure instanceof Error
          ? failure.message
          : "The Pulse request failed.";
    const requiredOrigin =
      "requiredOrigin" in failure && typeof failure.requiredOrigin === "string"
        ? failure.requiredOrigin
        : undefined;
    return { message, ...(requiredOrigin ? { requiredOrigin } : {}) };
  }
  return { message: "The Pulse request failed." };
}

export function issueConnectionGuidance(error: string | null): string | null {
  if (!error) return null;
  const normalized = error.toLocaleLowerCase();
  if (normalized.includes("origin")) {
    return "Allow this Pulse Code origin in the Pulse project, then reconnect.";
  }
  if (normalized.includes("token") || normalized.includes("auth")) {
    return "Create or replace the personal access token in Pulse, then reconnect.";
  }
  if (normalized.includes("permission") || normalized.includes("forbidden")) {
    return "Use a Pulse account that can read projects and update Issues.";
  }
  if (normalized.includes("project")) {
    return "Create or unarchive a project in Pulse before mapping this workspace.";
  }
  return "Check that Pulse is reachable from this environment, then retry.";
}

export function PulseIssuesIntegration() {
  const { environments } = useEnvironments();
  const serverConfigs = useServerConfigs();
  const projects = useProjects();
  const environmentOptions = useMemo(
    () =>
      environments.map((environment) => {
        const capabilities =
          serverConfigs.get(environment.environmentId)?.environment.capabilities ?? null;
        return {
          environment,
          support: pulseIssuesEnvironmentSupport(capabilities),
        };
      }),
    [environments, serverConfigs],
  );
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<EnvironmentId | null>(null);
  const selectedOption =
    environmentOptions.find(
      ({ environment }) => environment.environmentId === selectedEnvironmentId,
    ) ??
    environmentOptions.find(({ support }) => pulseIssuesEnvironmentCanRun(support)) ??
    environmentOptions[0] ??
    null;
  const environmentId = selectedOption?.environment.environmentId ?? null;
  const selectedSupportsIssues = selectedOption
    ? pulseIssuesEnvironmentCanRun(selectedOption.support)
    : false;
  const supportedEnvironmentCount = environmentOptions.filter(({ support }) =>
    pulseIssuesEnvironmentCanRun(support),
  ).length;
  const connection = useEnvironmentQuery(
    environmentId && selectedSupportsIssues
      ? issueEnvironment.connection({ environmentId, input: {} })
      : null,
  );
  const localProjects = useMemo(
    () => projects.filter((project) => project.environmentId === environmentId),
    [environmentId, projects],
  );
  const [endpoint, setEndpoint] = useState("");
  const [token, setToken] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [mutationFailure, setMutationFailure] = useState<IssueMutationFailure | null>(null);
  const updateConnection = useAtomCommand(issueEnvironment.updateConnection, {
    reportFailure: false,
  });
  const disconnect = useAtomCommand(issueEnvironment.disconnect, { reportFailure: false });
  const setMapping = useAtomCommand(issueEnvironment.setProjectMapping, {
    reportFailure: false,
  });
  const removeMapping = useAtomCommand(issueEnvironment.removeProjectMapping, {
    reportFailure: false,
  });

  useEffect(() => {
    setEndpoint(connection.data?.endpoint ?? "");
  }, [connection.data?.endpoint, environmentId]);
  useEffect(() => {
    setToken("");
    setMutationFailure(null);
  }, [environmentId]);

  const runConnectionAction = async (action: "connect" | "disconnect") => {
    if (!environmentId || !selectedSupportsIssues || pending) return;
    setPending(action);
    setMutationFailure(null);
    const submittedToken = token;
    if (action === "connect") setToken("");
    const result =
      action === "connect"
        ? await updateConnection({
            environmentId,
            input: { endpoint: endpoint.trim(), token: submittedToken },
          })
        : await disconnect({ environmentId, input: {} });
    setPending(null);
    if (result._tag === "Failure") {
      setMutationFailure(readIssueMutationFailure(result));
      return;
    }
    connection.refresh();
  };

  const updateProjectMapping = async (projectId: ProjectId, pulseProjectId: string | null) => {
    if (!environmentId || !selectedSupportsIssues || pending) return;
    const mappingKey = `mapping:${projectId}`;
    setPending(mappingKey);
    setMutationFailure(null);
    const result = pulseProjectId
      ? await setMapping({
          environmentId,
          input: { projectId, pulseProjectId: pulseProjectId as PulseProjectId },
        })
      : await removeMapping({ environmentId, input: { projectId } });
    setPending(null);
    if (result._tag === "Failure") {
      setMutationFailure(readIssueMutationFailure(result));
      return;
    }
    connection.refresh();
  };

  const snapshot = connection.data;
  const connected = snapshot?.status === "connected";
  const guidance = issueConnectionGuidance(mutationFailure?.message ?? snapshot?.error ?? null);
  const selectedEnvironment = selectedOption?.environment ?? null;

  return (
    <SettingsSection
      id="pulse-issues"
      title="Pulse Issues"
      icon={<Link2Icon className="size-4.5 text-orange-500" />}
      headerAction={
        selectedOption && !selectedSupportsIssues ? (
          <Badge variant="outline">
            <UnplugIcon />
            {selectedOption.support === "loading" ? "Checking server" : "Unsupported"}
          </Badge>
        ) : snapshot ? (
          <Badge
            variant={connected ? "success" : snapshot.status === "error" ? "error" : "outline"}
          >
            {connected ? <CheckCircle2Icon /> : <UnplugIcon />}
            {connected ? "Connected" : "Not connected"}
          </Badge>
        ) : null
      }
    >
      <SettingsRow
        {...searchableSetting("pulse-issues-connection")}
        description="Connect Pulse once per environment. Issues stay inside Pulse Code; Pulse remains the source of truth for reports and triage."
      >
        <div className="mt-3 space-y-3 border-t border-border/50 pt-3 pb-2">
          {environmentOptions.length > 0 ? (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground">Environment</label>
              <Select
                value={environmentId ?? undefined}
                onValueChange={(value) => setSelectedEnvironmentId(value as EnvironmentId)}
              >
                <SelectTrigger className="w-full sm:max-w-80" aria-label="Pulse environment">
                  <SelectValue>{selectedEnvironment?.label ?? "Choose environment"}</SelectValue>
                </SelectTrigger>
                <SelectPopup alignItemWithTrigger={false} className="min-w-72">
                  {environmentOptions.map(({ environment, support }) => (
                    <SelectItem key={environment.environmentId} value={environment.environmentId}>
                      <span className="flex w-full items-center justify-between gap-4">
                        <span>{environment.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {pulseIssuesEnvironmentCanRun(support)
                            ? support === "provider-lifecycle"
                              ? "Provider lifecycle"
                              : "Native Issues"
                            : support === "loading"
                              ? "Checking"
                              : "Update required"}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <p className="text-xs text-muted-foreground">
                {supportedEnvironmentCount} of {environmentOptions.length} environments support
                Pulse Issues. Unsupported environments receive no Issues requests.
              </p>
            </div>
          ) : null}

          {environmentOptions.length === 0 ? (
            <Alert variant="info">
              <InfoIcon />
              <AlertTitle>Connect a Pulse Code environment first</AlertTitle>
              <AlertDescription>
                Add a local or remote environment, then return here to connect Pulse Issues.
              </AlertDescription>
            </Alert>
          ) : !selectedSupportsIssues ? (
            <Alert variant="info">
              <InfoIcon />
              <AlertTitle>
                {selectedOption?.support === "loading"
                  ? "Checking this environment"
                  : `Pulse Issues is unavailable on ${selectedEnvironment?.label ?? "this environment"}`}
              </AlertTitle>
              <AlertDescription>
                {selectedOption?.support === "loading"
                  ? "Wait for the server descriptor before trying to connect."
                  : "Update that Pulse Code server, or choose a capable environment above."}
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
                Pulse URL
                <Input
                  nativeInput
                  value={endpoint}
                  onChange={(event) => setEndpoint(event.currentTarget.value)}
                  placeholder="https://pulse.example.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1 space-y-1.5 text-xs font-medium text-muted-foreground">
                  Personal access token
                  <Input
                    nativeInput
                    type="password"
                    value={token}
                    onChange={(event) => setToken(event.currentTarget.value)}
                    placeholder={
                      snapshot?.tokenConfigured ? "Stored securely — enter to replace" : "pat_…"
                    }
                    autoComplete="new-password"
                  />
                </label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => void runConnectionAction("connect")}
                    disabled={!endpoint.trim() || !token.trim() || pending !== null}
                  >
                    {pending === "connect" ? (
                      <LoaderCircleIcon className="animate-spin" />
                    ) : connected ? (
                      <RefreshCwIcon />
                    ) : (
                      <Link2Icon />
                    )}
                    {pulseIssuesConnectionActionLabel(snapshot?.tokenConfigured === true)}
                  </Button>
                  {snapshot?.tokenConfigured ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void runConnectionAction("disconnect")}
                      disabled={pending !== null}
                    >
                      <UnplugIcon />
                      Disconnect
                    </Button>
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The token is submitted once to {selectedEnvironment?.label} and cleared from this
                client immediately. Pulse Code only returns whether a credential is configured.
              </p>
              {snapshot?.lastCheckedAt ? (
                <p className="text-xs text-muted-foreground">
                  Last checked {new Date(snapshot.lastCheckedAt).toLocaleString()} on{" "}
                  {selectedEnvironment?.label}.
                </p>
              ) : null}
            </>
          )}
          {mutationFailure || snapshot?.error ? (
            <Alert variant="error" controlAlignment="first-line">
              <CircleAlertIcon />
              <AlertTitle>Pulse could not connect</AlertTitle>
              <AlertDescription>
                <span>{mutationFailure?.message ?? snapshot?.error}</span>
                {guidance ? <span>{guidance}</span> : null}
                {mutationFailure?.requiredOrigin ? (
                  <code className="w-fit rounded bg-background/70 px-1.5 py-0.5 text-xs">
                    Required origin: {mutationFailure.requiredOrigin}
                  </code>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
      </SettingsRow>

      {selectedSupportsIssues ? (
        <SettingsRow
          {...searchableSetting("pulse-issues-capabilities")}
          description="What Pulse Code can do through this provider on the selected environment."
        >
          <div
            className="mt-3 space-y-2 border-t border-border/50 pt-3 pb-2"
            aria-label="Pulse Issues capabilities"
          >
            <div className="flex flex-wrap gap-1.5">
              {PULSE_ISSUES_CAPABILITY_LABELS.map((label) => (
                <Badge key={label} variant="outline">
                  {label}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedOption?.support === "provider-lifecycle"
                ? "This server advertises the shared provider lifecycle and native Issues APIs."
                : "This server uses the backwards-compatible native Issues lifecycle."}
            </p>
          </div>
        </SettingsRow>
      ) : null}

      {connected ? (
        <SettingsRow
          {...searchableSetting("pulse-project-mapping")}
          description="Map each Pulse Code workspace to the Pulse project that should own its Reports and Issues."
        >
          <div className="mt-3 space-y-2 border-t border-border/50 pt-3 pb-2">
            {snapshot.projects.length === 0 ? (
              <Alert variant="warning">
                <CircleAlertIcon />
                <AlertTitle>No Pulse projects are available</AlertTitle>
                <AlertDescription>
                  Create a project in Pulse, then reconnect to discover it here.
                </AlertDescription>
              </Alert>
            ) : localProjects.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                This environment has no Pulse Code projects to map yet.
              </p>
            ) : (
              localProjects.map((project) => {
                const mapping = snapshot.mappings.find((entry) => entry.projectId === project.id);
                const pulseProject = mapping
                  ? snapshot.projects.find((entry) => entry.id === mapping.pulseProjectId)
                  : null;
                const mappingPending = pending === `mapping:${project.id}`;
                return (
                  <div
                    key={project.id}
                    className="grid gap-2 rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.8fr)] sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{project.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {project.workspaceRoot}
                      </p>
                    </div>
                    <Select
                      value={mapping?.pulseProjectId ?? null}
                      onValueChange={(value) => void updateProjectMapping(project.id, value)}
                      disabled={pending !== null}
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label={`Pulse project for ${project.title}`}
                      >
                        <SelectValue>
                          <span className="flex min-w-0 items-center gap-2">
                            {mappingPending ? (
                              <LoaderCircleIcon className="size-3.5 animate-spin" />
                            ) : null}
                            <span className="truncate">{pulseProject?.name ?? "Not mapped"}</span>
                          </span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectPopup align="end" alignItemWithTrigger={false} className="min-w-64">
                        <SelectItem value={null}>Not mapped</SelectItem>
                        {snapshot.projects.map((candidate) => (
                          <SelectItem key={candidate.id} value={candidate.id}>
                            <span className="flex w-full items-center justify-between gap-4">
                              <span>{candidate.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {candidate.slug}
                              </span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </div>
                );
              })
            )}
            {snapshot.endpoint ? (
              <Button
                render={
                  <a href={snapshot.endpoint} target="_blank" rel="noreferrer">
                    Open Pulse administration
                  </a>
                }
                size="xs"
                variant="ghost-muted"
              >
                <ExternalLinkIcon />
                Advanced project and origin settings live in Pulse
              </Button>
            ) : null}
          </div>
        </SettingsRow>
      ) : null}
    </SettingsSection>
  );
}

export function IntegrationsSettingsPanel() {
  // Client-local preview defaults are editable only where the preview exists.
  const previewDefaultsDisabled = !isElectron;
  const previewDefaults = (
    <>
      <BrowserViewportSetting disabled={previewDefaultsDisabled} />
      <BrowserZoomSetting disabled={previewDefaultsDisabled} />
      <BrowserAppearanceSetting disabled={previewDefaultsDisabled} />
      <BrowserAutoShowFloatingPreviewSetting disabled={previewDefaultsDisabled} />
    </>
  );

  return (
    <SettingsPageContainer>
      <MailAlphaSetting />
      <PulseIssuesIntegration />
      <SettingsSection id="browser" title="Browser">
        {/* Server-authoritative, so it stays editable on every client and sits
            outside the block covering the desktop-only defaults. */}
        <AgentBrowserAccessSetting />
        {previewDefaultsDisabled ? (
          <DesktopOnlyBrowserDefaults>{previewDefaults}</DesktopOnlyBrowserDefaults>
        ) : (
          previewDefaults
        )}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
