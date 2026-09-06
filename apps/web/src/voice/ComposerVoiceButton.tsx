import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MicIcon, SquareIcon } from "lucide-react";
import { useClientSettings } from "../hooks/useSettings";
import { voiceCapture, useVoiceCapture, VOICE_TOGGLE_EVENT } from "./voiceCapture";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../components/ui/tooltip";

export function ComposerVoiceButton({
  owner,
  disabled,
  insert,
}: {
  owner: string;
  disabled: boolean;
  insert: (text: string) => boolean;
}) {
  const state = useVoiceCapture();
  const shortcut = useClientSettings((settings) => settings.voiceShortcut);
  const [captureOwner] = useState(() => Symbol("composer voice"));
  const insertLatest = useRef(insert);
  useLayoutEffect(() => {
    insertLatest.current = insert;
  });
  const toggle = useCallback(() => {
    if (state.phase === "recording" && voiceCapture.isOwnedBy(captureOwner)) {
      void voiceCapture.stop();
      return;
    }
    if (disabled || !["idle", "error"].includes(state.phase)) return;
    void voiceCapture.start((text) => {
      if (!voiceCapture.isOwnedBy(captureOwner) || !insertLatest.current(text))
        throw new Error("The draft is no longer available. Copy the transcript below.");
    }, captureOwner);
  }, [state.phase, disabled, captureOwner]);
  useEffect(() => {
    const handle = (event: Event) => {
      if (event.defaultPrevented || disabled) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener(VOICE_TOGGLE_EVENT, handle);
    return () => window.removeEventListener(VOICE_TOGGLE_EVENT, handle);
  }, [toggle, disabled]);
  useLayoutEffect(() => {
    return () => {
      if (voiceCapture.isOwnedBy(captureOwner)) voiceCapture.cancel();
    };
  }, [owner, captureOwner]);
  const recording = state.phase === "recording" && voiceCapture.isOwnedBy(captureOwner);
  const busy = !["idle", "error", "recording"].includes(state.phase);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => toggle()}
            disabled={disabled || busy || (state.phase === "recording" && !recording)}
            aria-label={recording ? "Stop voice capture" : "Start voice capture"}
            aria-pressed={recording}
            className={`flex size-8 shrink-0 items-center justify-center rounded-full disabled:opacity-40 ${recording ? "bg-destructive text-white" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
          />
        }
      >
        {recording ? <SquareIcon className="size-3.5" /> : <MicIcon className="size-4" />}
      </TooltipTrigger>
      <TooltipPopup>
        {recording ? "Stop recording" : "Dictate with Parakeet"} ({shortcut})
      </TooltipPopup>
    </Tooltip>
  );
}
