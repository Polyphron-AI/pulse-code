import { APP_DISPLAY_NAME, APP_VERSION } from "../branding";
import { toastManager } from "../components/ui/toast";
import { isElectron } from "../env";
import { resolveServiceWorkerAction, serviceWorkerScriptUrl } from "./serviceWorkerSupport";

/**
 * Owns the service worker lifecycle for the installed web app: registers it,
 * clears it where it does not belong, and turns a waiting worker into a prompt
 * instead of a reload the user did not ask for.
 */

// A `controllerchange` reload must fire once. Without the guard, a worker that
// claims clients during its own activation can bounce the page in a loop.
let reloading = false;

function reloadOnce() {
  if (reloading) return;
  reloading = true;
  window.location.reload();
}

function promptUpdate(registration: ServiceWorkerRegistration) {
  const waiting = registration.waiting;
  if (!waiting) return;

  toastManager.add({
    type: "info",
    title: "Update available",
    description: `A newer ${APP_DISPLAY_NAME} is ready to load.`,
    // Persistent: this is the only affordance for picking up a new build in an
    // installed PWA, where there is no address bar to reload from.
    timeout: 0,
    actionProps: {
      children: "Reload",
      onClick: () => {
        navigator.serviceWorker.addEventListener("controllerchange", reloadOnce, { once: true });
        // ServiceWorker.postMessage takes a transfer list, not a target
        // origin — the lint rule is matching on the method name alone.
        // oxlint-disable-next-line unicorn/require-post-message-target-origin
        waiting.postMessage({ type: "SKIP_WAITING" });
      },
    },
  });
}

function watchForUpdate(registration: ServiceWorkerRegistration) {
  // Already staged from a previous visit.
  if (registration.waiting && navigator.serviceWorker.controller) {
    promptUpdate(registration);
  }

  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    // No controller means this is the very first install, not an update.
    if (!installing || !navigator.serviceWorker.controller) return;

    installing.addEventListener("statechange", () => {
      if (installing.state === "installed") promptUpdate(registration);
    });
  });
}

async function register() {
  try {
    const registration = await navigator.serviceWorker.register(
      serviceWorkerScriptUrl(APP_VERSION),
      // `updateViaCache: "none"` keeps the HTTP cache out of the update check,
      // which is the difference between shipping a fix and shipping it in a day.
      { scope: "/", updateViaCache: "none" },
    );
    watchForUpdate(registration);
  } catch (error) {
    // A failed registration costs offline support and installability, nothing
    // else — the app runs fine uncontrolled, so this must not be fatal.
    console.warn("[pwa] service worker registration failed", error);
  }
}

async function unregisterAll() {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  } catch (error) {
    console.warn("[pwa] service worker cleanup failed", error);
  }
}

export function registerServiceWorker(): void {
  const action = resolveServiceWorkerAction({
    hasServiceWorkerApi: typeof navigator !== "undefined" && "serviceWorker" in navigator,
    isElectron,
    isDev: import.meta.env.DEV,
    isSecureContext: typeof window !== "undefined" && window.isSecureContext,
  });

  if (action === "skip") return;
  if (action === "unregister") {
    void unregisterAll();
    return;
  }

  // Registration competes with the first paint for network and main thread, and
  // the worker is only useful on the *next* load anyway.
  if (document.readyState === "complete") {
    void register();
    return;
  }
  window.addEventListener("load", () => void register(), { once: true });
}
