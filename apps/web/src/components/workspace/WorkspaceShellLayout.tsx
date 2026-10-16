import { cn } from "../../lib/utils";
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./workspaceShell.css";
import { WorkspaceBreadcrumb } from "../WorkspaceBreadcrumb";
import type { WorkspaceHeaderModel } from "./WorkspaceHeader";
import { Sheet, SheetPopup, SheetTitle } from "../ui/sheet";

export interface WorkspaceShellLayoutProps {
  readonly navigation: ReactNode;
  readonly breadcrumb?: ReactNode;
  readonly header?: WorkspaceHeaderModel;
  readonly onOpenWorkspace?: () => void;
  readonly electron?: boolean;
  readonly rail: ReactNode;
  readonly engagement: ReactNode;
}

/** One resource host shared by live and fixture engagements. */
export function WorkspaceResourcesHost({
  wide,
  open,
  onOpenChange,
  label,
  children,
  closeFocus,
}: {
  readonly wide: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly label: string;
  readonly children: ReactNode;
  readonly closeFocus?: () => HTMLElement | false | null;
}) {
  const [container] = useState(() => {
    if (typeof document === "undefined") return null;
    const element = document.createElement("div");
    element.className = "flex h-full min-h-0 min-w-0 flex-1 flex-col";
    return element;
  });
  const retainedFocus = useRef<HTMLElement | null>(null);
  const dockBody = useCallback(
    (target: HTMLDivElement | null) => {
      if (!container) return;
      const active = document.activeElement;
      if (active instanceof HTMLElement && container.contains(active))
        retainedFocus.current = active;
      if (target) {
        target.appendChild(container);
        if (
          retainedFocus.current &&
          container.contains(retainedFocus.current) &&
          !retainedFocus.current.closest("[hidden]")
        )
          retainedFocus.current.focus();
      }
    },
    [container],
  );
  useLayoutEffect(() => () => container?.remove(), [container]);
  const host = wide ? (
    <aside aria-label={label} data-workspace-resources="" hidden={!open}>
      <div ref={dockBody} className="flex h-full min-h-0 flex-col" />
    </aside>
  ) : (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPopup
        data-workspace-resource-sheet=""
        finalFocus={closeFocus}
        transitionDurationMs={0}
        initialFocus={() =>
          retainedFocus.current?.isConnected && !retainedFocus.current.closest("[hidden]")
            ? retainedFocus.current
            : true
        }
      >
        <SheetTitle className="sr-only">{label}</SheetTitle>
        <div ref={dockBody} className="flex min-h-0 flex-1 flex-col" />
      </SheetPopup>
    </Sheet>
  );
  return (
    <>
      {host}
      {open ? (container ? createPortal(children, container) : children) : null}
    </>
  );
}

export function WorkspaceShellLayout({
  navigation,
  breadcrumb,
  header,
  onOpenWorkspace,
  electron = false,
  rail,
  engagement,
}: WorkspaceShellLayoutProps) {
  return (
    <div
      data-workspace-shell=""
      className={cn("flex min-h-0 min-w-0 flex-1", electron && "wco:[--workspace-caption-band:1]")}
    >
      <div
        data-workspace-shell-navigation=""
        className="w-[207px] shrink-0 border-r border-sidebar-border bg-sidebar"
      >
        {navigation}
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {header && onOpenWorkspace ? (
          <div
            data-workspace-breadcrumb-strip=""
            className={cn(
              "pr-3.25",
              electron && "drag-region wco:pr-(--workspace-native-controls-inset)",
            )}
          >
            <WorkspaceBreadcrumb
              variant="workspace"
              {...header}
              onOpenWorkspace={onOpenWorkspace}
            />
          </div>
        ) : (
          breadcrumb
        )}
        <div className="flex min-h-0 min-w-0 flex-1">
          <div className="w-[52px] shrink-0">{rail}</div>
          {engagement}
        </div>
      </div>
    </div>
  );
}
