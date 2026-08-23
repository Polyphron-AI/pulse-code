import { useMediaQuery } from "../hooks/useMediaQuery";

/**
 * Whether the app is running as an installed app rather than a browser tab.
 * Layout decisions that assume there is no address bar — full-height scroll
 * containers, bottom navigation inside the home indicator — key off this.
 */

type IosStandaloneNavigator = Navigator & { readonly standalone?: boolean };

/**
 * iOS reports an installed web app through the non-standard
 * `navigator.standalone` on older versions rather than the display-mode media
 * query, so both have to be consulted.
 */
export function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined") return false;
  if ((navigator as IosStandaloneNavigator).standalone === true) return true;
  return window.matchMedia("(display-mode: standalone)").matches;
}

export function useIsStandalone(): boolean {
  const matchesStandalone = useMediaQuery("(display-mode: standalone)");
  return matchesStandalone || (navigator as IosStandaloneNavigator).standalone === true;
}
