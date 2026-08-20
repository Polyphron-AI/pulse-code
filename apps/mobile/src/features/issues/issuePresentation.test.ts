import { describe, expect, it } from "@effect/vitest";

import {
  compactEvidence,
  isStaleIssueFailure,
  issueSeverityLabel,
  shouldShowInitialIssuesLoading,
} from "./issuePresentation";

describe("mobile Issue presentation", () => {
  it("gives unspecified severity a stable native label", () => {
    expect(issueSeverityLabel("")).toBe("Unspecified");
    expect(issueSeverityLabel("critical")).toBe("Critical");
  });

  it("keeps structured evidence bounded", () => {
    expect(compactEvidence({ message: "broken" })).toContain('"message": "broken"');
    expect(compactEvidence("123456", 4)).toBe("1234…");
  });

  it("recognizes optimistic-version conflicts without coupling to an error class", () => {
    expect(isStaleIssueFailure({ reason: "stale-version" })).toBe(true);
    expect(isStaleIssueFailure(new Error("offline"))).toBe(false);
  });

  it("does not leave an offline-only inbox behind a pending RPC spinner", () => {
    expect(
      shouldShowInitialIssuesLoading({
        catalogReady: true,
        reachableCapableEnvironmentCount: 0,
        connectionPending: true,
        connectionValueCount: 0,
        listTargetCount: 0,
        listPending: false,
        issueEntryCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldShowInitialIssuesLoading({
        catalogReady: true,
        reachableCapableEnvironmentCount: 1,
        connectionPending: true,
        connectionValueCount: 0,
        listTargetCount: 0,
        listPending: false,
        issueEntryCount: 0,
      }),
    ).toBe(true);
  });
});
