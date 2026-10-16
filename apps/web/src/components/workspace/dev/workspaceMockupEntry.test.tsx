// @vitest-environment happy-dom

import { getByRole } from "@testing-library/dom";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const main = vi.hoisted(() => vi.fn());
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
vi.mock("../../../main", () => {
  main();
  return { startup: Promise.resolve() };
});

type Capture = import("./workspaceMockupEntry").WorkspaceMockupCaptureApi;
const host = {
  viewport: { width: 1280, height: 800, deviceScaleFactor: 1, zoom: 1 },
  resolvedFont: "Segoe UI",
  os: "Windows",
  resolvedLocale: "en-GB",
  resolvedTimeZone: "Africa/Johannesburg",
} as const;
const originals = {
  fetch: window.fetch,
  WebSocket: window.WebSocket,
  EventSource: window.EventSource,
  open: XMLHttpRequest.prototype.open,
  beacon: Object.getOwnPropertyDescriptor(navigator, "sendBeacon"),
};
let runtimeLocale = "en-GB";
let runtimeTimeZone = "Africa/Johannesburg";

function storageSnapshot(storage: Storage) {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index)!)
    .sort()
    .map((key) => [key, storage.getItem(key)]);
}

beforeEach(() => {
  (
    window as unknown as {
      happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
    }
  ).happyDOM.setWindowSize({ width: 1280, height: 800 });
  vi.resetModules();
  vi.doUnmock("./mailMockupModule");
  vi.doUnmock("./driveMockupModule");
  vi.doUnmock("./agentsMockupModule");
  vi.doUnmock("./notesMockupModule");
  main.mockClear();
  runtimeLocale = "en-GB";
  runtimeTimeZone = "Africa/Johannesburg";
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockImplementation(() => ({
    locale: runtimeLocale,
    timeZone: runtimeTimeZone,
    calendar: "gregory",
    numberingSystem: "latn",
  }));
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(
    "http://fixture.invalid/workspace?space=mail&fixture=01",
  );
  document.body.innerHTML = '<div id="boot-shell"></div><div id="root"></div>';
  document.documentElement.className = "light developer-class";
  document.documentElement.dataset.themeId = "custom";
  document.documentElement.dataset.themeSelected = "true";
  document.documentElement.style.cssText =
    "background-color: pink; --boot-background: pink; --boot-foreground: black; --keep: yes";
  localStorage.setItem("t3code:themes:v1", "custom-light-theme");
  localStorage.setItem("t3code:theme", "custom");
  sessionStorage.setItem("untouched", "session");
});

afterEach(async () => {
  await act(async () => window.dispatchEvent(new Event("pagehide")));
  vi.restoreAllMocks();
  window.fetch = originals.fetch;
  window.WebSocket = originals.WebSocket;
  window.EventSource = originals.EventSource;
  XMLHttpRequest.prototype.open = originals.open;
  if (originals.beacon) Object.defineProperty(navigator, "sendBeacon", originals.beacon);
  else Reflect.deleteProperty(navigator, "sendBeacon");
  delete window.desktopBridge;
});

async function boot(): Promise<Capture> {
  await act(async () => {
    await import("../../../bootstrap");
    await vi.dynamicImportSettled();
  });
  expect(main).not.toHaveBeenCalled();
  return window.__workspaceMockupCapture!;
}

