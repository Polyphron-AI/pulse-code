export const WORKSPACE_BROWSER_PREVIEW_EXTENSIONS = [".htm", ".html", ".pdf"] as const;

export const WORKSPACE_IMAGE_PREVIEW_EXTENSIONS = [
  ".avif",
  ".gif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
] as const;

function hasPreviewExtension(path: string, extensions: ReadonlyArray<string>): boolean {
  const pathWithoutQuery = path.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  return extensions.some((extension) => pathWithoutQuery.endsWith(extension));
}

export function isWorkspaceBrowserPreviewPath(path: string): boolean {
  return hasPreviewExtension(path, WORKSPACE_BROWSER_PREVIEW_EXTENSIONS);
}

export function isWorkspaceImagePreviewPath(path: string): boolean {
  return hasPreviewExtension(path, WORKSPACE_IMAGE_PREVIEW_EXTENSIONS);
}

export function isWorkspacePreviewEntryPath(path: string): boolean {
  return isWorkspaceBrowserPreviewPath(path) || isWorkspaceImagePreviewPath(path);
}

/** Files that should be downloaded instead of being sent to the UTF-8 editor. */
export function isWorkspaceDownloadOnlyPath(path: string): boolean {
  return /\.(?:xlsx?|xlsm|xlsb|ods|docx?|odt|pptx?|odp|zip|gz|bz2|xz|7z|rar|tar|exe|dll|so|dylib|dmg|iso|sqlite3?|db|woff2?|ttf|otf|mp[34]|m4[av]|mov|webm|wav|ogg|flac|bin)$/i.test(
    path.split(/[?#]/, 1)[0] ?? "",
  );
}
