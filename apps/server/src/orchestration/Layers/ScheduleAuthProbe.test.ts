import { ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { scheduleAuthResult } from "./ScheduleAuthProbe.ts";

const instanceId = ProviderInstanceId.make("codex");

describe("scheduleAuthResult", () => {
  it("passes authenticated provider instances", () => {
    expect(
      scheduleAuthResult(instanceId, [
        { instanceId, auth: { status: "authenticated", label: "Signed in" } },
      ]),
    ).toEqual({ _tag: "ok" });
  });

  it("fails unauthenticated provider instances with their visible label", () => {
    expect(
      scheduleAuthResult(instanceId, [
        { instanceId, auth: { status: "unauthenticated", label: "Sign in required" } },
      ]),
    ).toEqual({ _tag: "failed", message: "Sign in required" });
  });

  it("allows unknown or unresolved auth state to use the normal turn failure path", () => {
    expect(scheduleAuthResult(instanceId, [{ instanceId, auth: { status: "unknown" } }])).toEqual({
      _tag: "unknown",
    });
    expect(scheduleAuthResult(instanceId, [])).toEqual({ _tag: "unknown" });
    expect(scheduleAuthResult(null, [])).toEqual({ _tag: "unknown" });
  });
});
