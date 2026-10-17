import { useEffect, useRef, useState, type ReactNode, type Ref, type ComponentProps } from "react";
import type { WorkspaceLinkEndpoint, WorkspaceLinkView } from "@t3tools/contracts";
import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import type { PreviewChromeRow } from "../preview/PreviewChromeRow";
import { cn } from "../../lib/utils";

export function WorkspaceBrowserView({
  addressDraft,
  linkTarget,
  displayedUrl,
  renderPage,
  menuOpen,
  unavailableReason,
  disabled = false,
  readOnly = false,
  menuActions,
  onAddressChange,
  onSubmit,
  onMenuChange,
  onOpenExternal,
  inputRef,
  loading = false,
  searchOpen = false,
  searchResults,
  onSearchChange,
}: {
  readonly addressDraft: string;
  readonly linkTarget: WorkspaceLinkEndpoint | null;
  readonly displayedUrl: string;
  readonly renderPage: ReactNode;
  readonly menuOpen: boolean;
  readonly unavailableReason: string | null;
  readonly disabled?: boolean;
  readonly readOnly?: boolean;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly loading?: boolean;
  readonly menuActions?: ReactNode;
  readonly onAddressChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onMenuChange: (open: boolean) => void;
  readonly onOpenExternal: () => void;
  readonly searchOpen?: boolean;
  readonly searchResults?: ReactNode;
  readonly onSearchChange?: (open: boolean) => void;
}) {
  const pill = useRef<HTMLFormElement>(null);
  return (
    <div
      className={cn("flex min-h-0 min-w-0 flex-col", renderPage ? "flex-1" : "shrink-0")}
      onKeyDown={(event) => {
        if (
          !searchOpen ||
          event.key !== "Escape" ||
          event.defaultPrevented ||
          !(event.target instanceof Node) ||
          !event.currentTarget.contains(event.target)
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        onSearchChange?.(false);
        pill.current?.querySelector("input")?.focus();
      }}
    >
      <form
        ref={pill}
        className="mb-[13px] flex h-[29px] shrink-0 items-center gap-2 rounded-full border border-border/20 bg-muted pl-2 pr-0.5 text-muted-foreground has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring"
        aria-busy={loading}
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled && !readOnly) onSubmit();
        }}
      >
        <Search className="size-3 shrink-0" aria-hidden="true" />
        <input
          className="min-w-0 flex-1 bg-transparent text-3xs text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Browser page address"
          ref={inputRef}
          placeholder="Search or enter a URL"
          maxLength={2048}
          value={addressDraft}
          disabled={disabled}
          readOnly={readOnly}
          aria-disabled={readOnly || undefined}
          onChange={(event) => onAddressChange(event.target.value)}
        />
        <Popover open={menuOpen} onOpenChange={onMenuChange}>
          <PopoverTrigger
            render={
              <Button type="button" size="icon-xs" variant="ghost" aria-label="Browser actions" />
            }
          >
            <SlidersHorizontal className="size-3" aria-hidden="true" />
          </PopoverTrigger>
          <PopoverPopup
            align="end"
            sideOffset={7}
            padding="compact"
            variant="opaque"
            aria-label="Browser actions"
          >
            <div className="flex max-w-64 flex-col items-start gap-1">
              {displayedUrl ? (
                <p className="max-w-full break-all px-1.75 text-sm text-muted-foreground sm:text-xs">
                  {displayedUrl}
                </p>
              ) : null}
              {menuActions}
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={!displayedUrl || disabled}
                aria-disabled={readOnly || undefined}
                onClick={() => {
                  if (!readOnly) onOpenExternal();
                }}
              >
                Open in new tab
              </Button>
              {linkTarget === null && !menuActions ? (
                <p className="px-1.75 text-sm text-muted-foreground sm:text-xs">
                  Select an item to link this page to.
                </p>
              ) : null}
            </div>
          </PopoverPopup>
        </Popover>
      </form>
      {searchOpen ? (
        <div
          role="region"
          aria-label="Linked pages"
          className="mb-[13px] max-h-80 min-w-0 shrink-0 overflow-y-auto rounded-lg border border-border bg-popover p-2 text-popover-foreground"
        >
          {searchResults}
        </div>
      ) : null}
      {unavailableReason ? (
        <p role="alert" className="mb-2 text-xs text-destructive">
          {unavailableReason}
        </p>
      ) : null}
      {renderPage}
    </div>
  );
}

