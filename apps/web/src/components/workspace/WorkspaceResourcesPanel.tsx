import type {
  EnvironmentId,
  ProjectId,
  WorkspaceItemRef,
  WorkspaceLinkEndpoint,
} from "@t3tools/contracts";
import { useState, type ReactNode } from "react";
import {
  useAllEnvironmentProjectSnapshotsReady,
  useProjects,
  useThreadShell,
} from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { workspaceLinks } from "../../state/workspaceLinks";
import { workspaceTools } from "../../state/workspaceTools";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useWorkspaceItemOpener } from "./useWorkspaceItemOpener";
import {
  resolveResourceProject,
  useWorkspaceResources,
  type WorkspaceResourceProject,
  type WorkspaceResourceScope,
} from "./workspaceResourceState";
import { WorkspaceResourcesPanelView } from "./WorkspaceResourcesPanelView";
import { WorkspaceResourceBody } from "./WorkspaceResourceBody";
import type { WorkspaceProjectOption } from "./ProjectPickerView";
import { WorkspaceItemMenu } from "./WorkspaceItemActions";
import { WorkspaceResourceFooter } from "./WorkspaceResourceFooter";
import { ProjectWorkspaceSettings } from "./ProjectTasks";
import { Sheet, SheetPopup, SheetTitle } from "../ui/sheet";

export interface WorkspaceResourcesPanelProps {
  readonly environmentId: EnvironmentId | null;
  readonly project: WorkspaceResourceProject | null;
  readonly projects: readonly WorkspaceProjectOption[];
  readonly selectedItem: WorkspaceLinkEndpoint | null;
  readonly onOpen: (ref: WorkspaceItemRef) => void;
  readonly footer: ReactNode;
  readonly renderProjectActions?: (id: ProjectId, row: ReactNode) => ReactNode;
}
export function WorkspaceResourcesPanel(props: WorkspaceResourcesPanelProps): ReactNode {
  const state = useWorkspaceResources();
  if (state.environmentId !== props.environmentId || !state.open) return null;
  const selected =
    props.project?.kind === "selected" && props.project.scope.environmentId === state.environmentId
      ? props.project
      : null;
  const body =
    props.environmentId === null ? (
      <p>Connect an environment to see project resources.</p>
    ) : props.project === null ? (
      <p>Loading projects...</p>
    ) : props.project.kind === "unavailable" ? (
      <p>This project is unavailable. Choose another project.</p>
    ) : selected ? (
      <WorkspaceResourceBody
        key={`${selected.scope.environmentId}:${selected.scope.projectId}:${state.selectedTab}`}
        {...selected.scope}
        tab={state.selectedTab}
        request={state.request}
        selectedItem={props.selectedItem}
        onOpen={props.onOpen}
      />
    ) : (
      <p>
        {props.projects.length === 0
          ? "No projects yet."
          : "Choose a project to see its resources."}
      </p>
    );
  return (
    <WorkspaceResourcesPanelView
      projects={props.projects}
      selectedProjectId={selected?.scope.projectId ?? state.projectId}
      status={props.project?.kind ?? (props.environmentId === null ? "choose" : "loading")}
      tab={state.selectedTab}
      onTabChange={state.selectTab}
      onChooseProject={state.chooseProject}
      onAutoProject={state.resetProject}
      automatic={state.projectId === null}
      {...(props.renderProjectActions ? { renderProjectActions: props.renderProjectActions } : {})}
      body={body}
      footer={props.footer}
      onClose={state.close}
    />
  );
}

