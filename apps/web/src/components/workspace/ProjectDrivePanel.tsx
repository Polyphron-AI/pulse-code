import { useEffect, useRef, useState } from "react";
import type { OfficeAccount, OfficeDriveFile, ProjectOffice } from "@t3tools/contracts";
import {
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  Grid2X2Icon,
  ListIcon,
  RefreshCwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { RequestState, useOfficeRequest } from "./office/shared";

import { driveResourceId } from "./projectWorkspace";
export { driveResourceId } from "./projectWorkspace";

export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";

function FileIcon({ file }: { file: OfficeDriveFile }) {
  return file.mimeType === DRIVE_FOLDER_MIME ? (
    <FolderIcon className="size-5 shrink-0 fill-warning/70 text-warning" />
  ) : (
    <FileTextIcon className="size-5 shrink-0 text-primary" />
  );
}

export function ProjectDriveConnection({
  drive,
  onSave,
}: {
  drive: ProjectOffice["drive"];
  onSave: (drive: ProjectOffice["drive"]) => Promise<boolean>;
}) {
  const { run, busy, error } = useOfficeRequest();
  const [accounts, setAccounts] = useState<readonly OfficeAccount[]>([]);
  const [accountId, setAccountId] = useState(drive?.accountId ?? "");
  const [folder, setFolder] = useState(drive?.folderId ?? "");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const saveLatest = useRef(onSave);
  useEffect(() => {
    saveLatest.current = onSave;
  }, [onSave]);
  async function refresh() {
    const result = await run({ operation: "accounts.list" });
    if (result?.accounts) setAccounts(result.accounts.filter((a) => a.provider === "google"));
  }
  useEffect(() => {
    void refresh();
  }, [run]);
  const account = accounts.find((a) => a.id === accountId);
  async function connect(upgrade: boolean) {
    const result = await run({
      operation: "accounts.connectOAuth",
      provider: "google",
      capabilities: ["drive"],
      ...(upgrade && account ? { accountId: account.id } : {}),
    });
    if (result?.accounts) {
      const googleAccounts = result.accounts.filter((a) => a.provider === "google");
      setAccounts(googleAccounts);
      if (!upgrade) {
        const connected = googleAccounts.find(
          (a) => !accounts.some((existing) => existing.id === a.id),
        );
        if (connected) setAccountId(connected.id);
      }
    }
  }
  async function save() {
    const folderId = driveResourceId(folder);
    if (!folderId || !account?.capabilities.includes("drive")) {
      setNotice("Choose a Drive account and enter a Google Drive folder link or ID.");
      return;
    }
    setNotice("");
    setSaving(true);
    try {
      const result = await run({ operation: "drive.get", accountId, fileId: folderId });
      if (!result?.file) return;
      if (result.file.mimeType !== DRIVE_FOLDER_MIME) {
        setNotice("Choose a folder, rather than a document.");
        return;
      }
      if (
        await saveLatest.current({
          accountId,
          folderId: result.file.id,
          folderName: result.file.name,
        })
      )
        setNotice("Project Drive folder saved.");
    } catch {
      setNotice("The project folder could not be saved. Your previous connection has been kept.");
    } finally {
      setSaving(false);
    }
  }
  async function unlink() {
    setSaving(true);
    setNotice("");
    try {
      if (await onSave(undefined)) {
        setFolder("");
        setNotice("Project Drive folder unlinked.");
      }
    } catch {
      setNotice("The folder could not be unlinked. Try again.");
    } finally {
      setSaving(false);
    }
  }
  if (!window.desktopBridge?.officeInvoke)
    return (
      <p className="text-sm text-muted-foreground">
        Connect Google Drive from Pulse desktop. Account access stays on that computer.
      </p>
    );
  return (
    <div className="space-y-3">
      <RequestState busy={busy || saving} error={error} />
      <label className="block text-xs">
        Google account
        <select
          className="mt-1 w-full rounded-md border bg-background p-2 text-sm"
          disabled={busy || saving}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          <option value="">Choose an account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.email}
              {a.capabilities.includes("drive") ? "" : " · Drive access needed"}
            </option>
          ))}
        </select>
      </label>
      {drive && !busy && !account && (
        <p role="status" className="text-xs text-muted-foreground">
          The linked Google account is not connected on this computer. Connect an account and relink
          the folder.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || saving}
          onClick={() => void connect(false)}
        >
          Connect Google account
        </Button>
        {account && (
          <Button size="sm" disabled={busy || saving} onClick={() => void connect(true)}>
            {account.capabilities.includes("drive")
              ? "Reconnect Google account"
              : "Allow Drive access"}
          </Button>
        )}
      </div>
      <label className="block text-xs">
        Default Google Drive folder
        <Input
          className="mt-1"
          disabled={busy || saving}
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          placeholder="Paste a Google Drive folder link"
        />
      </label>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={busy || saving || !account?.capabilities.includes("drive") || !folder.trim()}
          onClick={() => void save()}
        >
          Link folder
        </Button>
        {drive && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy || saving}
            onClick={() => void unlink()}
          >
            Unlink folder
          </Button>
        )}
      </div>
      {notice && (
        <p role="status" className="text-xs text-muted-foreground">
          {notice}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Linking a folder does not change its Google Drive sharing permissions. Unlinking leaves its
        files intact.
      </p>
    </div>
  );
}

