import { assert, describe, it } from "vite-plus/test";

import {
  makeDevelopmentLauncherScript,
  resolveElectronBinaryPath,
  resolveMacLauncherIconPaths,
  resolveMacLauncherPaths,
} from "./electron-launcher.mjs";

const normalizePath = (value) => value.replaceAll("\\", "/");

describe("electron development launcher", () => {
  it("uses captured values only as fallbacks for a live runner environment", () => {
    const script = makeDevelopmentLauncherScript({
      electronBinaryPath: "/repo/node_modules/electron/Electron",
      mainEntryPath: "/repo/apps/desktop/dist-electron/main.cjs",
      desktopRoot: "/repo/apps/desktop",
      environment: {
        VITE_DEV_SERVER_URL: "http://127.0.0.1:8526",
        T3CODE_PORT: "16566",
        T3CODE_HOME: "/tmp/t3",
      },
    });

    assert.include(
      script,
      "if [ -z \"${VITE_DEV_SERVER_URL:-}\" ]; then export VITE_DEV_SERVER_URL='http://127.0.0.1:8526'; fi",
    );
    assert.notInclude(script, "\nexport VITE_DEV_SERVER_URL=");
    assert.include(
      script,
      "if [ -z \"${PULSE_CODE_PORT:-}\" ]; then export PULSE_CODE_PORT='16566'; fi",
    );
    assert.include(script, "if [ -z \"${T3CODE_PORT:-}\" ]; then export T3CODE_PORT='16566'; fi");
    assert.include(
      script,
      "exec '/repo/node_modules/electron/Electron' --pulse-code-dev-root='/repo/apps/desktop' '/repo/apps/desktop/dist-electron/main.cjs' \"$@\"",
    );
  });

  it("repairs Electron before loading the package entrypoint", () => {
    const calls = [];
    const electronPath = resolveElectronBinaryPath({
      ensureRuntime: () => {
        calls.push("ensure");
      },
      createRequire: () => (specifier) => {
        calls.push(`require:${specifier}`);
        return "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron";
      },
      moduleUrl: import.meta.url,
    });

    assert.equal(
      electronPath,
      "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
    );
    assert.deepEqual(calls, ["ensure", "require:electron"]);
  });

  it("keeps the native Electron executable name inside the branded macOS bundle", () => {
    const paths = resolveMacLauncherPaths(
      "/repo/apps/desktop/.electron-runtime/Pulse Code (Dev).app",
      "Pulse Code (Dev)",
    );

    assert.equal(paths.launcherExecutableName, "Pulse Code (Dev) Launcher");
    assert.equal(
      normalizePath(paths.launcherBinaryPath),
      "/repo/apps/desktop/.electron-runtime/Pulse Code (Dev).app/Contents/MacOS/Pulse Code (Dev) Launcher",
    );
    assert.equal(
      normalizePath(paths.runtimeElectronBinaryPath),
      "/repo/apps/desktop/.electron-runtime/Pulse Code (Dev).app/Contents/MacOS/Electron",
    );

    const script = makeDevelopmentLauncherScript({
      electronBinaryPath: paths.runtimeElectronBinaryPath,
      mainEntryPath: "/repo/apps/desktop/dist-electron/main.cjs",
      desktopRoot: "/repo/apps/desktop",
      environment: {},
    });
    assert.include(
      normalizePath(script),
      "exec '/repo/apps/desktop/.electron-runtime/Pulse Code (Dev).app/Contents/MacOS/Electron'",
    );
    assert.notInclude(script, "node_modules/electron");
  });

  it("derives launcher icons from canonical development and production assets", () => {
    const development = resolveMacLauncherIconPaths("/runtime", true);
    const production = resolveMacLauncherIconPaths("/runtime", false);

    assert.match(
      normalizePath(development.sourceIconPath),
      /assets\/dev\/blueprint-macos-1024\.png$/,
    );
    assert.equal(normalizePath(development.generatedIconPath), "/runtime/icon-dev.icns");
    assert.match(normalizePath(production.sourceIconPath), /assets\/prod\/black-macos-1024\.png$/);
    assert.equal(normalizePath(production.generatedIconPath), "/runtime/icon-prod.icns");
  });
});
