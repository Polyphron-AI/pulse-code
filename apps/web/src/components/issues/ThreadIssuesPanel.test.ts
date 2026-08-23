import { EnvironmentId, ProjectId, PulseProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { directoryIssueListTargets } from "./ThreadIssuesPanel";

const environmentId = EnvironmentId.make("environment-local");
const projectId = ProjectId.make("project-current");

describe("directoryIssueListTargets", () => {
  it("queries only the current directory's mapped Pulse project", () => {
    expect(
      directoryIssueListTargets({
        environmentId,
        projectId,
        connection: {
          status: "connected",
          mappings: [
            {
              projectId,
              pulseProjectId: PulseProjectId.make("pulse-current"),
              pulseProjectName: "Current",
              pulseProjectSlug: "current",
              updatedAt: "2026-08-23T00:00:00.000Z",
            },
          ],
        },
      }),
    ).toEqual([
      {
        environmentId,
        input: { projectId, sort: "updated", limit: 100, offset: 0 },
      },
    ]);
  });

  it("does not query another directory's Pulse mapping", () => {
    expect(
      directoryIssueListTargets({
        environmentId,
        projectId,
        connection: {
          status: "connected",
          mappings: [
            {
              projectId: ProjectId.make("project-other"),
              pulseProjectId: PulseProjectId.make("pulse-other"),
              pulseProjectName: "Other",
              pulseProjectSlug: "other",
              updatedAt: "2026-08-23T00:00:00.000Z",
            },
          ],
        },
      }),
    ).toEqual([]);
  });
});
