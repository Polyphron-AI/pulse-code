import {
  DriveError,
  type DriveProjectRootResult,
  type EnvironmentId,
  type ProjectId,
  type WorkspaceDriveRoot,
} from "@t3tools/contracts";
import { useContext, useEffect, useRef, useState } from "react";
import * as Schema from "effect/Schema";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { drive } from "../../state/drive";
import { workspaceLinks } from "../../state/workspaceLinks";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { errorText, useDriveAccess } from "./DriveFiles";
import { LinkedSection } from "./mail/LinkedSection";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";
import { useWorkspaceItemOpener } from "./useWorkspaceItemOpener";

type Props = { environmentId: EnvironmentId; projectId: ProjectId };
const isDriveError = Schema.is(DriveError);
const rootMessages: Record<DriveProjectRootResult["state"], string> = {
  unconfigured: "Choose a confirmed project folder to browse Drive.",
  available: "Files stay in Google Drive.",
  unlinked: "This project folder is no longer linked.",
  disconnected: "Reconnect this Drive connection in Settings.",
  "binding-changed": "The folder connection changed. Choose the project folder again.",
  unavailable: "This project folder is unavailable. Verify the folder or choose another.",
};

export function ProjectDriveRootSettings(props: Props) {
  const {
    driveProjectRoot,
    driveRead,
    workspaceLinks: linksAvailable,
  } = useMailCapabilities(props.environmentId);
  const [showLinks, setShowLinks] = useState(false);
  const connected = useConnectedEnvironmentIds().includes(props.environmentId);
  const hidden = useContext(WorkspaceResourcesBodyContext)?.hidden ?? false;
  if (hidden) return null;
  return driveProjectRoot && connected ? (
    <AvailableRootSettings key={`${props.environmentId}:${props.projectId}`} {...props} />
  ) : (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {connected
          ? "Project Drive folders need a newer server. Use Link to in Linked context to find or read individual Drive files."
          : "Connect to this environment to manage its project Drive folder."}
      </p>
      {connected && driveRead && linksAvailable ? (
        <>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowLinks(!showLinks)}>
            {showLinks ? "Close linked files" : "Link to"}
          </Button>
          {showLinks ? <ProjectDriveLinks {...props} /> : null}
        </>
      ) : null}
    </div>
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

function DriveFolderOption({
  environmentId,
  fileId,
  linkId,
  title,
}: {
  environmentId: EnvironmentId;
  fileId: string;
  linkId: string;
  title: string;
}) {
  const binding = useEnvironmentQuery(drive.binding({ environmentId, input: { fileId } }));
  if (
    binding.data?.binding &&
    binding.data.binding.file.mimeType !== "application/vnd.google-apps.folder"
  )
    return null;
  return <option value={linkId}>{title}</option>;
}

function AvailableRootSettings({ environmentId, projectId }: Props) {
  const root = useEnvironmentQuery(drive.projectRoot({ environmentId, input: { projectId } }));
  const links = useEnvironmentQuery(
    workspaceLinks.list({ environmentId, input: { item: { type: "project", projectId } } }),
  );
  const { connections, canOperate } = useDriveAccess(environmentId);
  const setRoot = useAtomCommand(drive.setProjectRoot, { reportFailure: false });
  const bind = useAtomCommand(drive.bind, { reportFailure: false });
  const [choosing, setChoosing] = useState(false);
  const [linkId, setLinkId] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [showLinks, setShowLinks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const useButton = useRef<HTMLButtonElement>(null);
  const linkSelect = useRef<HTMLSelectElement>(null);
  const [focusAfterAction, setFocusAfterAction] = useState<"choose" | "use" | null>(null);
  const refreshRoot = root.refresh;
  const linksUpdatedAt = links.dataUpdatedAt;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (linksUpdatedAt) refreshRoot();
  }, [linksUpdatedAt, refreshRoot]);
  const candidates =
    links.data?.linked.filter(
      (link) =>
        link.status === "confirmed" &&
        link.item.ref.type === "file" &&
        link.item.ref.provider === "google-drive",
    ) ?? [];
  const selected = candidates.find((link) => link.id === linkId);
  const fileId = selected?.item.ref.type === "file" ? selected.item.ref.fileId : null;
  const binding = useEnvironmentQuery(
    fileId ? drive.binding({ environmentId, input: { fileId } }) : null,
  );
  const saved = root.data?.root;
  const selectedBinding = binding.data?.binding;
  const folder =
    selectedBinding?.file.mimeType === "application/vnd.google-apps.folder"
      ? selectedBinding
      : null;
  const boundConnection = connections.data?.find(
    (connection) => connection.id === selectedBinding?.connectionId,
  );
  const accountLabel = (id: string) => {
    const connection = connections.data?.find((value) => value.id === id);
    if (!connection) return `Unavailable connection: ${id}`;
    const identity = connection.identity?.email || connection.identity?.name;
    return `${connection.nickname}${identity ? ` (${identity})` : ""}${connection.connected ? "" : " (disconnected)"}`;
  };
  const state =
    saved &&
    links.data &&
    !links.data.truncated &&
    !candidates.some(
      (link) =>
        link.id === saved.linkId &&
        link.item.ref.type === "file" &&
        link.item.ref.fileId === saved.fileId,
    )
      ? "unlinked"
      : root.data?.state;
  const unavailable = root.error !== null || !root.data;
  const clearUnavailable = isDriveError(root.failure) && root.failure.kind === "unavailable";
  useEffect(() => {
    if (choosing) linkSelect.current?.focus();
  }, [choosing]);
  useEffect(() => {
    if (busy || unavailable || focusAfterAction === null) return;
    const target =
      focusAfterAction === "use" && useButton.current && !useButton.current.disabled
        ? useButton.current
        : chooseButton.current;
    if (!target || target.disabled) return;
    target.focus();
    setFocusAfterAction(null);
  }, [busy, focusAfterAction, unavailable]);
  const save = async (value: WorkspaceDriveRoot | null) => {
    if (
      !active.current ||
      !canOperate ||
      busy ||
      (unavailable && !(value === null && clearUnavailable))
    )
      return;
    setBusy(true);
    setError(null);
    const result = await setRoot({ environmentId, input: { projectId, root: value } });
    if (!active.current) return;
    setBusy(false);
    if (result._tag === "Failure") setError(errorText(result));
    else {
      setChoosing(false);
      setLinkId("");
      setConnectionId("");
      root.refresh();
      setFocusAfterAction("choose");
    }
  };
  return (
    <section aria-label="Project Drive folder" className="space-y-3 border-t border-border pt-3">
      <h3 className="text-sm font-medium">Project Drive folder</h3>
      {saved ? (
        <p className="break-words text-sm">{root.data?.file?.name ?? saved.fileId}</p>
      ) : null}
      {saved ? (
        <p className="break-words text-xs text-muted-foreground">
          Drive connection: {accountLabel(saved.connectionId)}
        </p>
      ) : null}
      {state || !root.error ? (
        <p className="text-xs text-muted-foreground">
          {state ? rootMessages[state] : "Loading project Drive folder..."}
        </p>
      ) : null}
      {root.error || links.error || connections.error || error ? (
        <p role="alert" className="text-sm text-destructive">
          {error ?? root.error ?? links.error ?? connections.error}
        </p>
      ) : null}
      {!canOperate ? (
        <p className="text-xs text-muted-foreground">
          You need operate permission to change the project Drive folder.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          ref={chooseButton}
          type="button"
          size="sm"
          variant="outline"
          disabled={!canOperate || busy || unavailable}
          onClick={() => {
            setChoosing(true);
            setError(null);
          }}
        >
          {saved ? "Replace folder" : "Choose folder"}
        </Button>
        {saved || clearUnavailable ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!canOperate || busy || (unavailable && !clearUnavailable)}
            onClick={() => save(null)}
          >
            Clear project folder
          </Button>
        ) : null}
        {root.error ? (
          <Button type="button" size="sm" variant="outline" onClick={root.refresh}>
            Retry
          </Button>
        ) : null}
      </div>
      {choosing ? (
        <div className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span>Confirmed Drive link</span>
            <select
              ref={linkSelect}
              aria-label="Confirmed Drive link"
              className="w-full rounded-md border border-input bg-background p-2"
              value={selected ? linkId : ""}
              disabled={!canOperate || busy}
              onChange={(event) => {
                setLinkId(event.target.value);
                setConnectionId("");
                setError(null);
              }}
            >
              <option value="">Choose a linked item to verify</option>
              {candidates.map((link) =>
                link.item.ref.type === "file" ? (
                  <DriveFolderOption
                    key={link.id}
                    environmentId={environmentId}
                    fileId={link.item.ref.fileId}
                    linkId={link.id}
                    title={link.item.title ?? link.item.ref.fileId}
                  />
                ) : null,
              )}
            </select>
          </label>
          {selectedBinding ? (
            <p className="break-words text-xs text-muted-foreground">
              Drive connection: {accountLabel(selectedBinding.connectionId)}
            </p>
          ) : null}
          {fileId && binding.data && !folder ? (
            <p className="text-xs text-muted-foreground">
              {selectedBinding
                ? "This linked item is not a folder. Choose another item or verify its metadata."
                : "Choose a connection and verify this linked item before using it as a project folder."}
            </p>
          ) : null}
          {fileId ? (
            <>
              <label className="block space-y-1 text-sm">
                <span>Drive connection</span>
                <select
                  aria-label="Drive connection"
                  className="w-full rounded-md border border-input bg-background p-2"
                  value={connectionId}
                  disabled={!canOperate || busy}
                  onChange={(event) => setConnectionId(event.target.value)}
                >
                  <option value="">Choose a connection to verify or change binding</option>
                  {connections.data
                    ?.filter((connection) => connection.connected)
                    .map((connection) => (
                      <option key={connection.id} value={connection.id}>
                        {accountLabel(connection.id)}
                      </option>
                    ))}
                </select>
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={
                  !canOperate ||
                  busy ||
                  !connectionId ||
                  !connections.data?.some(
                    (connection) => connection.id === connectionId && connection.connected,
                  )
                }
                onClick={async () => {
                  if (!canOperate || busy || !connectionId) return;
                  setBusy(true);
                  setError(null);
                  const result = await bind({ environmentId, input: { connectionId, fileId } });
                  if (!active.current) return;
                  setBusy(false);
                  if (result._tag === "Failure") setError(errorText(result));
                  else {
                    setConnectionId("");
                    binding.refresh();
                    root.refresh();
                    setFocusAfterAction("use");
                  }
                }}
              >
                Verify and bind linked item
              </Button>
              {binding.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {binding.error}
                </p>
              ) : null}
            </>
          ) : null}
          {folder ? <p className="text-sm">Folder: {folder.file.name}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              ref={useButton}
              type="button"
              size="sm"
              disabled={
                !canOperate ||
                busy ||
                unavailable ||
                !selected ||
                !folder ||
                !boundConnection?.connected ||
                !!connectionId ||
                !!binding.error
              }
              onClick={() => {
                if (selected && folder && fileId && boundConnection?.connected && !connectionId)
                  void save({ linkId: selected.id, connectionId: folder.connectionId, fileId });
              }}
            >
              Use as project folder
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setChoosing(false);
                setLinkId("");
                setConnectionId("");
                setError(null);
                setFocusAfterAction("choose");
              }}
            >
              Cancel
            </Button>
          </div>
          {connectionId || (folder && !boundConnection?.connected) ? (
            <p className="text-xs text-muted-foreground">
              {connectionId
                ? "Verify and bind first, or clear the connection choice."
                : "The bound Drive connection is disconnected. Reconnect it in Settings or verify with another connection."}
            </p>
          ) : null}
        </div>
      ) : null}
      {links.data?.truncated ? (
        <p className="text-xs text-muted-foreground">
          More links may exist. Use Link to to find and explicitly link the folder.
        </p>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => setShowLinks(!showLinks)}
      >
        {showLinks ? "Close linked files" : "Link to"}
      </Button>
      {showLinks ? <ProjectDriveLinks environmentId={environmentId} projectId={projectId} /> : null}
    </section>
  );
}
