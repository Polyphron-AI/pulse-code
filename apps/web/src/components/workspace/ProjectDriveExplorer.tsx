import {
  DRIVE_FOLDER_MIME,
  DRIVE_SHORTCUT_MIME,
  type DriveBrowseInput,
  type DriveBrowsePage,
  type DriveFile,
  type WorkspaceLinkEndpoint,
} from "@t3tools/contracts";
import {
  useCallback,
  useLayoutEffect,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { useEnvironmentSettings } from "../../hooks/useSettings";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { drive } from "../../state/drive";
import { workspaceLinks } from "../../state/workspaceLinks";
import { Button } from "../ui/button";
import { DriveFileAccess, errorText } from "./DriveFiles";
import { WorkspaceProjectFiles } from "./WorkspaceToolsPanel";
import { WorkspaceItemMenu } from "./WorkspaceItemActions";
import { ProjectDriveRootSettings } from "./ProjectDriveRootSettings";
import {
  ProjectDriveExplorerView,
  type ProjectDriveExplorerViewProps,
} from "./ProjectDriveExplorerView";
import type { WorkspaceResourceBodyProps } from "./WorkspaceResourceBody";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useMailLinks } from "./mail/useMailLinks";
import { readLocalApi } from "../../localApi";

export type ProjectDriveExplorerProps = WorkspaceResourceBodyProps &
  (
    | { mode?: "browse"; onChoose?: never; onCancel?: never }
    | {
        mode: "pick";
        onChoose: (choice: { endpoint: WorkspaceLinkEndpoint; connectionId: string }) => void;
        onCancel: () => void;
      }
  );
const endpoint = (file: DriveFile): WorkspaceLinkEndpoint => ({
  ref: { type: "file", provider: "google-drive", fileId: file.id },
  title: file.name,
});
const rootMessages = {
  unconfigured: "Choose a confirmed project folder to browse Drive.",
  available: null,
  unlinked: "This project folder is no longer linked.",
  disconnected: "Reconnect this Drive connection in Settings.",
  "binding-changed": "The folder connection changed. Choose the project folder again.",
  unavailable: "This project folder is unavailable. Verify the folder or choose another.",
};

