import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  ThreadId,
  type EnvironmentId,
  type IssueId,
  type IssueSeverity,
  type IssueStatus,
  type ProjectId,
} from "@t3tools/contracts";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  CircleAlertIcon,
  CircleDotIcon,
  FilterIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SearchIcon,
  SettingsIcon,
} from "lucide-react";
import { useEffect, useMemo } from "react";

import { IssueDetailPanel } from "../components/issues/IssueDetailPanel";
import { IssueList } from "../components/issues/IssueList";
import {
  ISSUE_SEVERITIES,
  ISSUE_SEVERITY_PRESENTATION,
  ISSUE_STATUSES,
  ISSUE_STATUS_PRESENTATION,
} from "../components/issues/issuePresentation";
import { RightPanelTabs } from "../components/RightPanelTabs";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { SidebarInset } from "../components/ui/sidebar";
import {
  type IssueSurface,
  selectActiveRightPanelSurface,
  selectThreadRightPanelState,
  useRightPanelStore,
} from "../rightPanelStore";
import { useAllEnvironmentShellsBootstrapped, useProjects } from "../state/entities";
import { useEnvironments } from "../state/environments";
import { type EnvironmentIssueEntry, useIssueConnections, useIssueList } from "../state/issues";
import { useDebouncedValue } from "../state/queries";
import { cn } from "~/lib/utils";

export interface IssuesSearch {
  readonly environmentId?: EnvironmentId;
  readonly projectId?: ProjectId;
  readonly status?: IssueStatus;
  readonly severity?: IssueSeverity;
  readonly assignee?: string;
  readonly q?: string;
  readonly issueId?: IssueId;
  readonly selectedEnvironmentId?: EnvironmentId;
  readonly selectedProjectId?: ProjectId;
  readonly limit: number;
}

type IssuesSearchPatch = {
  readonly [Key in keyof IssuesSearch]?: IssuesSearch[Key] | undefined;
};

export function parseIssuesSearch(raw: Record<string, unknown>): IssuesSearch {
  const status = ISSUE_STATUSES.find((candidate) => candidate === raw.status);
  const severity = ISSUE_SEVERITIES.find((candidate) => candidate === raw.severity);
  return {
    ...(typeof raw.environmentId === "string" && raw.environmentId
      ? { environmentId: raw.environmentId as EnvironmentId }
      : {}),
    ...(typeof raw.projectId === "string" && raw.projectId
      ? { projectId: raw.projectId as ProjectId }
      : {}),
    ...(status ? { status } : {}),
    ...(severity ? { severity } : {}),
    ...(typeof raw.assignee === "string" && raw.assignee
      ? { assignee: raw.assignee.slice(0, 256) }
      : {}),
    ...(typeof raw.q === "string" && raw.q ? { q: raw.q.slice(0, 500) } : {}),
    ...(typeof raw.issueId === "string" && raw.issueId ? { issueId: raw.issueId as IssueId } : {}),
    ...(typeof raw.selectedEnvironmentId === "string" && raw.selectedEnvironmentId
      ? { selectedEnvironmentId: raw.selectedEnvironmentId as EnvironmentId }
      : {}),
    ...(typeof raw.selectedProjectId === "string" && raw.selectedProjectId
      ? { selectedProjectId: raw.selectedProjectId as ProjectId }
      : {}),
    limit:
      typeof raw.limit === "number" && Number.isInteger(raw.limit)
        ? Math.max(20, Math.min(100, raw.limit))
        : 50,
  };
}

const ISSUES_PANEL_ENVIRONMENT_ID = "issues-panel" as EnvironmentId;
const ISSUES_PANEL_REF = scopeThreadRef(ISSUES_PANEL_ENVIRONMENT_ID, ThreadId.make("issues-panel"));
const EMPTY_PREVIEW_SESSIONS = {};
const EMPTY_PREVIEW_DESKTOP_STATE = {};
const EMPTY_TERMINAL_LABELS = new Map<string, string>();
const EMPTY_PENDING_SURFACES = new Set<string>();

