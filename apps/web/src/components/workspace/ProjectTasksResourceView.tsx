import type { ReactNode } from "react";
import type { ProjectId, WorkspaceTaskPage } from "@t3tools/contracts";
import { WorkspaceTaskRow, type WorkspaceTaskRowProps } from "./WorkspaceTaskRow";

export interface ProjectTasksResourceViewProps extends Omit<
  WorkspaceTaskRowProps,
  "task" | "density" | "completedColumn" | "pending" | "selected" | "ownerPresentation"
> {
  readonly projectId: ProjectId | null;
  readonly projectTitle: string;
  readonly page: WorkspaceTaskPage | null;
  readonly status: "loading" | "ready" | "refreshing" | "error" | "unavailable" | "disconnected";
  readonly error: string | null;
  readonly missingProject?: boolean;
  readonly pendingTaskIds?: ReadonlySet<string>;
  readonly selectedTaskId?: string | undefined;
  readonly loadingMore?: boolean;
  readonly onLoadMore: () => void;
  readonly onRetry: () => void;
  readonly ownerPresentation?: (
    task: WorkspaceTaskPage["tasks"][number],
  ) => WorkspaceTaskRowProps["ownerProfile"];
  readonly children?: ReactNode;
}

/** The resource's rows share task identity and commands with the central list. */
export function ProjectTasksResourceView(props: ProjectTasksResourceViewProps) {
  const { page, status } = props;
  if (props.projectId === null) return <p>Choose a project to see its tasks.</p>;
  if (props.missingProject)
    return (
      <p role="alert" className="text-xs text-muted-foreground">
        {props.error ?? "This project is unavailable. Choose another project."}
      </p>
    );
  if (status === "unavailable")
    return <p className="text-xs text-muted-foreground">Tasks need a newer server.</p>;
  return (
    <section aria-label="Project tasks" className="min-w-0">
      <h2 className="text-sm font-semibold">Project tasks</h2>
      {page ? (
        <p className="mt-1 text-3xs text-muted-foreground">{`${props.projectTitle} · ${page.openTotal} open`}</p>
      ) : null}
      {status === "loading" ? <p role="status">Loading tasks...</p> : null}
      {status === "refreshing" || props.loadingMore ? (
        <p role="status">Refreshing tasks...</p>
      ) : null}
      {status === "disconnected" ? (
        <p role="status" className="text-xs text-muted-foreground">
          Connection unavailable. Showing last confirmed tasks.
        </p>
      ) : null}
      {status === "ready" && !props.canOperate ? (
        <p role="status" className="text-xs text-muted-foreground">
          This connection is read-only.
        </p>
      ) : null}
      {props.error ? (
        <div role="alert" className="text-xs text-destructive">
          {props.error}
          <button type="button" onClick={props.onRetry} disabled={status === "disconnected"}>
            Retry tasks
          </button>
        </div>
      ) : null}
      {page ? (
        <ul className="mt-3">
          {page.tasks.map((task) => (
            <WorkspaceTaskRow
              key={task.id}
              environmentId={props.environmentId}
              task={task}
              density="resource"
              ownerProfile={props.ownerProfile}
              ownerPresentation={props.ownerPresentation?.(task)}
              now={props.now}
              timeZone={props.timeZone}
              locale={props.locale}
              settingsReady={props.settingsReady}
              workspaceTasksV2={props.workspaceTasksV2}
              canOperate={props.canOperate && status === "ready" && !props.error}
              completedColumn={
                page.projects.find((config) => config.projectId === task.projectId)
                  ?.completedColumn ?? null
              }
              pending={props.pendingTaskIds?.has(task.id) ?? false}
              refreshFailed={status === "error" || status === "disconnected"}
              selected={props.selectedTaskId === task.id}
              onOpen={props.onOpen}
              onTransition={props.onTransition}
              renderItemMenu={props.renderItemMenu}
            />
          ))}
        </ul>
      ) : null}
      {page?.tasks.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No tasks yet.</p>
      ) : null}
      {page?.nextCursor ? (
        <button
          type="button"
          aria-label="Load more tasks"
          className="mt-3 min-h-11 text-xs"
          disabled={status !== "ready" || props.loadingMore || !!props.error}
          onClick={props.onLoadMore}
        >
          Load more
        </button>
      ) : null}
      {props.children}
    </section>
  );
}
