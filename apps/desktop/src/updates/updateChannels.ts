import type { DesktopUpdateChannel } from "@t3tools/contracts";
import { resolveProductUpdateChannel } from "@t3tools/shared/productIdentity";

export function isNightlyDesktopVersion(version: string): boolean {
  return resolveProductUpdateChannel(version) === "nightly";
}

export function resolveDefaultDesktopUpdateChannel(appVersion: string): DesktopUpdateChannel {
  return resolveProductUpdateChannel(appVersion);
}
