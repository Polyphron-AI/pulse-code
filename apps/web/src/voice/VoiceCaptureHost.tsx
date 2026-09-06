import { useEffect, useState } from "react";
import { matchesVoiceShortcut } from "@t3tools/shared/voiceShortcut";
import { useClientSettings, useClientSettingsHydrated } from "../hooks/useSettings";
import { voiceCapture, useVoiceCapture, toggleComposerVoice } from "./voiceCapture";

export function VoiceCaptureHost() {
  const settings = useClientSettings();
  const hydrated = useClientSettingsHydrated();
  const state = useVoiceCapture();
  const [desktopError, setDesktopError] = useState("");
  useEffect(() => {
    if (!hydrated) return;
    let active = true;
    void window.desktopBridge?.voice
      ?.configure({
        shortcut: settings.voiceShortcut,
        globalEnabled: settings.voiceGlobalShortcutEnabled,
        hoverEnabled: settings.voiceHoverEnabled,
      })
      .then(() => {
        if (active) setDesktopError("");
      })
      .catch((error: unknown) => {
        if (active)
          setDesktopError(
            error instanceof Error ? error.message : "Could not enable desktop voice capture.",
          );
      });
    return () => {
      active = false;
    };
  }, [
    hydrated,
    settings.voiceShortcut,
    settings.voiceGlobalShortcutEnabled,
    settings.voiceHoverEnabled,
  ]);
  useEffect(
    () =>
      window.desktopBridge?.voice?.onAction(({ kind, target, message }) => {
        if (kind === "error") {
          voiceCapture.reportError(message ?? "Desktop voice capture failed.");
          return;
        }
        if (kind === "cancel") {
          voiceCapture.cancel();
          return;
        }
        if (voiceCapture.getSnapshot().phase === "recording") {
          void voiceCapture.stop();
          return;
        }
        if (target)
          void voiceCapture.start((text) => window.desktopBridge!.voice!.deliver(target, text));
        else toggleComposerVoice();
      }),
    [],
  );
  useEffect(() => {
    void window.desktopBridge?.voice
      ?.publish({ phase: state.phase, message: state.message })
      .catch(() => undefined);
  }, [state.phase, state.message]);
  useEffect(() => {
    let chordDown = false;
    const down = (event: KeyboardEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest("[data-voice-shortcut-capture], [data-keybinding-capture]")
      )
        return;
      if (event.key === "Escape" && !["idle", "error"].includes(voiceCapture.getSnapshot().phase)) {
        event.preventDefault();
        voiceCapture.cancel();
        return;
      }
      // The native hook consumes the global chord; avoid firing it twice.
      if (window.desktopBridge?.voice && settings.voiceGlobalShortcutEnabled) return;
      if (!event.repeat && !chordDown && matchesVoiceShortcut(event, settings.voiceShortcut)) {
        chordDown = true;
        event.preventDefault();
        toggleComposerVoice();
      }
    };
    const up = () => {
      chordDown = false;
    };
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", up);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", up);
    };
  }, [settings.voiceShortcut, settings.voiceGlobalShortcutEnabled]);
  useEffect(() => () => voiceCapture.cancel(), []);
  if (state.phase === "idle" && !desktopError) return null;
  return (
    <aside
      className="fixed bottom-4 left-1/2 z-50 w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
      aria-label="Voice capture"
    >
      <p role={state.phase === "error" || desktopError ? "alert" : "status"}>
        {desktopError || state.message}
      </p>
      {state.transcript ? (
        <textarea
          aria-label="Recovered transcript"
          readOnly
          value={state.transcript}
          className="mt-2 w-full rounded border p-2"
        />
      ) : null}
      <div className="mt-2 flex justify-end gap-3">
        {state.phase === "recording" ? (
          <button type="button" onClick={() => void voiceCapture.stop()}>
            Stop recording
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            voiceCapture.cancel();
            setDesktopError("");
          }}
        >
          {state.phase === "error" || desktopError ? "Dismiss" : "Cancel"}
        </button>
      </div>
    </aside>
  );
}
