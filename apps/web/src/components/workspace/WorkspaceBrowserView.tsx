import type { ReactNode } from "react";
import type { WorkspaceLinkEndpoint } from "@t3tools/contracts";
import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

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
}: {
  readonly addressDraft: string;
  readonly linkTarget: WorkspaceLinkEndpoint | null;
  readonly displayedUrl: string;
  readonly renderPage: ReactNode;
  readonly menuOpen: boolean;
  readonly unavailableReason: string | null;
  readonly disabled?: boolean;
  readonly menuActions?: ReactNode;
  readonly onAddressChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onMenuChange: (open: boolean) => void;
  readonly onOpenExternal: () => void;
}) {
  return (
    <div className={`flex min-h-0 min-w-0 flex-col ${renderPage ? "flex-1" : "shrink-0"}`}>
      <form
        className="mb-[13px] flex h-[29px] shrink-0 items-center gap-1 rounded-full border border-border bg-muted px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring"
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled) onSubmit();
        }}
      >
        <Search size={12} aria-hidden="true" />
        <input
          className="min-w-0 flex-1 bg-transparent text-3xs text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Browser page address"
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
            <SlidersHorizontal size={12} aria-hidden="true" />
          </PopoverTrigger>
          <PopoverPopup align="end" padding="compact">
            <div className="flex max-w-64 flex-col items-start gap-1">
              {displayedUrl ? (
                <p className="max-w-full break-all text-xs text-muted-foreground">{displayedUrl}</p>
              ) : null}
              {menuActions}
              <Button
                type="button"
                size="xs"
                variant="ghost"
                disabled={!displayedUrl}
                onClick={onOpenExternal}
              >
                Open in new tab
              </Button>
              {linkTarget === null ? (
                <p className="text-xs text-muted-foreground">
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
