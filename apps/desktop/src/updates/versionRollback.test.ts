import { describe, expect, it } from "vite-plus/test";

import {
  compareDesktopVersions,
  isRollbackVersionAllowed,
  selectRollbackVersions,
} from "./versionRollback.ts";

describe("compareDesktopVersions", () => {
  it("orders stable versions numerically", () => {
    expect(compareDesktopVersions("0.0.35", "0.0.34")).toBeGreaterThan(0);
    expect(compareDesktopVersions("0.0.34", "0.0.34")).toBe(0);
    expect(compareDesktopVersions("0.0.9", "0.0.10")).toBeLessThan(0);
    expect(compareDesktopVersions("1.0.0", "0.9.9")).toBeGreaterThan(0);
  });

  it("treats a nightly as a prerelease of its base version", () => {
    expect(compareDesktopVersions("0.0.35-nightly.20260821.1", "0.0.35")).toBeLessThan(0);
    expect(compareDesktopVersions("0.0.35-nightly.20260821.1", "0.0.34")).toBeGreaterThan(0);
    expect(
      compareDesktopVersions("0.0.35-nightly.20260822.1", "0.0.35-nightly.20260821.2"),
    ).toBeGreaterThan(0);
    expect(
      compareDesktopVersions("0.0.35-nightly.20260821.2", "0.0.35-nightly.20260821.1"),
    ).toBeGreaterThan(0);
  });

  it("returns null for unparseable versions", () => {
    expect(compareDesktopVersions("abc", "0.0.34")).toBeNull();
    expect(compareDesktopVersions("0.0.34", "0.0.x")).toBeNull();
  });
});

describe("selectRollbackVersions", () => {
  const releases = [
    { version: "0.0.37", publishedAt: "2026-08-20T00:00:00Z", draft: false },
    { version: "0.0.36", publishedAt: "2026-08-10T00:00:00Z", draft: false },
    { version: "0.0.35", publishedAt: "2026-08-01T00:00:00Z", draft: true },
    { version: "0.0.36-nightly.20260808.1", publishedAt: null, draft: false },
    { version: "0.0.34", publishedAt: "2026-07-20T00:00:00Z", draft: false },
    { version: "0.0.33", publishedAt: "2026-07-01T00:00:00Z", draft: false },
  ];

  it("keeps only same-channel, published versions between the floor and the current version", () => {
    const versions = selectRollbackVersions({
      releases,
      currentVersion: "0.0.37",
      channel: "latest",
    });
    expect(versions.map((entry) => entry.version)).toEqual(["0.0.36", "0.0.34"]);
  });

  it("offers nightlies only on the nightly channel", () => {
    const versions = selectRollbackVersions({
      releases,
      currentVersion: "0.0.37",
      channel: "nightly",
    });
    expect(versions.map((entry) => entry.version)).toEqual(["0.0.36-nightly.20260808.1"]);
  });

  it("never offers the running version or newer ones", () => {
    const versions = selectRollbackVersions({
      releases,
      currentVersion: "0.0.36",
      channel: "latest",
    });
    expect(versions.map((entry) => entry.version)).toEqual(["0.0.34"]);
  });

  it("respects an explicit minimum version", () => {
    const versions = selectRollbackVersions({
      releases,
      currentVersion: "0.0.37",
      channel: "latest",
      minimumVersion: "0.0.36",
    });
    expect(versions.map((entry) => entry.version)).toEqual(["0.0.36"]);
  });
});

describe("isRollbackVersionAllowed", () => {
  it("accepts an older same-channel version above the floor", () => {
    expect(
      isRollbackVersionAllowed({ version: "0.0.34", currentVersion: "0.0.35", channel: "latest" }),
    ).toBe(true);
  });

  it("rejects versions below the floor, newer versions, and channel mismatches", () => {
    expect(
      isRollbackVersionAllowed({ version: "0.0.33", currentVersion: "0.0.35", channel: "latest" }),
    ).toBe(false);
    expect(
      isRollbackVersionAllowed({ version: "0.0.36", currentVersion: "0.0.35", channel: "latest" }),
    ).toBe(false);
    expect(
      isRollbackVersionAllowed({
        version: "0.0.35-nightly.20260820.1",
        currentVersion: "0.0.35",
        channel: "latest",
      }),
    ).toBe(false);
  });
});