it("boots eight isolated memory routes, pins dark and preserves browser storage through resets and teardown", async () => {
  localStorage.setItem("pulse.workspace.fixture-environment.mail.engagement-width.v2", "450");
  localStorage.setItem(
    "pulse.workspace.resources.v1:fixture-environment",
    JSON.stringify({
      version: 1,
      open: false,
      projectId: "live-choice",
      tabs: { "live-choice": "prs" },
    }),
  );
  const local = storageSnapshot(localStorage);
  const session = storageSnapshot(sessionStorage);
  const originalHtml = document.documentElement.getAttribute("style");
  const capture = await boot();
  await expect(capture.ready()).rejects.toThrow("Capture host metadata is required.");
  capture.configureCapture(host);
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(document.documentElement.dataset.themeId).toBeUndefined();
  expect(document.documentElement.dataset.themeSelected).toBeUndefined();
  expect(document.documentElement.style.backgroundColor).toBe("");
  expect(document.documentElement.style.getPropertyValue("--boot-background")).toBe("");
  expect(document.documentElement.style.getPropertyValue("--keep")).toBe("yes");
  for (const id of ["01", "02", "03", "04", "05", "06", "07", "08"] as const) {
    await act(async () => {
      await capture.reset(id);
    });
    const result = await capture.ready();
    expect(result.fixtureReady).toBe(true);
    expect(result.shellReady).toBe(false);
    expect(result.manifest).toMatchObject({
      fixtureId: id,
      theme: "dark",
      clock: "2026-10-13T10:30:00+02:00",
      readiness: "seed-only",
      captureKind: "synthetic",
      networkRequests: 0,
      pendingOperations: 0,
      resolvedLocale: "en-GB",
      resolvedTimeZone: "Africa/Johannesburg",
      resolvedFont: "Segoe UI",
      os: "Windows",
    });
    expect(result.incompleteRegions.length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("Design preview · sample data");
    expect(document.body.textContent).toContain(`Recipe ${id}`);
    expect(result.incompleteRegions).not.toContain("shell.engagement");
    expect(result.incompleteRegions).not.toContain("shell.resources");
    expect(getByRole(document.body, "combobox", { name: "Choose project" }).textContent).toContain(
      "SynKEK",
    );
    if (id === "01" || id === "02" || id === "05" || id === "06") {
      const separator = getByRole(document.body, "separator", { name: "Resize item list" });
      expect(separator.getAttribute("aria-valuenow")).toBe("170");
      await act(async () =>
        separator.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
      );
      expect(separator.getAttribute("aria-valuenow")).toBe("190");
      await act(async () => capture.reset(id));
      expect(
        getByRole(document.body, "separator", { name: "Resize item list" }).getAttribute(
          "aria-valuenow",
        ),
      ).toBe("170");
    }
  }
  expect(storageSnapshot(localStorage)).toEqual(local);
  expect(storageSnapshot(sessionStorage)).toEqual(session);
  await act(async () => window.dispatchEvent(new Event("pagehide")));
  expect(window.__workspaceMockupCapture).toBeUndefined();
  expect(document.documentElement.className).toBe("light developer-class");
  expect(document.documentElement.getAttribute("style")).toBe(originalHtml);
  expect(document.documentElement.dataset.themeId).toBe("custom");
  expect(window.fetch).toBe(originals.fetch);
});

it.each([
  ["?fixture=99", "Unknown fixture."],
  ["?fixture=01&homeDir=/live", "Fixture state is in memory only."],
  ["?fixture=01&space=tasks", "Fixture space does not match recipe 01."],
])("shows an invalid dev request without evaluating main: %s", async (query, error) => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(
    `http://fixture.invalid/workspace${query}`,
  );
  await boot();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain(error);
  expect(window.__workspaceMockupCapture).toBeUndefined();
  expect(consoleError).toHaveBeenCalled();
});

it("requires measured metadata and checks ambient locale and time zone", async () => {
  const capture = await boot();
  expect(() => capture.configureCapture({ ...host, resolvedFont: "" })).toThrow(
    "Capture font and OS are required.",
  );
  expect(() => capture.configureCapture({ ...host, os: "" })).toThrow(
    "Capture font and OS are required.",
  );
  expect(() =>
    capture.configureCapture({ ...host, viewport: { ...host.viewport, zoom: 2 as 1 } }),
  ).toThrow("Capture requires scale 1 and zoom 1.");
  expect(() => capture.configureCapture({ ...host, resolvedLocale: "en-US" })).toThrow(
    "Capture locale/time zone does not match fixture.",
  );
  runtimeTimeZone = "UTC";
  expect(() => capture.configureCapture(host)).toThrow(
    "Capture locale/time zone does not match fixture.",
  );
  runtimeTimeZone = "Africa/Johannesburg";
  capture.configureCapture(host);
  runtimeLocale = "en-US";
  await expect(capture.ready()).rejects.toThrow("Capture locale/time zone does not match fixture.");
});

