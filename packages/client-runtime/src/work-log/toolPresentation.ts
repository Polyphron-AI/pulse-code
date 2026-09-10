import { classifyMarkdownImageSource } from "../markdownImages.ts";
import { isWorkspaceImagePreviewPath } from "@t3tools/shared/filePreview";
import type {
  ToolActivityIcon,
  ToolActivityNativeAppReference,
  ToolActivitySource,
  ToolActivitySurface,
} from "@t3tools/contracts";

export interface ExtractedToolActivityPresentation {
  readonly toolSurface?: ToolActivitySurface;
  readonly toolIcon?: ToolActivityIcon;
  readonly toolSource?: ToolActivitySource;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function trimmedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : undefined;
}

function imageUrl(value: unknown): string | undefined {
  const raw = trimmedString(value, 4096);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "data:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function pageUrl(value: unknown): string | undefined {
  const raw = trimmedString(value, 4096);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function nativeAppReference(value: unknown): ToolActivityNativeAppReference | undefined {
  const app = asRecord(value);
  const appId = trimmedString(app?.appId, 512);
  if (app?._tag === "app-id" && appId && /^[A-Za-z0-9._-]+$/u.test(appId)) {
    return { _tag: "app-id", appId };
  }
  const displayName = trimmedString(app?.displayName, 160);
  if (app?._tag === "display-name" && displayName) {
    return { _tag: "display-name", displayName };
  }
  return undefined;
}

function activityIcon(value: unknown): ToolActivityIcon | undefined {
  const icon = asRecord(value);
  if (icon?._tag === "website") {
    const resolvedPageUrl = pageUrl(icon.pageUrl);
    const faviconUrl = imageUrl(icon.faviconUrl);
    const faviconUrlDark = imageUrl(icon.faviconUrlDark);
    if (resolvedPageUrl) {
      return {
        _tag: "website",
        pageUrl: resolvedPageUrl,
        ...(faviconUrl ? { faviconUrl } : {}),
        ...(faviconUrlDark ? { faviconUrlDark } : {}),
      };
    }
  }
  if (icon?._tag === "native-app") {
    const app = nativeAppReference(icon.app);
    if (app) return { _tag: "native-app", app };
  }
  if (icon?._tag === "themed-logo") {
    const logoUrl = imageUrl(icon.logoUrl);
    const logoUrlDark = imageUrl(icon.logoUrlDark);
    if (logoUrl) {
      return {
        _tag: "themed-logo",
        logoUrl,
        ...(logoUrlDark ? { logoUrlDark } : {}),
      };
    }
  }
  return undefined;
}

function activitySource(value: unknown): ToolActivitySource | undefined {
  const source = asRecord(value);
  const key = trimmedString(source?.key, 512);
  const name = trimmedString(source?.name, 160);
  const kind = source?.kind;
  if (!key || !name || (kind !== "browser" && kind !== "computer" && kind !== "integration")) {
    return undefined;
  }
  const icon = activityIcon(source?.icon);
  return { key, name, kind, ...(icon ? { icon } : {}) };
}

export function extractToolActivityPresentation(
  payloadValue: unknown,
): ExtractedToolActivityPresentation {
  const payload = asRecord(payloadValue);
  const toolSurface =
    payload?.toolSurface === "browser" || payload?.toolSurface === "computer"
      ? payload.toolSurface
      : undefined;
  const toolIcon = activityIcon(payload?.toolIcon);
  const toolSource = activitySource(payload?.toolSource);
  return {
    ...(toolSurface ? { toolSurface } : {}),
    ...(toolIcon ? { toolIcon } : {}),
    ...(toolSource ? { toolSource } : {}),
  };
}

/** Preserve the current log layout while describing calls grouped by their source. */
export function summarizeToolSources(
  entries: ReadonlyArray<ExtractedToolActivityPresentation>,
): string | undefined {
  const sources = new Map(
    entries.flatMap((entry) =>
      entry.toolSource ? [[entry.toolSource.key, entry.toolSource] as const] : [],
    ),
  );
  if (sources.size === 0) return undefined;
  const values = [...sources.values()];
  const names = values.map((source) => source.name);
  const label =
    names.length < 3
      ? names.join(" and ")
      : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
  return `Used ${label}${values.every((source) => source.kind === "integration") ? (sources.size === 1 ? " integration" : " integrations") : ""}`;
}

/** A single image path reported by a read tool, never arbitrary tool output. */
export function workEntryViewedImagePath(entry: {
  readonly itemType?: string;
  readonly requestKind?: string;
  readonly toolTitle?: string;
  readonly detail?: string;
}): string | null {
  const readsFile =
    entry.requestKind === "file-read" ||
    entry.itemType === "image_view" ||
    (entry.itemType === "dynamic_tool_call" &&
      entry.toolTitle?.trim().toLowerCase() === "read file");
  const detail = entry.detail?.trim();
  return readsFile &&
    detail &&
    !/[\r\n]/.test(detail) &&
    isWorkspaceImagePreviewPath(detail) &&
    classifyMarkdownImageSource(detail, ".")._tag === "WorkspaceFile"
    ? detail
    : null;
}
