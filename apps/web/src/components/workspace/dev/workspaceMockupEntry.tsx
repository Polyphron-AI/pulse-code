import type { CSSProperties } from "react";
// Only side-effect-free seed helpers load statically. Presentation modules must
// stay behind the dynamic imports after installNetworkGuard() in startup.
import {
  createWorkspaceMockupSession,
  parseWorkspaceMockupRequest,
} from "./workspaceMockupFixtures";
import type {
  CreateWorkspaceMockupModule,
  WorkspaceMockupCaptureManifest,
  WorkspaceMockupId,
  WorkspaceMockupModule,
  WorkspaceMockupSession,
} from "./workspaceMockupFixtures";

export interface WorkspaceMockupCaptureApi {
  readonly configureCapture: (context: {
    readonly viewport: {
      readonly width: number;
      readonly height: number;
      readonly deviceScaleFactor: 1;
      readonly zoom: 1;
    };
    readonly resolvedFont: string;
    readonly os: string;
    readonly resolvedLocale: string;
    readonly resolvedTimeZone: string;
  }) => void;
  readonly reset: (id: WorkspaceMockupId) => Promise<void>;
  readonly ready: () => Promise<{
    readonly fixtureReady: true;
    readonly shellReady: boolean;
    readonly incompleteRegions: readonly string[];
    readonly manifest: WorkspaceMockupCaptureManifest;
  }>;
}

declare global {
  interface Window {
    __workspaceMockupCapture?: WorkspaceMockupCaptureApi;
  }
}

type CaptureContext = Parameters<WorkspaceMockupCaptureApi["configureCapture"]>[0];

function installNetworkGuard() {
  let count = 0;
  const restores: Array<() => void> = [];
  const blocked = () => {
    count += 1;
    throw new Error("Fixture blocked application request.");
  };
  const assets = new Set([
    "/@vite/client",
    "/@react-refresh",
    "/src/bootstrap.ts",
    "/src/index.css",
    ...[
      "workspaceMockupEntry",
      "WorkspaceMockupApp",
      "workspaceMockupFixtures",
      "mailMockupModule",
      "communicationsMockupModule",
      "tasksMockupModule",
      "projectsMockupModule",
      "driveMockupModule",
      "calendarMockupModule",
      "notesMockupModule",
      "browserMockupModule",
      "agentsMockupModule",
    ].map(
      (name) =>
        `/src/components/workspace/dev/${name}.${name === "workspaceMockupFixtures" ? "ts" : "tsx"}`,
    ),
  ]);
  function assetAllowed(raw: string, method: string) {
    try {
      if (
        method.toUpperCase() !== "GET" ||
        /(?:^|[/\\])\.\.(?:[/\\]|$)/.test(decodeURIComponent(raw))
      )
        return false;
      const url = new URL(raw, window.location.href);
      return (
        url.origin === window.location.origin &&
        assets.has(url.pathname) &&
        [...url.searchParams.keys()].every(
          (key) => key === "t" || key === "v" || key === "import" || key === "direct",
        )
      );
    } catch {
      return false;
    }
  }
  function replace(target: object, key: PropertyKey, value: unknown) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, {
      configurable: descriptor?.configurable ?? true,
      enumerable: descriptor?.enumerable ?? false,
      writable: true,
      value,
    });
    restores.push(() => {
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else Reflect.deleteProperty(target, key);
    });
  }
  const restore = () => {
    for (const undo of restores.toReversed()) undo();
    restores.length = 0;
    count = 0;
  };
  try {
    if (typeof window.fetch === "function") {
      const fetch = window.fetch;
      replace(window, "fetch", (input: RequestInfo | URL, init?: RequestInit) => {
        const raw =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const method =
          init?.method ?? (typeof input === "object" && "method" in input ? input.method : "GET");
        if (!assetAllowed(raw, method)) return blocked();
        return fetch.call(window, input, init);
      });
    }
    if (typeof window.XMLHttpRequest?.prototype.open === "function") {
      const open = window.XMLHttpRequest.prototype.open;
      replace(
        window.XMLHttpRequest.prototype,
        "open",
        function (this: XMLHttpRequest, ...args: Parameters<typeof open>) {
          if (!assetAllowed(String(args[1]), args[0])) return blocked();
          return Reflect.apply(open, this, args);
        },
      );
    }
    if (typeof window.WebSocket === "function")
      replace(
        window,
        "WebSocket",
        new Proxy(window.WebSocket, {
          construct(target, args) {
            const url = new URL(String(args[0]), window.location.href);
            const protocols = Array.isArray(args[1]) ? args[1] : [args[1]];
            const hmr =
              protocols.length === 1 &&
              (protocols[0] === "vite-hmr" || protocols[0] === "vite-ping");
            const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
            if (
              url.host !== window.location.host ||
              url.protocol !== scheme ||
              !hmr ||
              /^\/(?:api|ws|oauth|\.well-known)(?:\/|$)/.test(url.pathname)
            )
              return blocked();
            return Reflect.construct(target, args);
          },
        }),
      );
    if (typeof window.EventSource === "function")
      replace(window, "EventSource", new Proxy(window.EventSource, { construct: blocked }));
    if (typeof navigator.sendBeacon === "function") replace(navigator, "sendBeacon", blocked);
    if (typeof window.open === "function") replace(window, "open", blocked);
    const seen = new WeakSet<object>();
    function guardBridge(target: object) {
      if (seen.has(target)) return;
      seen.add(target);
      for (
        let owner: object | null = target;
        owner && owner !== Object.prototype;
        owner = Object.getPrototypeOf(owner)
      ) {
        for (const key of Reflect.ownKeys(owner)) {
          if (key === "constructor" && owner !== target) continue;
          const value: unknown = Reflect.get(target, key);
          if (typeof value === "function") replace(target, key, blocked);
          else if (value && typeof value === "object") guardBridge(value);
        }
      }
    }
    if (window.desktopBridge) guardBridge(window.desktopBridge);
  } catch (error) {
    restore();
    throw error;
  }
  return {
    count: () => count,
    reset: () => {
      count = 0;
    },
    restore,
  };
}

