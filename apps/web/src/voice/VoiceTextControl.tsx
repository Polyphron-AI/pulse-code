import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MicIcon } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import {
  rememberVoiceTextField,
  focusedVoiceElement,
  voiceFieldLabel,
  voiceTextField,
  type VoiceTextField,
} from "./voiceTextTarget";
import { toggleVoiceCapture, voiceCapture } from "./voiceCapture";

/** One delegated listener covers new forms, portals, and ordinary text editors. */
export function VoiceTextControl({ visible, shortcut }: { visible: boolean; shortcut: string }) {
  const [field, setField] = useState<VoiceTextField | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const parent = field?.parentNode;
  const container = parent instanceof ShadowRoot ? parent : (field?.parentElement ?? document.body);
  useEffect(() => {
    const focus = (event?: FocusEvent) => {
      if (!["idle", "error"].includes(voiceCapture.getSnapshot().phase)) return;
      const target = event?.composedPath()[0] ?? focusedVoiceElement();
      if (target instanceof Element && target.closest("[data-voice-control]")) return;
      const next = voiceTextField(target);
      rememberVoiceTextField(next);
      setField(next);
    };
    // Retarget on focusin. Between focusout and focusin the active element can
    // temporarily be body; clearing here would remove the next Tab destination.
    focus();
    document.addEventListener("focusin", focus);
    return () => {
      document.removeEventListener("focusin", focus);
      rememberVoiceTextField(null);
    };
  }, []);
  useEffect(() => {
    if (!field || !visible) return;
    if (
      field.matches('[data-testid="composer-editor"]') &&
      document.querySelector("[data-composer-voice]")
    )
      return;
    const previousPadding = field.style.paddingInlineEnd;
    field.style.paddingInlineEnd = `${Math.max(48, parseFloat(getComputedStyle(field).paddingInlineEnd) || 0)}px`;
    const place = () => {
      const rect = field.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      // Dialog transforms establish a containing block for their fixed descendants.
      let offsetLeft = 0;
      let offsetTop = 0;
      for (
        let parent: Element | null = container instanceof ShadowRoot ? container.host : container;
        parent && parent !== document.body;
        parent = parent.parentElement
      ) {
        const style = getComputedStyle(parent);
        if (
          style.transform !== "none" ||
          style.translate !== "none" ||
          style.filter !== "none" ||
          style.perspective !== "none"
        ) {
          const bounds = parent.getBoundingClientRect();
          offsetLeft = bounds.left;
          offsetTop = bounds.top;
          break;
        }
      }
      setPosition({
        left: Math.max(left + 4, Math.min(rect.right - 44, left + width - 48)) - offsetLeft,
        top: Math.max(top + 4, Math.min(rect.top, top + height - 44)) - offsetTop,
      });
    };
    place();
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      field.style.paddingInlineEnd = previousPadding;
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [field, container, visible]);
  if (
    !field?.isConnected ||
    !visible ||
    (field.matches('[data-testid="composer-editor"]') &&
      document.querySelector("[data-composer-voice]"))
  )
    return null;
  const label = voiceFieldLabel(field);
  return createPortal(
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            data-voice-control
            aria-label={`Dictate into ${label} with Pulse Talq`}
            onPointerDown={(event) => event.preventDefault()}
            onClick={toggleVoiceCapture}
            className="fixed z-[100] flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-fine:h-8"
            style={position}
          />
        }
      >
        <MicIcon className="size-4" />
      </TooltipTrigger>
      <TooltipPopup>
        Pulse Talq · Dictate into {label} ({shortcut})
      </TooltipPopup>
    </Tooltip>,
    container,
  );
}
