import { normalizeLinkUrl } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { useThreadShell } from "../../state/entities";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { workspaceTools } from "../../state/workspaceTools";
import { previewEnvironment } from "../../state/preview";
import { isPreviewSupportedInRuntime, useThreadPreviewState } from "../../previewStateStore";
import { readLocalApi } from "../../localApi";
import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { Button } from "../ui/button";
import { openPreviewSession } from "../preview/openPreviewSession";
import type { PreviewChromeRenderer } from "../preview/PreviewView";
import type { PreviewChromeRow } from "../preview/PreviewChromeRow";
import { useMailLinks } from "./mail/useMailLinks";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { workspaceToolsError } from "./ProjectTasks";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
import {
  useWorkspaceBrowserDraft,
  WorkspaceResourcesBodyContext,
  WorkspaceResourcesContext,
} from "./workspaceResourceState";
import type { WorkspaceResourceBodyProps } from "./WorkspaceResourceBody";
import { WorkspaceBrowserExternalPage, WorkspaceBrowserView } from "./WorkspaceBrowserView";

const PreviewPanel = lazy(() =>
  import("../preview/PreviewPanel").then((module) => ({ default: module.PreviewPanel })),
);

/** Opens an external page through the client, without a preview environment. */
async function openExternalUrl(url: string) {
  const api = readLocalApi();
  if (!api) throw new Error("Browser is unavailable on this client.");
  await api.shell.openExternal(url);
}

export type WorkspaceBrowserProps = WorkspaceResourceBodyProps;