export const Route = createFileRoute("/_chat/issues")({
  validateSearch: parseIssuesSearch,
  component: IssuesRouteView,
});

function IssuesRouteView() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { environments } = useEnvironments();
  const projects = useProjects();
  const projectsKnown = useAllEnvironmentShellsBootstrapped();
  const capableEnvironments = useMemo(
    () =>
      environments.filter(
        (environment) => environment.serverConfig?.environment.capabilities.issues === true,
      ),
    [environments],
  );
  const capableEnvironmentIds = useMemo(
    () => capableEnvironments.map((environment) => environment.environmentId),
    [capableEnvironments],
  );
  const connections = useIssueConnections(capableEnvironmentIds);
  const debouncedSearch = useDebouncedValue(search.q ?? "", 180);
  const listTargets = useMemo(
    () =>
      connections.values.flatMap(([target, snapshot]) =>
        snapshot.status !== "connected"
          ? []
          : snapshot.mappings.flatMap((mapping) => {
              if (search.environmentId && search.environmentId !== target.environmentId) return [];
              if (search.projectId && search.projectId !== mapping.projectId) return [];
              return [
                {
                  environmentId: target.environmentId,
                  input: {
                    projectId: mapping.projectId,
                    ...(search.status ? { status: search.status } : {}),
                    ...(search.severity ? { severities: [search.severity] } : {}),
                    ...(search.assignee ? { assignee: search.assignee } : {}),
                    ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
                    sort: "updated" as const,
                    limit: 100,
                    offset: 0,
                  },
                },
              ];
            }),
      ),
    [
      connections.values,
      debouncedSearch,
      search.assignee,
      search.environmentId,
      search.projectId,
      search.severity,
      search.status,
    ],
  );
  const issues = useIssueList(listTargets);
  const sortedEntries = useMemo(
    () =>
      [...issues.entries].sort(
        (left, right) => Date.parse(right.issue.updatedAt) - Date.parse(left.issue.updatedAt),
      ),
    [issues.entries],
  );
  const visibleEntries = sortedEntries.slice(0, search.limit);
  const environmentById = useMemo(
    () => new Map(environments.map((environment) => [environment.environmentId, environment])),
    [environments],
  );
  const projectByKey = useMemo(
    () => new Map(projects.map((project) => [`${project.environmentId}:${project.id}`, project])),
    [projects],
  );
  const mappedProjects = useMemo(
    () =>
      connections.values.flatMap(([target, snapshot]) =>
        snapshot.mappings.flatMap((mapping) => {
          const project = projectByKey.get(`${target.environmentId}:${mapping.projectId}`);
          return project ? [{ ...project, mapping }] : [];
        }),
      ),
    [connections.values, projectByKey],
  );

  const rightPanelState = useRightPanelStore((state) =>
    selectThreadRightPanelState(state.byThreadKey, ISSUES_PANEL_REF),
  );
  const activeSurface = useRightPanelStore((state) =>
    selectActiveRightPanelSurface(state.byThreadKey, ISSUES_PANEL_REF),
  );
  const activeIssueSurface = activeSurface?.kind === "issue" ? activeSurface : null;
  const selectedKey = activeIssueSurface
    ? `${activeIssueSurface.environmentId}:${activeIssueSurface.projectId}:${activeIssueSurface.issueId}`
    : null;

  const updateSearch = (patch: IssuesSearchPatch) => {
    const next = Object.fromEntries(
      Object.entries({ ...search, ...patch }).filter(([, value]) => value !== undefined),
    ) as unknown as IssuesSearch;
    void navigate({
      search: next,
      replace: true,
      resetScroll: false,
    });
  };
  const clearSelection = () =>
    updateSearch({
      issueId: undefined,
      selectedEnvironmentId: undefined,
      selectedProjectId: undefined,
    });

  const openEntry = (entry: EnvironmentIssueEntry) => {
    useRightPanelStore.getState().openIssue(ISSUES_PANEL_REF, {
      environmentId: entry.environmentId,
      projectId: entry.projectId,
      pulseProjectId: entry.issue.pulseProjectId,
      issueId: entry.issue.id,
    });
    updateSearch({
      issueId: entry.issue.id,
      selectedEnvironmentId: entry.environmentId,
      selectedProjectId: entry.projectId,
    });
  };

  useEffect(() => {
    if (!search.issueId || !search.selectedEnvironmentId || !search.selectedProjectId) return;
    const entry = issues.entries.find(
      (candidate) =>
        candidate.environmentId === search.selectedEnvironmentId &&
        candidate.projectId === search.selectedProjectId &&
        candidate.issue.id === search.issueId,
    );
    if (!entry) return;
    useRightPanelStore.getState().openIssue(ISSUES_PANEL_REF, {
      environmentId: entry.environmentId,
      projectId: entry.projectId,
      pulseProjectId: entry.issue.pulseProjectId,
      issueId: entry.issue.id,
    });
  }, [issues.entries, search.issueId, search.selectedEnvironmentId, search.selectedProjectId]);

  const activateSurface = (surface: IssueSurface) => {
    useRightPanelStore.getState().activateSurface(ISSUES_PANEL_REF, surface.id);
    updateSearch({
      issueId: surface.issueId as IssueId,
      selectedEnvironmentId: surface.environmentId as EnvironmentId,
      selectedProjectId: surface.projectId as ProjectId,
    });
  };
  const closeSurface = (surface: IssueSurface) => {
    useRightPanelStore.getState().closeSurface(ISSUES_PANEL_REF, surface.id);
    const next =
      useRightPanelStore.getState().byThreadKey[`${ISSUES_PANEL_ENVIRONMENT_ID}:issues-panel`];
    const nextSurface = next?.surfaces.find((candidate) => candidate.id === next.activeSurfaceId);
    if (nextSurface?.kind === "issue") activateSurface(nextSurface);
    else clearSelection();
  };

  const connectedCount = connections.values.filter(
    ([, snapshot]) => snapshot.status === "connected",
  ).length;
  const ready = projectsKnown && !connections.isPending;
  const showConnectionEmpty = ready && connectedCount === 0;
  const showMappingEmpty = ready && connectedCount > 0 && listTargets.length === 0;

  return (
    <SidebarInset className="h-(--app-shell-height) min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="relative flex min-h-0 flex-1">
        <section
          className={cn(
            "min-w-0 flex-1 flex-col",
            rightPanelState.isOpen && activeIssueSurface ? "hidden md:flex" : "flex",
          )}
        >
          <header className="shrink-0 border-b border-border/60 px-4 pt-3 pb-3">
            <div className="flex min-h-8 items-center gap-2">
              <CircleDotIcon className="size-4 text-orange-500" />
              <h1 className="text-sm font-semibold tracking-[-0.01em]">Issues</h1>
              <span className="text-xs tabular-nums text-muted-foreground">
                {issues.total || visibleEntries.length}
              </span>
              <Button
                className="ms-auto"
                size="icon-xs"
                variant="ghost-muted"
                aria-label="Refresh Issues"
                onClick={() => {
                  connections.refresh();
                  issues.refresh();
                }}
              >
                <RefreshCwIcon className={cn(issues.isPending && "animate-spin")} />
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="relative min-w-44 flex-1">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  nativeInput
                  size="sm"
                  className="pl-7"
                  value={search.q ?? ""}
                  onChange={(event) =>
                    updateSearch({ q: event.currentTarget.value || undefined, limit: 50 })
                  }
                  placeholder="Search Issues"
                />
              </label>
              <Select
                value={search.status ?? null}
                onValueChange={(value) =>
                  updateSearch({ status: value as IssueStatus | undefined, limit: 50 })
                }
              >
                <SelectTrigger size="sm" className="w-32">
                  <FilterIcon className="size-3" />
                  <SelectValue>
                    {search.status ? ISSUE_STATUS_PRESENTATION[search.status].label : "All status"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value={null}>All status</SelectItem>
                  {ISSUE_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {ISSUE_STATUS_PRESENTATION[status].label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <Select
                value={search.severity ?? null}
                onValueChange={(value) =>
                  updateSearch({ severity: value as IssueSeverity | undefined, limit: 50 })
                }
              >
                <SelectTrigger size="sm" className="w-32">
                  <SelectValue>
                    {search.severity
                      ? ISSUE_SEVERITY_PRESENTATION[search.severity].label
                      : "All severity"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value={null}>All severity</SelectItem>
                  {ISSUE_SEVERITIES.map((severity) => (
                    <SelectItem key={severity} value={severity}>
                      {ISSUE_SEVERITY_PRESENTATION[severity].label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <Select
                value={search.environmentId ?? null}
                onValueChange={(value) =>
                  updateSearch({
                    environmentId: value as EnvironmentId | undefined,
                    projectId: undefined,
                    limit: 50,
                  })
                }
              >
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue>
                    {search.environmentId
                      ? (environmentById.get(search.environmentId)?.label ?? "Environment")
                      : "All servers"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value={null}>All servers</SelectItem>
                  {capableEnvironments.map((environment) => (
                    <SelectItem key={environment.environmentId} value={environment.environmentId}>
                      {environment.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <Select
                value={search.projectId ?? null}
                onValueChange={(value) =>
                  updateSearch({ projectId: value as ProjectId | undefined, limit: 50 })
                }
              >
                <SelectTrigger size="sm" className="w-40">
                  <SelectValue>
                    {search.projectId
                      ? (mappedProjects.find((project) => project.id === search.projectId)?.title ??
                        "Project")
                      : "All projects"}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end" alignItemWithTrigger={false}>
                  <SelectItem value={null}>All projects</SelectItem>
                  {mappedProjects
                    .filter(
                      (project) =>
                        !search.environmentId || project.environmentId === search.environmentId,
                    )
                    .map((project) => (
                      <SelectItem key={`${project.environmentId}:${project.id}`} value={project.id}>
                        {project.title}
                      </SelectItem>
                    ))}
                </SelectPopup>
              </Select>
              <Input
                nativeInput
                size="sm"
                className="w-36"
                value={search.assignee ?? ""}
                onChange={(event) =>
                  updateSearch({ assignee: event.currentTarget.value || undefined, limit: 50 })
                }
                placeholder="Assignee email"
                aria-label="Filter by assignee"
              />
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!ready ? (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <LoaderCircleIcon className="size-5 animate-spin" />
              </div>
            ) : capableEnvironments.length === 0 ? (
              <div className="mx-auto max-w-md p-6">
                <Alert variant="info">
                  <CircleAlertIcon />
                  <AlertTitle>Issues are not available on a connected server</AlertTitle>
                  <AlertDescription>
                    Update Pulse Code Server, then reconnect this client.
                  </AlertDescription>
                </Alert>
              </div>
            ) : showConnectionEmpty || showMappingEmpty ? (
              <div className="mx-auto max-w-md p-6">
                <Alert variant="info">
                  <SettingsIcon />
                  <AlertTitle>
                    {showConnectionEmpty ? "Connect Pulse" : "Map a Pulse project"}
                  </AlertTitle>
                  <AlertDescription>
                    {showConnectionEmpty
                      ? "Connect Pulse for at least one environment to begin using native Issues."
                      : "Map a Pulse Code workspace to a Pulse project before its Issues can appear."}
                    <Button
                      render={<Link to="/settings/integrations" hash="pulse-issues" />}
                      size="xs"
                      variant="outline"
                    >
                      Open Integrations
                    </Button>
                  </AlertDescription>
                </Alert>
              </div>
            ) : issues.error && issues.entries.length === 0 ? (
              <div className="mx-auto max-w-md p-6">
                <Alert variant="error">
                  <CircleAlertIcon />
                  <AlertTitle>Issues could not be loaded</AlertTitle>
                  <AlertDescription>{issues.error}</AlertDescription>
                </Alert>
              </div>
            ) : (
              <>
                {issues.error ? (
                  <p className="border-b border-warning/20 bg-warning/5 px-4 py-2 text-xs text-warning-foreground">
                    One environment could not be reached; Issues from the others are still shown.
                  </p>
                ) : null}
                <IssueList
                  entries={visibleEntries}
                  selectedKey={selectedKey}
                  environmentLabel={(entry) =>
                    environmentById.get(entry.environmentId)?.label ?? entry.environmentId
                  }
                  projectLabel={(entry) =>
                    projectByKey.get(`${entry.environmentId}:${entry.projectId}`)?.title ??
                    "Project"
                  }
                  onSelect={openEntry}
                />
                {sortedEntries.length > visibleEntries.length ? (
                  <div className="flex justify-center border-t border-border/50 p-3">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => updateSearch({ limit: Math.min(100, search.limit + 50) })}
                    >
                      Show more
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>

        {rightPanelState.isOpen && activeIssueSurface ? (
          <RightPanelTabs
            mode="inline"
            widthStorageKey="t3code:issues-panel-width"
            defaultWidth={typeof window === "undefined" ? 640 : Math.floor(window.innerWidth / 2)}
            surfaces={rightPanelState.surfaces}
            activeSurfaceId={activeIssueSurface.id}
            pendingSurfaceIds={EMPTY_PENDING_SURFACES}
            previewSessions={EMPTY_PREVIEW_SESSIONS}
            desktopByTabId={EMPTY_PREVIEW_DESKTOP_STATE}
            terminalLabelsById={EMPTY_TERMINAL_LABELS}
            onActivate={(surface) => surface.kind === "issue" && activateSurface(surface)}
            onCloseSurface={(surface) => surface.kind === "issue" && closeSurface(surface)}
            onCloseOtherSurfaces={(surface) => {
              if (surface.kind !== "issue") return;
              useRightPanelStore.getState().closeOtherSurfaces(ISSUES_PANEL_REF, surface.id);
              activateSurface(surface);
            }}
            onCloseSurfacesToRight={(surface) => {
              if (surface.kind !== "issue") return;
              useRightPanelStore.getState().closeSurfacesToRight(ISSUES_PANEL_REF, surface.id);
            }}
            onCloseAllSurfaces={() => {
              useRightPanelStore.getState().closeAllSurfaces(ISSUES_PANEL_REF);
              clearSelection();
            }}
            onCopyFilePath={() => undefined}
            onAddBrowser={() => undefined}
            onAddTerminal={() => undefined}
            onAddDiff={() => undefined}
            onAddFiles={() => undefined}
            onAddPullRequest={() => undefined}
            onAddIssue={() => undefined}
            onAddPulseflow={() => undefined}
            onAddAgents={() => undefined}
            browserAvailable={false}
            terminalAvailable={false}
            diffAvailable={false}
            filesAvailable={false}
            pullRequestAvailable={false}
            issueAvailable={false}
            pulseflowAvailable={false}
            agentsAvailable={false}
            liveAgentCount={0}
          >
            <IssueDetailPanel
              key={activeIssueSurface.id}
              environmentId={activeIssueSurface.environmentId as EnvironmentId}
              reference={{
                projectId: activeIssueSurface.projectId as ProjectId,
                issueId: activeIssueSurface.issueId as IssueId,
              }}
              onActed={issues.refresh}
            />
          </RightPanelTabs>
        ) : null}
      </div>
    </SidebarInset>
  );
}