/** One Files body on web, desktop and phone web, gated on live capability. */
export function ProjectDriveExplorer(p: ProjectDriveExplorerProps) {
  const capabilities = useMailCapabilities(p.environmentId);
  const connected = useConnectedEnvironmentIds().includes(p.environmentId);
  const hidden = useContext(WorkspaceResourcesBodyContext)?.hidden ?? false;
  if (hidden) return null;
  if (!connected)
    return (
      <p className="text-sm text-muted-foreground">
        Connect to this environment to browse its project files.
      </p>
    );
  if (!capabilities.driveExplorer) return <WorkspaceProjectFiles {...p} />;
  return <Explorer key={`${p.environmentId}:${p.projectId}`} {...p} />;
}
type PageState = {
  scope: string;
  files: readonly DriveFile[];
  page: DriveBrowsePage | null;
  pending: boolean;
  error: string | null;
};
function Explorer(p: ProjectDriveExplorerProps) {
  const { environmentId, projectId } = p;
  const root = useEnvironmentQuery(drive.projectRoot({ environmentId, input: { projectId } }));
  const links = useEnvironmentQuery(
    workspaceLinks.list({ environmentId, input: { item: { type: "project", projectId } } }),
  );
  const connections = useEnvironmentQuery(
    root.data?.state === "unconfigured" && !root.isPending
      ? drive.connections({ environmentId, input: {} })
      : null,
  );
  const list = useAtomCommand(drive.listChildren, { reportFailure: false });
  const canOperate = useWorkspaceCanOperate(environmentId);
  const timeZone =
    useEnvironmentSettings(environmentId, (s) => s.workspaceDisplayTimeZone) ?? "UTC";
  const [path, setPath] = useState<readonly { fileId: string; title: string }[]>([]);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [filters, setFilters] = useState<ProjectDriveExplorerViewProps["filters"]>({});
  const [sort, setSort] = useState<DriveBrowseInput["sort"]>("name");
  const [direction, setDirection] = useState<DriveBrowseInput["direction"]>("asc");
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [selection, setSelection] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState<PageState>({
    scope: "",
    files: [],
    page: null,
    pending: false,
    error: null,
  });
  const host = useRef<HTMLDivElement>(null);
  const memories = useRef(new Map<string, { selection: string | null; scrollTop: number }>());
  const restore = useRef<{ selection: string | null; scrollTop: number } | null>(null);
  const epoch = useRef(0);
  const mounted = useRef(true);
  const queue = useRef<{
    running: boolean;
    next: null | { input: DriveBrowseInput; scope: string; append: boolean; epoch: number };
  }>({ running: false, next: null });
  const saved = root.data?.root;
  const rootIdentity = JSON.stringify(saved ?? null);
  const [pathRoot, setPathRoot] = useState(rootIdentity);
  if (pathRoot !== rootIdentity) {
    setPathRoot(rootIdentity);
    setPath([]);
    setSelection(null);
  }
  const currentPath = pathRoot === rootIdentity ? path : [];
  const unlinked = Boolean(
    saved &&
    links.data &&
    !links.data.truncated &&
    !links.data.linked.some(
      (link) =>
        link.id === saved.linkId &&
        link.status === "confirmed" &&
        link.item.ref.type === "file" &&
        link.item.ref.provider === "google-drive" &&
        link.item.ref.fileId === saved.fileId,
    ),
  );
  const available = !unlinked && root.data?.state === "available" && !root.error && !!saved;
  const input = useMemo<DriveBrowseInput | null>(
    () =>
      !available || !saved
        ? null
        : {
            projectId,
            connectionId: saved.connectionId,
            parentId: currentPath.at(-1)?.fileId ?? saved.fileId,
            path: currentPath.map((item) => item.fileId),
            sort,
            direction,
            limit: 20,
            ...(submitted ? { query: submitted } : {}),
            ...filters,
          },
    [available, saved, projectId, currentPath, sort, direction, submitted, filters],
  );
  const scope = JSON.stringify([input, rootIdentity, root.data?.state, refresh]);
  const requestState = useRef({ scope, input });
  useLayoutEffect(() => {
    requestState.current = { scope, input };
  }, [scope, input]);
  const run = useCallback(async () => {
    if (queue.current.running) return;
    queue.current.running = true;
    try {
      while (mounted.current && queue.current.next) {
        const task = queue.current.next;
        queue.current.next = null;
        setPage((previous) => ({ ...previous, pending: true, error: null }));
        try {
          const response = await list({ environmentId, input: task.input });
          if (
            !mounted.current ||
            task.epoch !== epoch.current ||
            task.scope !== requestState.current.scope
          )
            continue;
          if (response._tag === "Failure") {
            setPage((previous) => ({ ...previous, pending: false, error: errorText(response) }));
            continue;
          }
          setPage((previous) => ({
            scope: task.scope,
            pending: false,
            error: null,
            page: response.value,
            files: [
              ...new Map(
                (task.append
                  ? [...previous.files, ...response.value.files]
                  : response.value.files
                ).map((file) => [file.id, file]),
              ).values(),
            ],
          }));
        } catch (error) {
          if (mounted.current && task.epoch === epoch.current)
            setPage((previous) => ({
              ...previous,
              pending: false,
              error: error instanceof Error ? error.message : "Files could not be loaded.",
            }));
        }
      }
    } finally {
      queue.current.running = false;
    }
  }, [list, environmentId]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current++;
      queue.current.next = null;
    };
  }, []);
  useEffect(() => {
    const input = requestState.current.input;
    const request = ++epoch.current;
    setPage({ scope, files: [], page: null, pending: input !== null, error: null });
    setSelection(null);
    queue.current.next = input ? { input, scope, append: false, epoch: request } : null;
    if (input) void run();
    // The serialized scope owns the request; inputs have the same meaning until it changes.
  }, [scope, run]);
  const refreshRoot = root.refresh;
  const linkVersion = useRef(links.dataUpdatedAt);
  useEffect(() => {
    if (linkVersion.current === links.dataUpdatedAt) return;
    linkVersion.current = links.dataUpdatedAt;
    refreshRoot();
  }, [links.dataUpdatedAt, refreshRoot]);
  const current =
    page.scope === scope
      ? page
      : { scope, files: [], page: null, pending: input !== null, error: null };
  const files = current.files;
  useEffect(() => {
    if (!current.pending && current.page && restore.current) {
      const memory = restore.current;
      restore.current = null;
      setSelection(memory.selection);
      const scroller = host.current?.closest("[data-workspace-resource-body]");
      if (scroller) scroller.scrollTop = memory.scrollTop;
    }
  }, [current.pending, current.page]);
  const selected = files.find((file) => file.id === selection);
  const breadcrumbs = saved
    ? [
        {
          fileId: saved.fileId,
          title: current.page?.rootFile?.name ?? root.data?.file?.name ?? saved.fileId,
        },
        ...currentPath,
      ]
    : [];
  const linked = new Map(
    (links.data?.linked ?? []).flatMap((link) =>
      link.status === "confirmed" &&
      link.item.ref.type === "file" &&
      link.item.ref.provider === "google-drive"
        ? [[link.item.ref.fileId, link] as const]
        : [],
    ),
  );
  const handledRequest = useRef<{
    request: typeof p.request;
    rootIdentity: string;
    complete: boolean;
  } | null>(null);
  const [intent, setIntent] = useState<{
    request: typeof p.request;
    scope: string;
    files: readonly DriveFile[];
    message: string;
  } | null>(null);
  const intentError =
    p.request && intent?.request === p.request && intent.scope === scope && intent.files === files
      ? intent.message
      : null;
  useEffect(() => {
    const request = p.request;
    if (
      !request ||
      request.type !== "file" ||
      request.provider !== "google-drive" ||
      !saved ||
      !available ||
      current.pending
    )
      return;
    if (
      handledRequest.current?.request === request &&
      handledRequest.current.rootIdentity === rootIdentity &&
      handledRequest.current.complete
    )
      return;
    handledRequest.current = { request, rootIdentity, complete: true };
    if (request.fileId === saved.fileId) {
      setPath([]);
      return;
    }
    const found = files.find((file) => file.id === request.fileId);
    if (found?.mimeType === DRIVE_FOLDER_MIME && currentPath.length < 16) {
      setPath([...currentPath, { fileId: found.id, title: found.name }]);
      return;
    }
    if (found && found.mimeType !== DRIVE_FOLDER_MIME) {
      setSelection(found.id);
      return;
    }
    handledRequest.current.complete = false;
    setIntent({
      request,
      scope,
      files,
      message:
        "This item is not in the loaded folder. Open it in Google Drive, or browse from the project folder.",
    });
  }, [p.request, saved, rootIdentity, scope, available, current.pending, files, currentPath]);
  const more = () => {
    if (!input || !current.page?.nextCursor || current.pending || queue.current.running) return;
    queue.current.next = {
      input: {
        ...input,
        cursor: current.page.nextCursor,
      },
      scope,
      append: files.length + input.limit <= 200,
      epoch: epoch.current,
    };
    void run();
  };
  const view = (
    <ProjectDriveExplorerView
      files={files}
      linkedFileIds={new Set(linked.keys())}
      breadcrumbs={breadcrumbs}
      selectedFileId={selection}
      query={query}
      filters={filters}
      sort={sort}
      direction={direction}
      layout={layout}
      pending={current.pending}
      error={current.error ?? root.error}
      unavailableReason={
        unlinked
          ? rootMessages.unlinked
          : root.isPending && !root.data && !root.error
            ? "Loading project Drive folder..."
            : root.data?.state === "unconfigured" &&
                connections.data?.every((connection) => !connection.connected)
              ? "Connect Google Drive in Settings."
              : root.data
                ? rootMessages[root.data.state]
                : root.error
                  ? null
                  : "Loading project Drive folder..."
      }
      incomplete={current.page?.incomplete ?? false}
      hasMore={!!current.page?.nextCursor}
      pageLimitReached={files.length + (input?.limit ?? 20) > 200}
      sharingText="Files stay in Google Drive."
      canOperate={canOperate}
      timeZone={timeZone}
      onQueryChange={(value) => {
        setQuery(value);
        if (!value) setSubmitted("");
      }}
      onSearch={() => setSubmitted(query.trim())}
      onFiltersChange={(value) => {
        setFilters(value);
        if (!Object.keys(value).length) {
          setQuery("");
          setSubmitted("");
        }
      }}
      onSortChange={(sort, direction) => {
        setSort(sort);
        setDirection(direction);
      }}
      onLayoutChange={setLayout}
      onBrowse={(id) => {
        if (!saved) return;
        const parent = currentPath.at(-1)?.fileId ?? saved.fileId;
        memories.current.set(parent, {
          selection,
          scrollTop: host.current?.closest("[data-workspace-resource-body]")?.scrollTop ?? 0,
        });
        restore.current = memories.current.get(id) ?? null;
        setSubmitted("");
        setQuery("");
        if (id === saved.fileId) {
          setPath([]);
          return;
        }
        const back = currentPath.findIndex((crumb) => crumb.fileId === id);
        if (back >= 0) {
          setPath(currentPath.slice(0, back + 1));
          return;
        }
        const file = files.find((file) => file.id === id);
        if (file?.mimeType === DRIVE_FOLDER_MIME && currentPath.length < 16)
          setPath([...currentPath, { fileId: id, title: file.name }]);
      }}
      onOpen={setSelection}
      onFileMenu={setSelection}
      onRefresh={() => {
        setRefresh((value) => value + 1);
        root.refresh();
      }}
      onMore={more}
      onOpenSettings={() => setSettings(!settings)}
      picker={
        p.mode === "pick"
          ? {
              onCancel: p.onCancel,
              onChoose: (id) => {
                const chosen = files.find((file) => file.id === id);
                if (chosen && saved && available)
                  p.onChoose({ endpoint: endpoint(chosen), connectionId: saved.connectionId });
              },
            }
          : null
      }
      renderItem={(file, row) => (
        <WorkspaceItemMenu
          environmentId={environmentId}
          item={endpoint(file)}
          triggerClassName={
            file.mimeType === DRIVE_FOLDER_MIME
              ? "shrink-0 pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11"
              : "shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11"
          }
          actions={
            <FileActions
              key={`${environmentId}:${projectId}:${file.id}:${saved?.connectionId}`}
              environmentId={environmentId}
              projectId={projectId}
              file={file}
              connectionId={saved?.connectionId ?? ""}
              linkId={linked.get(file.id)?.id}
              canOperate={canOperate}
            />
          }
        >
          {row}
        </WorkspaceItemMenu>
      )}
    />
  );
  return (
    <div ref={host} className="min-w-0">
      {view}
      {intentError ? (
        <div className="mt-3 space-y-2">
          <p role="status" className="break-words text-xs text-muted-foreground">
            {intentError}
          </p>
          {p.request?.type === "file" ? (
            <ProviderOpen
              key={JSON.stringify(p.request)}
              url={
                p.request.driveKind === "folder"
                  ? `https://drive.google.com/drive/folders/${encodeURIComponent(p.request.fileId)}`
                  : `https://drive.google.com/file/d/${encodeURIComponent(p.request.fileId)}/view`
              }
            />
          ) : null}
        </div>
      ) : null}
      {selected && p.mode !== "pick" ? (
        <div className="mt-3 space-y-2">
          <h3 className="break-words text-sm">{selected.name}</h3>
          {selected.mimeType === DRIVE_SHORTCUT_MIME ? (
            <p className="text-xs text-muted-foreground">
              Open this shortcut in Google Drive. Shortcuts are not browsed here.
            </p>
          ) : null}
          <DriveFileAccess environmentId={environmentId} fileId={selected.id} />
        </div>
      ) : null}
      {intentError &&
      p.request?.type === "file" &&
      p.request.driveKind !== "folder" &&
      p.mode !== "pick" ? (
        <DriveFileAccess environmentId={environmentId} fileId={p.request.fileId} />
      ) : null}
      {settings ? (
        <ProjectDriveRootSettings environmentId={environmentId} projectId={projectId} />
      ) : null}
    </div>
  );
}
async function openExternal(url: string) {
  const api = readLocalApi();
  if (!api) throw new Error("Google Drive could not be opened. Try again from this client.");
  await api.shell.openExternal(url);
}
function ProviderOpen({ url }: { url: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2 pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11">
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          setError(null);
          try {
            await openExternal(url);
          } catch (error) {
            setError(error instanceof Error ? error.message : "Google Drive could not be opened.");
          }
        }}
      >
        Open in Google Drive
      </Button>
      {error ? (
        <p role="alert" className="break-words text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
function FileActions({
  environmentId,
  projectId,
  file,
  connectionId,
  linkId,
  canOperate,
}: Pick<WorkspaceResourceBodyProps, "environmentId" | "projectId"> & {
  file: DriveFile;
  connectionId: string;
  linkId: string | undefined;
  canOperate: boolean;
}): ReactNode {
  const bind = useAtomCommand(drive.bind, { reportFailure: false });
  const { linkItem, unlink } = useMailLinks(environmentId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const act = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : "The action could not finish.");
    }
  };
  const run = async () => {
    if (!canOperate || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (linkId) await unlink(linkId);
      else {
        const result = await bind({ environmentId, input: { connectionId, fileId: file.id } });
        if (result._tag === "Failure") {
          setError(errorText(result));
          return;
        }
        try {
          await linkItem(endpoint(result.value.file), { ref: { type: "project", projectId } });
        } catch (error) {
          throw new Error(
            `The file is bound to the chosen connection, but linking failed. ${error instanceof Error ? error.message : "Retry linking."}`,
            { cause: error },
          );
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "The link could not be changed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2 pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11">
      <Button size="sm" variant="ghost" onClick={() => void act(() => openExternal(file.url))}>
        Open in Google Drive
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          void act(async () => {
            await writeTextToClipboard(file.url, "Drive link");
            setCopied(true);
          })
        }
      >
        {copied ? "Copied" : "Copy link"}
      </Button>
      {canOperate ? (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run()}>
          {linkId ? "Unlink from project" : "Link to project"}
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="break-words text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
