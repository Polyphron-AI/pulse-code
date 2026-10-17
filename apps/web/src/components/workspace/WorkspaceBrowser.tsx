import { normalizeLinkUrl } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { lazy, Suspense, useContext, useEffect, useRef, useState } from "react";
import { useThreadShells } from "../../state/entities";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { workspaceTools } from "../../state/workspaceTools";
import { previewEnvironment } from "../../state/preview";
import { isPreviewSupportedInRuntime, useThreadPreviewState } from "../../previewStateStore";
import { readLocalApi } from "../../localApi";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { openPreviewSession } from "../preview/openPreviewSession";
import type { PreviewChromeRenderer } from "../preview/PreviewView";
import { useMailLinks } from "./mail/useMailLinks";
import { workspaceToolsError } from "./ProjectTasks";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
import { WorkspaceResourcesBodyContext } from "./workspaceResourceState";
import type { WorkspaceResourceBodyProps } from "./WorkspaceResourceBody";
import { WorkspaceBrowserView } from "./WorkspaceBrowserView";

const PreviewPanel = lazy(() =>
  import("../preview/PreviewPanel").then((module) => ({ default: module.PreviewPanel })),
);

export function WorkspaceBrowser({
  environmentId,
  projectId,
  selectedItem,
  request,
}: WorkspaceResourceBodyProps) {
  const hidden = useContext(WorkspaceResourcesBodyContext)?.hidden ?? false;
  const connected = useConnectedEnvironmentIds().includes(environmentId);
  const config = useEnvironmentQuery(
    connected && !hidden ? workspaceTools.config({ environmentId, input: { projectId } }) : null,
  );
  const threads = useThreadShells();
  const browserThread = threads.find(
    (thread) =>
      thread.environmentId === environmentId &&
      thread.projectId === projectId &&
      thread.id === config.data?.browserThreadId,
  );
  const threadRef = browserThread ? scopeThreadRef(environmentId, browserThread.id) : null;
  const preview = useThreadPreviewState(threadRef);
  const desktop = isPreviewSupportedInRuntime();
  const previewRead = useEnvironmentQuery(
    desktop && threadRef && connected && !hidden
      ? previewEnvironment.list({ environmentId, input: { threadId: threadRef.threadId } })
      : null,
  );
  const openPreview = useAtomCommand(previewEnvironment.open, { reportFailure: false });
  const { linkItem } = useMailLinks(environmentId);
  const canOperate = useWorkspaceCanOperate(environmentId) && connected && !hidden;
  const [address, setAddress] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = preview.snapshot?.navStatus;
  const current = desktop && status && status._tag !== "Idle" ? status.url : address;
  const page = normalizeLinkUrl(current);
  const permitted = canOperate && !config.error && !previewRead.error;
  const requested = request?.type === "url" ? normalizeLinkUrl(request.url) : null;
  const handledRequest = useRef<string | null>(null);

  const openAddress = async (url: string) => {
    if (!permitted || busy || (desktop && !threadRef)) return;
    setBusy(true);
    setError(null);
    try {
      if (desktop && threadRef) {
        const result = await openPreviewSession({ openPreview, threadRef, url });
        if (result._tag === "Failure") setError(workspaceToolsError(result));
      } else {
        const api = readLocalApi();
        if (!api) throw new Error("Browser is unavailable on this client.");
        await api.shell.openExternal(url);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The page could not be opened.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!desktop || !requested || !permitted || !threadRef || handledRequest.current === requested)
      return;
    handledRequest.current = requested;
    setAddress(requested);
    void openAddress(requested);
  });

  const linkPage = async () => {
    if (!permitted || busy || !page || selectedItem === null) return;
    setBusy(true);
    setError(null);
    try {
      await linkItem(selectedItem, {
        ref: { type: "url", url: page },
        title: desktop && status && status._tag !== "Idle" ? status.title : page,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This page could not be linked.");
    } finally {
      setBusy(false);
    }
  };
  const linkAction = (
    <Button
      size="xs"
      variant="ghost"
      disabled={busy || !permitted || !page || selectedItem === null}
      onClick={linkPage}
    >
      Link this page
    </Button>
  );
  const renderResourceChrome: PreviewChromeRenderer = (controls) => (
    <WorkspaceBrowserView
      addressDraft={address}
      linkTarget={selectedItem}
      displayedUrl={current}
      renderPage={null}
      menuOpen={menuOpen}
      unavailableReason={error ?? previewRead.error}
      disabled={!permitted || busy || controls.inputDisabled === true}
      onAddressChange={setAddress}
      onSubmit={() => {
        const url = normalizeLinkUrl(address);
        if (!url) {
          setError("Enter an http or https address.");
          return;
        }
        if (!permitted || busy) return;
        setError(null);
        controls.onSubmit(url);
      }}
      onMenuChange={setMenuOpen}
      onOpenExternal={() => {
        if (page)
          void readLocalApi()
            ?.shell.openExternal(page)
            .catch((cause: unknown) =>
              setError(cause instanceof Error ? cause.message : "The page could not be opened."),
            );
      }}
      menuActions={
        <>
          <Button
            size="xs"
            variant="ghost"
            disabled={!permitted || !controls.canGoBack}
            onClick={() => {
              if (permitted) controls.onBack();
            }}
          >
            Back
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={!permitted || !controls.canGoForward}
            onClick={() => {
              if (permitted) controls.onForward();
            }}
          >
            Forward
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={!permitted || controls.refreshDisabled}
            onClick={() => {
              if (permitted) controls.onRefresh();
            }}
          >
            Reload
          </Button>
          {permitted ? controls.leadingActions : null}
          {permitted ? controls.trailingActions : null}
          {error ? (
            <Button
              size="xs"
              variant="ghost"
              disabled={!permitted || busy}
              onClick={() => {
                const url = normalizeLinkUrl(address);
                if (url) void openAddress(url);
              }}
            >
              Retry
            </Button>
          ) : null}
          {linkAction}
        </>
      }
    />
  );

  if (hidden) {
    if (menuOpen) setMenuOpen(false);
    return null;
  }
  if (desktop) {
    if (!connected) return <p>Reconnect to use this project's Browser.</p>;
    if (!canOperate)
      return <p>Permission to operate this environment is required to use Browser.</p>;
    if (config.error) return <p role="alert">{config.error}</p>;
    if (!browserThread || !threadRef)
      return (
        <p className="text-xs text-muted-foreground">
          Choose an available Browser thread in this project's workspace settings.
        </p>
      );
    if (previewRead.error)
      return (
        <WorkspaceBrowserView
          addressDraft={address}
          linkTarget={selectedItem}
          displayedUrl={current}
          renderPage={null}
          menuOpen={menuOpen}
          unavailableReason={previewRead.error}
          disabled
          onAddressChange={setAddress}
          onSubmit={() => {}}
          onMenuChange={setMenuOpen}
          onOpenExternal={() => {
            if (page)
              void readLocalApi()
                ?.shell.openExternal(page)
                .catch(() => setError("The page could not be opened."));
          }}
          menuActions={
            <Button size="xs" variant="ghost" onClick={previewRead.refresh}>
              Retry
            </Button>
          }
        />
      );
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <Suspense fallback={<p role="status">Loading Browser...</p>}>
          <PreviewPanel
            mode="embedded"
            threadRef={threadRef}
            visible
            renderChrome={renderResourceChrome}
            surfaceCornerRadius={9}
          />
        </Suspense>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <Input
        aria-label="Browser page address"
        placeholder="https://"
        maxLength={2048}
        value={address}
        onChange={(event) => setAddress(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="xs"
          variant="outline"
          disabled={busy || !permitted || !normalizeLinkUrl(address)}
          onClick={() => {
            const url = normalizeLinkUrl(address);
            if (url) return openAddress(url);
          }}
        >
          Open in new tab
        </Button>
        {linkAction}
      </div>
      {selectedItem === null ? (
        <p className="text-xs text-muted-foreground">Select an item to link this page.</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        External tabs do not report navigation here. Paste the current page address before linking
        it.
      </p>
      {config.error || error ? (
        <p role="alert" className="text-xs text-destructive">
          {error ?? config.error}
        </p>
      ) : null}
    </div>
  );
}
