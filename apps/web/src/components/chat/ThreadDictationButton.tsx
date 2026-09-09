import { useEffect, useRef, useState } from "react";
import { MicIcon, SquareIcon } from "lucide-react";
import { randomUUID } from "../../lib/utils";
import { Button } from "../ui/button";

export function ThreadDictationButton({
  onTranscript,
  onBusyChange,
  disabled = false,
}: {
  onTranscript: (text: string) => void;
  onBusyChange: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionId = useRef(randomUUID());
  const mounted = useRef(true);
  const active = useRef(false);
  const locked = useRef(false);
  const finish = useRef<() => void>(() => undefined);
  const callback = useRef(onTranscript);
  callback.current = onTranscript;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (active.current)
        void window.desktopBridge?.talkInvoke?.({
          operation: "draftDictation.cancel",
          sessionId: sessionId.current,
        });
    };
  }, []);
  useEffect(() => {
    onBusyChange(recording || pending);
    return () => onBusyChange(false);
  }, [recording, pending, onBusyChange]);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setTimeout(() => finish.current(), 118_000);
    return () => window.clearTimeout(timer);
  }, [recording]);
  async function toggle() {
    if (locked.current) return;
    const invoke = window.desktopBridge?.talkInvoke;
    if (!invoke) {
      setError(
        "Local dictation is available in the Pulse desktop app. Enable it in Settings > Dictation.",
      );
      return;
    }
    locked.current = true;
    setPending(true);
    setError(null);
    try {
      const wasRecording = active.current;
      const result = await invoke({
        operation: wasRecording ? "draftDictation.stop" : "draftDictation.start",
        sessionId: sessionId.current,
      });
      if (!result.ok) throw new Error(result.error.message);
      active.current = !wasRecording;
      if (!mounted.current) {
        if (active.current)
          await invoke({ operation: "draftDictation.cancel", sessionId: sessionId.current });
        return;
      }
      setRecording(active.current);
      if (wasRecording) {
        const text = result.recording?.transcript?.trim();
        if (text) callback.current(text);
        else setError("No speech was transcribed. The recording is available in Talk history.");
      }
    } catch (error) {
      if (mounted.current)
        setError(error instanceof Error ? error.message : "Dictation failed. Check Talk history.");
      if (active.current) {
        await invoke({ operation: "draftDictation.cancel", sessionId: sessionId.current }).catch(
          () => undefined,
        );
        active.current = false;
      }
      if (mounted.current) setRecording(false);
    } finally {
      locked.current = false;
      if (mounted.current) setPending(false);
    }
  }
  finish.current = () => {
    void toggle();
  };
  return (
    <div className="relative flex justify-end">
      <Button
        type="button"
        size="icon-sm"
        variant={recording ? "destructive" : "ghost"}
        disabled={pending || (disabled && !recording)}
        aria-label={recording ? "Stop dictation and insert text" : "Dictate message"}
        aria-pressed={recording}
        title={recording ? "Stop and transcribe (maximum 2 minutes)" : "Dictate into this draft"}
        onClick={() => void toggle()}
      >
        {recording ? <SquareIcon className="size-3.5" /> : <MicIcon className="size-4" />}
      </Button>
      {(error || recording || pending) && (
        <div
          className="absolute bottom-full right-0 z-50 mb-2 w-64 rounded-lg border bg-popover p-3 text-xs shadow-md"
          role={error ? "alert" : "status"}
        >
          {error ??
            (pending
              ? "Preparing dictation…"
              : "Listening. Click the mic again to insert your words. Recording stops after 2 minutes.")}
          {error && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setError(null)}>
              Dismiss
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
