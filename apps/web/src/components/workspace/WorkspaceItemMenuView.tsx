import type { ComponentProps, ReactNode } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

/** The item-menu presentation, shared with isolated capture fixtures. */
export function WorkspaceItemMenuView({
  open,
  onOpenChange,
  actions,
  children,
  ...props
}: ComponentProps<"div"> & {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly actions: ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <div className="flex min-w-0 items-center gap-1" {...props}>
        {children}
        <PopoverTrigger
          render={<Button size="icon-xs" variant="ghost" aria-label="Item actions" />}
        >
          <MoreHorizontalIcon />
        </PopoverTrigger>
      </div>
      <PopoverPopup>{actions}</PopoverPopup>
    </Popover>
  );
}
