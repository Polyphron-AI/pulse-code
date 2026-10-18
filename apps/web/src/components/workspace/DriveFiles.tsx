import {
  type DriveFile,
  type DriveBinding,
  type DriveReadResult,
  type EnvironmentId,
  type WorkspaceLinkEndpoint,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  lazy,
  Suspense,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { drive } from "../../state/drive";
import { useEnvironmentQuery, type EnvironmentQueryView } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogPopup, DialogTitle, DialogHeader, DialogPanel } from "../ui/dialog";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";
const DriveItemMenu = lazy(() =>
  import("./WorkspaceItemActions").then((module) => ({ default: module.WorkspaceItemMenu })),
);
export const errorText = (result: Parameters<typeof squashAtomCommandFailure>[0]) => {
  const cause = squashAtomCommandFailure(result);
  return cause instanceof Error ? cause.message : "The Drive request could not finish.";
};
export function useDriveAccess(environmentId: EnvironmentId) {
  const canOperate = useWorkspaceCanOperate(environmentId);
  const connected = useConnectedEnvironmentIds().includes(environmentId);
  const connections = useEnvironmentQuery(
    connected ? drive.connections({ environmentId, input: {} }) : null,
  );
  return { connections, canOperate: canOperate && connected };
}
export function DriveSearch(props: {
  environmentId: EnvironmentId;
  onLink: (endpoint: WorkspaceLinkEndpoint) => Promise<void>;
}) {
  const { driveRead } = useMailCapabilities(props.environmentId);
  const connected = useConnectedEnvironmentIds().includes(props.environmentId);
  return driveRead && connected ? <DriveSearchAvailable {...props} /> : null;
}
function DriveSearchAvailable({
  environmentId,
  onLink,
}: {
  environmentId: EnvironmentId;
  onLink: (endpoint: WorkspaceLinkEndpoint) => Promise<void>;
}) {
  const { connections, canOperate } = useDriveAccess(environmentId);
  const search = useAtomCommand(drive.search, { reportFailure: false });
  const bind = useAtomCommand(drive.bind, { reportFailure: false });
  const [connectionId, setConnectionId] = useState("");
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<readonly DriveFile[]>([]);
  const [incomplete, setIncomplete] = useState(false);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2 border-t border-border pt-2">
      <p className="text-xs font-medium">Find a Drive file</p>
      <select
        className="w-full rounded-md border border-input bg-background p-2 text-sm"
        aria-label="Search Drive connection"
        value={connectionId}
        onChange={(event) => {
          setConnectionId(event.target.value);
          setFiles([]);
          setSearched(false);
        }}
        disabled={busy}
      >
        <option value="">Choose a Drive connection</option>
        {connections.data
          ?.filter((value) => value.connected)
          .map((value) => (
            <option key={value.id} value={value.id}>
              {value.nickname} ({value.identity?.email ?? value.identity?.name ?? "Connected"})
            </option>
          ))}
      </select>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          const result = await search({
            environmentId,
            input: { connectionId, query: query.trim(), limit: 20 },
          });
          setBusy(false);
          setSearched(true);
          if (result._tag === "Success") {
            setFiles(result.value.files);
            setIncomplete(result.value.incomplete);
          } else {
            setFiles([]);
            setError(errorText(result));
          }
        }}
      >
        <Input
          aria-label="Find a Drive file"
          placeholder="File name"
          maxLength={256}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          disabled={busy}
        />
        <Button
          size="sm"
          variant="outline"
          type="submit"
          disabled={busy || !connectionId || !query.trim()}
        >
          Search Drive
        </Button>
      </form>
      {connections.data?.every((value) => !value.connected) ? (
        <p className="text-xs text-muted-foreground">
          Connect Google Drive in Settings, Integrations. You can still paste a file link.
        </p>
      ) : null}
      {error || connections.error ? (
        <p role="alert" className="text-xs text-destructive">
          {error ?? connections.error}
        </p>
      ) : null}
      <ul className="max-h-48 overflow-y-auto">
        {files.map((file) => (
          <li key={file.id}>
            <Button
              className="h-auto w-full justify-start whitespace-normal text-left"
              size="sm"
              variant="ghost"
              disabled={busy || !canOperate}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const result = await bind({
                  environmentId,
                  input: { connectionId, fileId: file.id },
                });
                if (result._tag === "Failure") setError(errorText(result));
                else
                  try {
                    await onLink({
                      ref: { type: "file", provider: "google-drive", fileId: file.id },
                      title: result.value.file.name,
                    });
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : "Could not link this file.");
                  }
                setBusy(false);
              }}
            >
              {file.name}
            </Button>
          </li>
        ))}
      </ul>
      {searched && files.length === 0 && !error ? (
        <p className="text-xs text-muted-foreground">No matching files in this page.</p>
      ) : null}
      {incomplete ? (
        <p className="text-xs text-muted-foreground">
          Showing up to 20 files. Narrow your search for other matches.
        </p>
      ) : null}
    </div>
  );
}
export function DriveFileAccess({
  environmentId,
  fileId,
}: {
  environmentId: EnvironmentId;
  fileId: string;
}) {
  const { driveRead } = useMailCapabilities(environmentId);
  const connected = useConnectedEnvironmentIds().includes(environmentId);
  const [open, setOpen] = useState(false);
  return driveRead && connected ? (
    <>
      <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>
        Read file
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="w-full">
          <DialogHeader>
            <DialogTitle>Read Drive file</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            {open ? (
              <DriveReader
                key={`${environmentId}:${fileId}`}
                environmentId={environmentId}
                fileId={fileId}
              />
            ) : null}
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  ) : null;
}
interface DriveReaderProps {
  readonly environmentId: EnvironmentId;
  readonly fileId: string;
  readonly renderContent?: (result: DriveReadResult, text: string) => ReactNode;
  readonly actions?: ReactNode;
  readonly confirmed?: readonly WorkspaceLinkEndpoint[];
}
export function DriveReader(props: DriveReaderProps) {
  const { driveRead } = useMailCapabilities(props.environmentId);
  const connected = useConnectedEnvironmentIds().includes(props.environmentId);
  const hidden = useContext(WorkspaceResourcesBodyContext)?.hidden ?? false;
  if (hidden) return null;
  return driveRead && connected ? (
    <AvailableDriveReader {...props} />
  ) : (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {connected
          ? "Drive reading needs a newer server."
          : "Connect to this environment to read this document."}
      </p>
      <a
        className="inline-flex items-center text-sm underline pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-ring"
        href={`https://drive.google.com/file/d/${encodeURIComponent(props.fileId)}/view`}
        target="_blank"
        rel="noreferrer"
      >
        Open in Google Drive
      </a>
      {props.actions}
    </div>
  );
}
function AvailableDriveReader({ environmentId, fileId, ...props }: DriveReaderProps) {
  const binding = useEnvironmentQuery(drive.binding({ environmentId, input: { fileId } }));
  const { connections, canOperate } = useDriveAccess(environmentId);
  const changes = useEnvironmentQuery(drive.changes({ environmentId, input: {} }));
  const connectionId = binding.data?.binding?.connectionId;
  return (
    <DriveReaderContent
      key={JSON.stringify([
        environmentId,
        fileId,
        connectionId,
        changes.data,
        changes.error,
        binding.error,
        connections.error,
        connections.data?.find((value) => value.id === connectionId),
        binding.data?.binding?.file,
      ])}
      {...props}
      environmentId={environmentId}
      fileId={fileId}
      savedConnectionId={connectionId}
      binding={binding}
      connections={connections}
      canOperate={canOperate}
      subscriptionReady={changes.data !== null && !changes.error}
      subscriptionError={changes.error}
      onRetry={() => {
        binding.refresh();
        connections.refresh();
        changes.refresh();
      }}
    />
  );
}
const supportedDocument = (mimeType: string) =>
  mimeType.startsWith("text/") ||
  [
    "application/json",
    "application/xml",
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.presentation",
    "application/vnd.google-apps.spreadsheet",
  ].includes(mimeType);