function pinDarkTheme() {
  const html = document.documentElement;
  const original = new Map(
    ["class", "style", "data-theme-id", "data-theme-selected", "lang"].map((key) => [
      key,
      html.getAttribute(key),
    ]),
  );
  html.classList.remove("light");
  html.classList.add("dark");
  delete html.dataset.themeId;
  delete html.dataset.themeSelected;
  html.lang = "en-GB";
  html.style.removeProperty("background-color");
  for (const key of Array.from(html.style))
    if (key.startsWith("--boot-")) html.style.removeProperty(key);
  return () => {
    for (const [key, value] of original) {
      if (value === null) html.removeAttribute(key);
      else html.setAttribute(key, value);
    }
  };
}

function checkLocale(context: CaptureContext) {
  const actual = Intl.DateTimeFormat().resolvedOptions();
  if (
    context.resolvedLocale !== "en-GB" ||
    context.resolvedTimeZone !== "Africa/Johannesburg" ||
    actual.locale !== "en-GB" ||
    actual.timeZone !== "Africa/Johannesburg"
  )
    throw new Error("Capture locale/time zone does not match fixture.");
}

let teardown: (() => void) | undefined;

export async function startWorkspaceMockup(): Promise<void> {
  if (!import.meta.env.DEV) return;
  teardown?.();
  const id = parseWorkspaceMockupRequest(new URL(window.location.href), true);
  if (id === null) throw new Error("Unknown fixture.");
  const guard = installNetworkGuard();
  const restoreTheme = pinDarkTheme();
  let disposeView = () => {};
  let disposed = false;
  let session: WorkspaceMockupSession | undefined;
  let modules: WorkspaceMockupModule[] = [];
  let cancelCurrent: (() => void) | undefined;
  const disposeModules = () => {
    for (const module of modules) module.dispose();
    modules = [];
    session?.dispose();
  };
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    generation += 1;
    cancelCurrent?.();
    disposeView();
    disposeModules();
    delete window.__workspaceMockupCapture;
    window.removeEventListener("pagehide", cleanup);
    restoreTheme();
    guard.restore();
    teardown = undefined;
  };
  let generation = 0;
  teardown = cleanup;
  window.addEventListener("pagehide", cleanup);
  try {
    const [
      { createRoot },
      { flushSync },
      { WorkspaceMockupApp, WorkspaceMockupRenderContext },
      ...adapters
    ] = await Promise.all([
      import("react-dom/client"),
      import("react-dom"),
      import("./WorkspaceMockupApp"),
      import("./mailMockupModule"),
      import("./communicationsMockupModule"),
      import("./tasksMockupModule"),
      import("./projectsMockupModule"),
      import("./driveMockupModule"),
      import("./calendarMockupModule"),
      import("./notesMockupModule"),
      import("./browserMockupModule"),
      import("./agentsMockupModule"),
    ]);
    await import("../../../index.css");
    if (disposed) throw new Error("Fixture session is disposed.");
    const factories: readonly CreateWorkspaceMockupModule[] = adapters.map(
      (adapter) => adapter.createWorkspaceMockupModule,
    );
    const container = document.createElement("div");
    container.id = "workspace-mockup-root";
    document.body.append(container);
    const splash = document.getElementById("boot-shell");
    const hidden = splash?.hidden;
    if (splash) splash.hidden = true;
    let rejectCommit: ((reason: unknown) => void) | undefined;
    const root = createRoot(container, { onUncaughtError: (error) => rejectCommit?.(error) });
    disposeView = () => {
      flushSync(() => root.unmount());
      container.remove();
      if (splash) splash.hidden = hidden ?? false;
    };
    let context: CaptureContext | undefined;
    let report: { readonly shellReady: boolean; readonly incompleteRegions: readonly string[] } = {
      shellReady: false,
      incompleteRegions: [],
    };
    let queue: Promise<void> = Promise.resolve();
    const assertActive = () => {
      if (disposed) throw new Error("Fixture session is disposed.");
    };
    const reset: WorkspaceMockupCaptureApi["reset"] = (nextId) => {
      const request = ++generation;
      cancelCurrent?.();
      const run = queue
        .catch(() => {})
        .then(async () => {
          assertActive();
          if (request !== generation) throw new Error("Fixture reset was superseded.");
          flushSync(() => root.render(null));
          disposeModules();
          guard.reset();
          session = createWorkspaceMockupSession(nextId);
          const current = session;
          if (!current.recipe) throw new Error("Unknown fixture.");
          for (const factory of factories) {
            const module = factory(current);
            if (
              module.area === current.recipe.centerArea ||
              module.area === current.recipe.resourceArea
            )
              modules.push(module);
            else module.dispose();
          }
          const cancelled = new Promise<never>((_resolve, reject) => {
            cancelCurrent = () => reject(new Error("Fixture reset was superseded."));
          });
          const committed = new Promise<void>((resolve, reject) => {
            rejectCommit = reject;
            const onCommit = (next: typeof report) => {
              report = next;
              resolve();
            };
            const runtime = Object.freeze({ session: current, modules: [...modules], onCommit });
            flushSync(() =>
              root.render(
                <div
                  className="dark"
                  style={
                    {
                      colorScheme: "dark",
                      backgroundColor: "#090909",
                      color: "#f0f0f0",
                      fontFamily: '"Segoe UI", system-ui, sans-serif',
                      minHeight: "100dvh",
                      "--background": "#090909",
                      "--foreground": "#f0f0f0",
                      "--muted-foreground": "#86868a",
                      "--border": "#1c1c20",
                      "--primary": "#3268ff",
                    } as CSSProperties
                  }
                >
                  <WorkspaceMockupRenderContext.Provider value={runtime}>
                    <WorkspaceMockupApp key={request} session={current} />
                  </WorkspaceMockupRenderContext.Provider>
                </div>,
              ),
            );
          });
          await Promise.race([committed, cancelled]);
          await Promise.race([
            Promise.all([current.settled(), ...modules.map((module) => module.settled())]),
            cancelled,
          ]);
          assertActive();
          if (request !== generation) throw new Error("Fixture reset was superseded.");
          cancelCurrent = undefined;
        });
      queue = run;
      return run;
    };
    const api: WorkspaceMockupCaptureApi = {
      configureCapture: (next) => {
        assertActive();
        if (next.viewport.deviceScaleFactor !== 1 || next.viewport.zoom !== 1)
          throw new Error("Capture requires scale 1 and zoom 1.");
        if (
          !Number.isInteger(next.viewport.width) ||
          !Number.isInteger(next.viewport.height) ||
          next.viewport.width <= 0 ||
          next.viewport.height <= 0
        )
          throw new Error("Capture viewport is required.");
        if (
          !next.resolvedFont.trim() ||
          !next.os.trim() ||
          /^(unknown|unresolved|system-ui|sans-serif|serif|monospace|inherit|initial|unset)$/i.test(
            next.resolvedFont.trim(),
          ) ||
          /^(unknown|unresolved)$/i.test(next.os.trim())
        )
          throw new Error("Capture font and OS are required.");
        checkLocale(next);
        context = { ...next, viewport: { ...next.viewport } };
      },
      reset,
      ready: async () => {
        await queue;
        assertActive();
        if (!context) throw new Error("Capture host metadata is required.");
        checkLocale(context);
        const capturedGeneration = generation;
        const current = session!;
        await Promise.all([current.settled(), ...modules.map((module) => module.settled())]);
        assertActive();
        if (capturedGeneration !== generation) throw new Error("Fixture reset was superseded.");
        if (guard.count() !== 0)
          throw new Error(`Fixture attempted ${guard.count()} application requests.`);
        const incomplete = new Set(report.incompleteRegions);
        const required = [
          [current.recipe.centerArea, "center"],
          [current.recipe.resourceArea, "resource"],
        ] as const;
        for (const [area, region] of required) {
          if (area === null) continue;
          const module = modules.find((candidate) => candidate.area === area);
          if (!module?.readyRegions.includes(region) || module[region] === undefined)
            incomplete.add(`${current.id}.${area}.${region}`);
          for (const name of module?.incompleteRegions ?? []) incomplete.add(name);
        }
        if (
          current.id === "07" &&
          !modules.find((module) => module.area === "notes")?.readyRegions.includes("resource")
        ) {
          incomplete.add("07.docs-format");
          incomplete.add("07.docs-comments");
        }
        const incompleteRegions = [...incomplete];
        return {
          fixtureReady: true,
          shellReady: report.shellReady,
          incompleteRegions,
          manifest: {
            version: 1,
            fixtureId: current.id,
            referencePng: current.recipe.png,
            route: current.recipe.route,
            viewport: { ...context.viewport },
            locale: current.locale,
            timeZone: current.timeZone,
            resolvedLocale: context.resolvedLocale,
            resolvedTimeZone: context.resolvedTimeZone,
            clock: "2026-10-13T10:30:00+02:00",
            theme: "dark",
            fontFamily: '"Segoe UI", system-ui, sans-serif',
            resolvedFont: context.resolvedFont,
            os: context.os,
            selectedKey: current.recipe.selectedKey,
            centerArea: current.recipe.centerArea,
            resourceArea: current.recipe.resourceArea,
            resourceEnvironmentId: current.environmentId,
            resourceProjectId: current.resourceProjectId,
            resourceTab: current.recipe.resourceTab,
            sampleMarker: true,
            corrections: current.recipe.corrections,
            incompleteRegions,
            readiness: report.shellReady
              ? incompleteRegions.length
                ? "shell"
                : "complete"
              : "seed-only",
            captureKind: "synthetic",
            networkRequests: 0,
            // All active settled() promises resolved above. operations is history,
            // not a pending-work queue; adapters must include async work in settled().
            pendingOperations: 0,
          },
        };
      },
    };
    window.__workspaceMockupCapture = api;
    await reset(id);
  } catch (error) {
    cleanup();
    throw error;
  }
}

if (import.meta.hot) import.meta.hot.dispose(() => teardown?.());
