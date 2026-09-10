import { describe, expect, it } from "vite-plus/test";
import * as Result from "effect/Result";
import { decodeGitLabMergeRequestJson } from "./gitLabMergeRequests.ts";
import { decodeAzureDevOpsPullRequestJson } from "./azureDevOpsPullRequests.ts";
import { normalizeBitbucketPullRequestRecord } from "./bitbucketPullRequests.ts";

describe("provider draft state", () => {
  it.each([true, false, undefined])("preserves GitLab draft state %s", (draft) => {
    const result = decodeGitLabMergeRequestJson(
      JSON.stringify({
        iid: 7,
        title: "Change",
        web_url: "https://example.test/merge_requests/7",
        source_branch: "feature",
        target_branch: "main",
        state: "opened",
        draft,
      }),
    );
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) expect(result.success.isDraft === true).toBe(draft === true);
  });
  it("recognizes GitLab's older work-in-progress field", () => {
    const result = decodeGitLabMergeRequestJson(
      JSON.stringify({
        iid: 7,
        title: "Change",
        web_url: "https://example.test/merge_requests/7",
        source_branch: "feature",
        target_branch: "main",
        work_in_progress: true,
      }),
    );
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) expect(result.success.isDraft).toBe(true);
  });
  it.each([true, false, undefined])("preserves Azure draft state %s", (isDraft) => {
    const result = decodeAzureDevOpsPullRequestJson(
      JSON.stringify({
        pullRequestId: 7,
        title: "Change",
        sourceRefName: "refs/heads/feature",
        targetRefName: "refs/heads/main",
        status: "active",
        isDraft,
        _links: { web: { href: "https://example.test/pullrequest/7" } },
      }),
    );
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) expect(result.success.isDraft === true).toBe(isDraft === true);
  });
  it.each([true, false, undefined])("preserves Bitbucket draft state %s", (draft) => {
    const result = normalizeBitbucketPullRequestRecord({
      id: 7,
      title: "Change",
      state: "OPEN",
      ...(draft === undefined ? {} : { draft }),
      links: { html: { href: "https://example.test/pull-requests/7" } },
      source: { branch: { name: "feature" } },
      destination: { branch: { name: "main" } },
    });
    expect(result.isDraft === true).toBe(draft === true);
  });
});
