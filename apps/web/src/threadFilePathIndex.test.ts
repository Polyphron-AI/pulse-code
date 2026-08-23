import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  clearThreadFilePaths,
  recordThreadFilePaths,
  resolveThreadFileBasename,
} from "./threadFilePathIndex";

afterEach(() => {
  clearThreadFilePaths();
});

describe("threadFilePathIndex", () => {
  it("resolves a bare filename against a path the thread recorded", () => {
    recordThreadFilePaths("env:thread-1", ["apps/server/src/background/HostPowerMonitor.ts"]);

    expect(resolveThreadFileBasename("env:thread-1", "HostPowerMonitor.ts")).toEqual({
      _tag: "resolved",
      path: "apps/server/src/background/HostPowerMonitor.ts",
    });
  });

  it("keeps threads apart", () => {
    recordThreadFilePaths("env:thread-1", ["apps/web/src/App.tsx"]);

    expect(resolveThreadFileBasename("env:thread-2", "App.tsx")).toEqual({ _tag: "unresolved" });
  });

  it("accumulates across turns instead of replacing", () => {
    recordThreadFilePaths("env:thread-1", ["apps/web/src/App.tsx"]);
    recordThreadFilePaths("env:thread-1", ["docs/user/usage.md"]);

    expect(resolveThreadFileBasename("env:thread-1", "App.tsx")._tag).toBe("resolved");
    expect(resolveThreadFileBasename("env:thread-1", "usage.md")._tag).toBe("resolved");
  });

  it("reports an ambiguity rather than picking a same-named file", () => {
    recordThreadFilePaths("env:thread-1", ["apps/web/src/index.ts", "apps/mobile/src/index.ts"]);

    expect(resolveThreadFileBasename("env:thread-1", "index.ts")).toEqual({
      _tag: "ambiguous",
      candidates: ["apps/web/src/index.ts", "apps/mobile/src/index.ts"],
    });
  });

  it("is unresolved for an untracked name and for an empty index", () => {
    expect(resolveThreadFileBasename("env:thread-1", "App.tsx")).toEqual({ _tag: "unresolved" });
    recordThreadFilePaths("env:thread-1", ["apps/web/src/App.tsx"]);
    expect(resolveThreadFileBasename("env:thread-1", "Other.tsx")).toEqual({ _tag: "unresolved" });
  });

  it("evicts the least recently recorded thread once the cap is passed", () => {
    for (let index = 0; index < 9; index += 1) {
      recordThreadFilePaths(`env:thread-${index}`, [`apps/web/src/File${index}.tsx`]);
    }

    expect(resolveThreadFileBasename("env:thread-0", "File0.tsx")).toEqual({ _tag: "unresolved" });
    expect(resolveThreadFileBasename("env:thread-8", "File8.tsx")._tag).toBe("resolved");
  });
});
