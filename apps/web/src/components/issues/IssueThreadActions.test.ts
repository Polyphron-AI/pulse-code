import type { Issue } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildIssueFixPrompt } from "./IssueThreadActions";

const issue = {
  id: "ticket-42",
  pulseProjectId: "pulse-project-a",
  ref: "ISS-42",
  title: "Checkout total is stale",
  description: "The total does not update after removing an item.",
  severity: "high",
  status: "triage",
  assignedToId: null,
  labels: ["checkout"],
  resolvedAt: null,
  archivedAt: null,
  version: 1,
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:00:00.000Z",
  reportCount: 2,
} as unknown as Issue;

describe("Issue fix handoff", () => {
  it("builds a focused prompt that points at native evidence without stuffing it inline", () => {
    const prompt = buildIssueFixPrompt(issue);
    expect(prompt).toContain("Fix Pulse Issue ISS-42");
    expect(prompt).toContain("2 linked Reports");
    expect(prompt).toContain("native Issue panel");
    expect(prompt).not.toContain("consoleEntries");
    expect(prompt).not.toContain("networkEntries");
  });
});
