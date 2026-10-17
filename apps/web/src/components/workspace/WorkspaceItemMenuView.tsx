import type { ComponentProps, ReactNode } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

/** The item-menu presentation, shared with isolated capture fixtures. */
export function WorkspaceItemMenuView({
  open,
  onOpenChange,
  actions,
  available,
  children,
  ...props
}: ComponentProps<"div"> & {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly actions: ReactNode;
  readonly available: boolean;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <div
        className="flex min-w-0 items-center gap-1"
        data-workspace-menu-open={open ? "true" : undefined}
        {...props}
      >
        {children}
        {available ? (
          <PopoverTrigger
            render={<Button size="icon-xs" variant="ghost" aria-label="Item actions" />}
          >
            <MoreHorizontalIcon />
          </PopoverTrigger>
        ) : null}
      </div>
      {available ? <PopoverPopup align="end">{actions}</PopoverPopup> : null}
    </Popover>
  );
}
