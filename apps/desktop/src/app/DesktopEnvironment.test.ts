import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopConfig from "./DesktopConfig.ts";

const normalizePath = (value: string) =>
  value.replaceAll("\\", "/").replace(/^[A-Za-z]:(?=\/)/u, "");
const assertPathEqual = (actual: string, expected: string) =>
  assert.equal(normalizePath(actual), expected);

const defaultInput = {
  dirname: "/repo/apps/desktop/dist-electron",
  homeDirectory: "/Users/alice",
  platform: "darwin",
  processArch: "arm64",
  appVersion: "0.0.22",
  appPath: "/Applications/Pulse Code.app/Contents/Resources/app.asar",
  isPackaged: false,
  resourcesPath: "/Applications/Pulse Code.app/Contents/Resources",
  runningUnderArm64Translation: false,
} satisfies DesktopEnvironment.MakeDesktopEnvironmentInput;

const makeEnvironmentLayer = (
  overrides: Partial<DesktopEnvironment.MakeDesktopEnvironmentInput> = {},
  env: Record<string, string | undefined> = {},
) =>
  DesktopEnvironment.layer({
    ...defaultInput,
    ...overrides,
  }).pipe(Layer.provide(Layer.mergeAll(NodeServices.layer, DesktopConfig.layerTest(env))));

const makeEnvironment = (
  overrides: Partial<DesktopEnvironment.MakeDesktopEnvironmentInput> = {},
  env: Record<string, string | undefined> = {},
) =>
  DesktopEnvironment.DesktopEnvironment.pipe(Effect.provide(makeEnvironmentLayer(overrides, env)));

