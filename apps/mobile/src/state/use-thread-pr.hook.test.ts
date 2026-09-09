import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
const state = vi.hoisted(() => ({
  summary: null as unknown,
  vcs: null as unknown,
  queries: [] as { mode: string; environmentId: string; input: { number?: number } }[],
  values: new Map<unknown, unknown>(),
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: (atom: unknown) => state.values.get(atom) ?? null,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useLayoutEffect: (run: () => void) => run(),
}));
vi.mock("./atom-registry", () => ({
  appAtomRegistry: {
    modify: (atom: unknown, update: (previous: unknown) => [boolean, unknown]) => {
      state.values.set(atom, update(state.values.get(atom) ?? null)[1]);
    },
  },
}));
vi.mock("../connection/runtime", () => ({ connectionAtomRuntime: {} }));
vi.mock("./vcs", () => ({
  vcsEnvironment: { status: (args: object) => ({ mode: "vcs", ...args }) },
}));
vi.mock("./query", () => ({
  useEnvironmentQuery: (
    query: { mode: string; environmentId: string; input: { number?: number } } | null,
  ) => {
    if (query) state.queries.push(query);
    return { data: query === null ? null : query.mode === "vcs" ? state.vcs : state.summary };
  },
}));
vi.mock("@t3tools/client-runtime/state/pull-requests", async (original) => ({
  ...(await original<typeof import("@t3tools/client-runtime/state/pull-requests")>()),
  createLinkedPullRequestSummaryAtomFamily: () => (args: object) => ({ mode: "summary", ...args }),
  createLinkedPullRequestDetailAtomFamily: () => (args: object) => ({ mode: "detail", ...args }),
}));
import { useThreadPr } from "./use-thread-pr";
const ref = {
  projectId: "project",
  repository: "owner/repo",
  number: 4,
  url: "https://example.com/4",
};
const thread = (fields: object) =>
  ({
    environmentId: "remote",
    id: "thread",
    projectId: "project",
    branch: "feature",
    worktreePath: null,
    ...fields,
  }) as EnvironmentThreadShell;
const summary = (status: string, updatedAt = "2026-09-09T00:00:00.000Z") => ({
  ...ref,
  title: "Feature",
  provider: "github",
  headBranch: "feature",
  baseBranch: "main",
  state: status,
  updatedAt,
});
beforeEach(() => {
  state.summary = null;
  state.vcs = null;
  state.queries = [];
  state.values.clear();
});
describe("mobile canonical PR reads", () => {
  it("uses summary for server links, gives explicit links priority, and avoids checkout reads", () => {
    state.summary = summary("open");
    expect(useThreadPr(thread({ branchPullRequest: ref }), "/repo")?.number).toBe(4);
    expect(state.queries.map((query) => query.mode)).toEqual(["summary"]);
    state.queries = [];
    useThreadPr(
      thread({ linkedPullRequest: { ...ref, number: 7 }, branchPullRequest: ref }),
      "/repo",
    );
    expect(state.queries[0]?.input.number).toBe(7);
    state.queries = [];
    expect(useThreadPr(thread({ branchPullRequest: null }), "/repo")).toBeNull();
    expect(state.queries).toEqual([]);
  });
  it("retains legacy detail and checkout queries while old servers omit branch metadata", () => {
    useThreadPr(thread({ linkedPullRequest: ref }), "/repo");
    expect(state.queries.map((query) => query.mode)).toEqual(["detail"]);
    state.queries = [];
    useThreadPr(thread({}), "/repo");
    expect(state.queries.map((query) => query.mode)).toEqual(["vcs"]);
  });
  it("retains a merged observation across stale reads and isolates other environments and references", () => {
    state.summary = summary("merged", "2026-09-09T00:01:00.000Z");
    useThreadPr(thread({ branchPullRequest: ref }), "/repo");
    state.summary = summary("open");
    expect(useThreadPr(thread({ branchPullRequest: ref }), "/repo")?.state).toBe("merged");
    state.summary = null;
    expect(useThreadPr(thread({ branchPullRequest: ref }), "/repo")?.state).toBe("merged");
    expect(
      useThreadPr(thread({ environmentId: "other", branchPullRequest: ref }), "/repo"),
    ).toBeNull();
    expect(useThreadPr(thread({ branchPullRequest: { ...ref, number: 8 } }), "/repo")).toBeNull();
  });
});
