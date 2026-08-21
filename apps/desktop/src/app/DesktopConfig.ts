import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Option from "effect/Option";
import { withLegacyConfigAlias } from "@t3tools/shared/configAliases";

const pulseCodeConfig = <A>(
  legacyName: string,
  makeConfig: (name: string) => Config.Config<A>,
): Config.Config<A> =>
  withLegacyConfigAlias(
    makeConfig(legacyName.replace(/^T3CODE_/, "PULSE_CODE_")),
    makeConfig(legacyName),
  );

const pulseCodeOptionalTrimmedString = (legacyName: string) =>
  withLegacyConfigAlias(
    Config.string(legacyName.replace(/^T3CODE_/, "PULSE_CODE_")),
    Config.string(legacyName),
  ).pipe(Config.option, Config.map(Option.flatMap(trimNonEmptyOption)));

const pulseCodeOptionalBoolean = (legacyName: string) =>
  withLegacyConfigAlias(
    Config.boolean(legacyName.replace(/^T3CODE_/, "PULSE_CODE_")),
    Config.boolean(legacyName),
  ).pipe(Config.option, Config.map(Option.getOrElse(() => false)));

const pulseCodeOptionalPort = (legacyName: string) =>
  withLegacyConfigAlias(
    Config.port(legacyName.replace(/^T3CODE_/, "PULSE_CODE_")),
    Config.port(legacyName),
  ).pipe(Config.option);

const pulseCodeCommaSeparatedStrings = (legacyName: string) =>
  pulseCodeOptionalTrimmedString(legacyName).pipe(
    Config.map(
      Option.match({
        onNone: () => [],
        onSome: (value) =>
          value
            .split(",")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0),
      }),
    ),
  );

const trimNonEmptyOption = (value: string): Option.Option<string> => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Option.some(trimmed) : Option.none();
};

const trimmedString = (name: string) =>
  Config.string(name).pipe(Config.option, Config.map(Option.flatMap(trimNonEmptyOption)));

const compactEnv = (env: Readonly<Record<string, string | undefined>>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );

export const DesktopConfig = Config.all({
  appDataDirectory: trimmedString("APPDATA"),
  xdgConfigHome: trimmedString("XDG_CONFIG_HOME"),
  xdgDataHome: trimmedString("XDG_DATA_HOME"),
  t3Home: trimmedString("PULSE_CODE_HOME"),
  devServerUrl: Config.url("VITE_DEV_SERVER_URL").pipe(Config.option),
  appUserModelIdOverride: trimmedString("PULSE_CODE_DESKTOP_APP_USER_MODEL_ID"),
  devRemoteT3ServerEntryPath: pulseCodeOptionalTrimmedString(
    "T3CODE_DEV_REMOTE_T3_SERVER_ENTRY_PATH",
  ),
  configuredBackendPort: pulseCodeOptionalPort("T3CODE_PORT"),
  commitHashOverride: pulseCodeOptionalTrimmedString("T3CODE_COMMIT_HASH"),
  desktopLanHostOverride: pulseCodeOptionalTrimmedString("T3CODE_DESKTOP_LAN_HOST"),
  desktopHttpsEndpointUrls: pulseCodeCommaSeparatedStrings("T3CODE_DESKTOP_HTTPS_ENDPOINTS"),
  otlpTracesUrl: pulseCodeOptionalTrimmedString("T3CODE_OTLP_TRACES_URL"),
  otlpExportIntervalMs: pulseCodeConfig("T3CODE_OTLP_EXPORT_INTERVAL_MS", Config.int).pipe(
    Config.withDefault(10_000),
  ),
  appImagePath: trimmedString("APPIMAGE"),
  disableAutoUpdate: pulseCodeOptionalBoolean("T3CODE_DISABLE_AUTO_UPDATE"),
  mockUpdates: pulseCodeOptionalBoolean("T3CODE_DESKTOP_MOCK_UPDATES"),
  mockUpdateServerPort: pulseCodeConfig("T3CODE_DESKTOP_MOCK_UPDATE_SERVER_PORT", Config.port).pipe(
    Config.withDefault(3000),
  ),
});

export const layerTest = (env: Readonly<Record<string, string | undefined>>) =>
  ConfigProvider.layer(ConfigProvider.fromEnv({ env: compactEnv(env) }));
