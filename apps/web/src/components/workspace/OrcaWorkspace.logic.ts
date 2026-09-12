import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import {
  MANAGER_CYCLE_KIND_LABELS,
  managerCycleEntries,
  managerForThread,
  type EnvironmentManager,
  type ManagerCycleKind,
} from "@t3tools/client-runtime/state/managers";
import type {
  EnvironmentId,
  ManagerId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";

export type WorkspaceThreadStatus =
  | "approval"
  | "input"
  | "working"
  | "monitoring"
  | "failed"
  | "ready";

export type WorkspaceFilter = "all" | "attention" | "working" | "omp" | "argo";

export interface WorkspaceProviderInfo {
  readonly driverKind: ProviderDriverKind;
  readonly displayName: string;
}

export interface WorkspaceThreadRow {
  readonly key: string;
  readonly environmentId: EnvironmentThreadShell["environmentId"];
  readonly threadId: EnvironmentThreadShell["id"];
  readonly projectId: EnvironmentThreadShell["projectId"];
  readonly title: string;
  readonly projectTitle: string;
  readonly environmentLabel: string;
  readonly providerInstanceId: ProviderInstanceId;
  readonly providerDriverKind: ProviderDriverKind | null;
  readonly providerDisplayName: string;
  readonly model: string;
  readonly branch: string | null;
  readonly status: WorkspaceThreadStatus;
  readonly planProgress: EnvironmentThreadShell["planProgress"];
  readonly updatedAt: string;
  readonly isOmp: boolean;
  readonly isEnvironmentConnected: boolean;
  /** The Argo that owns this thread, if any. Children and control threads both. */
  readonly managerId: ManagerId | null;
  readonly managerName: string | null;
}

export interface WorkspaceCounts {
  readonly total: number;
  readonly connected: number;
  readonly lastKnown: number;
  readonly attention: number;
  readonly working: number;
  readonly failed: number;
  readonly ready: number;
  readonly omp: number;
  readonly argo: number;
}

export interface WorkspaceOverview {
  readonly rows: ReadonlyArray<WorkspaceThreadRow>;
  readonly counts: WorkspaceCounts;
}

const STATUS_SORT_ORDER: Readonly<Record<WorkspaceThreadStatus, number>> = {
  approval: 0,
  input: 1,
  failed: 2,
  working: 3,
  monitoring: 4,
  ready: 5,
};

export const WORKSPACE_STATUS_LABELS: Readonly<Record<WorkspaceThreadStatus, string>> = {
  approval: "Needs approval",
  input: "Needs input",
  working: "Working",
  monitoring: "Monitoring",
  failed: "Failed",
  ready: "Ready",
};

export function workspaceProviderKey(
  environmentId: EnvironmentId,
  instanceId: ProviderInstanceId,
): string {
  return `${environmentId}:${instanceId}`;
}

export function resolveWorkspaceThreadStatus(
  thread: Pick<
    EnvironmentThreadShell,
    "hasPendingApprovals" | "hasPendingUserInput" | "session" | "backgroundLiveness"
  >,
): WorkspaceThreadStatus {
  if (thread.hasPendingApprovals) return "approval";
  if (thread.hasPendingUserInput) return "input";
  if (thread.session?.status === "running" || thread.session?.status === "starting") {
    return "working";
  }
  if (thread.session?.status === "error") return "failed";
  if (thread.backgroundLiveness === "working") return "working";
  if (thread.backgroundLiveness === "monitoring") return "monitoring";
  return "ready";
}

function parseTimestamp(isoDate: string): number {
  const parsed = Date.parse(isoDate);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function projectKey(environmentId: EnvironmentId, projectId: EnvironmentProject["id"]): string {
  return `${environmentId}:${projectId}`;
}

export function summarizeWorkspaceThreads(
  threads: ReadonlyArray<EnvironmentThreadShell>,
  connectedEnvironmentIds: ReadonlySet<EnvironmentId>,
): Pick<
  WorkspaceCounts,
  "total" | "connected" | "lastKnown" | "attention" | "working" | "failed" | "ready"
> {
  let total = 0;
  let connected = 0;
  let lastKnown = 0;
  let attention = 0;
  let working = 0;
  let failed = 0;
  let ready = 0;

  for (const thread of threads) {
    if (thread.archivedAt !== null) continue;
    total += 1;
    if (!connectedEnvironmentIds.has(thread.environmentId)) {
      lastKnown += 1;
      continue;
    }
    connected += 1;
    const status = resolveWorkspaceThreadStatus(thread);
    if (status === "approval" || status === "input" || status === "failed") attention += 1;
    if (status === "working" || status === "monitoring") working += 1;
    if (status === "failed") failed += 1;
    if (status === "ready") ready += 1;
  }

  return { total, connected, lastKnown, attention, working, failed, ready };
}

export function buildWorkspaceOverview(input: {
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly projects: ReadonlyArray<EnvironmentProject>;
  readonly providerByKey: ReadonlyMap<string, WorkspaceProviderInfo>;
  readonly environmentLabelById: ReadonlyMap<EnvironmentId, string>;
  readonly connectedEnvironmentIds: ReadonlySet<EnvironmentId>;
  readonly managers?: ReadonlyArray<EnvironmentManager>;
}): WorkspaceOverview {
  const managerByKey = new Map(
    (input.managers ?? []).map(
      (manager) => [`${manager.environmentId}:${manager.id}`, manager] as const,
    ),
  );
  const projectByKey = new Map(
    input.projects.map(
      (project) => [projectKey(project.environmentId, project.id), project] as const,
    ),
  );
  let omp = 0;
  let argo = 0;

  const rows = input.threads
    .filter((thread) => thread.archivedAt === null)
    .map((thread): WorkspaceThreadRow => {
      const provider = input.providerByKey.get(
        workspaceProviderKey(thread.environmentId, thread.modelSelection.instanceId),
      );
      const isOmp = provider?.driverKind === "omp";
      const isEnvironmentConnected = input.connectedEnvironmentIds.has(thread.environmentId);
      if (isOmp) omp += 1;
      const project = projectByKey.get(projectKey(thread.environmentId, thread.projectId));
      const managerId = managerForThread(thread);
      const manager =
        managerId === null
          ? null
          : (managerByKey.get(`${thread.environmentId}:${managerId}`) ?? null);
      if (managerId !== null) argo += 1;
      return {
        key: `${thread.environmentId}:${thread.id}`,
        environmentId: thread.environmentId,
        threadId: thread.id,
        projectId: thread.projectId,
        title: thread.title,
        projectTitle: project?.title ?? "Unknown project",
        environmentLabel:
          input.environmentLabelById.get(thread.environmentId) ?? "Unknown environment",
        providerInstanceId: thread.modelSelection.instanceId,
        providerDriverKind: provider?.driverKind ?? null,
        providerDisplayName: provider?.displayName ?? thread.modelSelection.instanceId,
        model: thread.modelSelection.model,
        branch: thread.branch,
        status: resolveWorkspaceThreadStatus(thread),
        planProgress: thread.planProgress,
        updatedAt: thread.updatedAt,
        isOmp,
        isEnvironmentConnected,
        managerId,
        managerName: manager?.name ?? null,
      };
    })
    .sort((left, right) => {
      if (left.isEnvironmentConnected !== right.isEnvironmentConnected) {
        return left.isEnvironmentConnected ? -1 : 1;
      }
      const statusDelta = STATUS_SORT_ORDER[left.status] - STATUS_SORT_ORDER[right.status];
      if (statusDelta !== 0) return statusDelta;
      const updatedDelta = parseTimestamp(right.updatedAt) - parseTimestamp(left.updatedAt);
      return updatedDelta !== 0 ? updatedDelta : left.key.localeCompare(right.key);
    });

  const summary = summarizeWorkspaceThreads(input.threads, input.connectedEnvironmentIds);
  return {
    rows,
    counts: { ...summary, omp, argo },
  };
}

export function filterWorkspaceRows(
  rows: ReadonlyArray<WorkspaceThreadRow>,
  filter: WorkspaceFilter,
  query: string,
): ReadonlyArray<WorkspaceThreadRow> {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  return rows.filter((row) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "attention" &&
        row.isEnvironmentConnected &&
        (row.status === "approval" || row.status === "input" || row.status === "failed")) ||
      (filter === "working" &&
        row.isEnvironmentConnected &&
        (row.status === "working" || row.status === "monitoring")) ||
      (filter === "omp" && row.isOmp) ||
      (filter === "argo" && row.managerId !== null);
    if (!matchesFilter) return false;
    if (!normalizedQuery) return true;
    return [
      row.title,
      row.projectTitle,
      row.environmentLabel,
      row.providerDisplayName,
      row.model,
      row.branch ?? "",
      row.managerName ?? "",
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
  });
}

export function pageWorkspaceRows(
  rows: ReadonlyArray<WorkspaceThreadRow>,
  visibleLimit: number,
): {
  readonly rows: ReadonlyArray<WorkspaceThreadRow>;
  readonly remaining: number;
} {
  const safeLimit = Math.max(0, Math.floor(visibleLimit));
  const visibleRows = rows.slice(0, safeLimit);
  return {
    rows: visibleRows,
    remaining: Math.max(0, rows.length - visibleRows.length),
  };
}

export function workspaceCheckIn(counts: WorkspaceCounts): string {
  const lastKnownSuffix =
    counts.lastKnown === 0
      ? ""
      : ` ${counts.lastKnown} ${
          counts.lastKnown === 1
            ? "thread from a disconnected environment is"
            : "threads from disconnected environments are"
        } shown as last known.`;

  if (counts.total === 0) return "No active threads yet.";
  if (counts.connected === 0) {
    return `No connected thread state.${lastKnownSuffix}`;
  }
  if (counts.attention > 0) {
    const moving =
      counts.working === 0
        ? "No connected threads are moving."
        : `${counts.working} ${counts.working === 1 ? "is" : "are"} moving.`;
    return `${counts.attention} ${counts.attention === 1 ? "thread needs" : "threads need"} your attention. ${moving}${lastKnownSuffix}`;
  }
  if (counts.working > 0) {
    return `${counts.working} ${counts.working === 1 ? "thread is" : "threads are"} moving. Nothing currently needs your input.${lastKnownSuffix}`;
  }
  return `All connected threads are ready for review or follow-up.${lastKnownSuffix}`;
}

export function buildSeniorCrewPrompt(input: {
  readonly task: string;
  readonly sourceThread?: {
    readonly title: string;
    readonly environmentId: EnvironmentId;
    readonly threadId: EnvironmentThreadShell["id"];
  };
}): string {
  const source = input.sourceThread
    ? `\n\nRelated Pulse thread: “${input.sourceThread.title}” (${input.sourceThread.environmentId}/${input.sourceThread.threadId}). Treat this as a reference only; inspect the repository and verify the current state instead of assuming its conversation was copied.`
    : "";

  return `Work as a senior AI engineering crew with three explicit lenses:\n\n- Human UX: protect clarity, accessibility, and user control.\n- Efficiency: minimize latency, unnecessary work, and operational friction.\n- Effectiveness: verify that the result solves the stated problem and is testable.\n\nUse OMP's internal delegation when it materially improves the outcome. Keep one accountable implementation path, surface tradeoffs briefly, and verify the work before reporting completion.\n\nTask:\n${input.task.trim()}${source}`;
}

export interface WorkspaceArgoOption {
  readonly managerId: ManagerId;
  readonly name: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId | null;
}

/** The Argo filter list, sorted the way the sidebar sorts it. */
export function buildWorkspaceArgoOptions(
  managers: ReadonlyArray<EnvironmentManager>,
): ReadonlyArray<WorkspaceArgoOption> {
  return managers
    .filter((manager) => manager.deletedAt === null)
    .map((manager) => ({
      managerId: manager.id,
      name: manager.name,
      environmentId: manager.environmentId,
      threadId: manager.threadId,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

/** An empty selection means "every Argo", the same way the search box does. */
export function filterWorkspaceRowsByArgo(
  rows: ReadonlyArray<WorkspaceThreadRow>,
  selected: ReadonlySet<ManagerId>,
): ReadonlyArray<WorkspaceThreadRow> {
  if (selected.size === 0) return rows;
  return rows.filter((row) => row.managerId !== null && selected.has(row.managerId));
}

/** The cycle table only makes sense for one Argo at a time. */
export function soleSelectedArgo(
  options: ReadonlyArray<WorkspaceArgoOption>,
  selected: ReadonlySet<ManagerId>,
): WorkspaceArgoOption | null {
  if (selected.size !== 1) return null;
  const [managerId] = [...selected];
  return options.find((option) => option.managerId === managerId) ?? null;
}

export interface WorkspaceCycleRow {
  readonly key: string;
  readonly occurredAt: string;
  readonly kind: ManagerCycleKind;
  readonly kindLabel: string;
  readonly childTitle: string;
  readonly summary: string;
}

/**
 * Turns an Argo's `manager.cycle` activities into the fleet-view table,
 * newest first, naming children by their thread title where we have one.
 */
export function buildWorkspaceCycleRows(input: {
  readonly activities: ReadonlyArray<{
    readonly kind: string;
    readonly payload?: unknown;
    readonly createdAt?: string | undefined;
  }>;
  readonly threadTitleById: ReadonlyMap<ThreadId, string>;
}): ReadonlyArray<WorkspaceCycleRow> {
  return managerCycleEntries(input.activities)
    .map((entry, index): WorkspaceCycleRow => {
      const title =
        entry.threadId === null ? null : (input.threadTitleById.get(entry.threadId) ?? null);
      return {
        key: `${entry.occurredAt}:${index}`,
        occurredAt: entry.occurredAt,
        kind: entry.kind,
        kindLabel: MANAGER_CYCLE_KIND_LABELS[entry.kind],
        childTitle: title ?? (entry.threadId === null ? "" : entry.threadId),
        summary: entry.summary,
      };
    })
    .sort((left, right) => {
      const delta = parseTimestamp(right.occurredAt) - parseTimestamp(left.occurredAt);
      return delta !== 0 ? delta : left.key.localeCompare(right.key);
    });
}
