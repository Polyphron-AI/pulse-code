import { describe, expect, it } from "vite-plus/test";

import {
  buildWorkspaceBasenameIndex,
  claimWorkspaceBasenameLookup,
  isBasenameOnlyReference,
  resolveBasenameFromIndex,
  resolveWorkspaceBasename,
  workspacePathBasename,
} from "./workspaceFileReference.ts";

describe("isBasenameOnlyReference", () => {
  it("flags bare filenames", () => {
    expect(isBasenameOnlyReference("ChatView.tsx")).toBe(true);
    expect(isBasenameOnlyReference("Makefile")).toBe(true);
  });

  it("leaves anything with a directory alone", () => {
    expect(isBasenameOnlyReference("apps/web/src/components/ChatView.tsx")).toBe(false);
    expect(isBasenameOnlyReference("apps\\web\\ChatView.tsx")).toBe(false);
    expect(isBasenameOnlyReference("   ")).toBe(false);
  });
});

describe("workspacePathBasename", () => {
  it("reads the last segment of either separator", () => {
    expect(workspacePathBasename("apps/web/ChatView.tsx")).toBe("ChatView.tsx");
    expect(workspacePathBasename("apps\\web\\ChatView.tsx")).toBe("ChatView.tsx");
    expect(workspacePathBasename("ChatView.tsx")).toBe("ChatView.tsx");
  });

  it("looks past a trailing separator instead of reading an empty segment", () => {
    expect(workspacePathBasename("apps/web/components/")).toBe("components");
  });
});

describe("resolveWorkspaceBasename", () => {
  const entries = [
    { path: "apps/web/src/components/ChatView.test.tsx", kind: "file" as const },
    { path: "apps/web/src/components/ChatView.tsx", kind: "file" as const },
  ];

  it("resolves the exact filename match, not the closest fuzzy one", () => {
    expect(resolveWorkspaceBasename("ChatView.tsx", entries)).toEqual({
      _tag: "resolved",
      path: "apps/web/src/components/ChatView.tsx",
    });
  });

  it("ignores directories", () => {
    expect(
      resolveWorkspaceBasename("components", [
        { path: "apps/web/src/components", kind: "directory" },
        { path: "apps/web/src/components/components", kind: "file" },
      ]),
    ).toEqual({ _tag: "resolved", path: "apps/web/src/components/components" });
  });

  it("prefers the exactly-cased file over a case-only twin", () => {
    expect(
      resolveWorkspaceBasename("foo.ts", [
        { path: "src/Foo.ts", kind: "file" },
        { path: "src/foo.ts", kind: "file" },
      ]),
    ).toEqual({ _tag: "resolved", path: "src/foo.ts" });
  });

  it("falls back to case-insensitive when only the casing differs", () => {
    expect(resolveWorkspaceBasename("chatview.tsx", entries)).toEqual({
      _tag: "resolved",
      path: "apps/web/src/components/ChatView.tsx",
    });
  });

  // The old behaviour opened whichever same-named file the index ranked first,
  // which is indistinguishable from opening the right one until you read it.
  it("reports every candidate when the same filename lives in several folders", () => {
    expect(
      resolveWorkspaceBasename("index.ts", [
        { path: "packages/shared/src/index.ts", kind: "file" },
        { path: "packages/contracts/src/index.ts", kind: "file" },
      ]),
    ).toEqual({
      _tag: "ambiguous",
      candidates: ["packages/shared/src/index.ts", "packages/contracts/src/index.ts"],
    });
  });

  it("reports an ambiguity when only the casing distinguishes the candidates", () => {
    expect(
      resolveWorkspaceBasename("FOO.ts", [
        { path: "src/Foo.ts", kind: "file" },
        { path: "src/foo.ts", kind: "file" },
      ]),
    ).toEqual({ _tag: "ambiguous", candidates: ["src/Foo.ts", "src/foo.ts"] });
  });

  it("stays unresolved when nothing matches the name", () => {
    expect(resolveWorkspaceBasename("ChatView.tsx", [])).toEqual({ _tag: "unresolved" });
    expect(
      resolveWorkspaceBasename("ChatView.tsx", [
        { path: "apps/web/src/components/ChatHeader.tsx", kind: "file" },
      ]),
    ).toEqual({ _tag: "unresolved" });
    expect(resolveWorkspaceBasename("   ", entries)).toEqual({ _tag: "unresolved" });
  });
});

describe("resolveBasenameFromIndex", () => {
  const index = buildWorkspaceBasenameIndex([
    "apps/server/src/background/HostPowerMonitor.ts",
    "apps/server/src/background/HostPowerMonitor.test.ts",
    "docs/user/integrations.md",
    // A path repeated across turns must not read as two candidates.
    "docs/user/integrations.md",
  ]);

  it("resolves a name the thread already surfaced", () => {
    expect(resolveBasenameFromIndex("HostPowerMonitor.ts", index)).toEqual({
      _tag: "resolved",
      path: "apps/server/src/background/HostPowerMonitor.ts",
    });
  });

  it("dedupes a path recorded more than once", () => {
    expect(resolveBasenameFromIndex("integrations.md", index)).toEqual({
      _tag: "resolved",
      path: "docs/user/integrations.md",
    });
  });

  it("stays unresolved for names the thread never mentioned", () => {
    expect(resolveBasenameFromIndex("ChatView.tsx", index)).toEqual({ _tag: "unresolved" });
  });

  it("reports candidates when the thread touched two files of the same name", () => {
    const ambiguous = buildWorkspaceBasenameIndex([
      "apps/web/src/index.ts",
      "apps/mobile/src/index.ts",
    ]);
    expect(resolveBasenameFromIndex("index.ts", ambiguous)).toEqual({
      _tag: "ambiguous",
      candidates: ["apps/web/src/index.ts", "apps/mobile/src/index.ts"],
    });
  });
});

describe("claimWorkspaceBasenameLookup", () => {
  it("keeps only the newest claim, whatever order the lookups settle in", () => {
    const first = claimWorkspaceBasenameLookup();
    const second = claimWorkspaceBasenameLookup();

    // The older lookup answering last must not reopen the panel behind the
    // newer one.
    expect(second()).toBe(true);
    expect(first()).toBe(false);
  });

  it("stays valid while it is the only claim", () => {
    const only = claimWorkspaceBasenameLookup();
    expect(only()).toBe(true);
  });
});
