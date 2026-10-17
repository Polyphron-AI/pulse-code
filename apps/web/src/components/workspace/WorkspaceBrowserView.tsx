import type { ReactNode, Ref } from "react";
import type { WorkspaceLinkEndpoint } from "@t3tools/contracts";
import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { cn } from "../../lib/utils";

export function WorkspaceBrowserView({
  addressDraft,
  linkTarget,
  displayedUrl,
  renderPage,
  menuOpen,
  unavailableReason,
  disabled = false,
  menuActions,
  onAddressChange,
  onSubmit,
  onMenuChange,
  onOpenExternal,
  inputRef,
  loading = false,
}: {
  readonly addressDraft: string;
  readonly linkTarget: WorkspaceLinkEndpoint | null;
  readonly displayedUrl: string;
  readonly renderPage: ReactNode;
  readonly menuOpen: boolean;
  readonly unavailableReason: string | null;
  readonly disabled?: boolean;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly loading?: boolean;
  readonly menuActions?: ReactNode;
  readonly onAddressChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onMenuChange: (open: boolean) => void;
  readonly onOpenExternal: () => void;
}) {
  return (
    <div className={cn("flex min-h-0 min-w-0 flex-col", renderPage ? "flex-1" : "shrink-0")}>
      <form
        className="mb-[13px] flex h-[29px] shrink-0 items-center gap-2 rounded-full border border-border/20 bg-muted pl-2 pr-0.5 text-muted-foreground focus-within:ring-2 focus-within:ring-ring"
        aria-busy={loading}
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled) onSubmit();
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
          <PopoverPopup align="end" padding="compact">
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
                onClick={onOpenExternal}
              >
                Open in new tab
              </Button>
              {linkTarget === null ? (
                <p className="px-1.75 text-sm text-muted-foreground sm:text-xs">
                  Select an item to link this page to.
                </p>
              ) : null}
            </div>
          </PopoverPopup>
        </Popover>
      </form>
      {unavailableReason ? (
        <p role="alert" className="mb-2 text-xs text-destructive">
          {unavailableReason}
        </p>
      ) : null}
      {renderPage}
    </div>
  );
}

/** The pasted address is metadata for linking, never an observed external page. */
export function WorkspaceBrowserExternalPage({
  url,
  busy,
  linkAction,
  onOpen,
  onCopy,
}: {
  readonly url: string;
  readonly busy: boolean;
  readonly linkAction: ReactNode;
  readonly onOpen: () => void;
  readonly onCopy: () => void;
}) {
  return (
    <section
      aria-label="External-tab Browser"
      className="h-[311px] min-w-0 shrink-0 space-y-3 overflow-y-auto border border-border bg-background p-4 text-xs leading-5"
      style={{ borderRadius: 9 }}
    >
      <h2 className="font-semibold" style={{ fontSize: 13 }}>
        Open this page in your browser
      </h2>
      <p className="text-muted-foreground">
        External tabs do not report navigation here. Paste the current page address before linking
        it.
      </p>
      {url ? (
        <div className="min-w-0">
          <p className="text-muted-foreground">Link target</p>
          <p className="select-text break-all" aria-label="Link target">
            {url}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground">
          Paste an http or https address, or search this project's linked pages.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="xs" variant="outline" disabled={busy || !url} onClick={onOpen}>
          Open in new tab
        </Button>
        <Button size="xs" variant="ghost" disabled={!url} onClick={onCopy}>
          Copy address
        </Button>
        {linkAction}
      </div>
      <p className="text-muted-foreground">
        If no tab opened, allow pop-ups and try again, or copy this address.
      </p>
    </section>
  );
}
