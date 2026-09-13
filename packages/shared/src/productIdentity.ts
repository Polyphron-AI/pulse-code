// The one source of truth for how a packaged Pulse Next build identifies itself
// to the operating system: bundle id, executable, URL schemes, user-data
// directories and home base dir.
//
// These values are deliberately disjoint from T3 Code's (`com.t3tools.t3code`,
// `t3code`, `~/.t3`). A Pulse Next installer must land beside an installed
// T3 Code, Pulse Code (Alpha) or Pulse Preview without overwriting its install
// folder, stealing its URL scheme, or reading its roaming data. Anything that
// names the desktop app to the OS imports from here rather than inlining a
// string, so the two identities cannot drift back together.
//
// `apps/desktop/scripts/electron-launcher.mjs` is the one exception: it is a
// plain .mjs module loaded before any TypeScript tooling exists, so it repeats
// three of these strings and asserts they still match in its own test.

export const PRODUCT_BASE_NAME = "Pulse Next";
export const PRODUCT_ALPHA_NAME = `${PRODUCT_BASE_NAME} (Alpha)`;
export const PRODUCT_NIGHTLY_NAME = `${PRODUCT_BASE_NAME} (Nightly)`;
export const PRODUCT_DEV_NAME = `${PRODUCT_BASE_NAME} (Dev)`;

export const DESKTOP_APP_ID = "ai.polyphron.pulsenext";
export const DESKTOP_DEVELOPMENT_APP_ID = `${DESKTOP_APP_ID}.dev`;

export const DESKTOP_EXECUTABLE_NAME = "pulsenext";
export const DESKTOP_DEVELOPMENT_EXECUTABLE_NAME = `${DESKTOP_EXECUTABLE_NAME}-dev`;

export const DESKTOP_URL_SCHEME = DESKTOP_EXECUTABLE_NAME;
export const DESKTOP_DEVELOPMENT_URL_SCHEME = DESKTOP_DEVELOPMENT_EXECUTABLE_NAME;

/** Both schemes, in the order electron-builder should register them. */
export const DESKTOP_URL_SCHEMES = [DESKTOP_URL_SCHEME, DESKTOP_DEVELOPMENT_URL_SCHEME] as const;

export const DESKTOP_USER_DATA_DIR_NAME = DESKTOP_EXECUTABLE_NAME;
export const DESKTOP_DEVELOPMENT_USER_DATA_DIR_NAME = DESKTOP_DEVELOPMENT_EXECUTABLE_NAME;

export const DESKTOP_LINUX_DESKTOP_ENTRY_NAME = `${DESKTOP_EXECUTABLE_NAME}.desktop`;
export const DESKTOP_DEVELOPMENT_LINUX_DESKTOP_ENTRY_NAME = `${DESKTOP_DEVELOPMENT_EXECUTABLE_NAME}.desktop`;
export const DESKTOP_LINUX_URL_HANDLER_ENTRY_NAME = `${DESKTOP_EXECUTABLE_NAME}-url-handler.desktop`;

/** Default base directory name under the user's home, holding `userdata/`. */
export const HOME_BASE_DIR_NAME = ".pulse-next";

/** electron-builder template; the `${...}` parts are its placeholders, not ours. */
export const DESKTOP_ARTIFACT_NAME_TEMPLATE = "Pulse-Next-${version}-${arch}.${ext}";

export const MACOS_MICROPHONE_USAGE_DESCRIPTION =
  "Pulse Next uses the microphone to turn your speech into composer text.";

export function desktopAppId(isDevelopment: boolean): string {
  return isDevelopment ? DESKTOP_DEVELOPMENT_APP_ID : DESKTOP_APP_ID;
}

export function desktopUrlScheme(isDevelopment: boolean): string {
  return isDevelopment ? DESKTOP_DEVELOPMENT_URL_SCHEME : DESKTOP_URL_SCHEME;
}

export function desktopExecutableName(isDevelopment: boolean): string {
  return isDevelopment ? DESKTOP_DEVELOPMENT_EXECUTABLE_NAME : DESKTOP_EXECUTABLE_NAME;
}

export function desktopUserDataDirName(isDevelopment: boolean): string {
  return isDevelopment ? DESKTOP_DEVELOPMENT_USER_DATA_DIR_NAME : DESKTOP_USER_DATA_DIR_NAME;
}

export function desktopLinuxDesktopEntryName(isDevelopment: boolean): string {
  return isDevelopment
    ? DESKTOP_DEVELOPMENT_LINUX_DESKTOP_ENTRY_NAME
    : DESKTOP_LINUX_DESKTOP_ENTRY_NAME;
}