describe("DesktopEnvironment", () => {
  it.effect("derives state paths and development identity inside Effect", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment(
        {},
        {
          PULSE_CODE_HOME: " /tmp/pulse ",
          T3CODE_COMMIT_HASH: " 0123456789abcdef ",
          T3CODE_PORT: "4949",
          VITE_DEV_SERVER_URL: "http://localhost:5173",
          T3CODE_DEV_REMOTE_T3_SERVER_ENTRY_PATH: " /remote/server.mjs ",
          T3CODE_OTLP_TRACES_URL: " http://127.0.0.1:4318/v1/traces ",
          T3CODE_OTLP_EXPORT_INTERVAL_MS: "2500",
        },
      );

      assert.equal(environment.isDevelopment, true);
      assertPathEqual(environment.appDataDirectory, "/Users/alice/Library/Application Support");
      assertPathEqual(environment.baseDir, "/tmp/pulse");
      assertPathEqual(environment.stateDir, "/tmp/pulse/userdata");
      assertPathEqual(environment.desktopSettingsPath, "/tmp/pulse/userdata/desktop-settings.json");
      assertPathEqual(environment.clientSettingsPath, "/tmp/pulse/userdata/client-settings.json");
      assertPathEqual(
        environment.savedEnvironmentRegistryPath,
        "/tmp/pulse/userdata/saved-environments.json",
      );
      assertPathEqual(environment.serverSettingsPath, "/tmp/pulse/userdata/settings.json");
      assertPathEqual(environment.logDir, "/tmp/pulse/userdata/logs");
      assertPathEqual(environment.browserArtifactsDir, "/tmp/pulse/userdata/browser-artifacts");
      assertPathEqual(environment.rootDir, "/repo");
      assertPathEqual(environment.appRoot, "/repo");
      assertPathEqual(environment.serverRoot, "/repo");
      assertPathEqual(environment.backendEntryPath, "/repo/apps/server/dist/bin.mjs");
      assertPathEqual(environment.backendCwd, "/repo");
      assert.equal(environment.appUserModelId, "ai.polyphron.pulsecode.dev");
      assert.equal(environment.linuxDesktopEntryName, "pulsecode-dev.desktop");
      assert.equal(environment.linuxWmClass, "pulsecode-dev");
      assert.equal(environment.branding.baseName, "Pulse Code");
      assert.equal(environment.displayName, "Pulse Code (Dev)");
      assert.equal(environment.userDataDirName, "pulsecode-dev");
      assert.deepEqual(
        Option.map(environment.devServerUrl, (url) => url.href),
        Option.some("http://localhost:5173/"),
      );
      assert.deepEqual(
        Option.map(environment.devRemoteT3ServerEntryPath, normalizePath),
        Option.some("/remote/server.mjs"),
      );
      assert.deepEqual(environment.configuredBackendPort, Option.some(4949));
      assert.deepEqual(environment.commitHashOverride, Option.some("0123456789abcdef"));
      assert.deepEqual(environment.otlpTracesUrl, Option.some("http://127.0.0.1:4318/v1/traces"));
      assert.equal(environment.otlpExportIntervalMs, 2500);
    }),
  );

  it.effect("uses Pulse Code overrides instead of simultaneous T3 Code aliases", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment(
        {},
        {
          PULSE_CODE_HOME: "/tmp/pulse",
          T3CODE_HOME: "/tmp/legacy",
          PULSE_CODE_DESKTOP_APP_USER_MODEL_ID: "com.example.pulse",
          T3CODE_DESKTOP_APP_USER_MODEL_ID: "com.example.legacy",
        },
      );

      assertPathEqual(environment.baseDir, "/tmp/pulse");
      assert.equal(environment.appUserModelId, "com.example.pulse");
    }),
  );

  it.effect("ignores T3 Code home and desktop identity aliases", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment(
        {},
        {
          T3CODE_HOME: "/tmp/t3",
          T3CODE_DESKTOP_APP_USER_MODEL_ID: "com.example.legacy",
        },
      );

      assert.equal(environment.isDevelopment, false);
      assertPathEqual(environment.baseDir, "/Users/alice/.pulsecode");
      assertPathEqual(environment.stateDir, "/Users/alice/.pulsecode/userdata");
      assertPathEqual(environment.logDir, "/Users/alice/.pulsecode/userdata/logs");
      assertPathEqual(
        environment.browserArtifactsDir,
        "/Users/alice/.pulsecode/userdata/browser-artifacts",
      );
      assertPathEqual(
        environment.serverSettingsPath,
        "/Users/alice/.pulsecode/userdata/settings.json",
      );
      assert.equal(environment.appUserModelId, "ai.polyphron.pulsecode");
      assert.equal(environment.linuxDesktopEntryName, "pulsecode.desktop");
      assert.equal(environment.linuxWmClass, "pulsecode");
    }),
  );

  it.effect("uses the packaged Windows server sidecar as the backend root", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment({
        platform: "win32",
        isPackaged: true,
        appPath: "/install/resources/app.asar",
        resourcesPath: "/install/resources",
      });

      assertPathEqual(environment.appRoot, "/install/resources/app.asar");
      assertPathEqual(environment.serverRoot, "/install/resources/server.asar");
      assertPathEqual(
        environment.backendEntryPath,
        "/install/resources/server.asar/apps/server/dist/bin.mjs",
      );
    }),
  );

  it.effect("keeps implicit development state separate from production state", () =>
    Effect.gen(function* () {
      const development = yield* makeEnvironment(
        {},
        { VITE_DEV_SERVER_URL: "http://localhost:5173" },
      );
      const production = yield* makeEnvironment();

      assertPathEqual(development.stateDir, "/Users/alice/.pulsecode/dev");
      assertPathEqual(production.stateDir, "/Users/alice/.pulsecode/userdata");
    }),
  );

  it.effect("uses a configured app user model id override", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment(
        {},
        {
          PULSE_CODE_DESKTOP_APP_USER_MODEL_ID: " ai.polyphron.pulsecode.dev.local ",
          VITE_DEV_SERVER_URL: "http://localhost:5173",
        },
      );

      assert.equal(environment.appUserModelId, "ai.polyphron.pulsecode.dev.local");
    }),
  );

  it.effect("resolves picker defaults without nullish sentinels", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment();

      assert.deepEqual(environment.resolvePickFolderDefaultPath(null), Option.none());
      assert.deepEqual(
        environment.resolvePickFolderDefaultPath({ initialPath: " " }),
        Option.none(),
      );
      assert.deepEqual(
        environment.resolvePickFolderDefaultPath({ initialPath: "~" }),
        Option.some("/Users/alice"),
      );
      assert.deepEqual(
        Option.map(
          environment.resolvePickFolderDefaultPath({ initialPath: "~/project" }),
          normalizePath,
        ),
        Option.some("/Users/alice/project"),
      );
    }),
  );
});
