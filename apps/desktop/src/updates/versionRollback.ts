import type { DesktopUpdateChannel, DesktopUpdateVersion } from "@t3tools/contracts";

import { resolveDefaultDesktopUpdateChannel } from "./updateChannels.ts";

/**
 * Oldest version the app will offer to roll back to. Versions before this
 * predate the Pulse/T3 install-identity split (app id ai.polyphron.pulsecode),
 * so installing them would resurrect the old install identity and user-data
 * path. Bump this when a release changes something a downgrade cannot survive.
 */
export const MINIMUM_ROLLBACK_VERSION = "0.0.34";

const ROLLBACK_VERSION_LIMIT = 10;

const NIGHTLY_SUFFIX_PATTERN = /^(.*)-nightly\.(\d{8})\.(\d+)$/;

interface ParsedDesktopVersion {
  readonly base: ReadonlyArray<number>;
  // null for stable releases; stable sorts after any nightly of the same base.
  readonly nightly: readonly [number, number] | null;
}

function parseDesktopVersion(version: string): ParsedDesktopVersion | null {
  const nightlyMatch = version.match(NIGHTLY_SUFFIX_PATTERN);
  const baseText = nightlyMatch?.[1] ?? version;
  const parts = baseText.split(".").map((part) => Number.parseInt(part, 10));
  if (parts.length === 0 || parts.some((part) => Number.isNaN(part) || part < 0)) {
    return null;
  }
  return {
    base: parts,
    nightly:
      nightlyMatch?.[2] && nightlyMatch[3]
        ? [Number.parseInt(nightlyMatch[2], 10), Number.parseInt(nightlyMatch[3], 10)]
        : null,
  };
}

/**
 * Orders desktop versions, treating `x.y.z-nightly.YYYYMMDD.N` as a
 * prerelease of `x.y.z`. Returns null when either version does not parse,
 * so callers can exclude unknown formats instead of misordering them.
 */
export function compareDesktopVersions(a: string, b: string): number | null {
  const left = parseDesktopVersion(a);
  const right = parseDesktopVersion(b);
  if (!left || !right) {
    return null;
  }

  const length = Math.max(left.base.length, right.base.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left.base[index] ?? 0) - (right.base[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }

  if (left.nightly === null && right.nightly === null) return 0;
  if (left.nightly === null) return 1;
  if (right.nightly === null) return -1;
  return left.nightly[0] - right.nightly[0] || left.nightly[1] - right.nightly[1];
}

export interface RollbackReleaseCandidate {
  readonly version: string;
  readonly publishedAt: string | null;
  readonly draft: boolean;
}

/**
 * Filters published releases down to the versions the current install may
 * roll back to: same update channel, strictly older than the running
 * version, and no older than MINIMUM_ROLLBACK_VERSION, newest first.
 */
export function selectRollbackVersions(args: {
  readonly releases: ReadonlyArray<RollbackReleaseCandidate>;
  readonly currentVersion: string;
  readonly channel: DesktopUpdateChannel;
  readonly minimumVersion?: string;
}): Array<DesktopUpdateVersion> {
  const minimumVersion = args.minimumVersion ?? MINIMUM_ROLLBACK_VERSION;
  return args.releases
    .filter((release) => {
      if (release.draft) return false;
      if (resolveDefaultDesktopUpdateChannel(release.version) !== args.channel) return false;
      const againstCurrent = compareDesktopVersions(release.version, args.currentVersion);
      const againstFloor = compareDesktopVersions(release.version, minimumVersion);
      return (
        againstCurrent !== null && againstCurrent < 0 && againstFloor !== null && againstFloor >= 0
      );
    })
    .sort((a, b) => compareDesktopVersions(b.version, a.version) ?? 0)
    .slice(0, ROLLBACK_VERSION_LIMIT)
    .map((release) => ({ version: release.version, publishedAt: release.publishedAt }));
}

export function isRollbackVersionAllowed(args: {
  readonly version: string;
  readonly currentVersion: string;
  readonly channel: DesktopUpdateChannel;
  readonly minimumVersion?: string;
}): boolean {
  return (
    selectRollbackVersions({
      releases: [{ version: args.version, publishedAt: null, draft: false }],
      currentVersion: args.currentVersion,
      channel: args.channel,
      ...(args.minimumVersion === undefined ? {} : { minimumVersion: args.minimumVersion }),
    }).length === 1
  );
}
