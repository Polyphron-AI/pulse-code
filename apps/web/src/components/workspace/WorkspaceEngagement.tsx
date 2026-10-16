import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useResizableWidth } from "../../hooks/useResizableWidth";
import { cn } from "../../lib/utils";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { Sheet, SheetPopup, SheetTitle } from "../ui/sheet";
import { WorkspaceHeader, type WorkspaceHeaderModel } from "./WorkspaceHeader";
import type { WorkspaceDestination } from "./workspaceNavigation";

export interface WorkspaceEngagementCommonProps {
  readonly environmentId: EnvironmentId;
  readonly space: WorkspaceDestination;
  readonly header: WorkspaceHeaderModel;
  readonly children: ReactNode;
  readonly resources: ReactNode;
  readonly resourcesOpen: boolean;
  readonly onResourcesChange: (open: boolean) => void;
  readonly onLinkedContext?: () => void;
  readonly storage?: Pick<Storage, "getItem" | "setItem">;
}
export type WorkspaceEngagementProps = WorkspaceEngagementCommonProps &
  (
    | {
        readonly layout: "full";
        readonly list?: never;
        readonly selected?: never;
        readonly onBack?: never;
      }
    | {
        readonly layout: "split";
        readonly list: ReactNode;
        readonly selected: boolean;
        readonly onBack?: () => void;
      }
  );

export function WorkspaceEngagement(props: WorkspaceEngagementProps) {
  const wide = useMediaQuery("xl");
  const resources = props.resources ?? (
    <p className="p-3 text-sm text-muted-foreground">Choose a project to see its resources.</p>
  );
  return (
    <div data-workspace-engagement="" className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <WorkspaceHeader
          model={props.header}
          resourcesOpen={props.resourcesOpen}
          onResources={() => props.onResourcesChange(!props.resourcesOpen)}
          {...(props.onLinkedContext ? { onLinkedContext: props.onLinkedContext } : {})}
        />
        {props.layout === "split" ? (
          <WorkspaceSplit {...props} />
        ) : (
          <section
            aria-label="Workspace content"
            className="min-h-0 min-w-0 flex-1 overflow-y-auto"
          >
            {props.children}
          </section>
        )}
      </div>
      {wide ? (
        <aside aria-label="Resources" data-workspace-resources="" hidden={!props.resourcesOpen}>
          {props.resourcesOpen ? resources : null}
        </aside>
      ) : (
        <Sheet open={props.resourcesOpen} onOpenChange={props.onResourcesChange}>
          <SheetPopup>
            <SheetTitle>Resources</SheetTitle>
            {props.resourcesOpen ? resources : null}
          </SheetPopup>
        </Sheet>
      )}
    </div>
  );
}

function WorkspaceSplit({
  environmentId,
  space,
  storage,
  list,
  selected,
  children,
  onBack,
}: WorkspaceEngagementCommonProps & { list: ReactNode; selected: boolean; onBack?: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [hostWidth, setHostWidth] = useState(681);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setHostWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const minWidth = Math.min(160, hostWidth * 0.4);
  const maxWidth = hostWidth * 0.6;
  const split = useResizableWidth({
    storageKey: `pulse.workspace.${environmentId}.${space}.engagement-width.v2`,
    defaultWidth: 170,
    minWidth,
    maxWidth,
    edge: "right",
    ...(storage ? { storage } : {}),
  });
  return (
    <div ref={host} className="flex min-h-0 min-w-0 flex-1">
      <section
        aria-label="Item list"
        style={{ "--engagement-width": `${split.width}px` } as CSSProperties}
        className={cn(
          "min-h-0 w-full overflow-y-auto md:w-(--engagement-width) md:shrink-0",
          selected && "hidden md:block",
        )}
      >
        {list}
      </section>
      <div
        role="separator"
        aria-label="Resize item list"
        aria-orientation="vertical"
        aria-valuenow={Math.round(split.width)}
        aria-valuemin={Math.round(minWidth)}
        aria-valuemax={Math.round(maxWidth)}
        tabIndex={0}
        {...split.handlers}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            split.setWidth(split.width + (event.key === "ArrowLeft" ? -20 : 20));
          }
          if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            split.setWidth(event.key === "Home" ? minWidth : maxWidth);
          }
        }}
        data-workspace-list-divider=""
      />
      <section
        aria-label="Selected item"
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto",
          !selected && "hidden md:flex",
        )}
      >
        {onBack ? (
          <button type="button" className="p-2 text-sm md:hidden" onClick={onBack}>
            Back to list
          </button>
        ) : null}
        {children}
      </section>
    </div>
  );
}
