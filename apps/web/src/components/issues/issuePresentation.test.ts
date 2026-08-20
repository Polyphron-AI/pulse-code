import { describe, expect, it } from "vite-plus/test";

import {
  activityLabel,
  compactUnknown,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  issueSeverityLabel,
} from "./issuePresentation";

describe("Issue presentation", () => {
  it("keeps every lifecycle and severity option available to native controls", () => {
    expect(ISSUE_STATUSES).toEqual(["triage", "todo", "in_progress", "resolved", "wont_fix"]);
    expect(ISSUE_SEVERITIES).toEqual(["critical", "high", "medium", "low"]);
    expect(issueSeverityLabel("")).toBe("Unspecified");
  });

  it("turns Pulse activity identifiers into readable labels", () => {
    expect(activityLabel({ action: "updated", field: "assigned_to_id" })).toBe(
      "updated assigned to id",
    );
    expect(activityLabel({ action: "reopened", field: null })).toBe("reopened");
  });

  it("renders unknown evidence without crashing on circular objects", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;
    expect(compactUnknown(circular)).toBe("Details unavailable");
    expect(compactUnknown({ status: 500 })).toContain('"status": 500');
  });
});
