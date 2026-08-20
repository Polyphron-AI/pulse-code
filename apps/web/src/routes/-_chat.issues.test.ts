import { describe, expect, it } from "vite-plus/test";

import { parseIssuesSearch } from "./_chat.issues";

describe("Issues route search", () => {
  it("keeps valid native filters and a URL-addressable selection", () => {
    expect(
      parseIssuesSearch({
        environmentId: "env-a",
        projectId: "project-a",
        status: "in_progress",
        severity: "high",
        assignee: "owner@example.com",
        q: "checkout crash",
        issueId: "ticket-42",
        selectedEnvironmentId: "env-a",
        selectedProjectId: "project-a",
        limit: 80,
      }),
    ).toEqual({
      environmentId: "env-a",
      projectId: "project-a",
      status: "in_progress",
      severity: "high",
      assignee: "owner@example.com",
      q: "checkout crash",
      issueId: "ticket-42",
      selectedEnvironmentId: "env-a",
      selectedProjectId: "project-a",
      limit: 80,
    });
  });

  it("drops invalid filters and bounds pagination", () => {
    expect(parseIssuesSearch({ status: "open", severity: "urgent", limit: 500 })).toEqual({
      limit: 100,
    });
    expect(parseIssuesSearch({ limit: 1 })).toEqual({ limit: 20 });
    expect(parseIssuesSearch({})).toEqual({ limit: 50 });
  });
});
