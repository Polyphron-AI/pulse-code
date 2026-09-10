/**
 * Integrations settings - preferences for surfaces Pulse Code embeds rather than
 * owns. Browser is the first section: the defaults a preview tab opens at,
 * applied to both hand-opened tabs and agent `preview_open` calls that don't
 * state their own size.
 *
 * @module IntegrationsSettings
 */
import {
  BrowserImportFailureReason,
  BROWSER_PROFILE_MAX_COUNT,
  type BrowserLinkTarget,
  type BrowserProfile,
  BROWSER_PROFILE_NAME_MAX_LENGTH,
  DEFAULT_BROWSER_AUTO_SHOW_FLOATING_PREVIEW,
  DEFAULT_BROWSER_PROFILE_ID,
  BROWSER_RECORDING_FRAME_RATES,
  DEFAULT_BROWSER_LINK_TARGET,
  DEFAULT_BROWSER_RECORDING_FRAME_RATE,
  DEFAULT_BROWSER_VIEWPORT,
  DEFAULT_UNIFIED_SETTINGS,
  DEFAULT_PREVIEW_APPEARANCE,
  DEFAULT_PREVIEW_ZOOM_FACTOR,
  FILL_PREVIEW_VIEWPORT,
  PREVIEW_VIEWPORT_MAX_AREA,
  PREVIEW_VIEWPORT_MAX_DIMENSION,
  PREVIEW_VIEWPORT_MIN_DIMENSION,
  PREVIEW_ZOOM_LEVELS,
  findBrowserProfile,
  isBuiltInBrowserProfileId,
  resolveBrowserProfiles,
  type BrowserImportSource,
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
  MoreVertical,
  Plus as PlusIcon,
  Link2Icon,
  LoaderCircleIcon,
  RefreshCwIcon,
  UnplugIcon,
} from "lucide-react";
import { type ReactNode, useCallback, useRef, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";

import { ScreenRotationIcon } from "~/browser/ScreenRotationIcon";
import { resolveEnvironmentOptionLabel } from "~/components/BranchToolbar.logic";
import { previewBridge } from "~/components/preview/previewBridge";
import { cn, randomUUID } from "~/lib/utils";
import { useEnvironments, usePrimaryEnvironment } from "~/state/environments";
import { isElectron } from "../../env";

import { Badge } from "../ui/badge";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { readLocalApi } from "~/localApi";

import { toastManager } from "../ui/toast";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Input } from "../ui/input";
import { DraftInput } from "../ui/draft-input";
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
  getClientSettings,
  persistClientSettingsUpdate,
  useClientSettings,
  usePrimarySettings,
  useClientSettingsHydrated,
  useUpdatePrimarySettings,
} from "~/hooks/useSettings";
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
import { BrowserImportWizard, type WizardTarget } from "./BrowserImportWizard";
import type { ImportOutcome } from "./browserImportWizard.logic";

const FILL_VALUE = "fill";
const RESPONSIVE_VALUE = "responsive";

type BrowserProfileDataBridge = Pick<
  NonNullable<typeof previewBridge>,
  "clearCookies" | "clearCache"
>;

export async function clearBrowserProfileData(
  bridge: BrowserProfileDataBridge | null,
  environmentIds: ReadonlyArray<EnvironmentId>,
  profileId: string,
): Promise<void> {
  if (bridge === null || environmentIds.length === 0) {
    throw new Error("Browser profile data is not available to clear.");
  }
  await Promise.all(
    environmentIds.flatMap((environmentId) => [
      bridge.clearCookies(environmentId, profileId),
      bridge.clearCache(environmentId, profileId),
    ]),
  );
}

export function browserProfileRemovalAvailable(
  bridgeAvailable: boolean,
  environmentsReady: boolean,
  environmentCount: number,
): boolean {
  return bridgeAvailable && environmentsReady && environmentCount > 0;
}

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

/**
 * IPC flattens the failure to its message, so the reason token travels inside
 * it. Anything unrecognised reads as a plain read failure rather than leaking
 * the raw message into a toast.
 */
/** Thrown from the post-import settings updater when the cap was hit meanwhile. */
class ProfileLimitReachedError extends Error {
  constructor() {
    super("Browser profile limit reached.");
    this.name = "ProfileLimitReachedError";
  }
}

