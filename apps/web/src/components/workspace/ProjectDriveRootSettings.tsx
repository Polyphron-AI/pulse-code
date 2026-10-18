import { type EnvironmentId, type ProjectId } from "@t3tools/contracts";
import { useContext, useId, useState } from "react";
import { ProjectDriveRootSettingsView } from "./ProjectDriveRootSettingsView";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { drive } from "../../state/drive";
import { workspaceLinks } from "../../state/workspaceLinks";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { useDriveAccess } from "./DriveFiles";
import { LinkedSection } from "./mail/LinkedSection";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";
import { useWorkspaceItemOpener } from "./useWorkspaceItemOpener";

type Props = { environmentId: EnvironmentId; projectId: ProjectId; inSettings?: boolean };
export function ProjectDriveRootSettings(props: Props) {
  const {
    driveProjectRoot,
    driveRead,
    workspaceLinks: linksAvailable,
  } = useMailCapabilities(props.environmentId);
  const [showLinks, setShowLinks] = useState(false);
  const linksId = useId();
  const connected = useConnectedEnvironmentIds().includes(props.environmentId);
  const hidden = useContext(WorkspaceResourcesBodyContext)?.hidden ?? false;
  if (hidden && !props.inSettings) return null;
  return driveProjectRoot && connected ? (
    <AvailableRootSettings key={`${props.environmentId}:${props.projectId}`} {...props} />
  ) : (
    <section
      aria-label="Project Drive folder"
      className="space-y-3 border-t border-border pt-3 pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11"
    >
      <h3 className="text-sm font-medium">Project Drive folder</h3>
      <p className="text-xs text-muted-foreground">
        {connected
          ? "Project Drive folders need a newer server. Use Link to in Linked context to find or read individual Drive files."
          : "Connect to this environment to manage its project Drive folder."}
      </p>
      {connected && driveRead && linksAvailable ? (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-expanded={showLinks}
            aria-controls={linksId}
            onClick={() => setShowLinks(!showLinks)}
          >
            {showLinks ? "Close linked files" : "Link to"}
          </Button>
          {showLinks ? (
            <div id={linksId}>
              <ProjectDriveLinks {...props} />
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
function ProjectDriveLinks({ environmentId, projectId }: Props) {
  const onOpen = useWorkspaceItemOpener(environmentId);
  return (
    <LinkedSection
      mode="context"
      environmentId={environmentId}
      item={{ type: "project", projectId }}
      title="Project"
      onOpen={onOpen}
    />
  );
}

function AvailableRootSettings({ environmentId, projectId }: Props) {
  const { driveExplorer } = useMailCapabilities(environmentId);
  const root = useEnvironmentQuery(drive.projectRoot({ environmentId, input: { projectId } }));
  const links = useEnvironmentQuery(
    workspaceLinks.list({ environmentId, input: { item: { type: "project", projectId } } }),
  );
  const { connections, canOperate } = useDriveAccess(environmentId);
  const setRoot = useAtomCommand(drive.setProjectRoot, { reportFailure: false });
  const bind = useAtomCommand(drive.bind, { reportFailure: false });
  const [choosing, setChoosing] = useState(false);
  const [linkId, setLinkId] = useState("");
  const candidates =
    links.data?.linked.filter(
      (link) =>
        link.status === "confirmed" &&
        link.item.ref.type === "file" &&
        link.item.ref.provider === "google-drive",
    ) ?? [];
  const selected = candidates.find((link) => link.id === linkId);
  const fileId = selected?.item.ref.type === "file" ? selected.item.ref.fileId : null;
  const fileIds = [
    ...new Set(
      candidates.flatMap((link) => (link.item.ref.type === "file" ? [link.item.ref.fileId] : [])),
    ),
  ].sort();
  const bindings = useEnvironmentQuery(
    driveExplorer && choosing && fileIds.length
      ? drive.bindings({ environmentId, input: { fileIds } })
      : null,
  );
  const singleBinding = useEnvironmentQuery(
    !driveExplorer && choosing && fileId
      ? drive.binding({ environmentId, input: { fileId } })
      : null,
  );
  return (
    <ProjectDriveRootSettingsView
      {...{
        environmentId,
        projectId,
        root,
        links,
        connections,
        bindings,
        singleBinding,
        driveExplorer,
        canOperate,
        choosing,
        setChoosing,
        linkId,
        setLinkId,
        setRoot,
        bind,
      }}
      renderLinks={<ProjectDriveLinks environmentId={environmentId} projectId={projectId} />}
    />
  );
}
