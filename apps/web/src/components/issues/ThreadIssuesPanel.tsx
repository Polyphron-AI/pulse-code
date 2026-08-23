import type { EnvironmentId, IssueConnectionSnapshot, ProjectId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import {
  CircleAlertIcon,
  CircleDotIcon,
  FolderIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SettingsIcon,
} from "lucide-react";
import { useMemo } from "react";

import { useIssueConnections, useIssueList, type EnvironmentIssueEntry } from "~/state/issues";
import { cn } from "~/lib/utils";

import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { IssueList } from "./IssueList";

export function directoryIssueListTargets({
  connection,
  environmentId,
  projectId,
}: {
  connection: Pick<IssueConnectionSnapshot, "status" | "mappings"> | null;
  environmentId: EnvironmentId;
  projectId: ProjectId;
}) {
  if (
    connection?.status !== "connected" ||
    !connection.mappings.some((mapping) => mapping.projectId === projectId)
  ) {
    return [];
  }
  return [
    {
      environmentId,
      input: {
        projectId,
        sort: "updated" as const,
        limit: 100,
        offset: 0,
      },
    },
  ];
}

export function ThreadIssuesPanel({
  environmentId,
  projectId,
  projectTitle,
  workspaceRoot,
  onOpenIssue,
}: {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  projectTitle: string;
  workspaceRoot: string;
  onOpenIssue: (entry: EnvironmentIssueEntry) => void;
}) {
  const environmentIds = useMemo(() => [environmentId], [environmentId]);
  const connections = useIssueConnections(environmentIds);
  const connection = connections.values[0]?.[1] ?? null;
  const mapping =
    connection?.mappings.find((candidate) => candidate.projectId === projectId) ?? null;
  const listTargets = useMemo(
    () => directoryIssueListTargets({ connection, environmentId, projectId }),
    [connection, environmentId, projectId],
  );
  const issues = useIssueList(listTargets);
  const entries = useMemo(
    () =>
      [...issues.entries].sort(
        (left, right) => Date.parse(right.issue.updatedAt) - Date.parse(left.issue.updatedAt),
      ),
    [issues.entries],
  );
  const ready = !connections.isPending;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border/60 px-4 py-3">
        <div className="flex min-h-7 items-center gap-2">
          <CircleDotIcon className="size-4 text-orange-500" />
          <h2 className="text-sm font-semibold tracking-[-0.01em]">Issues</h2>
          <span className="text-xs tabular-nums text-muted-foreground">
            {issues.total || entries.length}
          </span>
          <Button
            className="ms-auto"
            size="icon-xs"
            variant="ghost-muted"
            aria-label="Refresh directory Issues"
            onClick={() => {
              connections.refresh();
              issues.refresh();
            }}
          >
            <RefreshCwIcon className={cn(issues.isPending && "animate-spin")} />
          </Button>
        </div>
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <FolderIcon className="size-3 shrink-0" />
          <span className="shrink-0">{projectTitle}</span>
          <span aria-hidden>·</span>
          <span className="truncate font-mono">{workspaceRoot}</span>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground/80">
          Matching Pulse tickets; linked bug reports are counted on each ticket.
        </p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!ready ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <LoaderCircleIcon className="size-5 animate-spin" />
          </div>
        ) : connection?.status !== "connected" ? (
          <div className="p-4">
            <Alert variant="info">
              <CircleAlertIcon />
              <AlertTitle>Connect Pulse for this environment</AlertTitle>
              <AlertDescription>
                This directory cannot load matching bugs and tickets until Pulse is connected.
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
        ) : !mapping ? (
          <div className="p-4">
            <Alert variant="info">
              <SettingsIcon />
              <AlertTitle>Map this directory to Pulse</AlertTitle>
              <AlertDescription>
                Map {projectTitle} to its Pulse project before matching bugs and tickets can appear.
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
        ) : issues.error && entries.length === 0 ? (
          <div className="p-4">
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
                Pulse could not refresh this directory; showing the available Issues.
              </p>
            ) : null}
            <IssueList
              entries={entries}
              selectedKey={null}
              environmentLabel={() => "Current server"}
              projectLabel={() => projectTitle}
              onSelect={onOpenIssue}
            />
          </>
        )}
      </div>
    </div>
  );
}