export const importFailureReason = (cause: unknown): BrowserImportFailureReason => {
  const message = String((cause as { message?: unknown } | undefined)?.message ?? "");
  return (
    BrowserImportFailureReason.literals.find((reason) => message.includes(`failed: ${reason}.`)) ??
    "readFailed"
  );
};

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

function AgentWardenAccessSetting() {
  const settings = usePrimarySettings();
  const updateSettings = useUpdatePrimarySettings();
  return (
    <SettingsRow
      {...searchableSetting("agent-warden-access")}
      description="Let agents request saved Grafana reads through Pulse Warden. Each read follows the broker's access policy and approval requirements."
      status="Enable for new agent sessions. Turning off blocks new Warden calls immediately; an in-flight read may still finish."
      resetAction={
        settings.enableAgentWardenAccess !== DEFAULT_UNIFIED_SETTINGS.enableAgentWardenAccess ? (
          <SettingResetButton
            label="agent Warden access"
            onClick={() =>
              updateSettings({
                enableAgentWardenAccess: DEFAULT_UNIFIED_SETTINGS.enableAgentWardenAccess,
              })
            }
          />
        ) : null
      }
      control={
        <Switch
          checked={settings.enableAgentWardenAccess}
          onCheckedChange={(checked) =>
            updateSettings({ enableAgentWardenAccess: Boolean(checked) })
          }
          aria-label="Allow agent Warden access"
        />
      }
    />
  );
}

