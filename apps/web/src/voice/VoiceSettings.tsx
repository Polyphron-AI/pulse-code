import { useState } from "react";
import { parseVoiceShortcut } from "@t3tools/shared/voiceShortcut";
import { useClientSettings, useUpdateClientSettings } from "../hooks/useSettings";

export function VoiceSettings() {
  const settings = useClientSettings();
  const update = useUpdateClientSettings();
  const [shortcut, setShortcut] = useState(settings.voiceShortcut);
  const [error, setError] = useState("");
  const desktop = Boolean(window.desktopBridge?.voice);
  return (
    <section
      id="voice-capture"
      className="space-y-3 rounded-xl border p-4"
      aria-labelledby="voice-settings-title"
    >
      <h2 id="voice-settings-title" className="font-medium">
        Voice capture
      </h2>
      <p className="text-sm text-muted-foreground">
        Parakeet transcribes on this device. Its speech model downloads on first use. Dictation adds
        text without sending the message.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!parseVoiceShortcut(shortcut)) {
            setError("Use a shortcut such as ctrl+shift+space or ctrl+windows.");
            return;
          }
          update({ voiceShortcut: shortcut.trim().toLowerCase() });
          setError("");
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <label htmlFor="voice-shortcut" className="text-sm">
          Voice shortcut
        </label>
        <input
          id="voice-shortcut"
          data-voice-shortcut-capture
          value={shortcut}
          onChange={(event) => setShortcut(event.target.value)}
          className="rounded-md border bg-transparent px-2 py-1 text-sm"
          spellCheck={false}
        />
        <button type="submit" className="rounded-md border px-3 py-1 text-sm">
          Save shortcut
        </button>
        <button
          type="button"
          className="text-sm text-muted-foreground"
          onClick={() => {
            setShortcut("ctrl+shift+space");
            update({ voiceShortcut: "ctrl+shift+space" });
            setError("");
          }}
        >
          Reset
        </button>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Press once to record, again to stop. Escape cancels. Ctrl+Windows without another key is
        supported by Windows desktop.
      </p>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Use voice shortcut outside Pulse Code</span>
        <input
          type="checkbox"
          checked={settings.voiceGlobalShortcutEnabled}
          disabled={!desktop}
          onChange={(event) => update({ voiceGlobalShortcutEnabled: event.target.checked })}
        />
      </label>
      <label className="flex items-center justify-between gap-3 text-sm">
        <span>Show floating voice control (hover mode)</span>
        <input
          type="checkbox"
          checked={settings.voiceHoverEnabled}
          disabled={!desktop}
          onChange={(event) => update({ voiceHoverEnabled: event.target.checked })}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Desktop hover mode shows a small control above other apps. Turning it off leaves your
        shortcut available. Typing into other apps is currently supported on Windows.
      </p>
    </section>
  );
}
