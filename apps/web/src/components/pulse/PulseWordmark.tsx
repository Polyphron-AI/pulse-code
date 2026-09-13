// Pulse-owned brand seam. Upstream never touches this file, so a T3 copy change
// can never conflict here; the only upstream contact point is the single import
// in the onboarding wizard header.
//
// Today this renders a text wordmark from PRODUCT_BASE_NAME. When the brand
// assets slice lands the real Pulse mark, point ACTIVE_WORDMARK at it and
// nothing else in the app changes.

import { PRODUCT_BASE_NAME } from "@t3tools/shared/productIdentity";
import type { ComponentType } from "react";

import { cn } from "../../lib/utils";

/** Pulse palette. Exported so the mark artwork can use the same two values. */
export const PULSE_BRAND_INK = "#0A0A0B";
export const PULSE_BRAND_ACCENT = "#00FF88";

/**
 * Every wordmark rendering takes the class name of the slot it fills, so the
 * real mark can honour the same `h-4 w-auto` sizing the text version does.
 */
export interface PulseWordmarkRenderingProps {
  readonly className?: string;
}

/**
 * Text fallback used until the real mark exists: the product name in Pulse ink
 * with the accent carried by a leading pulse dot. Ink is near-black in light
 * mode and lifts to white in dark mode, because #0A0A0B on a dark surface is
 * unreadable and the wizard renders in both themes.
 */
function PulseTextWordmark({ className }: PulseWordmarkRenderingProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[1.4rem] leading-none font-medium tracking-tight",
        className,
      )}
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: PULSE_BRAND_ACCENT }}
      />
      <span className="text-[#0A0A0B] dark:text-white">{PRODUCT_BASE_NAME}</span>
    </span>
  );
}

/** Swap this single binding to the real mark component when artwork lands. */
const ACTIVE_WORDMARK: ComponentType<PulseWordmarkRenderingProps> = PulseTextWordmark;

/**
 * The product lockup for the app's branded surfaces. Carries its own accessible
 * name so call sites do not repeat the product name as an aria-label.
 */
export function PulseWordmark({ className }: PulseWordmarkRenderingProps) {
  return (
    <div role="img" aria-label={PRODUCT_BASE_NAME}>
      <ACTIVE_WORDMARK className={className} />
    </div>
  );
}
