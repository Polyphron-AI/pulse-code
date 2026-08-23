/**
 * Decides whether this client should own a service worker, kept pure so the
 * matrix of surfaces (browser, installed PWA, Electron renderer, dev server,
 * MSW-backed tests) is testable without a real registration.
 */

export type ServiceWorkerEnvironment = {
  readonly hasServiceWorkerApi: boolean;
  readonly isElectron: boolean;
  readonly isDev: boolean;
  readonly isSecureContext: boolean;
};

/**
 * `unregister` rather than `skip` for Electron and dev on purpose. A developer
 * who ran a production build once, or a user who opened the hosted app before
 * installing the desktop shell, otherwise keeps a worker that outlives the
 * reason it existed and starts answering from a stale cache.
 */
export type ServiceWorkerAction = "register" | "unregister" | "skip";

export function resolveServiceWorkerAction(
  environment: ServiceWorkerEnvironment,
): ServiceWorkerAction {
  if (!environment.hasServiceWorkerApi) return "skip";
  if (environment.isElectron || environment.isDev) return "unregister";
  if (!environment.isSecureContext) return "skip";
  return "register";
}

/**
 * The version rides in the query string because a service worker only updates
 * when its script URL or bytes change, and `sw.js` is version-agnostic by
 * design. It also becomes the cache-name suffix inside the worker.
 */
export function serviceWorkerScriptUrl(version: string): string {
  return `/sw.js?v=${encodeURIComponent(version)}`;
}
