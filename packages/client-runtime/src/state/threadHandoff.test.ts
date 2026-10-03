import { describe, expect, it } from "vite-plus/test";
import { ProviderInstanceId, ProviderDriverKind, type ServerProvider } from "@t3tools/contracts";
import { threadModelSelectionNeedsSummary } from "./threadHandoff.ts";
const source = {
  instanceId: ProviderInstanceId.make("codex_work"),
  driver: ProviderDriverKind.make("codex"),
  continuation: { groupKey: "work-account" },
} as ServerProvider;
const destination = {
  instanceId: ProviderInstanceId.make("claude"),
  driver: ProviderDriverKind.make("claudeAgent"),
} as ServerProvider;
describe("thread model handoff decisions", () => {
  it("requires a summary for a different harness or continuation identity", () => {
    expect(
      threadModelSelectionNeedsSummary({
        providers: [source, destination],
        currentModelSelection: { instanceId: source.instanceId, model: "astra" },
        nextModelSelection: { instanceId: destination.instanceId, model: "fable" },
        hasStartedSession: true,
      }),
    ).toBe(true);
    expect(
      threadModelSelectionNeedsSummary({
        providers: [
          source,
          { ...destination, driver: source.driver, continuation: { groupKey: "other-account" } },
        ],
        currentModelSelection: { instanceId: source.instanceId, model: "astra" },
        nextModelSelection: { instanceId: destination.instanceId, model: "astra" },
        hasStartedSession: true,
      }),
    ).toBe(true);
  });
  it("keeps compatible model changes inside the original session", () => {
    expect(
      threadModelSelectionNeedsSummary({
        providers: [source],
        currentModelSelection: { instanceId: source.instanceId, model: "astra" },
        nextModelSelection: { instanceId: source.instanceId, model: "sol" },
        hasStartedSession: true,
      }),
    ).toBe(false);
    expect(
      threadModelSelectionNeedsSummary({
        providers: [source, destination],
        currentModelSelection: { instanceId: source.instanceId, model: "astra" },
        nextModelSelection: { instanceId: destination.instanceId, model: "fable" },
        hasStartedSession: false,
      }),
    ).toBe(false);
  });
});
