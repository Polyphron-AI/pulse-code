import * as Schema from "effect/Schema";
import { EnvironmentId, ProjectId, PullRequestListInput } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { pullRequestNamedFilters, pullRequestFacetTargets } from "./pullRequestNamedFilters.logic";
import {
  readPullRequestListPreferences,
  writePullRequestListPreferences,
} from "./pullRequestListPreferences";

const decodeFacetInput = Schema.decodeUnknownSync(PullRequestListInput);

describe("named pull request filters", () => {
  it("accepts shared single-label URLs without splitting punctuation", () => {
    expect(pullRequestNamedFilters({ author: " me ", labels: "area: ui, mobile" })).toEqual({
      author: "me",
      labels: ["area: ui, mobile"],
    });
  });
  it("bounds untrusted URL labels and removes duplicate and invalid values", () => {
    const filters = pullRequestNamedFilters({
      author: "x".repeat(250),
      labels: [
        null,
        "",
        " Bug ",
        "bug",
        ...Array.from({ length: 20 }, (_, index) => `label-${index}`),
      ],
    });
    expect(filters.author).toHaveLength(200);
    expect(filters.labels).toHaveLength(10);
    expect(filters.labels?.slice(0, 2)).toEqual(["Bug", "label-0"]);
    expect(pullRequestNamedFilters({ author: 5, labels: { label: "bug" } })).toEqual({});
  });
  it("restores saved controls and removes cleared controls from the next visit", () => {
    let saved: string | null = null;
    const storage = {
      getItem: () => saved,
      setItem: (_key: string, value: string) => {
        saved = value;
      },
    };
    writePullRequestListPreferences(
      { involvement: "all", state: "open", author: "me", labels: ["bug", "needs review"] },
      storage,
    );
    expect(pullRequestNamedFilters(readPullRequestListPreferences(storage))).toEqual({
      author: "me",
      labels: ["bug", "needs review"],
    });
    writePullRequestListPreferences(
      {
        involvement: "all",
        state: "open",
        ...pullRequestNamedFilters({ author: " ", labels: [] }),
      },
      storage,
    );
    expect(pullRequestNamedFilters(readPullRequestListPreferences(storage))).toEqual({});
  });
});

it("loads unfiltered facets only while open and preserves environment/project/host scope", () => {
  const scope = {
    open: true,
    involvement: "reviewing" as const,
    host: "git.example.test",
    projectId: ProjectId.make("project-1"),
    environments: [
      { environmentId: EnvironmentId.make("env-1"), projectIds: [ProjectId.make("project-1")] },
      { environmentId: EnvironmentId.make("env-2") },
    ],
  };
  expect(pullRequestFacetTargets({ ...scope, open: false })).toEqual([]);
  for (const target of pullRequestFacetTargets(scope)) {
    expect(decodeFacetInput(target.input)).toEqual(target.input);
  }
  expect(pullRequestFacetTargets(scope)).toEqual([
    {
      environmentId: "env-1",
      input: {
        state: "all",
        involvement: "reviewing",
        limit: 99,
        projectId: "project-1",
        projectIds: ["project-1"],
        host: "git.example.test",
      },
    },
    {
      environmentId: "env-2",
      input: {
        state: "all",
        involvement: "reviewing",
        limit: 99,
        projectId: "project-1",
        host: "git.example.test",
      },
    },
  ]);
});
