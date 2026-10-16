import type {
  EnvironmentId,
  WorkspaceItemRef,
  WorkspaceLinkEndpoint,
  WorkspaceLinkList,
} from "@t3tools/contracts";
import { useThreadShells } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { workspaceLinks } from "../../state/workspaceLinks";
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
}) {
  const capability = useMailCapabilities(props.environmentId);
  const threads = useThreadShells();
  const ref = props.item?.ref;
  const projectThreads =
    ref?.type === "project"
      ? threads.filter(
          (thread) =>
            thread.environmentId === props.environmentId && thread.projectId === ref.projectId,
        )
      : [];
  const related = useEnvironmentQuery(
    ref?.type === "project" && capability.workspaceItemContext
      ? workspaceLinks.projectHub({
          environmentId: props.environmentId,
          input: {
            projectId: ref.projectId,
            threadIds: projectThreads.slice(0, 30).map((thread) => thread.id),
          },
        })
      : null,
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
      {ref?.type === "project" && capability.workspaceItemContext ? (
        <section aria-label="Related through linked items" className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Related through linked items</h2>
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
                  <p className="text-xs text-muted-foreground">
                    Via {workspaceEndpointTitle(row.via)}
                  </p>
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
      ) : null}
    </div>
  );
}