/** Live data boundary, kept out of the dev-safe engagement and fixture imports. */
export function WorkspaceProjectResources({
  selectedItem = null,
  owningProjectId,
}: {
  readonly selectedItem?: WorkspaceLinkEndpoint | null;
  readonly owningProjectId?: ProjectId;
}): ReactNode {
  const state = useWorkspaceResources();
  const open = useWorkspaceItemOpener(state.environmentId);
  return state.environmentId === null ? (
    <WorkspaceResourcesPanel
      environmentId={null}
      project={null}
      projects={[]}
      selectedItem={null}
      onOpen={open}
      footer={<span>Connection status unavailable</span>}
    />
  ) : (
    <ResolvedProjectResources
      key={state.environmentId}
      environmentId={state.environmentId}
      selectedItem={selectedItem}
      owningProjectId={owningProjectId}
    />
  );
}
function ResolvedProjectResources({
  environmentId,
  selectedItem,
  owningProjectId,
}: {
  readonly environmentId: EnvironmentId;
  readonly selectedItem: WorkspaceLinkEndpoint | null;
  readonly owningProjectId: ProjectId | undefined;
}): ReactNode {
  const state = useWorkspaceResources();
  const projects = useProjects();
  const [settingsScope, setSettingsScope] = useState<WorkspaceResourceScope | null>(null);
  const ready = useAllEnvironmentProjectSnapshotsReady();
  const capability = useMailCapabilities(environmentId);
  const ref = selectedItem?.ref;
  const inferProject = state.projectId === null;
  const owner = useThreadShell(
    inferProject && ref?.type === "thread" ? { environmentId, threadId: ref.threadId } : null,
  );
  const links = useEnvironmentQuery(
    inferProject && ref && capability.workspaceLinks
      ? workspaceLinks.list({ environmentId, input: { item: ref } })
      : null,
  );
  const task = useEnvironmentQuery(
    inferProject && ref?.type === "task" && capability.workspaceTools
      ? workspaceTools.task({ environmentId, input: { id: ref.taskId } })
      : null,
  );
  const owners = [
    ...(owningProjectId ? [owningProjectId] : []),
    ...(ref?.type === "project" ? [ref.projectId] : []),
    ...(task.data ? [task.data.projectId] : []),
    ...(owner ? [owner.projectId] : []),
  ];
  const project = ready
    ? resolveResourceProject({
        environmentId,
        projects,
        explicitProjectId: state.projectId,
        owningProjectIds: owners,
        confirmedProjectIds: (links.data?.linked ?? []).flatMap((view) =>
          view.item.ref.type === "project" ? [view.item.ref.projectId] : [],
        ),
      })
    : null;
  const open = useWorkspaceItemOpener(
    environmentId,
    project?.kind === "selected"
      ? {
          openPage: (ref) =>
            state.openResource({
              tab: "browser",
              projectId: project.scope.projectId,
              request: ref,
            }),
        }
      : {},
  );
  return (
    <>
      <WorkspaceResourcesPanel
        environmentId={environmentId}
        project={project}
        projects={projects.filter((candidate) => candidate.environmentId === environmentId)}
        selectedItem={selectedItem}
        onOpen={open}
        footer={
          project?.kind === "selected" ? (
            <WorkspaceResourceFooter
              scope={project.scope}
              observations={[]}
              sample={false}
              onSettings={setSettingsScope}
            />
          ) : (
            <span>Connection status unavailable</span>
          )
        }
        renderProjectActions={(id, row) => (
          <WorkspaceItemMenu
            environmentId={environmentId}
            item={{
              ref: { type: "project", projectId: id },
              title:
                projects.find(
                  (candidate) => candidate.environmentId === environmentId && candidate.id === id,
                )?.title ?? "Project",
            }}
          >
            {row}
          </WorkspaceItemMenu>
        )}
      />
      <Sheet
        open={settingsScope !== null}
        onOpenChange={(open) => {
          if (!open) setSettingsScope(null);
        }}
      >
        <SheetPopup>
          <div className="p-4">
            <SheetTitle>Project workspace settings</SheetTitle>
          </div>
          {settingsScope ? (
            <div className="min-h-0 overflow-y-auto p-4">
              {capability.workspaceTools ? (
                <ProjectWorkspaceSettings {...settingsScope} />
              ) : (
                <p>Project settings need a newer server.</p>
              )}
            </div>
          ) : null}
        </SheetPopup>
      </Sheet>
    </>
  );
}