/** Both the live Browser and isolated recipe use this bounded result presentation. */
export function WorkspaceBrowserSearchResults({
  pages,
  truncated,
  pending,
  error,
  onOpen,
  renderRow,
}: {
  readonly pages: readonly WorkspaceLinkView[];
  readonly truncated: boolean;
  readonly pending?: boolean;
  readonly error?: string | null;
  readonly onOpen: (page: WorkspaceLinkEndpoint) => void;
  readonly renderRow?: (page: WorkspaceLinkView, row: ReactNode) => ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2 text-sm sm:text-xs">
      <p className="px-1.75 font-medium">Linked pages</p>
      {error ? (
        <p role="alert" className="px-1.75 text-destructive">
          {error}
        </p>
      ) : pending ? (
        <p role="status" className="px-1.75 text-muted-foreground">
          Loading this project's linked pages...
        </p>
      ) : pages.length === 0 ? (
        <p className="px-1.75 text-muted-foreground">
          No linked pages match. Paste an http or https address to open a page.
        </p>
      ) : (
        <ul className="flex min-w-0 flex-col gap-2" aria-label="Project linked pages">
          {pages.map((page) => {
            const title = page.item.title?.trim() || "Linked page";
            const row = (
              <>
                <button
                  type="button"
                  className="min-w-0 flex-1 px-1.75 text-left hover:underline"
                  aria-label={
                    page.item.ref.type === "url" ? `${title}: ${page.item.ref.url}` : title
                  }
                  onClick={() => onOpen(page.item)}
                >
                  <span className="block break-words">{title}</span>
                  <span className="block truncate text-muted-foreground">
                    {page.item.ref.type === "url" ? page.item.ref.url : ""}
                  </span>
                </button>
                <Button
                  size="xs"
                  variant="ghost"
                  aria-label={`Open ${title}`}
                  onClick={() => onOpen(page.item)}
                >
                  Open
                </Button>
              </>
            );
            return (
              <li key={page.id} className="min-w-0">
                {renderRow ? (
                  renderRow(page, row)
                ) : (
                  <div className="flex min-w-0 items-center">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {truncated ? (
        <p className="px-1.75 text-muted-foreground">Only loaded linked pages are searched.</p>
      ) : null}
    </div>
  );
}

/** The pasted address is metadata for linking, never an observed external page. */
export function WorkspaceBrowserExternalPage({
  url,
  address,
  busy,
  linkHint,
  linkAction,
  onOpen,
  onCopy,
}: {
  readonly url: string;
  readonly address: string;
  readonly busy: boolean;
  readonly linkHint: string | null;
  readonly linkAction: ReactNode;
  readonly onOpen: () => void;
  readonly onCopy: () => Promise<boolean>;
}) {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const copied = copiedAddress === address;
  // Parsing applies host casing and slash normalization without removing query parts or fragments.
  const removedUrlParts =
    url && URL.canParse(address.trim()) && url !== new URL(address.trim()).toString();
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopiedAddress(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);
  return (
    <section
      aria-label="External-tab Browser"
      className="min-h-[311px] min-w-0 shrink-0 space-y-3 border border-border bg-background p-4 text-sm leading-5 sm:text-xs"
      style={{ borderRadius: 9 }}
    >
      <h2 data-workspace-browser-heading className="text-base font-semibold">
        Open this page in your browser
      </h2>
      <p className="text-muted-foreground">
        External tabs do not report navigation here. Paste the current page address before linking
        it.
      </p>
      {url ? (
        <div className="min-w-0">
          <dl>
            <dt className="text-muted-foreground">Link target</dt>
            <dd className="select-text break-all">{url}</dd>
          </dl>
          {removedUrlParts ? (
            <p className="text-muted-foreground">
              Tracking parameters and #fragments are left out of the link.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground">
          Paste an http or https address, or search this project's linked pages.
        </p>
      )}
      {linkHint ? <p className="text-muted-foreground">{linkHint}</p> : null}
      <div className="flex flex-col items-start gap-2">
        <div className="flex gap-2">
          <Button
            size="xs"
            variant="outline"
            disabled={!url}
            aria-disabled={busy || undefined}
            onClick={() => {
              if (!busy) onOpen();
            }}
          >
            Open in new tab
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="min-w-28 sm:min-w-24"
            disabled={!url}
            aria-live="polite"
            onClick={async () => {
              if (await onCopy()) setCopiedAddress(address);
            }}
          >
            {copied ? "Copied" : "Copy address"}
          </Button>
        </div>
        {linkAction}
      </div>
      <p className="text-muted-foreground">
        If no tab opened, allow pop-ups and try again, or copy this address.
      </p>
    </section>
  );
}

/** Shared captured-page menu presentation, with commands supplied by the live or isolated host. */
export function WorkspaceBrowserPageActions({
  target,
  controls,
  permitted,
  linkAction,
  linkHint,
  retryAction,
  sharedActions,
  external = false,
}: {
  target: WorkspaceLinkEndpoint | null;
  controls?: ComponentProps<typeof PreviewChromeRow> | undefined;
  permitted: boolean;
  linkAction: ReactNode;
  linkHint: string | null;
  retryAction?: ReactNode;
  sharedActions?: ReactNode;
  external?: boolean;
}) {
  return (
    <>
      {target ? (
        <p className="px-1.75 text-sm text-muted-foreground sm:text-xs">
          Link to <span className="text-foreground">{target.title ?? target.ref.type}</span>
        </p>
      ) : null}
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
      {retryAction}
      {external ? null : (
        <>
          {linkAction}
          {linkHint ? (
            <p className="px-1.75 text-sm text-muted-foreground sm:text-xs">{linkHint}</p>
          ) : null}
        </>
      )}
      {sharedActions}
    </>
  );
}
