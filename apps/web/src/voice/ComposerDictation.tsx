import { AudioLinesIcon, MicIcon, RotateCcwIcon, SquareIcon, XIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "../components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import type { PulseDictationState } from "./pulseDictation";

export function ComposerDictation(props: {
  readonly state: PulseDictationState;
  readonly disabledReason: string | null;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onCancel: () => void;
}) {
  if (props.state.phase === "recording") {
    return (
      <div className="flex items-center gap-1" role="group" aria-label="Dictation recording">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-error-foreground"
                onPointerDown={(event) => event.preventDefault()}
                onClick={props.onStop}
                aria-label="Stop recording and transcribe"
              />
            }
          >
            <SquareIcon className="fill-current" />
          </TooltipTrigger>
          <TooltipPopup>Stop and transcribe</TooltipPopup>
        </Tooltip>
        <CancelButton label="Cancel recording" onCancel={props.onCancel} />
      </div>
    );
  }

  if (props.state.phase === "preparing" || props.state.phase === "transcribing") {
    const label = props.state.phase === "preparing" ? "Preparing microphone" : "Transcribing";
    return (
      <div className="flex items-center gap-1" role="status" aria-label={label}>
        <Button type="button" variant="ghost" size="icon-sm" disabled aria-label={label}>
          <AudioLinesIcon />
        </Button>
        <CancelButton label={`Cancel ${label.toLowerCase()}`} onCancel={props.onCancel} />
      </div>
    );
  }

  const isError = props.state.phase === "error";
  const label = isError ? "Record again" : "Dictate";
  const unavailable = !isError && props.disabledReason !== null;
  if (isError) {
    return (
      <div className="flex min-w-0 items-center gap-1" role="alert">
        <span className="max-w-32 truncate text-xs text-error-foreground">
          {props.state.message}
        </span>
        <SetupVoiceButton />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onPointerDown={(event) => event.preventDefault()}
                onClick={props.onStart}
                aria-label={label}
              />
            }
          >
            <RotateCcwIcon />
          </TooltipTrigger>
          <TooltipPopup>{props.state.message}</TooltipPopup>
        </Tooltip>
        <CancelButton label="Dismiss dictation error" onCancel={props.onCancel} />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Voice dictation">
      <SetupVoiceButton />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={unavailable}
              onPointerDown={(event) => event.preventDefault()}
              onClick={props.onStart}
              aria-label={label}
            />
          }
        >
          <MicIcon />
        </TooltipTrigger>
        <TooltipPopup className="max-w-72 whitespace-normal">
          {props.disabledReason ?? "Dictate"}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}

function SetupVoiceButton() {
  return (
    <Button
      size="xs"
      variant="ghost-muted"
      className="rounded-full px-2 text-xs"
      render={
        <Link
          to="/settings/integrations"
          hash="dictation"
          aria-label="Set up voice with Parakeet"
        />
      }
    >
      Set up voice
    </Button>
  );
}

function CancelButton(props: { readonly label: string; readonly onCancel: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onPointerDown={(event) => event.preventDefault()}
            onClick={props.onCancel}
            aria-label={props.label}
          />
        }
      >
        <XIcon />
      </TooltipTrigger>
      <TooltipPopup>{props.label}</TooltipPopup>
    </Tooltip>
  );
}
