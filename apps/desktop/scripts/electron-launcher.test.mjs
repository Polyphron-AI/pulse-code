import {
  DESKTOP_APP_ID,
  DESKTOP_DEVELOPMENT_APP_ID,
  DESKTOP_DEVELOPMENT_URL_SCHEME,
  DESKTOP_URL_SCHEME,
  MACOS_MICROPHONE_USAGE_DESCRIPTION as SHARED_MACOS_MICROPHONE_USAGE_DESCRIPTION,
  PRODUCT_ALPHA_NAME,
  PRODUCT_DEV_NAME,
} from "@t3tools/shared/productIdentity";
import { assert, describe, it } from "vite-plus/test";

import {
  APP_BUNDLE_ID,
  APP_DISPLAY_NAME,
  APP_PROTOCOL_SCHEMES,
  makeDevelopmentLauncherScript,
  MACOS_MICROPHONE_USAGE_DESCRIPTION,
  mainBundleInfoPlistStringEntries,
  resolveElectronBinaryPath,
  resolveMacLauncherIconPaths,
  resolveMacLauncherPaths,
} from "./electron-launcher.mjs";

describe("electron development launcher", () => {
  // The launcher duplicates these strings because plain node cannot load the
  // TypeScript identity module. A drift here would give the dev app a bundle id
  // or scheme that no longer belongs to Pulse Next.
  it("repeats the shared product identity without drifting from it", () => {
    assert.equal(MACOS_MICROPHONE_USAGE_DESCRIPTION, SHARED_MACOS_MICROPHONE_USAGE_DESCRIPTION);
    assert.oneOf(APP_DISPLAY_NAME, [PRODUCT_DEV_NAME, PRODUCT_ALPHA_NAME]);
    assert.equal(APP_PROTOCOL_SCHEMES.length, 1);
    assert.oneOf(APP_PROTOCOL_SCHEMES[0], [DESKTOP_URL_SCHEME, DESKTOP_DEVELOPMENT_URL_SCHEME]);

    // The dev bundle id keeps a per-repo suffix so two checkouts do not share
    // one macOS registration, but it stays under the Pulse Next namespace.
    const isDevelopmentLauncher = APP_DISPLAY_NAME === PRODUCT_DEV_NAME;
    if (isDevelopmentLauncher) {
      assert.match(APP_BUNDLE_ID, new RegExp(`^${DESKTOP_DEVELOPMENT_APP_ID}\.[a-z0-9]+$`));
      assert.equal(APP_PROTOCOL_SCHEMES[0], DESKTOP_DEVELOPMENT_URL_SCHEME);
    } else {
      assert.equal(APP_BUNDLE_ID, DESKTOP_APP_ID);
      assert.equal(APP_PROTOCOL_SCHEMES[0], DESKTOP_URL_SCHEME);
    }
  });

  it("adds the microphone purpose string to the branded macOS bundle", () => {
    assert.deepInclude(Object.fromEntries(mainBundleInfoPlistStringEntries("Electron")), {
      NSMicrophoneUsageDescription: MACOS_MICROPHONE_USAGE_DESCRIPTION,
    });
  });

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
      "exec '/repo/node_modules/electron/Electron' --t3code-dev-root='/repo/apps/desktop' '/repo/apps/desktop/dist-electron/main.cjs' \"$@\"",
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
      "/repo/apps/desktop/.electron-runtime/T3 Code (Dev).app",
      "T3 Code (Dev)",
    );

    assert.equal(paths.launcherExecutableName, "T3 Code (Dev) Launcher");
    assert.equal(
      paths.launcherBinaryPath,
      "/repo/apps/desktop/.electron-runtime/T3 Code (Dev).app/Contents/MacOS/T3 Code (Dev) Launcher",
    );
    assert.equal(
      paths.runtimeElectronBinaryPath,
      "/repo/apps/desktop/.electron-runtime/T3 Code (Dev).app/Contents/MacOS/Electron",
    );

    const script = makeDevelopmentLauncherScript({
      electronBinaryPath: paths.runtimeElectronBinaryPath,
      mainEntryPath: "/repo/apps/desktop/dist-electron/main.cjs",
      desktopRoot: "/repo/apps/desktop",
      environment: {},
    });
    assert.include(
      script,
      "exec '/repo/apps/desktop/.electron-runtime/T3 Code (Dev).app/Contents/MacOS/Electron'",
    );
    assert.notInclude(script, "node_modules/electron");
  });

  it("derives launcher icons from canonical development and production assets", () => {
    const development = resolveMacLauncherIconPaths("/runtime", true);
    const production = resolveMacLauncherIconPaths("/runtime", false);

    // The source icons are real repo paths, joined for the host.
    assert.match(development.sourceIconPath, /assets[\\/]dev[\\/]blueprint-macos-1024\.png$/);
    assert.equal(development.generatedIconPath, "/runtime/icon-dev.icns");
    assert.match(production.sourceIconPath, /assets[\\/]prod[\\/]black-macos-1024\.png$/);
    assert.equal(production.generatedIconPath, "/runtime/icon-prod.icns");
  });
});
