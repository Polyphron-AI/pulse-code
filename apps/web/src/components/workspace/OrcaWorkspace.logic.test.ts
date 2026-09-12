import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentManager } from "@t3tools/client-runtime/state/managers";
import {
  EnvironmentId,
  ManagerId,
  managerThreadOrigin,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildSeniorCrewPrompt,
  buildWorkspaceArgoOptions,
  buildWorkspaceCycleRows,
  buildWorkspaceOverview,
  filterWorkspaceRows,
  filterWorkspaceRowsByArgo,
  soleSelectedArgo,
  pageWorkspaceRows,
  resolveWorkspaceThreadStatus,
  summarizeWorkspaceThreads,
  workspaceCheckIn,
  workspaceProviderKey,
} from "./OrcaWorkspace.logic";

const environmentId = EnvironmentId.make("environment-local");
const projectId = ProjectId.make("project-1");
const connectedEnvironmentIds = new Set([environmentId]);

function thread(
  id: string,
  overrides: Partial<EnvironmentThreadShell> = {},
): EnvironmentThreadShell {
  return {
    environmentId,
    id: ThreadId.make(id),
    projectId,
    title: `Thread ${id}`,
    modelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.6-sol",
    },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: "main",
    worktreePath: null,
    latestTurn: null,
    createdAt: "2026-09-01T08:00:00.000Z",
    updatedAt: "2026-09-01T09:00:00.000Z",
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    ...overrides,
  };
}

describe("resolveWorkspaceThreadStatus", () => {
  it("keeps attention precedence ahead of running and failed state", () => {
    expect(
      resolveWorkspaceThreadStatus(
        thread("approval", {
          hasPendingApprovals: true,
          hasPendingUserInput: true,
          session: {
            threadId: ThreadId.make("approval"),
            status: "error",
            providerName: "Codex",
            providerInstanceId: ProviderInstanceId.make("codex"),
            runtimeMode: "full-access",
            activeTurnId: null,
            lastError: "failed",
            updatedAt: "2026-09-01T08:00:00.000Z",
          },
        }),
      ),
    ).toBe("approval");
  });

  it("uses background liveness only after session state", () => {
    expect(resolveWorkspaceThreadStatus(thread("working", { backgroundLiveness: "working" }))).toBe(
      "working",
    );
    expect(
      resolveWorkspaceThreadStatus(thread("monitoring", { backgroundLiveness: "monitoring" })),
    ).toBe("monitoring");
  });

  it("shows a failed session ahead of stale background work", () => {
    expect(
      resolveWorkspaceThreadStatus(
        thread("failed", {
          backgroundLiveness: "working",
          session: {
            threadId: ThreadId.make("failed"),
            status: "error",
            providerName: "Oh My Pi",
            providerInstanceId: ProviderInstanceId.make("omp"),
            runtimeMode: "full-access",
            activeTurnId: null,
            lastError: "Provider stopped",
            updatedAt: "2026-09-01T08:30:00.000Z",
          },
        }),
      ),
    ).toBe("failed");
  });
});

