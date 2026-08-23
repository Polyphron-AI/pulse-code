import { formatAppDisplayName } from "../branding.logic";

/**
 * The web app manifest is built here rather than kept as a static file so an
 * installed Pulse Code carries the same name the running app shows. The
 * `pwaManifest` Vite plugin serves this at `/manifest.webmanifest`, so nothing
 * in this module may touch `window` or `import.meta.env`.
 */

/** Matches the boot shell's dark background in `index.html`, so the launch splash does not flash. */
const SPLASH_BACKGROUND = "#0a0a0a";

const DESCRIPTION =
  "A minimal GUI for coding agents. Drive Codex, Claude Code, Cursor, Grok, and OpenCode from any device.";

export type WebAppManifestIcon = {
  readonly src: string;
  readonly sizes: string;
  readonly type: string;
  readonly purpose?: "any" | "maskable";
};

export type WebAppManifestShortcut = {
  readonly name: string;
  readonly short_name: string;
  readonly url: string;
};

export type WebAppManifest = {
  readonly id: string;
  readonly name: string;
  readonly short_name: string;
  readonly description: string;
  readonly start_url: string;
  readonly scope: string;
  readonly display: "standalone";
  readonly display_override: ReadonlyArray<string>;
  readonly orientation: "any";
  readonly background_color: string;
  readonly theme_color: string;
  readonly categories: ReadonlyArray<string>;
  readonly icons: ReadonlyArray<WebAppManifestIcon>;
  readonly shortcuts: ReadonlyArray<WebAppManifestShortcut>;
};

export type WebAppManifestInput = {
  readonly baseName: string;
  readonly stageLabel: string;
};

/**
 * Mirrors `branding.ts`'s stage-label resolution for the build-time context,
 * where the hosted channel is known but `import.meta.env` is not in scope.
 */
export function resolveManifestStageLabel(input: {
  readonly hostedAppChannel: string | undefined;
  readonly isDev: boolean;
}): string {
  const channel = input.hostedAppChannel?.trim().toLowerCase();
  if (channel === "nightly") return "Nightly";
  if (channel === "latest") return "Latest";
  return input.isDev ? "Dev" : "Alpha";
}

export function buildWebAppManifest(input: WebAppManifestInput): WebAppManifest {
  return {
    id: "/",
    name: formatAppDisplayName(input),
    // Home-screen labels truncate around twelve characters, so the stage label
    // only ever appears in the install dialog via `name`.
    short_name: input.baseName,
    description: DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Window controls overlay first: `index.css`'s `.wco` block already lays
    // the workspace top bar out against `titlebar-area-*`, so a desktop install
    // gets the same chrome the Electron shell does.
    display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
    orientation: "any",
    background_color: SPLASH_BACKGROUND,
    theme_color: SPLASH_BACKGROUND,
    categories: ["developer", "productivity", "utilities"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
      { src: "/favicon-32x32.png", sizes: "32x32", type: "image/png", purpose: "any" },
    ],
    shortcuts: [
      { name: "New task", short_name: "New", url: "/" },
      { name: "Issues", short_name: "Issues", url: "/issues" },
      { name: "Pull requests", short_name: "PRs", url: "/pull-requests" },
      { name: "Settings", short_name: "Settings", url: "/settings/general" },
    ],
  };
}

export function serializeWebAppManifest(input: WebAppManifestInput): string {
  return `${JSON.stringify(buildWebAppManifest(input), null, 2)}\n`;
}