it("counts every blocked API including caught errors and nested desktop commands, then restores descriptors", async () => {
  const fetch = vi.fn(() => Promise.resolve(new Response("asset")));
  window.fetch = fetch;
  const socket = vi.fn();
  window.WebSocket = vi.fn(function FixtureSocket(...args: unknown[]) {
    socket(...args);
  }) as unknown as typeof WebSocket;
  window.EventSource = vi.fn(function FixtureEventSource() {}) as unknown as typeof EventSource;
  const beacon = vi.fn();
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: beacon });
  const nested = vi.fn();
  const openWindow = window.open;
  window.desktopBridge = {
    command: { execute: nested },
    shell: { openExternal: nested },
  } as unknown as NonNullable<Window["desktopBridge"]>;
  const capture = await boot();
  capture.configureCapture(host);
  await window.fetch("/src/index.css");
  expect(new window.WebSocket("ws://fixture.invalid/", "vite-hmr")).toBeDefined();
  expect(new window.WebSocket("ws://fixture.invalid/", "vite-ping")).toBeDefined();
  expect(new window.WebSocket("ws://fixture.invalid/", ["vite-ping"])).toBeDefined();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(socket).toHaveBeenCalledTimes(3);
  const bridge = window.desktopBridge as unknown as {
    command: { execute: () => void };
    shell: { openExternal: () => void };
  };
  const attempts = [
    () => window.fetch("/api/data.js"),
    () => window.fetch("/arbitrary.js"),
    () => window.fetch("https://external.invalid/src/index.css"),
    () => window.fetch("/src/index.css", { method: "POST" }),
    () => window.fetch("/src/../src/index.css"),
    () => window.fetch("/oauth/token.js"),
    () => window.fetch("/.well-known/test.js"),
    () => new XMLHttpRequest().open("GET", "/api/data"),
    () => new window.WebSocket("ws://fixture.invalid/ws", "application"),
    () => new window.WebSocket("ws://external.invalid/", "vite-hmr"),
    () => new window.WebSocket("ws://external.invalid/", "vite-ping"),
    () => new window.WebSocket("wss://fixture.invalid/", "vite-ping"),
    () => new window.WebSocket("ws://fixture.invalid/api/data", "vite-ping"),
    () => new window.WebSocket("ws://fixture.invalid/ws", "vite-hmr"),
    () => new window.WebSocket("ws://fixture.invalid/", ["vite-hmr", "app"]),
    () => window.open("https://external.invalid/"),
    () => new window.EventSource("/events"),
    () => navigator.sendBeacon("/log"),
    () => bridge.command.execute(),
    () => bridge.shell.openExternal(),
  ];
  for (const attempt of attempts) expect(attempt).toThrow("Fixture blocked application request.");
  await expect(capture.ready()).rejects.toThrow(
    `Fixture attempted ${attempts.length} application requests.`,
  );
  await act(async () => {
    await capture.reset("02");
  });
  expect((await capture.ready()).manifest.networkRequests).toBe(0);
  await act(async () => window.dispatchEvent(new Event("pagehide")));
  expect(window.fetch).toBe(fetch);
  expect(bridge.command.execute).toBe(nested);
  expect(bridge.shell.openExternal).toBe(nested);
  expect(navigator.sendBeacon).toBe(beacon);
  expect(window.open).toBe(openWindow);
  delete (navigator as Partial<Navigator>).sendBeacon;
});

it("allows secure Vite HMR and reconnect probes without counting application requests", async () => {
  (window as unknown as { happyDOM: { setURL: (url: string) => void } }).happyDOM.setURL(
    "https://fixture.invalid/workspace?space=mail&fixture=01",
  );
  const socket = vi.fn();
  window.WebSocket = vi.fn(function FixtureSocket(...args: unknown[]) {
    socket(...args);
  }) as unknown as typeof WebSocket;
  const capture = await boot();
  capture.configureCapture(host);
  expect(new window.WebSocket("wss://fixture.invalid/", ["vite-hmr"])).toBeDefined();
  expect(new window.WebSocket("wss://fixture.invalid/", "vite-ping")).toBeDefined();
  expect(socket).toHaveBeenCalledTimes(2);
  expect((await capture.ready()).manifest.networkRequests).toBe(0);
});

it("waits for active adapter work before reporting zero pending operations", async () => {
  let begin = () => {};
  let finish = () => {};
  let observed = () => {};
  const waiting = new Promise<void>((resolve) => {
    observed = resolve;
  });
  vi.doMock("./mailMockupModule", () => ({
    createWorkspaceMockupModule: (
      session: import("./workspaceMockupFixtures").WorkspaceMockupSession,
    ) => {
      let work: Promise<void> | undefined;
      begin = () => {
        void session.record("send", undefined, "demo reply");
        work = new Promise<void>((resolve) => {
          finish = resolve;
        });
      };
      return {
        area: "mail",
        readyRegions: [],
        settled: () => {
          if (work) observed();
          return work ?? Promise.resolve();
        },
        dispose: () => finish(),
      };
    },
  }));
  const capture = await boot();
  capture.configureCapture(host);
  begin();
  let ready = false;
  const result = capture.ready().then((report) => {
    ready = true;
    return report;
  });
  await waiting;
  expect(ready).toBe(false);
  finish();
  expect((await result).manifest.pendingOperations).toBe(0);
});