describe("workspace overview", () => {
  const ompInstanceId = ProviderInstanceId.make("omp_product");
  const providerByKey = new Map([
    [
      workspaceProviderKey(environmentId, ompInstanceId),
      { driverKind: ProviderDriverKind.make("omp"), displayName: "OMP Product" },
    ],
  ]);
  const projects = [
    {
      environmentId,
      id: projectId,
      title: "Pulse Code",
      workspaceRoot: "/repo",
      defaultModelSelection: null,
      scripts: [],
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T09:00:00.000Z",
    },
  ];

  it("sorts attention first and resolves custom OMP instances exactly", () => {
    const overview = buildWorkspaceOverview({
      threads: [
        thread("ready"),
        thread("omp", {
          modelSelection: { instanceId: ompInstanceId, model: "anthropic/claude-sonnet" },
          session: {
            threadId: ThreadId.make("omp"),
            status: "running",
            providerName: "Oh My Pi",
            providerInstanceId: ompInstanceId,
            runtimeMode: "full-access",
            activeTurnId: null,
            lastError: null,
            updatedAt: "2026-09-01T08:30:00.000Z",
          },
        }),
        thread("input", { hasPendingUserInput: true }),
      ],
      projects,
      providerByKey,
      environmentLabelById: new Map([[environmentId, "Local"]]),
      connectedEnvironmentIds,
    });

    expect(overview.rows.map((row) => row.status)).toEqual(["input", "working", "ready"]);
    expect(overview.rows.find((row) => row.threadId === ThreadId.make("omp"))).toMatchObject({
      isOmp: true,
      providerDisplayName: "OMP Product",
      projectTitle: "Pulse Code",
    });
    expect(overview.counts).toMatchObject({ total: 3, attention: 1, working: 1, omp: 1 });
  });

  it("filters by state, OMP identity, and text without including archived work", () => {
    const overview = buildWorkspaceOverview({
      threads: [
        thread("omp", {
          title: "Improve composer flow",
          modelSelection: { instanceId: ompInstanceId, model: "openai/gpt-5" },
        }),
        thread("attention", { hasPendingApprovals: true }),
        thread("archived", { archivedAt: "2026-09-01T10:00:00.000Z" }),
      ],
      projects,
      providerByKey,
      environmentLabelById: new Map([[environmentId, "Local"]]),
      connectedEnvironmentIds,
    });

    expect(filterWorkspaceRows(overview.rows, "omp", "composer")).toHaveLength(1);
    expect(filterWorkspaceRows(overview.rows, "attention", "")).toHaveLength(1);
    expect(overview.rows.some((row) => row.threadId === ThreadId.make("archived"))).toBe(false);
  });

  it("labels disconnected rows as last-known and excludes them from live status filters", () => {
    const remoteEnvironmentId = EnvironmentId.make("environment-remote");
    const overview = buildWorkspaceOverview({
      threads: [
        thread("connected-working", { backgroundLiveness: "working" }),
        {
          ...thread("remote-approval", { hasPendingApprovals: true }),
          environmentId: remoteEnvironmentId,
        },
      ],
      projects,
      providerByKey,
      environmentLabelById: new Map([
        [environmentId, "Local"],
        [remoteEnvironmentId, "Remote"],
      ]),
      connectedEnvironmentIds,
    });

    expect(overview.rows.map((row) => row.threadId)).toEqual([
      ThreadId.make("connected-working"),
      ThreadId.make("remote-approval"),
    ]);
    expect(overview.rows[1]).toMatchObject({
      status: "approval",
      isEnvironmentConnected: false,
    });
    expect(overview.counts).toMatchObject({
      total: 2,
      connected: 1,
      lastKnown: 1,
      attention: 0,
      working: 1,
    });
    expect(filterWorkspaceRows(overview.rows, "attention", "")).toHaveLength(0);
    expect(workspaceCheckIn(overview.counts)).toBe(
      "1 thread is moving. Nothing currently needs your input. 1 thread from a disconnected environment is shown as last known.",
    );
  });

  it("scopes identical instance ids by environment and sinks malformed timestamps", () => {
    const remoteEnvironmentId = EnvironmentId.make("environment-remote");
    const sharedInstanceId = ProviderInstanceId.make("omp_product");
    const overview = buildWorkspaceOverview({
      threads: [
        thread("local-old", {
          modelSelection: { instanceId: sharedInstanceId, model: "local/model" },
          updatedAt: "not-a-date",
        }),
        {
          ...thread("remote-new", {
            modelSelection: { instanceId: sharedInstanceId, model: "remote/model" },
            updatedAt: "2026-09-01T12:00:00.000Z",
          }),
          environmentId: remoteEnvironmentId,
        },
      ],
      projects,
      providerByKey: new Map([
        [
          workspaceProviderKey(environmentId, sharedInstanceId),
          { driverKind: ProviderDriverKind.make("omp"), displayName: "Local OMP" },
        ],
        [
          workspaceProviderKey(remoteEnvironmentId, sharedInstanceId),
          { driverKind: ProviderDriverKind.make("omp"), displayName: "Remote OMP" },
        ],
      ]),
      environmentLabelById: new Map([
        [environmentId, "Local"],
        [remoteEnvironmentId, "Remote"],
      ]),
      connectedEnvironmentIds: new Set([environmentId, remoteEnvironmentId]),
    });

    expect(overview.rows.map((row) => row.providerDisplayName)).toEqual([
      "Remote OMP",
      "Local OMP",
    ]);
  });

  it("pages large ledgers without making later rows unreachable", () => {
    const rows = Array.from(
      { length: 205 },
      (_, index) =>
        buildWorkspaceOverview({
          threads: [thread(`thread-${index}`)],
          projects,
          providerByKey,
          environmentLabelById: new Map([[environmentId, "Local"]]),
          connectedEnvironmentIds,
        }).rows[0],
    ).filter((row): row is NonNullable<typeof row> => row !== undefined);

    expect(pageWorkspaceRows(rows, 100)).toMatchObject({
      rows: expect.arrayContaining([rows[99]]),
      remaining: 105,
    });
    expect(pageWorkspaceRows(rows, 200)).toMatchObject({
      rows: expect.arrayContaining([rows[199]]),
      remaining: 5,
    });
    expect(pageWorkspaceRows(rows, 300)).toEqual({ rows, remaining: 0 });
  });
});

describe("workspace summaries and crew brief", () => {
  it("counts only visible threads and writes a compact deterministic check-in", () => {
    const counts = summarizeWorkspaceThreads(
      [
        thread("working", { backgroundLiveness: "working" }),
        thread("attention", { hasPendingApprovals: true }),
        thread("archived", { archivedAt: "2026-09-01T10:00:00.000Z" }),
      ],
      connectedEnvironmentIds,
    );
    expect(counts).toEqual({
      total: 2,
      connected: 2,
      lastKnown: 0,
      attention: 1,
      working: 1,
      failed: 0,
      ready: 0,
    });
    expect(workspaceCheckIn({ ...counts, omp: 0, argo: 0 })).toBe(
      "1 thread needs your attention. 1 is moving.",
    );
  });

  it("seeds all three engineering lenses without claiming copied context", () => {
    const prompt = buildSeniorCrewPrompt({
      task: "Make the workspace easier to scan.",
      sourceThread: {
        title: "Workspace audit",
        environmentId,
        threadId: ThreadId.make("source"),
      },
    });
    expect(prompt).toContain("Human UX");
    expect(prompt).toContain("Efficiency");
    expect(prompt).toContain("Effectiveness");
    expect(prompt).toContain("reference only");
    expect(prompt).toContain("Make the workspace easier to scan.");
  });
});

