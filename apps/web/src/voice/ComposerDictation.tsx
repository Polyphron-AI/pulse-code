import type { ContextMenuItem } from "@t3tools/contracts";
import { AudioLinesIcon, MicIcon, RotateCcwIcon } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "../components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { readLocalApi } from "../localApi";
import {
  listAudioInputChoices,
  readAudioInputDeviceId,
  writeAudioInputDeviceId,
} from "./audioInputDevices";
import type { PulseDictationState } from "./pulseDictation";

export function ComposerDictation(props: {
  readonly state: PulseDictationState;
  readonly disabledReason: string | null;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onCancel: () => void;
  readonly parakeetConfigured: boolean;
}) {
  const isError = props.state.phase === "error";
  const recording = props.state.phase === "recording";
  const busy = props.state.phase === "preparing" || props.state.phase === "transcribing";
  const label = recording
    ? "Stop recording and transcribe"
    : busy
      ? `Cancel ${props.state.phase}`
      : isError
        ? "Record again"
        : "Dictate";
  const unavailable = !isError && props.disabledReason !== null;
  if (isError) {
    return (
      <div className="flex min-w-0 items-center gap-1" role="alert">
        <span className="max-w-32 truncate text-xs text-error-foreground">
          {props.state.message}
        </span>
        {!props.parakeetConfigured ? <SetupVoiceButton /> : null}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onPointerDown={(event) => event.preventDefault()}
                onClick={props.onStart}
                onContextMenu={showAudioInputMenu}
                onKeyDown={(event) => {
                  if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10"))
                    return;
                  showAudioInputMenu(event);
                }}
                aria-label={label}
              />
            }
          >
            <RotateCcwIcon />
          </TooltipTrigger>
          <TooltipPopup>{props.state.message}</TooltipPopup>
        </Tooltip>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Voice dictation">
      {!props.parakeetConfigured ? <SetupVoiceButton /> : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size={recording ? "sm" : "icon-sm"}
              disabled={unavailable}
              className={
                recording
                  ? "border-[#ff674f] bg-[#ff3b1f] px-2.5 text-white shadow-sm shadow-black/20 [--control-icon-color:white] hover:bg-[#e9341b]"
                  : undefined
              }
              onPointerDown={(event) => event.preventDefault()}
              onClick={recording ? props.onStop : busy ? props.onCancel : props.onStart}
              onContextMenu={showAudioInputMenu}
              onKeyDown={(event) => {
                if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
                showAudioInputMenu(event);
              }}
              aria-label={label}
              aria-pressed={recording}
            />
          }
        >
          {busy ? (
            <AudioLinesIcon />
          ) : recording ? (
            <>
              <span className="pulse-dictation-wave" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="text-xs font-semibold">Voice dictation</span>
              <MicIcon className="fill-current" />
            </>
          ) : (
            <MicIcon />
          )}
        </TooltipTrigger>
        <TooltipPopup className="max-w-72 whitespace-normal">
          {props.disabledReason ?? `${label}. Right-click to choose a microphone.`}
        </TooltipPopup>
      </Tooltip>
    </div>
  );
}

async function showAudioInputMenu(
  event: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>,
) {
  event.preventDefault();
  event.stopPropagation();
  const bounds = event.currentTarget.getBoundingClientRect();
  const mouse = "clientX" in event && event.clientX !== 0;
  const position = mouse
    ? { x: event.clientX, y: event.clientY }
    : { x: bounds.left, y: bounds.bottom };
  const api = readLocalApi();
  if (!api) return;
  const choices = await listAudioInputChoices();
  const selected = readAudioInputDeviceId();
  const ids = new Map<string, string | null>();
  const items: ContextMenuItem<string>[] = choices.map((choice, index) => {
    const id = `audio-input-${String(index)}`;
    ids.set(id, choice.deviceId);
    return {
      id,
      label: `${choice.deviceId === selected ? "✓ " : ""}${choice.label}`,
    };
  });
  const result = await api.contextMenu.show(items, position);
  if (result) writeAudioInputDeviceId(ids.get(result) ?? null);
}

function SetupVoiceButton() {
  return (
    <Button
      size="xs"
      variant="outline"
      className="rounded-full px-2.5 text-xs"
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
