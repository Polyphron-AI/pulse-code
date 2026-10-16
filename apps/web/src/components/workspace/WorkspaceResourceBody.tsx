import type { WorkspaceItemRef, WorkspaceLinkEndpoint } from "@t3tools/contracts";
import { lazy, Suspense, type ReactNode } from "react";
import type { WorkspaceResourceScope, WorkspaceResourceTab } from "./workspaceResourceState";

export interface WorkspaceResourceBodyProps extends WorkspaceResourceScope {
  readonly selectedItem: WorkspaceLinkEndpoint | null;
  readonly request: WorkspaceItemRef | null;
  readonly onOpen: (ref: WorkspaceItemRef) => void;
}
export interface WorkspaceResourceBodySwitchProps extends WorkspaceResourceBodyProps {
  readonly tab: WorkspaceResourceTab;
}
const Files = lazy(() =>
  import("./WorkspaceToolsPanel").then((module) => ({ default: module.WorkspaceProjectFiles })),
);
const Browser = lazy(() =>
  import("./WorkspaceToolsPanel").then((module) => ({ default: module.WorkspaceBrowser })),
);
const Agents = lazy(() =>
  import("./WorkspaceToolsPanel").then((module) => ({ default: module.WorkspaceProjectAgents })),
);
const Tasks = lazy(async () => {
  const [{ ProjectTasks }, { useMailCapabilities }] = await Promise.all([
    import("./ProjectTasks"),
    import("./mail/useMailCapabilities"),
  ]);
  return {
    default: function ResourceTasks(props: WorkspaceResourceBodyProps) {
      const capabilities = useMailCapabilities(props.environmentId);
      return capabilities.workspaceTools ? (
        <ProjectTasks
          environmentId={props.environmentId}
          projectId={props.projectId}
          selected={null}
          onSelect={(task) => {
            if (task) props.onOpen({ type: "task", taskId: task.id });
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">Tasks are not available on this server yet.</p>
      );
    },
  };
});

/** The single live resource switch. Later waves replace only their tab's case. */
export function WorkspaceResourceBody(props: WorkspaceResourceBodySwitchProps): ReactNode {
  let body: ReactNode;
  switch (props.tab) {
    case "files":
      body = <Files {...props} />;
      break;
    case "browser":
      body = <Browser {...props} />;
      break;
    case "agents":
      body = <Agents {...props} />;
      break;
    case "tasks":
      body = <Tasks {...props} />;
      break;
    case "docs":
      body = (
        <p className="text-sm text-muted-foreground">
          Documents are not available on this server yet.
        </p>
      );
      break;
    case "prs":
      body = (
        <p className="text-sm text-muted-foreground">
          Project pull requests are not available in this view yet.
        </p>
      );
      break;
  }
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading resources...</p>}>
      {body}
    </Suspense>
  );
}
