import {
  normalizeLinkUrl,
  type PreviewSessionSnapshot,
  type WorkspaceLinkEndpoint,
  type EnvironmentId,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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
import { workspaceLinks as workspaceLinkQueries } from "../../state/workspaceLinks";
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
import {
  WorkspaceBrowserExternalPage,
  WorkspaceBrowserView,
  WorkspaceBrowserSearchResults,
  WorkspaceBrowserPageActions,
} from "./WorkspaceBrowserView";
import { captureWorkspacePage, findLinkedPages, hasExplicitScheme } from "./workspaceBrowser.logic";
import { WorkspaceItemActions, WorkspaceItemMenu } from "./WorkspaceItemActions";
import { useWorkspaceItemOpener } from "./useWorkspaceItemOpener";
import { WorkspaceLinkProvenance } from "./mail/WorkspaceLinkProvenance";

type CapturedPage = NonNullable<ReturnType<typeof captureWorkspacePage>>;

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
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryUrl, setRetryUrl] = useState<string | null>(null);
  const [requestedAddress, setRequestedAddress] = useState<{ url: string } | null>(null);
  const draft = useWorkspaceBrowserDraft(environmentId, projectId);
  const admittedRequest = useRef<WorkspaceBrowserProps["request"]>(null);
  const externalOpening = useRef(false);
  const linkingPage = useRef(false);
  const scope = useMemo(() => ({ environmentId, projectId }), [environmentId, projectId]);
  const activeScope = useRef<typeof scope | null>(null);
  const previousScope = useRef(scope);
  useLayoutEffect(() => {
    activeScope.current = scope;
    if (previousScope.current !== scope) {
      previousScope.current = scope;
      externalOpening.current = false;
      linkingPage.current = false;
      admittedRequest.current = null;
      setBusy(false);
      setLinking(false);
      setError(null);
      setRetryUrl(null);
      setRequestedAddress(null);
    }
    return () => {
      activeScope.current = null;
    };
  }, [scope]);
  const inScope = useCallback(() => activeScope.current === scope, [scope]);
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
          if (result._tag === "Failure" && inScope()) {
            setError(workspaceToolsError(result));
            setRetryUrl(url);
          }
        } else {
          await openExternalUrl(url);
        }
      } catch (cause) {
        if (inScope()) {
          setError(cause instanceof Error ? cause.message : "The page could not be opened.");
          setRetryUrl(url);
        }
      } finally {
        if (inScope()) setBusy(false);
      }
    },
    [desktop, permitted, previewRead.error, threadRef, openPreview, inScope],
  );
  const clearRequest = resources?.clearRequest;
  useEffect(() => {
    if (hidden || request?.type !== "url" || admittedRequest.current === request || !clearRequest)
      return;
    if (!external && (!permitted || !threadRef || busy)) return;
    if (!normalizeLinkUrl(request.url)) return;
    const url = request.url.trim();
    admittedRequest.current = request;
    draft.write(url);
    // eslint-disable-next-line react/set-state-in-effect -- Navigation requests arrive outside the chrome and are consumed after admission.
    setRequestedAddress({ url });
    if (!external) void openAddress(url);
    clearRequest(request);
  }, [external, request, permitted, threadRef, busy, clearRequest, openAddress, hidden, draft]);

  const linkPage = async (captured: CapturedPage) => {
    if (
      !permitted ||
      linkUnavailableReason ||
      busy ||
      linkingPage.current ||
      captured.environmentId !== environmentId
    )
      return;
    linkingPage.current = true;
    setLinking(true);
    setBusy(true);
    setError(null);
    setRetryUrl(null);
    try {
      await linkItem(captured.target, captured.page);
    } catch (cause) {
      if (inScope())
        setError(cause instanceof Error ? cause.message : "This page could not be linked.");
    } finally {
      if (inScope()) {
        linkingPage.current = false;
        setBusy(false);
        setLinking(false);
      }
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
      if (inScope())
        setError(cause instanceof Error ? cause.message : "The page could not be opened.");
    } finally {
      if (inScope()) {
        externalOpening.current = false;
        setBusy(false);
      }
    }
  };
  const chrome = {
    environmentId,
    projectId,
    navigation: status,
    selectedItem,
    permitted,
    linkUnavailableReason,
    busy,
    linking,
    error: error ?? previewRead.error,
    retryUrl,
    requestedAddress,
    draft,
    current,
    onOpen: openAddress,
    onLink: linkPage,
    onOpenExternal: openExternal,
    onAddressEdited: () => setError(null),
    // Link support is the existing compatibility proxy for servers with preview reads.
    onRetryRead:
      previewRead.error && capabilitiesReady && workspaceLinks ? previewRead.refresh : undefined,
  };
  const renderResourceChrome: PreviewChromeRenderer = (controls) => (
    <ResourceBrowserChrome key={`${environmentId}:${projectId}`} {...chrome} controls={controls} />
  );
  if (hidden) return null;
  if (desktop) {
    if (
      request?.type === "url" &&
      (!connected || !canOperate || config.error || (config.data !== undefined && !threadRef))
    )
      return (
        <div className="flex min-h-0 min-w-0 flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            {!connected
              ? "Reconnect to use this project's Browser."
              : !canOperate
                ? "Permission to operate this environment is required to use Browser."
                : (config.error ??
                  "Choose an available Browser thread in this project's workspace settings.")}
          </p>
          <ResourceBrowserChrome
            key={`${environmentId}:${projectId}`}
            {...chrome}
            requestedAddress={request}
            external
          />
        </div>
      );
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
          <ResourceBrowserChrome key={`${environmentId}:${projectId}`} {...chrome} external />
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
  return <ResourceBrowserChrome key={`${environmentId}:${projectId}`} {...chrome} external />;
}

