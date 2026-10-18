import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type ThreadPullRequestLink,
  type WorkspaceLinkView,
} from "@t3tools/contracts";
import { expect, it } from "vite-plus/test";
import { collectProjectPullRequests } from "./projectPullRequests.ts";

const environmentId = EnvironmentId.make("remote");
const projectId = ProjectId.make("synkek");
const pr = (host: string): ThreadPullRequestLink => ({
  host,
  repository: "synkek/site",
  number: 42,
  url: `https://${host}/synkek/site/pull/42`,
  source: "manual",
  linkedAt: "2026-10-13T07:00:00Z",
  snapshot: null,
  stack: null,
});
const thread = (id = "a", links = [pr("github.com")]) => ({
  environmentId,
  projectId,
  id: ThreadId.make(id),
  title: id === "a" ? "Design" : "Build",
  pullRequests: links,
});
const projectLink = (ref: WorkspaceLinkView["item"]["ref"], index = 1): WorkspaceLinkView => ({
  id: `wl_00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
  item: { ref },
  status: "confirmed",
  source: { type: "user" },
  updatedAt: "2026-10-13T07:00:00Z",
});
const collect = (overrides: Partial<Parameters<typeof collectProjectPullRequests>[0]> = {}) =>
  collectProjectPullRequests({
    environmentId,
    projectId,
    threadsComplete: true,
    linksComplete: true,
    linkMode: "multiple",
    projectLinks: [],
    threads: [thread()],
    ...overrides,
  });

it("deduplicates native PRs while preserving source threads and host identity", () => {
  const result = collectProjectPullRequests({
    environmentId,
    projectId,
    threadsComplete: true,
    linksComplete: true,
    linkMode: "multiple",
    projectLinks: [],
    threads: [
      {
        environmentId,
        projectId,
        id: ThreadId.make("a"),
        title: "Design",
        pullRequests: [pr("github.com")],
      },
      {
        environmentId,
        projectId,
        id: ThreadId.make("b"),
        title: "Build",
        pullRequests: [pr("github.com"), pr("github.enterprise.test")],
      },
    ],
  });
  expect(result.entries).toHaveLength(2);
  expect(
    result.entries
      .find((entry) => entry.key === "github.com/synkek/site#42")
      ?.provenance.map((edge) => edge.type),
  ).toEqual(["thread", "thread"]);
  expect(result.incomplete).toBe(false);
});

it("retains a direct URL and both native edges, removing only the selected edge", () => {
  const direct = projectLink({ type: "url", url: pr("github.com").url });
  const initial = collect({ projectLinks: [direct], threads: [thread(), thread("b")] });
  expect(initial.entries[0]?.provenance).toHaveLength(3);
  const removed = collect({ projectLinks: [direct], threads: [thread("a", []), thread("b")] });
  expect(removed.entries).toHaveLength(1);
  expect(removed.entries[0]?.provenance).toEqual(
    expect.arrayContaining([
      { type: "project-link", linkId: direct.id },
      { type: "thread", threadId: ThreadId.make("b"), title: "Build", url: pr("github.com").url },
    ]),
  );
  expect(collect({ threads: [thread("a", []), thread("b")] }).entries[0]?.provenance).toHaveLength(
    1,
  );
});

it("uses legacy single links rather than cached modern arrays after a capability downgrade", () => {
  const linkedPullRequest = {
    projectId,
    repository: "synkek/site",
    number: 7,
    url: "https://github.com/synkek/site/pull/7",
  };
  const shell = { ...thread(), linkedPullRequest };
  expect(
    collect({ threads: [shell], linkMode: "single" }).entries.map((entry) => entry.key),
  ).toEqual(["github.com/synkek/site#7"]);
  expect(collect({ threads: [{ ...shell, pullRequests: undefined }] }).entries[0]?.key).toBe(
    "github.com/synkek/site#7",
  );
  expect(collect({ threads: [{ ...shell, pullRequests: [] }] }).entries).toEqual([]);
  expect(collect({ threads: [shell], linkMode: "unsupported" }).entries).toEqual([]);
});

it.each(["single", "multiple"] as const)(
  "never resurrects a dismissed stack through legacy fallback in %s mode",
  (linkMode) => {
    const linked = pr("github.com");
    expect(
      collect({
        linkMode,
        threads: [
          {
            ...thread("a", [{ ...linked, source: "stack-dismissed" }]),
            linkedPullRequest: { projectId, ...linked },
          },
        ],
      }).entries,
    ).toEqual([]);
  },
);

it("normalizes URL identity while retaining original native URLs and unique provenance", () => {
  const url = "https://GITHUB.COM/SynKEK/Site/pull/42/files?view=split#diff";
  const shell = thread("a", [{ ...pr("github.com"), url }]);
  const direct = projectLink({ type: "url", url: "http://github.com/synkek/site/pull/42/" });
  const result = collect({ threads: [shell, shell], projectLinks: [direct, direct] });
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0]?.provenance).toHaveLength(2);
  expect(result.entries[0]?.provenance).toContainEqual({
    type: "thread",
    threadId: shell.id,
    title: "Design",
    url,
  });
});

it("keeps Forgejo authorities and ports distinct, including legacy keys", () => {
  const urls = [
    "http://forge.test:3000/owner/repo/pulls/42",
    "https://forge.test:444/owner/repo/pulls/42",
    "https://forge.test/owner/repo/pulls/42",
  ];
  const links = urls.map((url, index) => projectLink({ type: "url", url }, index + 1));
  const native = { ...pr("forge.test"), repository: "owner/repo", url: urls[0]! };
  const result = collect({ projectLinks: links, threads: [thread("a", [native])] });
  expect(result.entries.map((entry) => entry.key).sort()).toEqual(
    [
      "forge.test/owner/repo#42",
      "forge.test:3000/owner/repo#42",
      "forge.test:444/owner/repo#42",
    ].sort(),
  );
  expect(result.entries.find((entry) => entry.key.includes(":3000"))?.provenance).toHaveLength(2);
  expect(
    collect({
      linkMode: "single",
      threads: [{ ...thread(), linkedPullRequest: { ...native, projectId } }],
    }).entries[0]?.key,
  ).toBe("forge.test:3000/owner/repo#42");
});

it("preserves nested GitLab paths and rejects arbitrary URLs and suggestions", () => {
  const links = [
    projectLink({ type: "url", url: "https://git.test/group/sub/site/-/merge_requests/42" }),
    projectLink({ type: "url", url: "https://unknown.test/group/site/pull/42" }, 2),
    { ...projectLink({ type: "url", url: pr("github.com").url }, 3), status: "suggested" as const },
  ];
  expect(collect({ threads: [], projectLinks: links }).entries.map((entry) => entry.key)).toEqual([
    "git.test/group/sub/site#42",
  ]);
});

it("collects owned and directly linked sources only, filtering environment and deletion first", () => {
  const foreignProject = ProjectId.make("other");
  const direct = projectLink({ type: "thread", threadId: ThreadId.make("b") });
  const result = collect({
    projectLinks: [direct],
    threads: [
      thread(),
      { ...thread("b"), projectId: foreignProject },
      { ...thread("one-hop"), projectId: foreignProject },
      { ...thread("foreign"), environmentId: EnvironmentId.make("local") },
      { ...thread("deleted"), deletedAt: "2026-10-13T07:00:00Z" },
    ],
  });
  expect(
    result.entries[0]?.provenance.map((edge) => edge.type === "thread" && edge.threadId),
  ).toEqual(["a", "b"]);
  expect(result.incomplete).toBe(false);
});

it.each(["unloaded", "deleted", "foreign"])(
  "marks an explicitly linked %s source incomplete",
  (kind) => {
    const direct = projectLink({ type: "thread", threadId: ThreadId.make("missing") });
    const shell = {
      ...thread("missing"),
      ...(kind === "deleted"
        ? { deletedAt: "2026-10-13T07:00:00Z" }
        : { environmentId: EnvironmentId.make("elsewhere") }),
    };
    const result = collect({ projectLinks: [direct], threads: kind === "unloaded" ? [] : [shell] });
    expect(result.entries).toEqual([]);
    expect(result.incomplete).toBe(true);
  },
);

it("prefers an available snapshot without losing provenance", () => {
  const snapshot = {
    state: "merged" as const,
    title: "Publish the site",
    headBranch: "site",
    baseBranch: "main",
    isDraft: false,
    updatedAt: null,
    syncedAt: "2026-10-13T08:00:00Z",
  };
  const result = collect({ threads: [thread(), thread("b", [{ ...pr("github.com"), snapshot }])] });
  expect(result.entries[0]?.reference?.snapshot).toEqual(snapshot);
  expect(result.entries[0]?.provenance).toHaveLength(2);
});

it("bounds rows at 100 and keeps provenance for already displayed rows", () => {
  const projectLinks = Array.from({ length: 101 }, (_, index) =>
    projectLink(
      { type: "url", url: `https://github.com/synkek/site/pull/${index + 1}` },
      index + 1,
    ),
  );
  const result = collect({ projectLinks });
  expect(result.entries).toHaveLength(100);
  expect(result.incomplete).toBe(true);
  expect(result.entries.find((entry) => entry.key.endsWith("#42"))?.provenance).toHaveLength(2);
  expect(collect({ threads: [], projectLinks: projectLinks.slice(0, 100) }).incomplete).toBe(false);
});

it("bounds eligible source threads at 30 and carries upstream incompleteness", () => {
  const threads = Array.from({ length: 31 }, (_, index) => thread(String(index)));
  expect(collect({ threads }).entries[0]?.provenance).toHaveLength(30);
  expect(collect({ threads }).incomplete).toBe(true);
  expect(collect({ threads: threads.slice(0, 30) }).incomplete).toBe(false);
  expect(collect({ threadsComplete: false }).incomplete).toBe(true);
  expect(collect({ linksComplete: false }).incomplete).toBe(true);
});
