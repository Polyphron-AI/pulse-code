import type {
  EnvironmentId,
  ProjectId,
  WorkspaceItemRef,
  WorkspaceLinkEndpoint,
  WorkspaceLinkList,
} from "@t3tools/contracts";
import { useThreadShells } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { workspaceLinks } from "../../state/workspaceLinks";
import { workspaceTools } from "../../state/workspaceTools";
import { LinkedSection } from "./mail/LinkedSection";
import { MailError } from "./mail/MailNotice";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { canOpenLinkedItem, workspaceEndpointTitle } from "./mail/linkedItems";
import { WorkspaceItemMenu } from "./WorkspaceItemActions";

/** Reads only the captured item's relationships. Resource project selection is independent. */
export function WorkspaceLinkedContext(props: {
  readonly environmentId: EnvironmentId;
  readonly item: WorkspaceLinkEndpoint | null;
  readonly linkedData?: WorkspaceLinkList;
  readonly onOpen: (ref: WorkspaceItemRef) => void;
  readonly unavailableReason?: string;
}) {
  const capability = useMailCapabilities(props.environmentId);
  if (props.unavailableReason)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {props.unavailableReason}
      </p>
    );
  if (props.item === null)
    return (
      <p className="text-sm text-muted-foreground">Select an item to see its linked context.</p>
    );
  return (
    <div className="flex flex-col gap-3">
      <LinkedSection
        key={`${props.environmentId}:${JSON.stringify(props.item.ref)}`}
        mode="context"
        environmentId={props.environmentId}
        item={props.item.ref}
        title={workspaceEndpointTitle(props.item)}
        {...(props.linkedData ? { linkedData: props.linkedData } : {})}
        onOpen={props.onOpen}
      />
      {props.item.ref.type === "project" && capability.workspaceItemContext ? (
        <ProjectRelatedItems
          environmentId={props.environmentId}
          projectId={props.item.ref.projectId}
          onOpen={props.onOpen}
        />
      ) : null}
      {props.item.ref.type === "task" &&
      capability.workspaceItemContext &&
      capability.workspaceTools ? (
        <TaskProjectRelatedItems
          environmentId={props.environmentId}
          taskId={props.item.ref.taskId}
          onOpen={props.onOpen}
        />
      ) : null}
    </div>
  );
}
function TaskProjectRelatedItems(props: {
  environmentId: EnvironmentId;
  taskId: string;
  onOpen: (ref: WorkspaceItemRef) => void;
}) {
  const task = useEnvironmentQuery(
    workspaceTools.task({ environmentId: props.environmentId, input: { id: props.taskId } }),
  );
  return task.data ? (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">Related to this task's project.</p>
      <ProjectRelatedItems
        environmentId={props.environmentId}
        projectId={task.data.projectId}
        onOpen={props.onOpen}
      />
    </div>
  ) : task.error ? (
    <MailError message={task.error} onRetry={task.refresh} />
  ) : (
    <p className="text-sm text-muted-foreground">Finding this task's project...</p>
  );
}
function ProjectRelatedItems(props: {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  onOpen: (ref: WorkspaceItemRef) => void;
}) {
  const threads = useThreadShells();
  const projectThreads = threads.filter(
    (thread) =>
      thread.environmentId === props.environmentId && thread.projectId === props.projectId,
  );
  const related = useEnvironmentQuery(
    workspaceLinks.projectHub({
      environmentId: props.environmentId,
      input: {
        projectId: props.projectId,
        threadIds: projectThreads.slice(0, 30).map((thread) => thread.id),
      },
    }),
  );
  return (
    <section aria-label="Related through linked items" className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Related through linked items</h3>
      <p className="text-xs text-muted-foreground">
        Shown for discovery. These items are not project context until you link them directly.
      </p>
      {related.error ? <MailError message={related.error} onRetry={related.refresh} /> : null}
      {related.data === null && !related.error ? (
        <p className="text-sm text-muted-foreground">Loading related items...</p>
      ) : null}
      {related.data?.related.length === 0 ? (
        <p className="text-sm text-muted-foreground">No related items yet.</p>
      ) : null}
      <ul>
        {related.data?.related.map((row) => (
          <li key={JSON.stringify(row.item.ref)} className="py-2 text-sm">
            <WorkspaceItemMenu
              environmentId={props.environmentId}
              item={row.item}
              provenance={<p>Via {workspaceEndpointTitle(row.via)}</p>}
            >
              <button
                type="button"
                disabled={!canOpenLinkedItem(row.item.ref)}
                onClick={() => props.onOpen(row.item.ref)}
              >
                {workspaceEndpointTitle(row.item)}
              </button>
              <p className="text-xs text-muted-foreground">Via {workspaceEndpointTitle(row.via)}</p>
            </WorkspaceItemMenu>
          </li>
        ))}
      </ul>
      {related.data?.truncated || projectThreads.length > 30 ? (
        <p className="text-xs text-muted-foreground">
          Showing a bounded selection of related items.
        </p>
      ) : null}
    </section>
  );
}
