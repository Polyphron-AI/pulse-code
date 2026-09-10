import { describe, expect, it } from "vite-plus/test";
import { pullRequestNamedFilters } from "./pullRequestNamedFilters.logic";
import {
  readPullRequestListPreferences,
  writePullRequestListPreferences,
} from "./pullRequestListPreferences";

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