function BrowserRecordingFrameRateSetting({ disabled }: { readonly disabled: boolean }) {
  const frameRate = useClientSettings((settings) => settings.browserRecordingFrameRate);
  const updateSettings = useUpdatePrimarySettings();

  return (
    <SettingsRow
      {...searchableSetting("browser-recording-frame-rate")}
      description="Maximum frame rate for browser recordings. 30 fps is the default and uses less CPU and storage; 60 fps captures smoother motion."
      resetAction={
        !disabled && frameRate !== DEFAULT_BROWSER_RECORDING_FRAME_RATE ? (
          <SettingResetButton
            label="browser recording frame rate"
            onClick={() =>
              updateSettings({ browserRecordingFrameRate: DEFAULT_BROWSER_RECORDING_FRAME_RATE })
            }
          />
        ) : null
      }
      control={
        <Select
          disabled={disabled}
          value={String(frameRate)}
          onValueChange={(value) => {
            const next = BROWSER_RECORDING_FRAME_RATES.find((rate) => String(rate) === value);
            if (next !== undefined) {
              updateSettings({ browserRecordingFrameRate: next });
            }
          }}
        >
          <SelectTrigger className="w-full sm:w-40" aria-label="Browser recording frame rate">
            <SelectValue>{frameRate} fps</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {BROWSER_RECORDING_FRAME_RATES.map((rate) => (
              <SelectItem hideIndicator key={rate} value={String(rate)}>
                {rate} fps
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}

const LINK_TARGET_LABELS: Readonly<Record<BrowserLinkTarget, string>> = {
  system: "Your default browser",
  app: "Pulse Code",
};

function BrowserLinkTargetSetting({ disabled }: { readonly disabled: boolean }) {
  const linkTarget = useClientSettings((settings) => settings.browserLinkTarget);
  const updateSettings = useUpdatePrimarySettings();

  return (
    <SettingsRow
      {...searchableSetting("browser-link-target")}
      description="Where links in the chat and terminal open. Hold ⌘ or Ctrl while clicking a chat link to open it in your default browser either way."
      resetAction={
        !disabled && linkTarget !== DEFAULT_BROWSER_LINK_TARGET ? (
          <SettingResetButton
            label="link target"
            onClick={() => updateSettings({ browserLinkTarget: DEFAULT_BROWSER_LINK_TARGET })}
          />
        ) : null
      }
      control={
        <Select
          disabled={disabled}
          value={linkTarget}
          onValueChange={(value) => {
            if (value === "system" || value === "app") {
              updateSettings({ browserLinkTarget: value });
            }
          }}
        >
          <SelectTrigger size="sm" className="w-full sm:w-40" aria-label="Open links in">
            <SelectValue>{LINK_TARGET_LABELS[linkTarget]}</SelectValue>
          </SelectTrigger>
          <SelectPopup align="end" alignItemWithTrigger={false}>
            {(Object.keys(LINK_TARGET_LABELS) as ReadonlyArray<BrowserLinkTarget>).map((target) => (
              <SelectItem hideIndicator key={target} value={target}>
                {LINK_TARGET_LABELS[target]}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      }
    />
  );
}

function AgentBrowserAccessSetting() {
  return (
    <SettingsRow
      {...searchableSetting("agent-browser-access")}
      description="Choose whether agents can use the preview browser for all projects or a specific project."
      control={
        <Button
          render={
            <Link to="/settings/projects" search={{ project: undefined, machine: undefined }} />
          }
          size="sm"
          variant="outline"
        >
          Project settings
        </Button>
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
      description="Pop the floating preview into view when an agent uses a browser. An agent that explicitly asks to show or hide its preview still gets what it asked for."
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

/**
 * Profile list, its header menu, and the import flow.
 *
 * One menu creates profiles and imports into them, because the two are the
 * same decision from the user's side: "I want a profile that has my Helium
 * logins in it". Import targets include "New profile" so that case does not
 * require creating one first and then finding a second control.
 *
 * Built-ins render without a rename field: they are synthesized rather than
 * stored, so there is nothing to rename and removing them would strand every
 * tab that opened under them.
 *
 * Sources are listed lazily on open: detection touches the other browser's
 * files, and the answer changes while the app is running (quitting the browser
 * clears `browserRunning`), so a value cached at mount would go stale.
 */
function BrowserProfilesSetting({ disabled }: { readonly disabled: boolean }) {
  const userProfiles = useClientSettings((settings) => settings.browserProfiles);
  const defaultProfileId = useClientSettings((settings) => settings.browserDefaultProfileId);
  const settingsHydrated = useClientSettingsHydrated();
  const updateSettings = useUpdatePrimarySettings();
  const { environments, isReady: environmentsReady } = useEnvironments();
  const primaryEnvironment = usePrimaryEnvironment();
  const [sources, setSources] = useState<ReadonlyArray<BrowserImportSource> | null>(null);
  const [importSession, setImportSession] = useState<{
    readonly source: BrowserImportSource;
    readonly environmentId: EnvironmentId;
    readonly environmentName: string;
  } | null>(null);
  const [profilePendingRemoval, setProfilePendingRemoval] = useState<BrowserProfile | null>(null);
  const [profileRemovalError, setProfileRemovalError] = useState<string | null>(null);
  const [profileRemovalInFlight, setProfileRemovalInFlight] = useState(false);
  const removalAvailable = browserProfileRemovalAvailable(
    previewBridge !== null,
    environmentsReady,
    environments.length,
  );
  const importInFlightRef = useRef(false);
  const [importInFlight, setImportInFlight] = useState(false);
  const profileWritesDisabled = disabled || !settingsHydrated;

  const profiles = resolveBrowserProfiles(userProfiles);
  // Incognito is deliberately not a row — it holds nothing to manage — so the
  // default has to resolve against the list that renders. A stored
  // `browserDefaultProfileId` of "incognito" would otherwise leave the section
  // with no Default badge at all.
  const listedProfiles = profiles.filter((profile) => profile.kind !== "incognito");
  const resolvedDefaultId =
    findBrowserProfile(listedProfiles, defaultProfileId)?.id ?? DEFAULT_BROWSER_PROFILE_ID;

  const createProfile = (baseName: string) => {
    if (!settingsHydrated || importInFlightRef.current) return undefined;
    const currentProfiles = getClientSettings().browserProfiles;
    // Checked against the live settings, not the rendered list: two clicks
    // before a re-render would otherwise both pass the disabled control.
    if (currentProfiles.length >= BROWSER_PROFILE_MAX_COUNT) return undefined;
    const resolvedProfiles = resolveBrowserProfiles(currentProfiles);
    const taken = new Set(resolvedProfiles.map((profile) => profile.name));
    let name = baseName;
    for (let index = 2; taken.has(name); index += 1) name = `${baseName} ${index}`;
    const profile = { id: `profile-${randomUUID()}`, name, kind: "persistent" as const };
    updateSettings({ browserProfiles: [...currentProfiles, profile] });
    return profile;
  };

  const renameProfile = (id: string, next: string) => {
    if (!settingsHydrated || importInFlightRef.current) return;
    const name = next.trim().slice(0, BROWSER_PROFILE_NAME_MAX_LENGTH);
    if (name === "") return;
    const currentProfiles = getClientSettings().browserProfiles;
    updateSettings({
      browserProfiles: currentProfiles.map((profile) =>
        profile.id === id ? { ...profile, name } : profile,
      ),
    });
  };

  const clearProfileData = (id: string, name: string) => {
    if (!settingsHydrated || importInFlightRef.current) return;
    if (!previewBridge || !environmentsReady || environments.length === 0) {
      toastManager.add({
        type: "error",
        title: `Could not clear ${name}'s data`,
        description: "You're not connected to a server yet.",
      });
      return;
    }
    void clearBrowserProfileData(
      previewBridge,
      environments.map((environment) => environment.environmentId),
      id,
    )
      .then(() => {
        toastManager.add({ type: "success", title: `Cleared ${name}'s cookies and cache` });
      })
      .catch(() => {
        toastManager.add({ type: "error", title: `Could not clear ${name}'s data` });
      });
  };

  const removeProfile = async (id: string) => {
    if (!settingsHydrated || importInFlightRef.current) return;
    if (!removalAvailable) {
      setProfileRemovalError("Connect to an environment before removing this profile.");
      return;
    }
    setProfileRemovalError(null);
    setProfileRemovalInFlight(true);
    // Drop the partition's data too, otherwise a removed profile's cookies
    // stay on disk with nothing in the UI pointing at them.
    try {
      await clearBrowserProfileData(
        previewBridge,
        environmentsReady ? environments.map((environment) => environment.environmentId) : [],
        id,
      );
    } catch {
      setProfileRemovalError("Profile data could not be deleted. Try again.");
      setProfileRemovalInFlight(false);
      return;
    }
    const currentSettings = getClientSettings();
    updateSettings({
      browserProfiles: currentSettings.browserProfiles.filter((profile) => profile.id !== id),
      // Reassign the default rather than leaving it pointing at nothing.
      ...(currentSettings.browserDefaultProfileId === id
        ? { browserDefaultProfileId: DEFAULT_BROWSER_PROFILE_ID }
        : {}),
    });
    setProfileRemovalInFlight(false);
    setProfilePendingRemoval(null);
  };

  // A browser that is not on this machine is left out rather than listed as a
  // dead row: there is nothing to act on, and the menu is a list of things you
  // can import from. An unsupported one is left out for the same reason — the
  // blocked wizard step can't be fixed from here. Every other unavailable
  // reason stays, since each names a step the user can take.
  const importableSources = (sources ?? []).filter(
    (source) =>
      source.unavailable !== "notInstalled" && source.unavailable !== "unsupportedPlatform",
  );

  // Refreshed without blanking the last result: the menu shows the cached list
  // straight away so it doesn't reflow on open, and the source list is stable
  // (names only) since choosing what to import happens in the wizard, not here.
  const loadSources = useCallback(() => {
    if (!previewBridge) return;
    void previewBridge
      .listBrowserImportSources()
      .then(setSources)
      .catch(() => setSources((previous) => previous ?? []));
  }, []);

  // Loaded once so the first open is instant instead of flashing a spinner.
  useEffect(() => {
    loadSources();
  }, [loadSources]);

  // Runs one import for the wizard. A new profile is registered only once the
  // import succeeds — the cookies land in its partition first — so a blocked
  // attempt never leaves an empty profile behind.
  const runWizardImport = async (
    source: BrowserImportSource,
    environmentId: EnvironmentId,
    input: { readonly sourceProfileDirectory: string; readonly target: WizardTarget },
  ): Promise<ImportOutcome> => {
    if (!previewBridge) return { kind: "blocked", reason: "sessionUnavailable" };
    if (!settingsHydrated) return { kind: "blocked", reason: "sessionUnavailable" };
    if (
      input.target.kind === "existing" &&
      !resolveBrowserProfiles(getClientSettings().browserProfiles).some(
        (profile) => profile.id === input.target.profileId,
      )
    ) {
      return { kind: "blocked", reason: "readFailed" };
    }
    if (importInFlightRef.current) return { kind: "blocked", reason: "readFailed" };
    importInFlightRef.current = true;
    setImportInFlight(true);
    try {
      const result = await previewBridge.importBrowserCookies({
        environmentId,
        sourceId: source.id,
        sourceProfileDirectory: input.sourceProfileDirectory,
        targetProfileId: input.target.profileId,
      });
      if (
        input.target.kind === "existing" &&
        !resolveBrowserProfiles(getClientSettings().browserProfiles).some(
          (profile) => profile.id === input.target.profileId,
        )
      ) {
        return { kind: "blocked", reason: "readFailed" };
      }
      let targetName: string;
      if (input.target.kind === "new") {
        // Registered only when something actually came over: an import that
        // found no cookies should not leave a new, empty profile behind.
        if (result.imported > 0) {
          try {
            const persisted = await persistClientSettingsUpdate((current) => {
              const existing = current.browserProfiles.find(
                (profile) => profile.id === input.target.profileId,
              );
              if (existing) return current;
              // The wizard refuses a new target at the cap, but the cap can be
              // reached while the import runs; the updater sees the newest
              // settings, so this is the check that holds.
              if (current.browserProfiles.length >= BROWSER_PROFILE_MAX_COUNT) {
                throw new ProfileLimitReachedError();
              }
              const taken = new Set(
                resolveBrowserProfiles(current.browserProfiles).map((profile) => profile.name),
              );
              let name = source.name;
              for (let index = 2; taken.has(name); index += 1) name = `${source.name} ${index}`;
              return {
                ...current,
                browserProfiles: [
                  ...current.browserProfiles,
                  { id: input.target.profileId, name, kind: "persistent" as const },
                ],
              };
            });
            targetName =
              persisted.browserProfiles.find((profile) => profile.id === input.target.profileId)
                ?.name ?? source.name;
          } catch (cause) {
            // This target id belongs only to the attempted new profile. Clear
            // its partition so a failed registration cannot strand imported
            // cookies behind a profile that disappears on restart.
            await clearBrowserProfileData(
              previewBridge,
              [environmentId],
              input.target.profileId,
            ).catch(() => undefined);
            // Not a read failure: the cookies came over and were cleared again
            // because the profile could not be kept. Name that, in the same
            // token form `importFailureReason` recovers from a bridge error.
            const reason =
              cause instanceof ProfileLimitReachedError ? "profileLimitReached" : "profileNotSaved";
            throw new Error(`Importing cookies from ${source.id} failed: ${reason}.`, { cause });
          }
        } else {
          targetName = source.name;
        }
      } else {
        targetName = input.target.name;
      }
      return {
        kind: "imported",
        imported: result.imported,
        skipped: result.skipped,
        skippedDomains: result.skippedDomains,
        targetName,
      };
    } catch (cause) {
      return { kind: "blocked", reason: importFailureReason(cause) };
    } finally {
      importInFlightRef.current = false;
      setImportInFlight(false);
    }
  };

  // Re-checks a source's availability after the user quits the browser, and
  // keeps the cached list in step so the menu reflects it too.
  const refreshImportSource = async (
    sourceId: BrowserImportSource["id"],
  ): Promise<BrowserImportSource | undefined> => {
    if (!previewBridge) return undefined;
    try {
      const latest = await previewBridge.listBrowserImportSources();
      setSources(latest);
      return latest.find((source) => source.id === sourceId);
    } catch {
      return undefined;
    }
  };

  const atProfileLimit = userProfiles.length >= BROWSER_PROFILE_MAX_COUNT;

  return (
    <SettingsRow
      {...searchableSetting("browser-profiles")}
      description="Each profile has its own cookies and logins, so you can stay signed in to different accounts at once."
      control={
        <Menu onOpenChange={(open) => open && loadSources()}>
          <MenuTrigger
            render={
              <Button
                size="sm"
                variant="outline"
                disabled={profileWritesDisabled || importInFlight}
              />
            }
          >
            <PlusIcon />
            Add profile
          </MenuTrigger>
          <MenuPopup align="end" className="min-w-56">
            <MenuItem
              disabled={!settingsHydrated || atProfileLimit}
              onClick={() => createProfile("New profile")}
            >
              Blank profile
            </MenuItem>
            {atProfileLimit ? (
              <MenuItem disabled>You&rsquo;ve reached the profile limit</MenuItem>
            ) : null}
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>Import from</MenuGroupLabel>
              {sources === null ? (
                <MenuItem disabled>Looking for browsers…</MenuItem>
              ) : importableSources.length === 0 ? (
                <MenuItem disabled>No supported browsers found</MenuItem>
              ) : (
                // Every source is a plain row — running, needs-permission and
                // ready all look the same here. The wizard picks up whatever
                // state the source is in and walks the user forward from there.
                <>
                  {importableSources.map((source) => (
                    <MenuItem
                      key={source.id}
                      disabled={!settingsHydrated || primaryEnvironment == null}
                      onClick={() => {
                        if (!settingsHydrated || primaryEnvironment == null) return;
                        setImportSession({
                          source,
                          environmentId: primaryEnvironment.environmentId,
                          environmentName: resolveEnvironmentOptionLabel({
                            isPrimary: true,
                            environmentId: primaryEnvironment.environmentId,
                            runtimeLabel: primaryEnvironment.label,
                          }),
                        });
                      }}
                    >
                      {source.name}
                    </MenuItem>
                  ))}
                  {primaryEnvironment == null ? (
                    <MenuItem disabled>Connect to an environment to import cookies</MenuItem>
                  ) : null}
                </>
              )}
            </MenuGroup>
          </MenuPopup>
        </Menu>
      }
    >
      {/*
        The bordered container groups rows unambiguously at any width, and
        carries the bottom spacing `SettingsRow` leaves to its children
        (`pt-3 pb-1`).
      */}
      <div className="mt-2 mb-2 overflow-hidden rounded-lg border border-border/60">
        {listedProfiles.map((profile, index) => {
          const builtIn = isBuiltInBrowserProfileId(profile.id);
          const isDefault = profile.id === resolvedDefaultId;
          return (
            <div
              key={profile.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2",
                index > 0 && "border-t border-border/60",
              )}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                {builtIn ? (
                  // Dimmed here rather than on the table: a wrapper-level dim
                  // stacks with the rename field's and the row menu button's
                  // own, landing them near 0.41 while every other disabled
                  // control in the block sits at 0.64.
                  <span
                    className={cn(
                      "truncate text-sm text-foreground",
                      profileWritesDisabled && "opacity-64",
                    )}
                  >
                    {profile.name}
                  </span>
                ) : (
                  <DraftInput
                    nativeInput
                    size="sm"
                    className="w-full max-w-56"
                    aria-label={`Rename ${profile.name}`}
                    disabled={profileWritesDisabled || importInFlight}
                    maxLength={BROWSER_PROFILE_NAME_MAX_LENGTH}
                    value={profile.name}
                    onCommit={(next) => renameProfile(profile.id, next)}
                  />
                )}
                {/*
                  Dimmed with the rest of the row: a `Badge` has no disabled
                  treatment of its own, so a solid `bg-primary` pill would
                  otherwise sit at full strength beside a name, rename field
                  and menu button that are all at 0.64.
                */}
                {isDefault ? (
                  <Badge className={cn(profileWritesDisabled && "opacity-64")}>Default</Badge>
                ) : null}
              </span>
              <Menu>
                <MenuTrigger
                  render={
                    <Button
                      size="icon-xs"
                      variant="ghost-muted"
                      disabled={profileWritesDisabled || importInFlight}
                      aria-label={`${profile.name} options`}
                    />
                  }
                >
                  <MoreVertical />
                </MenuTrigger>
                <MenuPopup align="end" className="min-w-44">
                  <MenuItem
                    disabled={!settingsHydrated || isDefault}
                    onClick={() => {
                      if (settingsHydrated) {
                        updateSettings({ browserDefaultProfileId: profile.id });
                      }
                    }}
                  >
                    Set as default
                  </MenuItem>
                  <MenuItem
                    disabled={!settingsHydrated || !removalAvailable}
                    onClick={() => clearProfileData(profile.id, profile.name)}
                  >
                    Clear cookies and cache
                  </MenuItem>
                  {builtIn ? null : (
                    <MenuItem
                      variant="destructive"
                      disabled={!settingsHydrated || !removalAvailable}
                      onClick={() => {
                        if (settingsHydrated) setProfilePendingRemoval(profile);
                      }}
                    >
                      Remove profile and data
                    </MenuItem>
                  )}
                  {!removalAvailable ? (
                    <>
                      <MenuSeparator />
                      <MenuItem disabled>
                        {environmentsReady
                          ? "Connect to an environment to clear profile data"
                          : "Checking environments…"}
                      </MenuItem>
                    </>
                  ) : null}
                </MenuPopup>
              </Menu>
            </div>
          );
        })}
      </div>
      <AlertDialog
        open={profilePendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open && !profileRemovalInFlight) {
            setProfilePendingRemoval(null);
            setProfileRemovalError(null);
          }
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{profilePendingRemoval?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its cookies and logins are deleted. Tabs already open in this profile stay open until
              you close them.
            </AlertDialogDescription>
            {profileRemovalError ? (
              <p aria-live="polite" className="text-sm text-destructive">
                {profileRemovalError}
              </p>
            ) : null}
            {!removalAvailable ? (
              <p className="text-sm text-muted-foreground">
                Connect to an environment to remove this profile and its data.
              </p>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose
              disabled={profileRemovalInFlight}
              render={<Button variant="outline" disabled={profileRemovalInFlight} />}
            >
              Cancel
            </AlertDialogClose>
            <Button
              variant="destructive"
              disabled={profileRemovalInFlight || !settingsHydrated || !removalAvailable}
              onClick={() => {
                if (profilePendingRemoval && settingsHydrated && removalAvailable) {
                  void removeProfile(profilePendingRemoval.id);
                }
              }}
            >
              {profileRemovalInFlight ? "Removing…" : "Remove profile"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
      {importSession ? (
        <BrowserImportWizard
          source={importSession.source}
          destinationEnvironmentName={importSession.environmentName}
          targetProfiles={listedProfiles.map((profile) => ({ id: profile.id, name: profile.name }))}
          canCreateProfile={settingsHydrated && !atProfileLimit}
          onImport={(input) =>
            runWizardImport(importSession.source, importSession.environmentId, input)
          }
          onRefreshSource={() => refreshImportSource(importSession.source.id)}
          onOpenFullDiskAccessSettings={() => {
            // Rejects outside the desktop shell (and on shells that predate the
            // method), so the one toast covers every way the link can fail.
            void readLocalApi()
              ?.shell.openSystemSettings("full-disk-access")
              .catch(() => {
                toastManager.add({
                  type: "error",
                  title: "Could not open System Settings",
                  description: "Open Privacy & Security → Full Disk Access manually.",
                });
              });
          }}
          onClose={() => setImportSession(null)}
        />
      ) : null}
    </SettingsRow>
  );
}

export function IntegrationsSettingsPanel() {
  // Client-local preview defaults are editable only where the preview exists.
  const previewDefaultsDisabled = !isElectron;
  const previewDefaults = (
    <>
      <BrowserProfilesSetting disabled={previewDefaultsDisabled} />
      <BrowserViewportSetting disabled={previewDefaultsDisabled} />
      <BrowserZoomSetting disabled={previewDefaultsDisabled} />
      <BrowserAppearanceSetting disabled={previewDefaultsDisabled} />
      <BrowserRecordingFrameRateSetting disabled={previewDefaultsDisabled} />
      <BrowserLinkTargetSetting disabled={previewDefaultsDisabled} />
      <BrowserAutoShowFloatingPreviewSetting disabled={previewDefaultsDisabled} />
    </>
  );

  return (
    <SettingsPageContainer>
      <MailAlphaSetting />
      <PulseIssuesIntegration />
      <SettingsSection id="warden" title="Pulse Warden">
        <AgentWardenAccessSetting />
      </SettingsSection>
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