describe("fleet view Argo column", () => {
  const managerId = ManagerId.make("manager-1");
  const otherManagerId = ManagerId.make("manager-2");
  const managerThreadId = ThreadId.make("thread-argo");

  function argo(overrides: Partial<EnvironmentManager> = {}): EnvironmentManager {
    return {
      environmentId,
      id: managerId,
      name: "Nightly triage",
      scope: { kind: "environment", projectIds: [] },
      mission: "Keep the queue empty.",
      childModelSelection: null,
      childRuntimeMode: "auto-accept-edits",
      maxChildren: 8,
      intervalMinutes: 30,
      threadId: managerThreadId,
      pausedAt: null,
      lastCycleAt: null,
      createdAt: "2026-09-01T08:00:00.000Z",
      updatedAt: "2026-09-01T08:00:00.000Z",
      deletedAt: null,
      ...overrides,
    } as EnvironmentManager;
  }

  function overview(managers: ReadonlyArray<EnvironmentManager>) {
    return buildWorkspaceOverview({
      threads: [
        thread("thread-argo", { origin: managerThreadOrigin(managerId) }),
        thread("thread-child", { origin: managerThreadOrigin(managerId) }),
        thread("thread-plain"),
      ],
      projects: [],
      providerByKey: new Map(),
      environmentLabelById: new Map([[environmentId, "Local"]]),
      connectedEnvironmentIds,
      managers,
    });
  }

  it("names the owning Argo on every thread it owns, and counts them", () => {
    const result = overview([argo()]);
    const byId = new Map(result.rows.map((row) => [row.threadId, row] as const));

    expect(byId.get(ThreadId.make("thread-child"))?.managerName).toBe("Nightly triage");
    expect(byId.get(ThreadId.make("thread-argo"))?.managerId).toBe(managerId);
    expect(byId.get(ThreadId.make("thread-plain"))?.managerName).toBeNull();
    expect(result.counts.argo).toBe(2);
  });

  it("filters to Argo work, and then to a chosen Argo", () => {
    const result = overview([argo()]);

    expect(filterWorkspaceRows(result.rows, "argo", "").map((row) => row.threadId)).toEqual([
      ThreadId.make("thread-argo"),
      ThreadId.make("thread-child"),
    ]);
    expect(filterWorkspaceRowsByArgo(result.rows, new Set()).length).toBe(3);
    expect(filterWorkspaceRowsByArgo(result.rows, new Set([otherManagerId])).length).toBe(0);
    expect(filterWorkspaceRowsByArgo(result.rows, new Set([managerId])).length).toBe(2);
    expect(filterWorkspaceRows(result.rows, "all", "nightly").length).toBe(2);
  });

  it("offers only live Argos, and opens the cycle log for exactly one", () => {
    const options = buildWorkspaceArgoOptions([
      argo({ id: otherManagerId, name: "Alpha" }),
      argo(),
      argo({
        id: ManagerId.make("manager-3"),
        name: "Gone",
        deletedAt: "2026-09-02T00:00:00.000Z",
      }),
    ]);

    expect(options.map((option) => option.name)).toEqual(["Alpha", "Nightly triage"]);
    expect(soleSelectedArgo(options, new Set())).toBeNull();
    expect(soleSelectedArgo(options, new Set([managerId, otherManagerId]))).toBeNull();
    expect(soleSelectedArgo(options, new Set([managerId]))?.name).toBe("Nightly triage");
  });

  it("renders the cycle log newest first and names children by title", () => {
    const rows = buildWorkspaceCycleRows({
      activities: [
        {
          kind: "manager.cycle",
          payload: {
            kind: "spawned",
            threadId: "thread-child",
            summary: "Started #42",
            occurredAt: "2026-09-01T10:00:00.000Z",
          },
        },
        {
          kind: "manager.cycle",
          payload: {
            kind: "idle",
            summary: "Nothing to do",
            occurredAt: "2026-09-01T11:00:00.000Z",
          },
        },
        { kind: "message", payload: { kind: "spawned" } },
      ],
      threadTitleById: new Map([[ThreadId.make("thread-child"), "Fix the flake"]]),
    });

    expect(rows.map((row) => row.kindLabel)).toEqual(["Idle", "Spawned"]);
    expect(rows[0]?.childTitle).toBe("");
    expect(rows[1]?.childTitle).toBe("Fix the flake");
    expect(rows[1]?.summary).toBe("Started #42");
  });
});