it("keeps recipe 07 docs subregions incomplete when only the plain note resource is ready", async () => {
  const original = await import("./notesMockupModule");
  vi.doMock("./notesMockupModule", () => ({
    createWorkspaceMockupModule: (
      session: import("./workspaceMockupFixtures").WorkspaceMockupSession,
    ) => ({
      ...original.createWorkspaceMockupModule(session),
      readyRegions: ["resource"],
      resource: "Plain note",
    }),
  }));
  const capture = await boot();
  expect(document.querySelector('[role="alert"]')?.textContent).toBeUndefined();
  capture.configureCapture(host);
  await act(async () => capture.reset("07"));
  const result = await capture.ready();
  expect(result.incompleteRegions).not.toContain("07.notes.resource");
  expect(result.incompleteRegions).toContain("07.docs-format");
  expect(result.incompleteRegions).toContain("07.docs-comments");
});

it("rejects stale reset generations and exposes only the newest committed recipe", async () => {
  const capture = await boot();
  capture.configureCapture(host);
  let results: PromiseSettledResult<void>[] = [];
  await act(async () => {
    results = await Promise.allSettled([capture.reset("02"), capture.reset("03")]);
  });
  expect(results[0]?.status).toBe("rejected");
  expect(results[1]?.status).toBe("fulfilled");
  expect((await capture.ready()).manifest.fixtureId).toBe("03");
});

it("disposes pending active fakes before reset and never waits on inactive modules", async () => {
  let finish: (() => void) | undefined;
  let entered: (() => void) | undefined;
  const pendingEntered = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let mailMounts = 0;
  let mailDisposals = 0;
  vi.doMock("./mailMockupModule", () => ({
    createWorkspaceMockupModule: () => {
      mailMounts += 1;
      const pending =
        mailMounts === 2
          ? new Promise<void>((resolve) => {
              finish = resolve;
            })
          : Promise.resolve();
      return {
        area: "mail",
        readyRegions: [],
        settled: () => {
          if (mailMounts === 2) entered?.();
          return pending;
        },
        dispose: () => {
          mailDisposals += 1;
          finish?.();
        },
      };
    },
  }));
  const inactiveDispose = vi.fn();
  const inactiveSettled = vi.fn(() => {
    throw new Error("Inactive adapter was awaited");
  });
  vi.doMock("./agentsMockupModule", () => ({
    createWorkspaceMockupModule: () => ({
      area: "agents",
      readyRegions: [],
      settled: inactiveSettled,
      dispose: inactiveDispose,
    }),
  }));
  const capture = await boot();
  capture.configureCapture(host);
  let pending: Promise<void>;
  let rejected: Promise<unknown>;
  await act(async () => {
    pending = capture.reset("01");
    rejected = pending.catch((error: unknown) => error);
    await pendingEntered;
  });
  await act(async () => {
    await capture.reset("03");
  });
  expect(await rejected!).toMatchObject({ message: "Fixture reset was superseded." });
  expect(mailDisposals).toBe(3);
  expect(inactiveDispose).toHaveBeenCalledTimes(3);
  expect(inactiveSettled).not.toHaveBeenCalled();
  expect((await capture.ready()).manifest.fixtureId).toBe("03");
});

it("derives missing slots from center and resource roles rather than adapter order", async () => {
  vi.doMock("./driveMockupModule", () => ({
    createWorkspaceMockupModule: () => ({
      area: "drive",
      readyRegions: ["center"],
      center: "wrong slot",
      settled: async () => {},
      dispose: () => {},
    }),
  }));
  const capture = await boot();
  capture.configureCapture(host);
  expect((await capture.ready()).incompleteRegions).toContain("01.drive.resource");
});

it("fails startup and restores installed guards when an existing bridge method cannot be guarded", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const bridge = Object.freeze({ command: Object.freeze({ execute: () => {} }) });
  window.desktopBridge = bridge as unknown as NonNullable<Window["desktopBridge"]>;
  await boot();
  expect(window.__workspaceMockupCapture).toBeUndefined();
  expect(document.querySelector('[role="alert"]')).not.toBeNull();
  expect(window.fetch).toBe(originals.fetch);
  expect(window.WebSocket).toBe(originals.WebSocket);
});

it("leaves unavailable APIs absent", async () => {
  Reflect.deleteProperty(window, "EventSource");
  Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: undefined });
  await boot();
  expect(window.EventSource).toBeUndefined();
  expect(navigator.sendBeacon).toBeUndefined();
});
