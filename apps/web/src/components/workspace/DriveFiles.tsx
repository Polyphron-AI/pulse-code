import {
  type DriveFile,
  type DriveReadResult,
  type EnvironmentId,
  type WorkspaceLinkEndpoint,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useEffect, useRef, useState } from "react";
import { drive } from "../../state/drive";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Dialog, DialogPopup, DialogTitle, DialogHeader, DialogPanel } from "../ui/dialog";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
const errorText = (result: Parameters<typeof squashAtomCommandFailure>[0]) => {
  const cause = squashAtomCommandFailure(result);
  return cause instanceof Error ? cause.message : "The Drive request could not finish.";
};
function useDriveAccess(environmentId: EnvironmentId) {
  const canOperate = useWorkspaceCanOperate(environmentId);
  const connections = useEnvironmentQuery(drive.connections({ environmentId, input: {} }));
  return { connections, canOperate };
}
export function DriveSearch(props: {
  environmentId: EnvironmentId;
  onLink: (endpoint: WorkspaceLinkEndpoint) => Promise<void>;
}) {
  const { driveRead } = useMailCapabilities(props.environmentId);
  return driveRead ? <DriveSearchAvailable {...props} /> : null;
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
  const [open, setOpen] = useState(false);
  return driveRead ? (
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
function DriveReader({ environmentId, fileId }: { environmentId: EnvironmentId; fileId: string }) {
  const binding = useEnvironmentQuery(drive.binding({ environmentId, input: { fileId } }));
  const connectionId = binding.data?.binding?.connectionId;
  return (
    <DriveReaderContent
      key={connectionId ?? "unbound"}
      environmentId={environmentId}
      fileId={fileId}
      savedConnectionId={connectionId}
    />
  );
}
function DriveReaderContent({
  environmentId,
  fileId,
  savedConnectionId,
}: {
  environmentId: EnvironmentId;
  fileId: string;
  savedConnectionId: string | undefined;
}) {
  const { connections, canOperate } = useDriveAccess(environmentId);
  const binding = useEnvironmentQuery(drive.binding({ environmentId, input: { fileId } }));
  const bind = useAtomCommand(drive.bind, { reportFailure: false });
  const read = useAtomCommand(drive.read, { reportFailure: false });
  const [connectionId, setConnectionId] = useState("");
  const [result, setResult] = useState<DriveReadResult | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const load = async (offset = 0) => {
    setBusy(true);
    setError(null);
    const response = await read({ environmentId, input: { fileId, offset } });
    if (!active.current) return;
    setBusy(false);
    if (response._tag === "Failure") setError(errorText(response));
    else if (response.value.connectionId !== savedConnectionId) {
      setResult(null);
      setText("");
      setError("The file connection changed. Read the file again using its chosen connection.");
      binding.refresh();
    } else {
      setResult(response.value);
      setText((previous) =>
        offset === 0 ? response.value.body.text : previous + response.value.body.text,
      );
    }
  };
  const current = connections.data?.find(
    (value) => value.id === binding.data?.binding?.connectionId,
  );
  return (
    <div className="space-y-3">
      <a
        href={`https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`}
        target="_blank"
        rel="noreferrer"
        className="text-sm underline"
      >
        Open in Google Drive
      </a>
      {binding.data?.binding ? (
        <p className="text-xs text-muted-foreground">
          Chosen connection: {current?.nickname ?? "Unavailable connection"}
          {current && !current.connected ? " (disconnected)" : ""}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Choose the account allowed to read this file. Linking a file does not choose an account.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Read Drive connection"
          value={connectionId}
          onChange={(event) => setConnectionId(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-input bg-background p-2 text-sm"
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
            setBusy(true);
            setError(null);
            const response = await bind({ environmentId, input: { connectionId, fileId } });
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
        <Button size="sm" disabled={busy || !binding.data?.binding} onClick={() => void load()}>
          Read file
        </Button>
      </div>
      {error || binding.error || connections.error ? (
        <p role="alert" className="text-sm text-destructive">
          {error ?? binding.error ?? connections.error}
        </p>
      ) : null}
      {result ? (
        <>
          <h3 className="text-sm font-medium">{result.file.name}</h3>
          <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words text-sm">
            {text}
          </pre>
          {result.limitation ? (
            <p className="text-xs text-muted-foreground">{result.limitation}</p>
          ) : null}
          {result.body.nextOffset !== undefined ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void load(result.body.nextOffset)}
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
    </div>
  );
}