/** Presents the project's desktop lease inline, with external opening on other clients. */
export function WorkspaceBrowser({
  environmentId,
  projectId,
  selectedItem,
  request,
}: WorkspaceBrowserProps) {
  const hidden = useContext(WorkspaceResourcesBodyContext)?.hidden ?? false;
  const resources = useContext(WorkspaceResourcesContext);
  const connected = useConnectedEnvironmentIds().includes(environmentId);
  const config = useEnvironmentQuery(
    connected && !hidden ? workspaceTools.config({ environmentId, input: { projectId } }) : null,
  );
  const browserThreadId = config.data?.browserThreadId;
  const configuredRef = useMemo(
    () => (browserThreadId ? scopeThreadRef(environmentId, browserThreadId) : null),
    [environmentId, browserThreadId],
  );
  const browserThread = useThreadShell(configuredRef);
  const threadRef =
    browserThread?.projectId === projectId && browserThread.environmentId === environmentId
      ? configuredRef
      : null;
  const preview = useThreadPreviewState(threadRef);
  const desktop = isPreviewSupportedInRuntime();
  const previewRead = useEnvironmentQuery(
    desktop && threadRef && connected && !hidden
      ? previewEnvironment.list({ environmentId, input: { threadId: threadRef.threadId } })
      : null,
  );
  const openPreview = useAtomCommand(previewEnvironment.open, { reportFailure: false });
  const { linkItem } = useMailLinks(environmentId);
  const { workspaceLinks, ready: capabilitiesReady } = useMailCapabilities(environmentId);
  const canOperate = useWorkspaceCanOperate(environmentId) && connected && !hidden;
  const external = !desktop || Boolean(previewRead.error);
  const permitted = canOperate && !config.error;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryUrl, setRetryUrl] = useState<string | null>(null);
  const [requestedAddress, setRequestedAddress] = useState<{ url: string } | null>(null);
  const draft = useWorkspaceBrowserDraft(environmentId, projectId);
  const admittedRequest = useRef<WorkspaceBrowserProps["request"]>(null);
  const externalOpening = useRef(false);
  const linkUnavailableReason = !connected
    ? "Reconnect to link this page."
    : !canOperate
      ? "Permission to operate this environment is required to link this page."
      : !capabilitiesReady
        ? "Checking whether this server supports linking."
        : !workspaceLinks
          ? "This server does not support linking yet."
          : config.error
            ? "Browser settings are unavailable. Retry before linking this page."
            : null;
  const status = preview.snapshot?.navStatus;
  const current = desktop && status && status._tag !== "Idle" ? status.url : "";
  const openAddress = useCallback(
    async (url: string) => {
      if (desktop && (!permitted || previewRead.error || !threadRef)) return;
      setBusy(true);
      setError(null);
      setRetryUrl(null);
      try {
        if (desktop && threadRef) {
          const result = await openPreviewSession({ openPreview, threadRef, url });
          if (result._tag === "Failure") {
            setError(workspaceToolsError(result));
            setRetryUrl(url);
          }
        } else {
          await openExternalUrl(url);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The page could not be opened.");
        setRetryUrl(url);
      } finally {
        setBusy(false);
      }
    },
    [desktop, permitted, previewRead.error, threadRef, openPreview],
  );
  const clearRequest = resources?.clearRequest;
  useEffect(() => {
    if (hidden || request?.type !== "url" || admittedRequest.current === request || !clearRequest)
      return;
    if (!external && (!permitted || !threadRef || busy)) return;
    const url = normalizeLinkUrl(request.url);
    if (!url) return;
    admittedRequest.current = request;
    draft.write(url);
    // eslint-disable-next-line react/set-state-in-effect -- Navigation requests arrive outside the chrome and are consumed after admission.
    setRequestedAddress({ url });
    if (!external) void openAddress(url);
    clearRequest(request);
  }, [external, request, permitted, threadRef, busy, clearRequest, openAddress, hidden, draft]);

  const linkPage = async (url: string) => {
    if (!permitted || linkUnavailableReason || busy || selectedItem === null) return;
    setBusy(true);
    setError(null);
    setRetryUrl(null);
    try {
      await linkItem(selectedItem, {
        ref: { type: "url", url },
        title: !external && status?._tag === "Success" ? status.title : url,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This page could not be linked.");
    } finally {
      setBusy(false);
    }
  };
  const openExternal = async (url: string) => {
    if (externalOpening.current) return;
    externalOpening.current = true;
    setBusy(true);
    setError(null);
    try {
      await openExternalUrl(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The page could not be opened.");
    } finally {
      externalOpening.current = false;
      setBusy(false);
    }
  };
  const chrome = {
    selectedItem,
    permitted,
    linkUnavailableReason,
    busy,
    error: error ?? previewRead.error,
    retryUrl,
    requestedAddress,
    draft,
    current,
    onOpen: openAddress,
    onLink: linkPage,
    onOpenExternal: openExternal,
    onAddressEdited: () => setError(null),
    onRetryRead:
      previewRead.error && capabilitiesReady && workspaceLinks ? previewRead.refresh : undefined,
  };
  const renderResourceChrome: PreviewChromeRenderer = (controls) => (
    <ResourceBrowserChrome {...chrome} controls={controls} />
  );
  if (hidden) return null;
  if (desktop) {
    if (!connected)
      return (
        <p className="text-xs text-muted-foreground">Reconnect to use this project's Browser.</p>
      );
    if (!canOperate)
      return (
        <p className="text-xs text-muted-foreground">
          Permission to operate this environment is required to use Browser.
        </p>
      );
    if (config.error)
      return (
        <p role="alert" className="text-xs text-destructive">
          {config.error}
        </p>
      );
    if (config.data === undefined && !config.error)
      return (
        <p role="status" className="text-xs text-muted-foreground">
          Loading Browser settings...
        </p>
      );
    if (!threadRef)
      return (
        <p className="text-xs text-muted-foreground">
          Choose an available Browser thread in this project's workspace settings.
        </p>
      );
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {previewRead.error ? (
          <ResourceBrowserChrome {...chrome} external />
        ) : (
          <Suspense fallback={<p role="status">Loading Browser...</p>}>
            <PreviewPanel
              mode="embedded"
              threadRef={threadRef}
              visible
              renderChrome={renderResourceChrome}
              surfaceCornerRadius={9}
            />
          </Suspense>
        )}
      </div>
    );
  }
  return <ResourceBrowserChrome {...chrome} external />;
}

/** Keeps address edits and popup state outside the native preview render tree. */
function ResourceBrowserChrome({
  controls,
  selectedItem,
  permitted,
  linkUnavailableReason,
  busy,
  error,
  retryUrl,
  requestedAddress,
  draft,
  current,
  onOpen,
  onLink,
  onOpenExternal,
  onAddressEdited,
  onRetryRead,
  external = false,
}: {
  controls?: ComponentProps<typeof PreviewChromeRow>;
  selectedItem: WorkspaceBrowserProps["selectedItem"];
  permitted: boolean;
  linkUnavailableReason: string | null;
  busy: boolean;
  error: string | null;
  retryUrl: string | null;
  requestedAddress: { url: string } | null;
  draft: ReturnType<typeof useWorkspaceBrowserDraft>;
  current: string;
  onOpen: (url: string) => Promise<void>;
  onLink: (url: string) => Promise<void>;
  onOpenExternal: (url: string) => Promise<void>;
  onAddressEdited: () => void;
  onRetryRead: (() => void) | undefined;
  external?: boolean;
}) {
  const [address, setAddress] = useState(() => draft.read() || (external ? current : ""));
  const [menuOpen, setMenuOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [previousRequest, setPreviousRequest] = useState(requestedAddress);
  if (previousRequest !== requestedAddress) {
    setPreviousRequest(requestedAddress);
    if (requestedAddress) setAddress(requestedAddress.url);
  }
  useEffect(() => {
    if (controls?.focusUrlNonce == null) return;
    input.current?.focus();
    input.current?.select();
  }, [controls?.focusUrlNonce]);
  const displayedUrl = external ? (normalizeLinkUrl(address) ?? "") : (controls?.url ?? current);
  const page = normalizeLinkUrl(displayedUrl);
  const linkHint =
    linkUnavailableReason ??
    (selectedItem === null
      ? "Select an item to link this page to."
      : !page
        ? "Enter an http or https address before linking."
        : busy
          ? "Wait for the current Browser action before linking."
          : null);
  const link = (
    <Button
      size="xs"
      variant="ghost"
      disabled={!permitted || Boolean(linkUnavailableReason) || !page || selectedItem === null}
      aria-disabled={busy || undefined}
      onClick={() => {
        if (page && !busy && !linkHint) void onLink(page);
      }}
    >
      Link this page
    </Button>
  );
  const submit = () => {
    const url = normalizeLinkUrl(address);
    if (!url) {
      setValidationError("Enter an http or https address.");
      return;
    }
    setValidationError(null);
    if (busy || (!external && !permitted)) return;
    if (external) void onOpenExternal(address.trim());
    else if (controls?.url) controls.onSubmit(url);
    else void onOpen(url);
  };
  const copyAddress = async () => {
    if (!normalizeLinkUrl(address)) return false;
    try {
      await writeTextToClipboard(address.trim(), "page address");
      setValidationError(null);
      return true;
    } catch (cause) {
      setValidationError(
        cause instanceof Error ? cause.message : "The address could not be copied.",
      );
      return false;
    }
  };
  return (
    <>
      <WorkspaceBrowserView
        addressDraft={address}
        linkTarget={selectedItem}
        displayedUrl={displayedUrl}
        renderPage={
          external ? (
            <WorkspaceBrowserExternalPage
              url={page ?? ""}
              address={address}
              busy={busy}
              linkHint={linkHint}
              linkAction={link}
              onOpen={submit}
              onCopy={copyAddress}
            />
          ) : null
        }
        menuOpen={menuOpen}
        unavailableReason={validationError ?? error}
        inputRef={input}
        loading={controls?.loading ?? false}
        disabled={!external && (busy || !permitted || controls?.inputDisabled === true)}
        readOnly={external && busy}
        onAddressChange={(value) => {
          draft.write(value);
          setAddress(value);
          setValidationError(null);
          onAddressEdited();
        }}
        onSubmit={submit}
        onMenuChange={setMenuOpen}
        onOpenExternal={() => {
          if (controls?.onOpenInBrowser) controls.onOpenInBrowser();
          else submit();
        }}
        menuActions={
          <>
            {controls ? (
              <>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={!permitted || !controls.canGoBack}
                  onClick={controls.onBack}
                >
                  Back
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={!permitted || !controls.canGoForward}
                  onClick={controls.onForward}
                >
                  Forward
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={!permitted || controls.refreshDisabled}
                  onClick={controls.onRefresh}
                >
                  Reload
                </Button>
                {permitted ? controls.leadingActions : null}
                {permitted ? controls.trailingActions : null}
              </>
            ) : null}
            {onRetryRead ? (
              <Button size="xs" variant="ghost" onClick={onRetryRead}>
                Retry
              </Button>
            ) : retryUrl ? (
              <Button
                size="xs"
                variant="ghost"
                disabled={busy || (!external && !permitted)}
                onClick={() => void onOpen(retryUrl)}
              >
                Retry
              </Button>
            ) : null}
            {external ? null : (
              <>
                {link}
                {linkHint ? (
                  <p className="px-1.75 text-sm text-muted-foreground sm:text-xs">{linkHint}</p>
                ) : null}
              </>
            )}
          </>
        }
      />
    </>
  );
}
