import {
  DRIVE_FOLDER_MIME,
  DriveError,
  type DriveProjectRootResult,
  type DriveBinding,
  type DriveConnection,
  type EnvironmentId,
  type ProjectId,
  type WorkspaceDriveRoot,
  type WorkspaceLinkList,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Schema from "effect/Schema";
import { useEffect, useRef, useState, useId, type ReactNode } from "react";
import { Button } from "../ui/button";
interface Query<T> {
  readonly data: T | null | undefined;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
  readonly failure?: unknown;
  readonly dataUpdatedAt?: number | null;
}
type Result<T> =
  | { readonly _tag: "Success"; readonly value: T }
  | { readonly _tag: "Failure"; readonly cause: Cause.Cause<unknown> };
export interface ProjectDriveRootSettingsViewProps {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly root: Query<DriveProjectRootResult>;
  readonly links: Query<WorkspaceLinkList>;
  readonly connections: Query<readonly DriveConnection[]>;
  readonly bindings: Query<{ readonly bindings: readonly DriveBinding[] }>;
  readonly singleBinding: Query<{ readonly binding?: DriveBinding }>;
  readonly driveExplorer: boolean;
  readonly canOperate: boolean;
  readonly choosing: boolean;
  readonly setChoosing: (value: boolean) => void;
  readonly linkId: string;
  readonly setLinkId: (value: string) => void;
  readonly setRoot: (request: {
    environmentId: EnvironmentId;
    input: { projectId: ProjectId; root: WorkspaceDriveRoot | null };
  }) => Promise<Result<DriveProjectRootResult>>;
  readonly bind: (request: {
    environmentId: EnvironmentId;
    input: { connectionId: string; fileId: string };
  }) => Promise<Result<DriveBinding>>;
  readonly renderLinks: ReactNode;
}
const errorText = (result: { readonly cause: Cause.Cause<unknown> }) => {
  const error = Cause.squash(result.cause);
  return error instanceof Error ? error.message : "The Drive request could not finish.";
};
const isDriveError = Schema.is(DriveError);
const rootMessages: Record<DriveProjectRootResult["state"], string> = {
  unconfigured: "Choose a confirmed project folder to browse Drive.",
  available: "Files stay in Google Drive.",
  unlinked: "This project folder is no longer linked.",
  disconnected: "Reconnect this Drive connection in Settings.",
  "binding-changed": "The folder connection changed. Choose the project folder again.",
  unavailable: "This project folder is unavailable. Verify the folder or choose another.",
};

export function ProjectDriveRootSettingsView({
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
  renderLinks,
}: ProjectDriveRootSettingsViewProps) {
  const chooserId = useId();
  const linksId = useId();
  const [connectionId, setConnectionId] = useState("");
  const [showLinks, setShowLinks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const useButton = useRef<HTMLButtonElement>(null);
  const linkSelect = useRef<HTMLSelectElement>(null);
  const focusAfterAction = useRef<"choose" | "use" | "select" | null>(null);
  const refreshRoot = root.refresh;
  const linksUpdatedAt = links.dataUpdatedAt;
  const lastLinkUpdate = useRef(linksUpdatedAt);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (linksUpdatedAt && lastLinkUpdate.current !== linksUpdatedAt) refreshRoot();
    lastLinkUpdate.current = linksUpdatedAt;
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
  const [lastBindings, setLastBindings] = useState({ environmentId, data: bindings.data });
  if (
    environmentId !== lastBindings.environmentId ||
    (bindings.data && bindings.data !== lastBindings.data)
  )
    setLastBindings({ environmentId, data: bindings.data });
  const currentBindings =
    bindings.data ?? (lastBindings.environmentId === environmentId ? lastBindings.data : null);
  const bindingsById = new Map(currentBindings?.bindings.map((value) => [value.file.id, value]));
  const binding = driveExplorer
    ? {
        ...bindings,
        data: currentBindings
          ? { binding: fileId ? bindingsById.get(fileId) : undefined }
          : undefined,
      }
    : singleBinding;
  const saved = root.data?.root;
  const selectedBinding = binding.data?.binding;
  const folder = selectedBinding?.file.mimeType === DRIVE_FOLDER_MIME ? selectedBinding : null;
  const boundConnection = connections.data?.find(
    (connection) => connection.id === selectedBinding?.connectionId,
  );
  const accountLabel = (id: string) => {
    const connection = connections.data?.find((value) => value.id === id);
    if (!connection) return "Unavailable Drive connection. Choose a connection in Settings.";
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
    if (busy || focusAfterAction.current === null) return;
    if (focusAfterAction.current === "use" && binding.isPending && !binding.error) return;
    if (focusAfterAction.current === "choose" && root.isPending && !root.error) return;
    if (focusAfterAction.current === "select") {
      if (bindings.isPending || bindings.error) return;
      linkSelect.current?.focus();
      focusAfterAction.current = null;
      return;
    }
    const target =
      focusAfterAction.current === "use" && useButton.current && !useButton.current.disabled
        ? useButton.current
        : chooseButton.current;
    if (target && !target.disabled) target.focus();
    focusAfterAction.current = null;
  });
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
      focusAfterAction.current = "choose";
    }
  };
  return (
    <section
      aria-label="Project Drive folder"
      className="space-y-3 border-t border-border pt-3 pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11"
    >
      <h3 className="text-sm font-medium">Project Drive folder</h3>
      {saved ? (
        <p className="break-words text-sm">{root.data?.file?.name ?? saved.fileId}</p>
      ) : null}
      {saved ? (
        <p className="break-words text-xs text-muted-foreground">
          Drive connection: {accountLabel(saved.connectionId)}
        </p>
      ) : null}
      {busy || state || !root.error ? (
        <p
          role={busy || !state ? "status" : undefined}
          className="break-words text-xs text-muted-foreground"
        >
          {busy
            ? "Saving project folder..."
            : state
              ? rootMessages[state]
              : "Loading project Drive folder..."}
        </p>
      ) : null}
      {root.error || links.error || connections.error || error ? (
        <p role="alert" className="break-words text-sm text-destructive">
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
          aria-expanded={choosing}
          aria-controls={chooserId}
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
        <div id={chooserId} className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span>Confirmed Drive link</span>
            <select
              ref={linkSelect}
              aria-label="Confirmed Drive link"
              aria-busy={driveExplorer && bindings.isPending}
              className="w-full min-w-0 rounded-md border border-border bg-background p-2 pointer-coarse:min-h-11 pointer-coarse:text-base outline-none ring-ring/24 focus-visible:border-ring focus-visible:ring-[3px]"
              value={selected ? linkId : ""}
              disabled={!canOperate || busy}
              onChange={(event) => {
                setLinkId(event.target.value);
                setConnectionId("");
                setError(null);
              }}
            >
              <option value="">Choose a linked item to verify</option>
              {candidates.map((link) => {
                if (link.item.ref.type !== "file") return null;
                const id = link.item.ref.fileId;
                const known = bindingsById.get(id);
                const notFolder = known && known.file.mimeType !== DRIVE_FOLDER_MIME;
                if (notFolder && link.id !== linkId) return null;
                return (
                  <option key={link.id} value={link.id}>
                    {link.item.title ?? id}
                    {notFolder ? " (not a folder)" : ""}
                  </option>
                );
              })}
            </select>
          </label>
          {driveExplorer && bindings.error ? (
            <div role="alert" className="break-words text-sm text-destructive">
              <p>Could not check which linked items are folders.</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  focusAfterAction.current = "select";
                  bindings.refresh();
                }}
              >
                Retry folder check
              </Button>
            </div>
          ) : null}
          {driveExplorer && bindings.isPending && !currentBindings && !bindings.error ? (
            <p className="text-xs text-muted-foreground">
              Checking which linked items are folders...
            </p>
          ) : null}
          {selectedBinding ? (
            <p className="break-words text-xs text-muted-foreground">
              Bound to: {accountLabel(selectedBinding.connectionId)}
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
                <span>Verify with connection</span>
                <select
                  aria-label="Verify with connection"
                  className="w-full min-w-0 rounded-md border border-border bg-background p-2 pointer-coarse:min-h-11 pointer-coarse:text-base outline-none ring-ring/24 focus-visible:border-ring focus-visible:ring-[3px]"
                  value={connectionId}
                  disabled={!canOperate || busy}
                  onChange={(event) => setConnectionId(event.target.value)}
                >
                  <option value="">Choose a connection</option>
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
                    focusAfterAction.current = "use";
                  }
                }}
              >
                Verify and bind linked item
              </Button>
              {!driveExplorer && binding.error ? (
                <p role="alert" className="break-words text-sm text-destructive">
                  {binding.error}
                </p>
              ) : null}
            </>
          ) : null}
          {folder ? <p className="break-words text-sm">Folder: {folder.file.name}</p> : null}
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
                focusAfterAction.current = "choose";
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
        variant="outline"
        disabled={busy}
        aria-expanded={showLinks}
        aria-controls={linksId}
        onClick={() => setShowLinks(!showLinks)}
      >
        {showLinks ? "Close linked files" : "Link to"}
      </Button>
      {showLinks ? <div id={linksId}>{renderLinks}</div> : null}
    </section>
  );
}
