import { describe, expect, it } from "vite-plus/test";

import { buildOpenCodePermissionRules } from "./opencodeRuntime.ts";

const actionFor = (
  rules: ReturnType<typeof buildOpenCodePermissionRules>,
  permission: string,
): string | undefined => rules.find((rule) => rule.permission === permission)?.action;

describe("buildOpenCodePermissionRules", () => {
  it("keeps the runtime-mode behavior when no allow-list is set", () => {
    expect(buildOpenCodePermissionRules("full-access")).toEqual([
      { permission: "*", pattern: "*", action: "allow" },
    ]);
    expect(actionFor(buildOpenCodePermissionRules("approval-required"), "bash")).toBe("ask");
  });

  it("denies everything that writes when an allow-list is set", () => {
    const rules = buildOpenCodePermissionRules("full-access", [
      "read",
      "grep",
      "webfetch",
      "websearch",
    ]);
    expect(actionFor(rules, "*")).toBe("deny");
    expect(actionFor(rules, "bash")).toBe("deny");
    expect(actionFor(rules, "edit")).toBe("deny");
    expect(actionFor(rules, "external_directory")).toBe("deny");
    expect(actionFor(rules, "webfetch")).toBe("allow");
    expect(actionFor(rules, "websearch")).toBe("allow");
  });

  it("denies a permission the allow-list leaves out", () => {
    const rules = buildOpenCodePermissionRules("full-access", ["read"]);
    expect(actionFor(rules, "webfetch")).toBe("deny");
    expect(actionFor(rules, "codesearch")).toBe("deny");
  });
});
