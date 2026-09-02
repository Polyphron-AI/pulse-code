import { useAtomValue } from "@effect/atom-react";
import { Link } from "@tanstack/react-router";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import {
  AlertTriangleIcon,
  ArrowUpRightIcon,
  BotIcon,
  CheckCircle2Icon,
  CircleDotIcon,
  NetworkIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
} from "../../providerInstances";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useNowMinute } from "../../hooks/useNowMinute";
import { useEnvironments } from "../../state/environments";
import {
  useAllEnvironmentShellsBootstrapped,
  useProjects,
  useServerConfigs,
  useThreadShells,
} from "../../state/entities";
import { environmentShellSummaryAtom } from "../../state/shell";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { cn } from "~/lib/utils";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "~/workspaceTitlebar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { SidebarInset } from "../ui/sidebar";
import { OmpThreadDialog } from "./OmpThreadDialog";
import { deriveDispatchReadyOmpEntries } from "./OmpThreadDialog.logic";
import {
  buildWorkspaceOverview,
  filterWorkspaceRows,
  pageWorkspaceRows,
  workspaceCheckIn,
  workspaceProviderKey,
  WORKSPACE_STATUS_LABELS,
  type WorkspaceCounts,
  type WorkspaceFilter,
  type WorkspaceProviderInfo,
  type WorkspaceThreadRow,
  type WorkspaceThreadStatus,
} from "./OrcaWorkspace.logic";

const LEDGER_PAGE_SIZE = 100;

const FILTER_OPTIONS: ReadonlyArray<{
  readonly value: WorkspaceFilter;
  readonly label: string;
}> = [
  { value: "all", label: "All work" },
  { value: "attention", label: "Needs attention" },
  { value: "working", label: "Working" },
  { value: "omp", label: "OMP" },
];

const STATUS_DOT_CLASS: Readonly<Record<WorkspaceThreadStatus, string>> = {
  approval: "bg-warning",
  input: "bg-warning",
  working: "bg-info",
  monitoring: "bg-info/70",
  failed: "bg-destructive",
  ready: "bg-muted-foreground/45",
};

const STATUS_BADGE_VARIANT: Readonly<
  Record<WorkspaceThreadStatus, "warning" | "error" | "info" | "secondary">
> = {
  approval: "warning",
  input: "warning",
  working: "info",
  monitoring: "info",
  failed: "error",
  ready: "secondary",
};

function WorkspaceStatus(props: {
  readonly status: WorkspaceThreadStatus;
  readonly isEnvironmentConnected: boolean;
}) {
  if (!props.isEnvironmentConnected) {
    return (
      <Badge variant="secondary" className="gap-1.5">
        <span className="size-1.5 rounded-full bg-muted-foreground/45" aria-hidden />
        Last known · {WORKSPACE_STATUS_LABELS[props.status]}
      </Badge>
    );
  }

  return (
    <Badge variant={STATUS_BADGE_VARIANT[props.status]} className="gap-1.5">
      <span className={cn("size-1.5 rounded-full", STATUS_DOT_CLASS[props.status])} aria-hidden />
      {WORKSPACE_STATUS_LABELS[props.status]}
    </Badge>
  );
}

function CoordinatorMark() {
  return (
    <div
      className="relative flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/80 bg-card text-foreground shadow-xs"
      aria-hidden
    >
      <span className="absolute inset-1.5 rounded-full border border-primary/18" />
      <NetworkIcon className="relative size-5" />
    </div>
  );
}

function StatCard(props: {
  readonly label: string;
  readonly value: number;
  readonly description: string;
  readonly icon: React.ReactNode;
  readonly active?: boolean;
  readonly onClick?: () => void;
}) {
  const content = (
    <>
      <span className="flex items-center justify-between text-xs font-medium text-muted-foreground">
        {props.label}
        {props.icon}
      </span>
      <strong className="mt-3 block font-heading text-2xl font-semibold tabular-nums">
        {props.value}
      </strong>
      <span className="mt-1 block text-xs text-muted-foreground">{props.description}</span>
    </>
  );

  if (!props.onClick) {
    return <Card className="p-4">{content}</Card>;
  }

  return (
    <Card
      render={
        <button
          type="button"
          aria-pressed={props.active}
          onClick={props.onClick}
          className={cn(
            "p-4 text-left outline-none transition-colors hover:border-foreground/20 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            props.active && "border-primary/30 bg-primary/5",
          )}
        />
      }
    >
      {content}
    </Card>
  );
}

