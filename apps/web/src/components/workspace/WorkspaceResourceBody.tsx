import type { WorkspaceItemRef, WorkspaceLinkEndpoint } from "@t3tools/contracts";
import { lazy, Suspense, type ReactNode } from "react";
import type {
  WorkspaceResourceRequest,
  WorkspaceResourceScope,
  WorkspaceResourceTab,
} from "./workspaceResourceState";

export interface WorkspaceResourceBodyProps extends WorkspaceResourceScope {
  readonly selectedItem: WorkspaceLinkEndpoint | null;
  readonly request: WorkspaceResourceRequest | null;
  readonly onOpen: (ref: WorkspaceItemRef) => void;
}
export interface WorkspaceResourceBodySwitchProps extends WorkspaceResourceBodyProps {
  readonly tab: WorkspaceResourceTab;
}
const Files = lazy(() =>
  import("./ProjectDriveExplorer").then((module) => ({ default: module.ProjectDriveExplorer })),
);
const Browser = lazy(() =>
  import("./WorkspaceBrowser").then((module) => ({ default: module.WorkspaceBrowser })),
);
const Agents = lazy(() =>
  import("./WorkspaceAgents").then((module) => ({ default: module.WorkspaceAgents })),
);
const Tasks = lazy(() =>
  import("./ProjectTasksResource").then((module) => ({ default: module.ProjectTasksResource })),
);
const Docs = lazy(() =>
  import("./WorkspaceDocsPanel").then((module) => ({ default: module.WorkspaceDocsResource })),
);

const PullRequests = lazy(() =>
  import("./WorkspacePullRequestsPanel").then((module) => ({
    default: module.WorkspacePullRequestsPanel,
  })),
);

/** The single live resource switch. Later waves replace only their tab's case. */
export function WorkspaceResourceBody(props: WorkspaceResourceBodySwitchProps): ReactNode {
  let body: ReactNode;
  switch (props.tab) {
    case "files":
      body = <Files key={`${props.environmentId}:${props.projectId}`} {...props} />;
      break;
    case "browser":
      body = (
        <div className="flex h-full min-h-0 min-w-0 flex-col">
          <Browser key={`${props.environmentId}:${props.projectId}`} {...props} />
        </div>
      );
      break;
    case "agents":
      body = <Agents {...props} />;
      break;
    case "tasks":
      body = <Tasks {...props} />;
      break;
    case "docs":
      body = <Docs key={`${props.environmentId}:${props.projectId}`} {...props} />;
      break;
    case "prs":
      body = <PullRequests {...props} />;
      break;
  }
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading resources...</p>}>
      {body}
    </Suspense>
  );
}