/** Keeps address edits and popup state outside the native preview render tree. */
function ResourceBrowserChrome({
  environmentId,
  projectId,
  navigation,
  controls,
  selectedItem,
  permitted,
  linkUnavailableReason,
  busy,
  linking,
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
  environmentId: EnvironmentId;
  projectId: WorkspaceBrowserProps["projectId"];
  navigation: PreviewSessionSnapshot["navStatus"] | undefined;
  controls?: ComponentProps<typeof PreviewChromeRow>;
  selectedItem: WorkspaceBrowserProps["selectedItem"];
  permitted: boolean;
  linkUnavailableReason: string | null;
  busy: boolean;
  linking: boolean;
  error: string | null;
  retryUrl: string | null;
  requestedAddress: { url: string } | null;
  draft: ReturnType<typeof useWorkspaceBrowserDraft>;
  current: string;
  onOpen: (url: string) => Promise<void>;
  onLink: (captured: CapturedPage) => Promise<void>;
  onOpenExternal: (url: string) => Promise<void>;
  onAddressEdited: () => void;
  onRetryRead: (() => void) | undefined;
  external?: boolean;
}) {
  const [address, setAddress] = useState(
    () => requestedAddress?.url ?? (draft.read() || (external ? current : "")),
  );
  const [menu, setMenu] = useState<{
    target: WorkspaceLinkEndpoint | null;
    page: CapturedPage["page"] | null;
    openExternal: () => void;
  } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const { workspaceLinks, ready } = useMailCapabilities(environmentId);
  const projectLinks = useEnvironmentQuery(
    searchOpen && ready && workspaceLinks
      ? workspaceLinkQueries.list({
          environmentId,
          input: { item: { type: "project", projectId } },
        })
      : null,
  );
  const { unlink } = useMailLinks(environmentId);
  const pendingUnlinks = useRef(new Set<string>());
  const [unlinking, setUnlinking] = useState<ReadonlySet<string>>(() => new Set());
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const unlinkPage = async (id: Parameters<typeof unlink>[0]) => {
    if (!permitted || busy || pendingUnlinks.current.has(id)) return;
    pendingUnlinks.current.add(id);
    setUnlinking(new Set(pendingUnlinks.current));
    setValidationError(null);
    try {
      await unlink(id);
    } catch (cause) {
      if (mounted.current)
        setValidationError(
          cause instanceof Error ? cause.message : "This page could not be unlinked.",
        );
    } finally {
      pendingUnlinks.current.delete(id);
      if (mounted.current) setUnlinking(new Set(pendingUnlinks.current));
    }
  };
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
  const capture = () =>
    captureWorkspacePage({
      environmentId,
      target: selectedItem,
      desktop: !external,
      address,
      navigation,
    });
  const linkHint =
    linkUnavailableReason ??
    (linking
      ? "This page is already being linked."
      : busy
        ? "Wait for the current Browser action before linking."
        : (menu ? menu.target : selectedItem) == null
          ? "Select an item to link this page to."
          : !external && !menu?.page && navigation?._tag === "Loading"
            ? "Wait for this page to finish loading before linking."
            : !external && !menu?.page && navigation?._tag === "LoadFailed"
              ? "This page failed to load. Reload it before linking."
              : menu && !menu.page && !external && navigation?._tag === "Success"
                ? "Reopen this menu to link the loaded page."
                : !(menu ? menu.page : page)
                  ? "Enter an http or https address before linking."
                  : !external && !menu?.page && navigation?._tag !== "Success"
                    ? "Wait for this page to finish loading before linking."
                    : null);
  const link = (
    <Button
      size="xs"
      variant="ghost"
      disabled={!permitted || (Boolean(linkHint) && !busy && !linking)}
      aria-disabled={busy || linking || undefined}
      title={linkHint ?? undefined}
      onClick={() => {
        const action = menu
          ? menu.target && menu.page
            ? { environmentId, target: menu.target, page: menu.page }
            : null
          : capture();
        if (action && !busy && !linkHint) void onLink(action);
      }}
    >
      Link this page
    </Button>
  );
  const submit = () => {
    const url = normalizeLinkUrl(address);
    if (!url) {
      if (hasExplicitScheme(address)) {
        setSearchOpen(false);
        setValidationError("Enter an http or https address.");
      } else {
        setValidationError(null);
        setMenu(null);
        setSearchOpen(address.trim().length > 0);
      }
      return;
    }
    setSearchOpen(false);
    setValidationError(null);
    if (busy || (!external && !permitted)) return;
    if (external) void onOpenExternal(address.trim());
    else if (controls?.url) controls.onSubmit(address.trim());
    else void onOpen(address.trim());
  };
  const openResourcePage = useCallback(
    (ref: Extract<WorkspaceLinkEndpoint["ref"], { type: "url" }>) => {
      if (busy || !normalizeLinkUrl(ref.url)) return;
      const url = ref.url.trim();
      draft.write(url);
      setAddress(url);
      setSearchOpen(false);
      setValidationError(null);
      if (external) void onOpenExternal(url);
      else if (controls) controls.onSubmit(url);
      else void onOpen(url);
    },
    [busy, draft, external, onOpenExternal, controls, onOpen],
  );
  const openPage = useWorkspaceItemOpener(environmentId, { openPage: openResourcePage });
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
        linkTarget={menu ? menu.target : selectedItem}
        displayedUrl={menu?.page?.ref.type === "url" ? menu.page.ref.url : displayedUrl}
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
        menuOpen={menu !== null}
        searchOpen={searchOpen}
        onSearchChange={setSearchOpen}
        searchResults={
          <WorkspaceBrowserSearchResults
            pages={searchOpen ? findLinkedPages(projectLinks.data, address) : []}
            truncated={projectLinks.data?.truncated ?? false}
            pending={ready && workspaceLinks && projectLinks.data === null && !projectLinks.error}
            error={
              !ready
                ? "Checking whether this server supports linking."
                : !workspaceLinks
                  ? "This server does not support linking yet."
                  : projectLinks.error
            }
            onOpen={(endpoint) => openPage(endpoint.ref)}
            renderRow={(view, row) => (
              <WorkspaceItemMenu
                layout="menu"
                popupVariant="opaque"
                environmentId={environmentId}
                item={{
                  ...structuredClone(view.item),
                  ref:
                    view.item.ref.type === "url"
                      ? {
                          type: "url",
                          url: normalizeLinkUrl(view.item.ref.url) ?? view.item.ref.url,
                        }
                      : view.item.ref,
                }}
                provenance={
                  <div className="mb-1 space-y-2">
                    <WorkspaceLinkProvenance {...view} />
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={!permitted || busy}
                      aria-disabled={unlinking.has(view.id) || undefined}
                      onClick={() => void unlinkPage(view.id)}
                    >
                      Unlink
                    </Button>
                  </div>
                }
              >
                {row}
              </WorkspaceItemMenu>
            )}
          />
        }
        unavailableReason={validationError ?? error}
        inputRef={input}
        loading={controls?.loading ?? false}
        disabled={!external && (busy || !permitted || controls?.inputDisabled === true)}
        readOnly={external && busy}
        onAddressChange={(value) => {
          draft.write(value);
          setAddress(value);
          setValidationError(null);
          if (!value.trim()) setSearchOpen(false);
          onAddressEdited();
        }}
        onSubmit={submit}
        onMenuChange={(open) => {
          setSearchOpen(false);
          if (!open) {
            setMenu(null);
            return;
          }
          const url = normalizeLinkUrl(displayedUrl);
          const captured = capture();
          const metadata =
            captured ??
            (url
              ? captureWorkspacePage({
                  environmentId,
                  target: selectedItem ?? { ref: { type: "url", url } },
                  desktop: !external,
                  address,
                  navigation,
                })
              : null);
          setMenu({
            target: selectedItem ? (metadata?.target ?? structuredClone(selectedItem)) : null,
            page: metadata?.page ?? null,
            openExternal:
              controls?.onOpenInBrowser ??
              (() => {
                if (normalizeLinkUrl(address)) void onOpenExternal(address.trim());
              }),
          });
        }}
        onOpenExternal={() => {
          if (menu?.page?.ref.type === "url") menu.openExternal();
          else if (controls?.onOpenInBrowser) controls.onOpenInBrowser();
          else submit();
        }}
        menuActions={
          <WorkspaceBrowserPageActions
            target={menu?.target ?? null}
            controls={controls}
            permitted={permitted}
            external={external}
            linkAction={link}
            linkHint={linkHint}
            retryAction={
              onRetryRead ? (
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
              ) : null
            }
            sharedActions={
              menu?.page && ready && workspaceLinks ? (
                <WorkspaceItemActions
                  environmentId={environmentId}
                  item={menu.page}
                  layout="menu"
                />
              ) : null
            }
          />
        }
      />
    </>
  );
}