function ThreadProjectLabel({ row }: { readonly row: WorkspaceThreadRow }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-sm text-foreground">{row.projectTitle}</span>
      <span className="block truncate text-xs text-muted-foreground">{row.environmentLabel}</span>
    </span>
  );
}

function ThreadProviderLabel({ row }: { readonly row: WorkspaceThreadRow }) {
  return (
    <span className="min-w-0">
      <span className="flex items-center gap-1.5 truncate text-sm text-foreground">
        {row.isOmp ? <BotIcon className="size-3.5 shrink-0 text-primary" /> : null}
        <span className="truncate">{row.providerDisplayName}</span>
      </span>
      <span className="block truncate font-mono text-[11px] text-muted-foreground">
        {row.model}
      </span>
    </span>
  );
}

function RelatedOmpAction(props: {
  readonly row: WorkspaceThreadRow;
  readonly onPrepare: (row: WorkspaceThreadRow) => void;
  readonly compact?: boolean;
}) {
  if (props.row.isOmp) {
    return <span className="text-xs text-muted-foreground">OMP thread</span>;
  }
  return (
    <Button
      size={props.compact ? "sm" : "xs"}
      variant="outline"
      onClick={() => props.onPrepare(props.row)}
      aria-label={`Prepare a separate OMP thread using ${props.row.title} as a reference`}
    >
      <BotIcon className="size-3.5" />
      Prepare separate OMP
    </Button>
  );
}

