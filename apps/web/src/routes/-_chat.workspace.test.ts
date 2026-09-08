import { describe, expect, it } from "vite-plus/test";

import { parseWorkspaceSearch } from "./_chat.workspace";

describe("parseWorkspaceSearch", () => {
  it("selects Office only for a supported space and preserves Code handoffs", () => {
    expect(parseWorkspaceSearch({ space: "office" })).toEqual({ space: "office" });
    expect(parseWorkspaceSearch({ space: "unknown" })).toEqual({});
    expect(parseWorkspaceSearch({ space: "code" })).toEqual({});
    expect(parseWorkspaceSearch({ space: "office", prepare: true })).toEqual({ prepare: true });
  });

  it("accepts only an explicit prepare request", () => {
    expect(parseWorkspaceSearch({ prepare: true })).toEqual({ prepare: true });
    expect(parseWorkspaceSearch({ prepare: "true" })).toEqual({ prepare: true });
    expect(parseWorkspaceSearch({ prepare: "false" })).toEqual({});
    expect(parseWorkspaceSearch({ prepare: 1 })).toEqual({});
  });

  it("keeps a complete related-thread reference only with a prepare request", () => {
    expect(
      parseWorkspaceSearch({
        prepare: true,
        sourceEnvironmentId: "environment-local",
        sourceThreadId: "thread-1",
      }),
    ).toEqual({
      prepare: true,
      sourceEnvironmentId: "environment-local",
      sourceThreadId: "thread-1",
    });
    expect(
      parseWorkspaceSearch({
        prepare: true,
        sourceEnvironmentId: "environment-local",
      }),
    ).toEqual({ prepare: true });
    expect(
      parseWorkspaceSearch({
        sourceEnvironmentId: "environment-local",
        sourceThreadId: "thread-1",
      }),
    ).toEqual({});
  });
});