export function ProjectDrivePanel({
  drive,
  onConfigure,
  onOpenFile,
  initialFolderId,
}: {
  drive: ProjectOffice["drive"];
  onConfigure: () => void;
  onOpenFile: (file: OfficeDriveFile, accountId: string) => void;
  initialFolderId?: string | undefined;
}) {
  const { run, busy, error } = useOfficeRequest({ queue: true });
  const [path, setPath] = useState(() =>
    drive
      ? [
          {
            id: initialFolderId ?? drive.folderId,
            name: initialFolderId ? "Shared folder" : drive.folderName,
          },
        ]
      : [],
  );
  const [files, setFiles] = useState<readonly OfficeDriveFile[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [grid, setGrid] = useState(false);
  const [fileType, setFileType] = useState("all");
  const [loaded, setLoaded] = useState(false);
  const generation = useRef(0);
  const folderId = path.at(-1)?.id;
  async function load(next?: string) {
    if (!drive || !folderId) return;
    const requestGeneration = ++generation.current;
    const result = await run({
      operation: "drive.list",
      accountId: drive.accountId,
      folderId,
      ...(query ? { query } : {}),
      ...(next ? { cursor: next } : {}),
    });
    if (!result || requestGeneration !== generation.current) return;
    setFiles((previous) => (next ? [...previous, ...(result.files ?? [])] : (result.files ?? [])));
    setCursor(result.nextCursor);
    setLoaded(true);
  }
  useEffect(() => {
    setLoaded(false);
    setFiles([]);
    setCursor(undefined);
    void load();
    return () => {
      generation.current++;
    };
  }, [drive?.accountId, folderId, query, run]);
  if (!drive)
    return (
      <div className="space-y-3 p-6">
        <FolderIcon className="size-8 text-muted-foreground" />
        <h2 className="font-semibold">Your project Drive</h2>
        <p className="text-sm text-muted-foreground">
          Link a Google Drive folder to open it automatically with this project.
        </p>
        <Button onClick={onConfigure}>Connect Google Drive</Button>
      </div>
    );
  if (!window.desktopBridge?.officeInvoke)
    return (
      <p className="p-6 text-sm text-muted-foreground">
        Open Pulse desktop on the computer with this Drive account to browse {drive.folderName}.
      </p>
    );
  function open(file: OfficeDriveFile) {
    if (file.mimeType === DRIVE_FOLDER_MIME) {
      setPath((p) => [...p, { id: file.id, name: file.name }]);
      setSearch("");
      setQuery("");
    } else if (drive) onOpenFile(file, drive.accountId);
  }
  const visibleFiles = files.filter(
    (file) =>
      fileType === "all" ||
      (fileType === "folders"
        ? file.mimeType === DRIVE_FOLDER_MIME
        : file.mimeType !== DRIVE_FOLDER_MIME),
  );
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <FolderIcon className="text-primary" />
          Google Drive
        </h2>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Refresh Drive"
          disabled={busy}
          onClick={() => void load()}
        >
          <RefreshCwIcon />
        </Button>
      </div>
      <form
        className="flex items-center gap-2 rounded-full bg-muted/80 px-4 py-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) setQuery(search.trim());
        }}
      >
        <SearchIcon className="size-4 text-muted-foreground" />
        <Input
          disabled={busy}
          unstyled
          aria-label="Search in this Drive folder"
          placeholder="Search in this folder"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button type="submit" size="sm" variant="ghost" disabled={busy}>
          Search
        </Button>
      </form>
      <nav aria-label="Drive folders" className="flex flex-wrap items-center gap-1 text-sm">
        {path.map((p, i) => (
          <span key={p.id} className="flex items-center">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setPath(path.slice(0, i + 1));
                setSearch("");
                setQuery("");
              }}
            >
              {p.name}
            </Button>
            {i < path.length - 1 && <ChevronRightIcon className="size-3" />}
          </span>
        ))}
      </nav>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 rounded-lg border border-border/80 px-3 py-1.5 text-xs">
          <SlidersHorizontalIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <select
            aria-label="File type"
            value={fileType}
            onChange={(event) => setFileType(event.target.value)}
            className="bg-background"
          >
            <option value="all">All types</option>
            <option value="folders">Folders</option>
            <option value="files">Files</option>
          </select>
        </label>
        <div className="flex overflow-hidden rounded-full border">
          <Button
            size="icon-sm"
            variant={grid ? "ghost" : "secondary"}
            aria-label="List view"
            aria-pressed={!grid}
            onClick={() => setGrid(false)}
          >
            <ListIcon />
          </Button>
          <Button
            size="icon-sm"
            variant={grid ? "secondary" : "ghost"}
            aria-label="Grid view"
            aria-pressed={grid}
            onClick={() => setGrid(true)}
          >
            <Grid2X2Icon />
          </Button>
        </div>
      </div>
      <RequestState busy={busy} error={error} />
      {grid ? (
        <div className="grid grid-cols-2 gap-2">
          {visibleFiles.map((file) => (
            <button
              disabled={busy}
              key={file.id}
              className="flex min-w-0 flex-col gap-3 rounded-xl border border-border/60 bg-muted/30 p-4 text-left hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => open(file)}
            >
              <FileIcon file={file} />
              <span className="w-full truncate text-sm">{file.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th className="pb-2 font-normal">Name</th>
              <th className="w-24 pb-2 font-normal">Modified</th>
            </tr>
          </thead>
          <tbody>
            {visibleFiles.map((file) => (
              <tr key={file.id} className="border-b border-border/50 hover:bg-primary/5">
                <td className="py-3">
                  <button
                    disabled={busy}
                    className="flex w-full items-center gap-3 rounded-sm pr-2 text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() => open(file)}
                  >
                    <FileIcon file={file} />
                    <span className="truncate">{file.name}</span>
                  </button>
                </td>
                <td className="text-xs text-muted-foreground">
                  {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error && (
        <Button variant="outline" onClick={onConfigure}>
          Manage Drive connection
        </Button>
      )}
      {loaded && !busy && !error && !visibleFiles.length && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {query || fileType !== "all"
            ? "No matching files in this folder."
            : "This folder is empty."}
        </p>
      )}
      {cursor && (
        <Button variant="outline" disabled={busy} onClick={() => void load(cursor)}>
          Load more files
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Linked to this project. Access follows your Google Drive permissions.
      </p>
    </div>
  );
}