function DesktopLedger(props: {
  readonly rows: ReadonlyArray<WorkspaceThreadRow>;
  readonly onPrepareRelated: (row: WorkspaceThreadRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[1180px] table-fixed border-collapse text-left">
        <caption className="sr-only">
          Connected Pulse threads ordered by attention state, followed by last-known snapshots
        </caption>
        <thead className="border-b border-border bg-muted/35 text-xs font-medium text-muted-foreground">
          <tr>
            <th scope="col" className="w-48 px-4 py-3 font-medium">
              Status
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Thread
            </th>
            <th scope="col" className="w-48 px-4 py-3 font-medium">
              Project
            </th>
            <th scope="col" className="w-48 px-4 py-3 font-medium">
              Provider
            </th>
            <th scope="col" className="w-40 px-4 py-3 font-medium">
              Branch
            </th>
            <th scope="col" className="w-20 px-4 py-3 text-right font-medium">
              Updated
            </th>
            <th scope="col" className="w-48 px-4 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/70">
          {props.rows.map((row) => (
            <tr key={row.key} className="group hover:bg-muted/24">
              <td className="px-4 py-3 align-middle">
                <WorkspaceStatus
                  status={row.status}
                  isEnvironmentConnected={row.isEnvironmentConnected}
                />
              </td>
              <td className="min-w-0 px-4 py-3 align-middle">
                <Link
                  to="/$environmentId/$threadId"
                  params={{ environmentId: row.environmentId, threadId: row.threadId }}
                  className="block min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex items-center gap-1.5 font-medium text-foreground group-hover:text-primary">
                    <span className="truncate">{row.title}</span>
                    <ArrowUpRightIcon className="size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70 group-focus-within:opacity-70" />
                  </span>
                  {row.planProgress ? (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {row.planProgress.step} · {row.planProgress.completedSteps}/
                      {row.planProgress.totalSteps}
                    </span>
                  ) : null}
                </Link>
              </td>
              <td className="min-w-0 px-4 py-3 align-middle">
                <ThreadProjectLabel row={row} />
              </td>
              <td className="min-w-0 px-4 py-3 align-middle">
                <ThreadProviderLabel row={row} />
              </td>
              <td className="px-4 py-3 align-middle">
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {row.branch ?? "—"}
                </span>
              </td>
              <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                {formatRelativeTimeLabel(row.updatedAt)}
              </td>
              <td className="px-4 py-3 text-right align-middle">
                <RelatedOmpAction row={row} onPrepare={props.onPrepareRelated} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MobileLedger(props: {
  readonly rows: ReadonlyArray<WorkspaceThreadRow>;
  readonly onPrepareRelated: (row: WorkspaceThreadRow) => void;
}) {
  return (
    <div className="grid gap-3">
      {props.rows.map((row) => (
        <Card key={row.key} className="gap-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <WorkspaceStatus
              status={row.status}
              isEnvironmentConnected={row.isEnvironmentConnected}
            />
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatRelativeTimeLabel(row.updatedAt)}
            </span>
          </div>
          <div className="min-w-0">
            <Link
              to="/$environmentId/$threadId"
              params={{ environmentId: row.environmentId, threadId: row.threadId }}
              className="inline-flex max-w-full items-center gap-1.5 rounded-sm font-medium text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="truncate">{row.title}</span>
              <ArrowUpRightIcon className="size-3.5 shrink-0" />
            </Link>
            {row.planProgress ? (
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {row.planProgress.step} · {row.planProgress.completedSteps}/
                {row.planProgress.totalSteps}
              </p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3 border-y border-border/70 py-3">
            <ThreadProjectLabel row={row} />
            <ThreadProviderLabel row={row} />
          </div>
          <div className="flex min-h-11 items-center justify-between gap-3">
            <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
              {row.branch ?? "No branch"}
            </span>
            <RelatedOmpAction row={row} onPrepare={props.onPrepareRelated} compact />
          </div>
        </Card>
      ))}
    </div>
  );
}

function WorkspaceStats(props: {
  readonly counts: WorkspaceCounts;
  readonly filter: WorkspaceFilter;
  readonly onFilter: (filter: WorkspaceFilter) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard
        label="Needs attention"
        value={props.counts.attention}
        description="Connected: approval, input, or recovery"
        icon={<AlertTriangleIcon className="size-4 text-warning" />}
        active={props.filter === "attention"}
        onClick={() => props.onFilter(props.filter === "attention" ? "all" : "attention")}
      />
      <StatCard
        label="Working"
        value={props.counts.working}
        description="Connected active or monitoring"
        icon={<CircleDotIcon className="size-4 text-info" />}
        active={props.filter === "working"}
        onClick={() => props.onFilter(props.filter === "working" ? "all" : "working")}
      />
      <StatCard
        label="Ready"
        value={props.counts.ready}
        description="Connected and available for review"
        icon={<CheckCircle2Icon className="size-4 text-muted-foreground" />}
      />
      <StatCard
        label="OMP threads"
        value={props.counts.omp}
        description="Across available thread snapshots"
        icon={<BotIcon className="size-4 text-primary" />}
        active={props.filter === "omp"}
        onClick={() => props.onFilter(props.filter === "omp" ? "all" : "omp")}
      />
    </div>
  );
}

export function OrcaWorkspace(props: {
  readonly prepareRequested: boolean;
  readonly requestedSourceRef: {
    readonly environmentId: EnvironmentId;
    readonly threadId: ThreadId;
  } | null;
  readonly onPrepareRequestedChange: (requested: boolean) => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogInvokerRef = useRef<HTMLElement | null>(null);
  const shouldFocusHeadingOnMountRef = useRef(!props.prepareRequested);
  const projects = useProjects();
  const threads = useThreadShells();
  const serverConfigs = useServerConfigs();
  const { environments } = useEnvironments();
  const allEnvironmentShellsBootstrapped = useAllEnvironmentShellsBootstrapped();
  const shellSummary = useAtomValue(environmentShellSummaryAtom);
  const useDesktopLedger = useMediaQuery("2xl");
  useNowMinute();
  const [filter, setFilter] = useState<WorkspaceFilter>("all");
  const [query, setQuery] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(LEDGER_PAGE_SIZE);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sourceThread, setSourceThread] = useState<WorkspaceThreadRow | null>(null);

  useEffect(() => {
    if (!shouldFocusHeadingOnMountRef.current) return;
    const frame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (props.prepareRequested) {
      dialogInvokerRef.current = null;
    }
  }, [props.prepareRequested]);

  const environmentLabelById = useMemo(
    () =>
      new Map(environments.map((environment) => [environment.environmentId, environment.label])),
    [environments],
  );
  const connectedEnvironmentIds = useMemo(
    () =>
      new Set(
        environments
          .filter((environment) => environment.connection.phase === "connected")
          .map((environment) => environment.environmentId),
      ),
    [environments],
  );
  const disconnectedEnvironmentCount = environments.length - connectedEnvironmentIds.size;
  const isWorkspaceSyncing =
    !allEnvironmentShellsBootstrapped || shellSummary.hasSynchronizingShell;
  const providerByKey = useMemo(() => {
    const providers = new Map<string, WorkspaceProviderInfo>();
    for (const [environmentId, config] of serverConfigs) {
      const entries = applyProviderInstanceSettings(
        deriveProviderInstanceEntries(config.providers),
        config.settings,
      );
      for (const entry of entries) {
        providers.set(workspaceProviderKey(environmentId, entry.instanceId), {
          driverKind: entry.driverKind,
          displayName: entry.displayName,
        });
      }
    }
    return providers;
  }, [serverConfigs]);
  const readyOmpInstanceCount = useMemo(() => {
    let count = 0;
    for (const [environmentId, config] of serverConfigs) {
      if (!connectedEnvironmentIds.has(environmentId)) continue;
      count += deriveDispatchReadyOmpEntries(config, true).length;
    }
    return count;
  }, [connectedEnvironmentIds, serverConfigs]);
  const overview = useMemo(
    () =>
      buildWorkspaceOverview({
        threads,
        projects,
        providerByKey,
        environmentLabelById,
        connectedEnvironmentIds,
      }),
    [connectedEnvironmentIds, environmentLabelById, projects, providerByKey, threads],
  );
  const filteredRows = useMemo(
    () => filterWorkspaceRows(overview.rows, filter, query),
    [filter, overview.rows, query],
  );
  const requestedSourceThread = useMemo(
    () =>
      props.requestedSourceRef === null
        ? null
        : (overview.rows.find(
            (row) =>
              row.environmentId === props.requestedSourceRef?.environmentId &&
              row.threadId === props.requestedSourceRef.threadId,
          ) ?? null),
    [overview.rows, props.requestedSourceRef],
  );
  const ledgerPage = pageWorkspaceRows(filteredRows, visibleLimit);
  const visibleRows = ledgerPage.rows;
  const remainingRowCount = ledgerPage.remaining;
  const isDialogOpen = props.prepareRequested || dialogOpen;

  const setWorkspaceFilter = (nextFilter: WorkspaceFilter) => {
    setFilter(nextFilter);
    setVisibleLimit(LEDGER_PAGE_SIZE);
  };

  const captureDialogInvoker = () => {
    const activeElement = document.activeElement;
    dialogInvokerRef.current =
      activeElement instanceof HTMLElement && activeElement.isConnected ? activeElement : null;
  };

  const setPrepareDialogOpen = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setSourceThread(null);
      props.onPrepareRequestedChange(false);
    }
  };
  const prepareNewOmpThread = () => {
    captureDialogInvoker();
    setSourceThread(null);
    setDialogOpen(true);
  };
  const prepareRelatedOmpThread = (row: WorkspaceThreadRow) => {
    captureDialogInvoker();
    setSourceThread(row);
    setDialogOpen(true);
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header
          className={cn(
            "flex h-[var(--workspace-topbar-height)] min-h-[var(--workspace-topbar-height)] shrink-0 items-center border-b border-border px-3 transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none sm:px-5",
            COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
          )}
        >
          <span className="text-sm font-medium text-foreground md:text-muted-foreground/70">
            Workspace
          </span>
          <span className="mx-2 text-muted-foreground/35" aria-hidden>
            /
          </span>
          <span className="truncate text-sm text-muted-foreground">ORCA</span>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <section className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-3.5">
                <CoordinatorMark />
                <div className="min-w-0">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    <h1
                      ref={headingRef}
                      tabIndex={-1}
                      className="font-heading text-2xl font-semibold tracking-tight outline-none sm:text-3xl"
                    >
                      ORCA workspace
                    </h1>
                    <Badge variant="outline">Pulse coordination view</Badge>
                  </div>
                  <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    Pulse-native visibility across active threads, with reviewable OMP handoffs.
                  </p>
                </div>
              </div>
              <Button
                className="min-h-11 w-full shrink-0 sm:w-auto"
                onClick={prepareNewOmpThread}
                disabled={projects.length === 0}
              >
                <BotIcon className="size-4" />
                Prepare OMP thread
              </Button>
            </section>

            <Card className="overflow-hidden border-primary/16 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--card)_94%,var(--primary)_6%),var(--card))]">
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary">
                    <NetworkIcon className="size-4" />
                  </span>
                  <div>
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Workspace check-in
                    </span>
                    <p className="mt-1 font-medium text-foreground">
                      {isWorkspaceSyncing
                        ? "Synchronizing thread snapshots before reporting workspace state."
                        : workspaceCheckIn(overview.counts)}
                    </p>
                    {!isWorkspaceSyncing && disconnectedEnvironmentCount > 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {disconnectedEnvironmentCount === 1
                          ? "1 disconnected environment is shown from an available or last-known snapshot."
                          : `${disconnectedEnvironmentCount} disconnected environments are shown from available or last-known snapshots.`}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  {isWorkspaceSyncing
                    ? "Checking OMP catalogs…"
                    : `${readyOmpInstanceCount} connected OMP ${
                        readyOmpInstanceCount === 1 ? "instance" : "instances"
                      } with models`}
                </div>
              </div>
            </Card>

            {isWorkspaceSyncing ? (
              <Card className="items-center justify-center px-6 py-10 text-center" role="status">
                <NetworkIcon className="size-5 text-muted-foreground" />
                <h2 className="mt-3 font-medium">Syncing workspace snapshots</h2>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  Counts and empty states will appear after Pulse has checked every configured
                  environment.
                </p>
              </Card>
            ) : (
              <WorkspaceStats
                counts={overview.counts}
                filter={filter}
                onFilter={setWorkspaceFilter}
              />
            )}

            <section aria-labelledby="work-ledger-title" className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 id="work-ledger-title" className="font-heading text-lg font-semibold">
                    Work ledger
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Thread shell snapshots, ordered by attention first. Disconnected environments
                    may show last-known state; no thread transcripts are loaded.
                  </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div
                    className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-muted/25 p-1"
                    role="group"
                    aria-label="Filter workspace threads"
                  >
                    {FILTER_OPTIONS.map((option) => (
                      <Button
                        key={option.value}
                        size="xs"
                        variant={filter === option.value ? "secondary" : "ghost"}
                        aria-pressed={filter === option.value}
                        className="shrink-0"
                        onClick={() => setWorkspaceFilter(option.value)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                  <div className="relative min-w-0 sm:w-64">
                    <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      aria-label="Search workspace threads"
                      value={query}
                      onChange={(event) => {
                        setQuery(event.currentTarget.value);
                        setVisibleLimit(LEDGER_PAGE_SIZE);
                      }}
                      placeholder="Search work"
                      className="[&_input]:pl-8 [&_input]:pr-8"
                    />
                    {query ? (
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Clear workspace search"
                        className="absolute right-1 top-1/2 z-10 -translate-y-1/2"
                        onClick={() => {
                          setQuery("");
                          setVisibleLimit(LEDGER_PAGE_SIZE);
                        }}
                      >
                        <XIcon className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              {isWorkspaceSyncing ? null : visibleRows.length > 0 ? (
                <>
                  {useDesktopLedger ? (
                    <DesktopLedger rows={visibleRows} onPrepareRelated={prepareRelatedOmpThread} />
                  ) : (
                    <MobileLedger rows={visibleRows} onPrepareRelated={prepareRelatedOmpThread} />
                  )}
                  {remainingRowCount > 0 ? (
                    <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        Showing {visibleRows.length} of {filteredRows.length} matching threads.
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setVisibleLimit((current) => current + LEDGER_PAGE_SIZE)}
                      >
                        Show {Math.min(LEDGER_PAGE_SIZE, remainingRowCount)} more
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : (
                <Card className="items-center justify-center px-6 py-14 text-center">
                  <SearchIcon className="size-5 text-muted-foreground" />
                  <h3 className="mt-3 font-medium">No matching threads</h3>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Adjust the filter or search, or prepare a new OMP thread.
                  </p>
                </Card>
              )}
            </section>
          </div>
        </main>
      </div>

      <OmpThreadDialog
        open={isDialogOpen}
        onOpenChange={setPrepareDialogOpen}
        projects={projects}
        serverConfigs={serverConfigs}
        environmentLabelById={environmentLabelById}
        connectedEnvironmentIds={connectedEnvironmentIds}
        sourceThread={sourceThread ?? requestedSourceThread}
        finalFocus={() => {
          const invoker = dialogInvokerRef.current;
          dialogInvokerRef.current = null;
          return invoker?.isConnected ? invoker : headingRef.current;
        }}
      />
    </SidebarInset>
  );
}
