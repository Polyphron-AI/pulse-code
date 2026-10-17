import { useContext, useMemo, useState } from "react";
import * as Schema from "effect/Schema";
import { WorkspaceToolsError, type WorkspaceTask } from "@t3tools/contracts";
import { useProjects } from "../../state/entities";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { workspaceTools } from "../../state/workspaceTools";
import { timestampLocale } from "../../timestampFormat";
import { useWorkspaceTaskPages } from "./TasksSpace";
import { ProjectTasksResourceView } from "./ProjectTasksResourceView";
import { WorkspaceTaskEditor, workspaceTaskSummary, useTaskDateClock } from "./WorkspaceTaskEditor";
import type { WorkspaceResourceBodyProps } from "./WorkspaceResourceBody";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";
import { WorkspaceItemMenu } from "./WorkspaceItemActions";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";

const isToolsError = Schema.is(WorkspaceToolsError);
export function ProjectTasksResource(props: WorkspaceResourceBodyProps) {
  return (
    <ProjectTasksResourceSession key={`${props.environmentId}:${props.projectId}`} {...props} />
  );
}

function ProjectTasksResourceSession({
  environmentId,
  projectId,
  request,
  onOpen,
}: WorkspaceResourceBodyProps) {
  const capability = useMailCapabilities(environmentId);
  const connected = useConnectedEnvironmentIds().includes(environmentId);
  const canOperate = useWorkspaceCanOperate(environmentId) && connected;
  const hidden = useContext(WorkspaceResourcesBodyContext)?.hidden ?? false;
  const available = capability.workspaceTasksV2 && projectId != null;
  const projectTitle =
    useProjects().find(
      (project) => project.environmentId === environmentId && project.id === projectId,
    )?.title ?? "Unavailable project";
  const ownerProfile = useEnvironmentSettings(
    environmentId,
    (settings) => settings.workspaceOwnerProfile,
  );
  const zone =
    useEnvironmentSettings(environmentId, (settings) => settings.workspaceDisplayTimeZone) ?? "UTC";
  const now = useTaskDateClock(zone, available && connected && capability.ready && !hidden);
  const transition = useAtomCommand(workspaceTools.transitionTask, { reportFailure: false });
  const input = useMemo(() => ({ projectId, state: "all" as const, limit: 50 }), [projectId]);
  const query = useWorkspaceTaskPages({ environmentId, input, available, connected });
  const [selectedId, setSelectedId] = useState(request?.type === "task" ? request.taskId : null);
  const [observedRequest, setObservedRequest] = useState(request);
  if (request !== observedRequest) {
    setObservedRequest(request);
    if (request?.type === "task") setSelectedId(request.taskId);
  }
  const selected = useEnvironmentQuery(
    available && selectedId
      ? workspaceTools.task({ environmentId, input: { id: selectedId } })
      : null,
  );
  const [lastSelected, setLastSelected] = useState<WorkspaceTask | null>(null);
  if (selected.data && selected.data !== lastSelected) setLastSelected(selected.data);
  const task = selected.data ?? (lastSelected?.id === selectedId ? lastSelected : null);
  const config = useEnvironmentQuery(
    available && task?.projectId === projectId
      ? workspaceTools.config({ environmentId, input: { projectId } })
      : null,
  );
  const [pendingTaskIds, setPendingTaskIds] = useState<ReadonlySet<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<string | null>(null);
  const unavailable = isToolsError(selected.failure) && selected.failure.kind === "not-found";
  return (
    <>
      <ProjectTasksResourceView
        environmentId={environmentId}
        projectId={projectId}
        projectTitle={projectTitle}
        {...query.view}
        missingProject={isToolsError(query.failure) && query.failure.kind === "not-found"}
        ownerProfile={ownerProfile}
        timeZone={zone}
        now={now}
        locale={timestampLocale}
        settingsReady={capability.ready}
        canOperate={canOperate}
        workspaceTasksV2={available}
        pendingTaskIds={pendingTaskIds}
        selectedTaskId={selectedId ?? undefined}
        onTransition={transition}
        onOpen={(ref) => {
          if (ref.type !== "task") {
            onOpen(ref);
            return;
          }
          if (pendingTaskIds.size || ref.taskId === selectedId) return;
          if (dirty) setPendingSelection(ref.taskId);
          else setSelectedId(ref.taskId);
        }}
        renderItemMenu={(row, children) => (
          <WorkspaceItemMenu
            environmentId={environmentId}
            item={{ ref: { type: "task", taskId: row.id }, title: row.title }}
            confirmed={[{ ref: { type: "project", projectId: row.projectId } }]}
          >
            {children}
          </WorkspaceItemMenu>
        )}
      >
        {selectedId && available ? (
          task && config.data && task.projectId === projectId ? (
            <div className="mt-3">
              <WorkspaceTaskEditor
                environmentId={environmentId}
                task={workspaceTaskSummary(task, projectTitle)}
                config={config.data}
                projectTitle={projectTitle}
                ownerProfile={ownerProfile}
                unavailable={unavailable}
                onClose={() => {
                  setSelectedId(null);
                  setPendingSelection(null);
                }}
                backLabel="Back to project tasks"
                onDirtyChange={setDirty}
                onBusyChange={(busy) => setPendingTaskIds(busy ? new Set([selectedId]) : new Set())}
              />
            </div>
          ) : (
            <div className="mt-3">
              <button type="button" onClick={() => setSelectedId(null)}>
                Back to project tasks
              </button>
              <p role={selected.error || config.error ? "alert" : "status"}>
                {selected.error ??
                  config.error ??
                  (selected.isPending || config.isPending
                    ? "Loading task..."
                    : "This task is unavailable. Its links have been kept.")}
              </p>
            </div>
          )
        ) : null}
        {pendingSelection && !hidden ? (
          <div
            role="alertdialog"
            aria-label="Discard task changes?"
            className="mt-3 space-y-2 rounded-md border border-border p-3"
          >
            <p>Discard unsaved task changes?</p>
            <button
              type="button"
              onClick={() => {
                setSelectedId(pendingSelection);
                setPendingSelection(null);
              }}
            >
              Discard changes
            </button>
            <button type="button" onClick={() => setPendingSelection(null)}>
              Keep editing
            </button>
          </div>
        ) : null}
      </ProjectTasksResourceView>
      {query.cursor}
    </>
  );
}
