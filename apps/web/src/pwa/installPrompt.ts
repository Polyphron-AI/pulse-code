import { useCallback, useSyncExternalStore } from "react";

import { isElectron } from "../env";
import { useIsStandalone } from "./displayMode";

/**
 * `beforeinstallprompt` is not in the DOM lib because only Chromium ships it.
 * The shape we rely on is the deferral contract: prevent the browser's own
 * banner, keep the event, and replay it from our own affordance.
 */
export type BeforeInstallPromptEvent = Event & {
  readonly platforms: ReadonlyArray<string>;
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{
    readonly outcome: "accepted" | "dismissed";
    readonly platform: string;
  }>;
};

export type InstallAvailability =
  /** Already running as an installed app, or inside the desktop shell. */
  | "installed"
  /** The browser handed us a deferred prompt we can replay on a gesture. */
  | "prompt"
  /** Installable, but only through a browser menu we cannot open (iOS Safari). */
  | "manual"
  | "unsupported";

export function resolveInstallAvailability(input: {
  readonly isElectron: boolean;
  readonly isStandalone: boolean;
  readonly isSecureContext: boolean;
  readonly hasDeferredPrompt: boolean;
  readonly supportsManualInstall: boolean;
}): InstallAvailability {
  // The Electron renderer is already the installed app; offering to install it
  // again would be nonsense even if Chromium fired the event.
  if (input.isElectron) return "unsupported";
  if (input.isStandalone) return "installed";
  if (input.hasDeferredPrompt) return "prompt";
  // A plain-HTTP LAN origin can still be added to the Home Screen, but with no
  // service worker it is a bookmark wearing an app icon. Recommending it would
  // be promising an installed app we cannot deliver there.
  if (input.supportsManualInstall && input.isSecureContext) return "manual";
  return "unsupported";
}

/**
 * iOS and iPadOS install only through Share -> Add to Home Screen, and never
 * fire `beforeinstallprompt`. iPadOS 13+ claims a desktop macOS user agent, so
 * touch points are what separate an iPad from a Mac.
 */
export function supportsManualHomeScreenInstall(input: {
  readonly userAgent: string;
  readonly maxTouchPoints: number;
}): boolean {
  if (/iPhone|iPad|iPod/.test(input.userAgent)) return true;
  return /Macintosh/.test(input.userAgent) && input.maxTouchPoints > 1;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const subscribers = new Set<() => void>();

function notify() {
  for (const subscriber of subscribers) subscriber();
}

function subscribe(onChange: () => void): () => void {
  subscribers.add(onChange);
  return () => subscribers.delete(onChange);
}

function readDeferredPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

/**
 * Starts listening before React mounts: Chromium fires
 * `beforeinstallprompt` once, early, and never again for the page, so a
 * listener attached from an effect misses it on a cold load.
 */
export function captureInstallPrompt(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

export type InstallPromptOutcome = "accepted" | "dismissed" | "unavailable";

export function useInstallPrompt(): {
  readonly availability: InstallAvailability;
  readonly promptInstall: () => Promise<InstallPromptOutcome>;
} {
  const prompt = useSyncExternalStore(subscribe, readDeferredPrompt, () => null);
  const isStandalone = useIsStandalone();

  const availability = resolveInstallAvailability({
    isElectron,
    isStandalone,
    isSecureContext: window.isSecureContext,
    hasDeferredPrompt: prompt !== null,
    supportsManualInstall: supportsManualHomeScreenInstall({
      userAgent: navigator.userAgent,
      maxTouchPoints: navigator.maxTouchPoints,
    }),
  });

  const promptInstall = useCallback(async (): Promise<InstallPromptOutcome> => {
    if (!prompt) return "unavailable";
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      // A deferred prompt is single-use either way; keeping a spent one would
      // leave a button that silently does nothing.
      deferredPrompt = null;
      notify();
      return outcome;
    } catch (error) {
      console.warn("Could not show the install prompt.", error);
      return "unavailable";
    }
  }, [prompt]);

  return { availability, promptInstall };
}
