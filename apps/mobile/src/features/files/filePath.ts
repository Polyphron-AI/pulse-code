import {
  isWorkspaceBrowserPreviewPath,
  isWorkspaceImagePreviewPath,
} from "@t3tools/shared/filePreview";

export interface FileBreadcrumb {
  readonly label: string;
  readonly path: string;
  readonly kind: "project" | "directory" | "file";
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || isWindowsAbsolutePath(value);
}

function isWindowsPathStyle(value: string): boolean {
  return isWindowsAbsolutePath(value) || /^[A-Za-z]:\\/.test(value);
}

function joinPath(base: string, next: string, separator: "/" | "\\"): string {
  const cleanBase = base.replace(/[\\/]+$/, "");
  if (separator === "\\") {
    return `${cleanBase}\\${next.replaceAll("/", "\\")}`;
  }
  return `${cleanBase}/${next.replace(/^\/+/, "")}`;
}

export function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}

export function resolveWorkspaceFilePath(cwd: string, relativePath: string): string {
  if (isAbsolutePath(relativePath)) {
    return relativePath;
  }

  const separator: "/" | "\\" = isWindowsPathStyle(cwd) ? "\\" : "/";
  return joinPath(cwd, relativePath, separator);
}

function normalizeRelativePath(value: string): string | null {
  const segments: string[] = [];
  for (const segment of value.replaceAll("\\", "/").split("/")) {
    if (segment.length === 0 || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length === 0) {
        return null;
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.length > 0 ? segments.join("/") : null;
}

export function resolveWorkspaceRelativeFilePath(
  workspaceRoot: string | null | undefined,
  targetPath: string,
): string | null {
  if (!isAbsolutePath(targetPath)) {
    if (targetPath.startsWith("~/") || targetPath.startsWith("~\\")) {
      return null;
    }
    return normalizeRelativePath(targetPath);
  }
  if (!workspaceRoot) {
    return null;
  }

  const normalizedTarget = targetPath.replaceAll("\\", "/");
  const normalizedRoot = workspaceRoot.replaceAll("\\", "/").replace(/\/+$/, "");
  const caseInsensitive = isWindowsAbsolutePath(targetPath) || isWindowsAbsolutePath(workspaceRoot);
  const comparableTarget = caseInsensitive ? normalizedTarget.toLowerCase() : normalizedTarget;
  const comparableRoot = caseInsensitive ? normalizedRoot.toLowerCase() : normalizedRoot;
  if (!comparableTarget.startsWith(`${comparableRoot}/`)) {
    return null;
  }

  return normalizeRelativePath(normalizedTarget.slice(normalizedRoot.length + 1));
}

/**
 * Why a workspace-file link cannot be turned into a location. Each reason gets
 * its own message at the tap site: a link that looks live and does nothing reads
 * as a broken app, so the caller must always have something true to say.
 */
export type UnaddressableWorkspaceLinkReason =
  | "no-workspace"
  | "home-relative"
  | "outside-workspace";

export type WorkspaceLinkTarget =
  | { readonly _tag: "workspace-path"; readonly relativePath: string }
  | { readonly _tag: "unaddressable"; readonly reason: UnaddressableWorkspaceLinkReason };

/**
 * Classify a link destination against the thread's workspace. Wraps
 * `resolveWorkspaceRelativeFilePath` so the tap handler can distinguish "we
 * have no root yet" from "this path is somewhere else" without re-deriving the
 * path rules.
 */
export function resolveWorkspaceLinkTarget(
  workspaceRoot: string | null | undefined,
  targetPath: string,
): WorkspaceLinkTarget {
  const relativePath = resolveWorkspaceRelativeFilePath(workspaceRoot, targetPath);
  if (relativePath !== null) {
    return { _tag: "workspace-path", relativePath };
  }
  if (targetPath.startsWith("~/") || targetPath.startsWith("~\\")) {
    return { _tag: "unaddressable", reason: "home-relative" };
  }
  if (!workspaceRoot) {
    return { _tag: "unaddressable", reason: "no-workspace" };
  }
  return { _tag: "unaddressable", reason: "outside-workspace" };
}

export function isBrowserPreviewFile(path: string): boolean {
  return isWorkspaceBrowserPreviewPath(path);
}

export function isImagePreviewFile(path: string): boolean {
  return isWorkspaceImagePreviewPath(path);
}

export function isSvgImagePreviewFile(path: string): boolean {
  return /\.svg$/i.test(path.split(/[?#]/, 1)[0] ?? "");
}

export function isMarkdownPreviewFile(path: string): boolean {
  return /\.(?:md|mdx)$/i.test(path.split(/[?#]/, 1)[0] ?? "");
}

export function fileBreadcrumbs(projectName: string, relativePath: string): FileBreadcrumb[] {
  const parts = relativePath.split("/").filter(Boolean);
  return [
    { label: projectName, path: "", kind: "project" },
    ...parts.map((part, index) => ({
      label: part,
      path: parts.slice(0, index + 1).join("/"),
      kind: index === parts.length - 1 ? ("file" as const) : ("directory" as const),
    })),
  ];
}
