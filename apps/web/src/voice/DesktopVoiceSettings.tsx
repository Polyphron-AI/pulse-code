import type {
  DesktopVoiceDevice,
  DesktopVoiceState,
  VoiceDictationShortcut,
} from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { Checkbox } from "../components/ui/checkbox";
import { Radio, RadioGroup } from "../components/ui/radio-group";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { useClientSettings, useUpdateClientSettings } from "../hooks/useSettings";

// The sidecar's hook does not swallow keys, so presets avoid chords Windows acts on (Alt+Space).
const SHORTCUT_PRESETS: ReadonlyArray<VoiceDictationShortcut> = [
  ["Ctrl", "Win"],
  ["Ctrl", "Shift", "Space"],
  ["Ctrl", "Alt", "Space"],
];
const DEFAULT_DEVICE = "__default__";

const shortcutLabel = (shortcut: VoiceDictationShortcut) => shortcut.join(" + ");

function voiceStatusMessage(state: DesktopVoiceState | null): string | null {
  if (state?.status !== "unavailable") return null;
  return state.message ?? "The voice engine is unavailable.";
}

/** Global dictation into any app. Only the Windows desktop app has the voice engine. */
export function DesktopVoiceSettings() {
  const bridge = typeof window === "undefined" ? undefined : window.desktopBridge;
  const settings = useClientSettings();
  const updateSettings = useUpdateClientSettings();
  const [state, setState] = useState<DesktopVoiceState | null>(null);
  const [devices, setDevices] = useState<ReadonlyArray<DesktopVoiceDevice>>([]);
  const enabled = settings.voiceGlobalDictationEnabled;

  useEffect(() => {
    if (!bridge?.getVoiceState) return;
    let active = true;
    const unsubscribe = bridge.onVoiceEvent?.((event) => {
      if (event.type === "state") setState(event.state);
    });
    void bridge.getVoiceState().then(
      (next) => active && setState(next),
      () => undefined,
    );
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [bridge]);

  useEffect(() => {
    if (!enabled || !bridge?.listVoiceDevices || state?.status !== "ready") return;
    let active = true;
    void bridge.listVoiceDevices().then(
      (next) => active && setDevices(next.inputs),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [bridge, enabled, state?.status]);

  if (!bridge?.getVoiceState || state === null || state.status === "unsupported") return null;

  const shortcut = settings.voiceDictationShortcut;
  const shortcuts = SHORTCUT_PRESETS.some(
    (preset) => shortcutLabel(preset) === shortcutLabel(shortcut),
  )
    ? SHORTCUT_PRESETS
    : [shortcut, ...SHORTCUT_PRESETS];
  const deviceId = settings.voiceInputDeviceId;
  const statusMessage = voiceStatusMessage(state);

  return (
    <div className="space-y-3 border-t border-border pt-5" id="dictation-anywhere">
      <label className="flex items-center gap-3 text-sm font-medium">
        <Checkbox
          checked={enabled}
          onCheckedChange={(checked) =>
            void updateSettings({ voiceGlobalDictationEnabled: checked })
          }
        />
        Dictate into any app with a shortcut
      </label>
      <p className="text-[13px] text-muted-foreground">
        Press the shortcut anywhere on this computer, speak, and the text is pasted into the focused
        app. Parakeet runs on this device; audio never leaves it.
      </p>
      {statusMessage ? (
        <p className="text-sm text-error-foreground" role="alert">
          {statusMessage}
        </p>
      ) : null}
      {enabled ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Shortcut</p>
            <Select
              value={shortcutLabel(shortcut)}
              onValueChange={(value) => {
                const next = shortcuts.find((candidate) => shortcutLabel(candidate) === value);
                if (next) void updateSettings({ voiceDictationShortcut: next });
              }}
            >
              <SelectTrigger size="sm" className="w-full sm:w-64" aria-label="Dictation shortcut">
                <SelectValue>{shortcutLabel(shortcut)}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {shortcuts.map((candidate) => (
                  <SelectItem key={shortcutLabel(candidate)} value={shortcutLabel(candidate)}>
                    {shortcutLabel(candidate)}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
          <RadioGroup
            value={settings.voiceDictationMode}
            onValueChange={(value) =>
              void updateSettings({ voiceDictationMode: value === "toggle" ? "toggle" : "hold" })
            }
          >
            <label className="flex items-center gap-3 text-sm">
              <Radio value="hold" />
              Hold the shortcut while speaking
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Radio value="toggle" />
              Press once to start, again to stop
            </label>
          </RadioGroup>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Microphone</p>
            <Select
              value={deviceId ?? DEFAULT_DEVICE}
              onValueChange={(value) =>
                void updateSettings({
                  voiceInputDeviceId: !value || value === DEFAULT_DEVICE ? null : value,
                })
              }
            >
              <SelectTrigger size="sm" className="w-full sm:w-64" aria-label="Dictation microphone">
                <SelectValue>
                  {deviceId === null
                    ? "System default"
                    : (devices.find((device) => device.id === deviceId)?.name ?? deviceId)}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value={DEFAULT_DEVICE}>System default</SelectItem>
                {devices.map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.name}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={settings.voicePillEnabled}
              onCheckedChange={(checked) => void updateSettings({ voicePillEnabled: checked })}
            />
            Show the voice pill on the active screen while dictating
          </label>
          <p className="text-xs text-muted-foreground">Press Escape to cancel a dictation.</p>
        </div>
      ) : null}
    </div>
  );
}