function DriveReaderContent({
  environmentId,
  fileId,
  savedConnectionId,
  binding,
  connections,
  canOperate,
  renderContent,
  actions,
  confirmed,
  subscriptionReady,
  subscriptionError,
  onRetry,
}: DriveReaderProps & {
  savedConnectionId: string | undefined;
  binding: EnvironmentQueryView<{ readonly binding?: DriveBinding }>;
  connections: ReturnType<typeof useDriveAccess>["connections"];
  canOperate: boolean;
  subscriptionReady: boolean;
  subscriptionError: string | null;
  onRetry: () => void;
}) {
  const bind = useAtomCommand(drive.bind, { reportFailure: false });
  const read = useAtomCommand(drive.read, { reportFailure: false });
  const [connectionId, setConnectionId] = useState("");
  const [result, setResult] = useState<DriveReadResult | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  const inFlight = useRef(false);
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const metadata = result?.file ?? binding.data?.binding?.file;
  const unsupported = metadata?.mimeType && !supportedDocument(metadata.mimeType);
  const current = connections.data?.find((value) => value.id === savedConnectionId);
  const readable =
    !!savedConnectionId &&
    current?.connected !== false &&
    !binding.error &&
    !connections.error &&
    subscriptionReady &&
    !unsupported;
  const load = async (offset = 0) => {
    if (!active.current || inFlight.current || !readable) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const response = await read({ environmentId, input: { fileId, offset } });
    if (!active.current) return;
    inFlight.current = false;
    setBusy(false);
    if (response._tag === "Failure") setError(errorText(response));
    else if (
      response.value.connectionId !== savedConnectionId ||
      response.value.file.id !== fileId
    ) {
      setResult(null);
      setText("");
      setError("The file connection changed. Read the file again using its chosen connection.");
      binding.refresh();
    } else if (
      response.value.body.nextOffset !== undefined &&
      (!Number.isSafeInteger(response.value.body.nextOffset) ||
        response.value.body.nextOffset <= offset ||
        response.value.body.nextOffset > 256 * 1024)
    ) {
      setResult(null);
      setText("");
      setError("This document returned an invalid continuation. Read the file again.");
    } else {
      setResult(response.value);
      setText((previous) =>
        offset === 0 ? response.value.body.text : previous + response.value.body.text,
      );
    }
  };
  const providerAction = (
    <a
      href={`https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center text-sm underline pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-ring"
    >
      Open in Google Drive
    </a>
  );
  const inline = renderContent !== undefined;
  const menu = inline ? (
    <div className="absolute top-0 right-0">
      <Suspense fallback={null}>
        <DriveItemMenu
          environmentId={environmentId}
          item={{
            ref: { type: "file", provider: "google-drive", fileId },
            ...(metadata?.name ? { title: metadata.name } : {}),
          }}
          {...(confirmed ? { confirmed } : {})}
          triggerClassName="pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11"
          actions={
            <div className="flex flex-col gap-2">
              {providerAction}
              {actions}
            </div>
          }
        >
          {null}
        </DriveItemMenu>
      </Suspense>
    </div>
  ) : null;
  return (
    <div className="relative space-y-3 pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11">
      {!inline || !result ? (
        <>
          {!inline ? providerAction : null}
          {binding.data?.binding ? (
            <p className="text-xs text-muted-foreground">
              Chosen connection: {current?.nickname ?? "Unavailable connection"}
              {current && !current.connected ? " (disconnected)" : ""}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Choose the account allowed to read this file. Linking a file does not choose an
              account.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Read Drive connection"
              value={connectionId}
              onChange={(event) => setConnectionId(event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-input bg-background p-2 text-sm pointer-coarse:min-h-11 focus-visible:outline-2 focus-visible:outline-ring"
              disabled={busy || !canOperate}
            >
              <option value="">Choose a Drive connection</option>
              {connections.data
                ?.filter((value) => value.connected)
                .map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.nickname} ({value.identity?.email ?? value.identity?.name})
                  </option>
                ))}
            </select>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !canOperate || !connectionId}
              onClick={async () => {
                if (
                  !active.current ||
                  inFlight.current ||
                  !canOperate ||
                  !connections.data?.some((value) => value.id === connectionId && value.connected)
                )
                  return;
                inFlight.current = true;
                setBusy(true);
                setError(null);
                const response = await bind({ environmentId, input: { connectionId, fileId } });
                if (!active.current) return;
                inFlight.current = false;
                setBusy(false);
                if (response._tag === "Failure") setError(errorText(response));
                else {
                  binding.refresh();
                  setResult(null);
                  setText("");
                }
              }}
            >
              Use this connection
            </Button>
            <Button size="sm" disabled={busy || !readable} onClick={() => load()}>
              Read file
            </Button>
          </div>
          {unsupported ? (
            <p className="text-sm text-muted-foreground">
              Unsupported document type. Open in Google Drive.
            </p>
          ) : null}
          {current && !current.connected ? (
            <p className="text-sm text-muted-foreground">
              Reconnect this Drive connection in Settings, then read the file again.
            </p>
          ) : null}
        </>
      ) : null}
      {error || binding.error || connections.error || subscriptionError ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            {error ?? binding.error ?? connections.error ?? subscriptionError}
          </p>
          {binding.error || connections.error || subscriptionError ? (
            <Button size="sm" variant="outline" onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
      {result ? (
        <>
          {!inline ? <h3 className="text-sm font-medium">{result.file.name}</h3> : null}
          {renderContent ? (
            renderContent(result, text)
          ) : (
            <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words text-sm">
              {text}
            </pre>
          )}
          {result.limitation ? (
            <p className="text-xs text-muted-foreground">{result.limitation}</p>
          ) : null}
          {result.body.nextOffset !== undefined ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => load(result.body.nextOffset)}
            >
              Read more
            </Button>
          ) : result.body.truncated ? (
            <p className="text-xs text-muted-foreground">
              This view is incomplete. Open the full file in Google Drive.
            </p>
          ) : null}
        </>
      ) : null}
      {menu}
    </div>
  );
}
