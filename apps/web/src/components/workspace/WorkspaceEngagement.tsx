import {
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useResizableWidth } from "../../hooks/useResizableWidth";
import { cn } from "../../lib/utils";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { WorkspaceResourcesHost } from "./WorkspaceShellLayout";
import { WorkspaceResourcesContext } from "./workspaceResourceState";
import { WorkspaceHeader, type WorkspaceHeaderModel } from "./WorkspaceHeader";
import type { WorkspaceDestination } from "./workspaceNavigation";

export interface WorkspaceEngagementCommonProps {
  readonly environmentId: EnvironmentId | null;
  readonly space: WorkspaceDestination;
  readonly header: WorkspaceHeaderModel;
  readonly children: ReactNode;
  readonly resources?: ReactNode;
  /** Temporary selected-item dock until W4-T4b installs Linked context. */
  readonly linked?: ReactNode;
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
  const state = useContext(WorkspaceResourcesContext);
  const linkedOnly = props.resources === undefined && props.linked !== undefined;
  const [linkedDockOpen, setLinkedDockOpen] = useState(true);
  const [linkedSheetOpen, setLinkedSheetOpen] = useState(false);
  const resourcesOpen = state?.open ?? (linkedOnly && wide ? linkedDockOpen : props.resourcesOpen);
  const resources = linkedOnly
    ? (props.linked ?? (
        <p className="p-3 text-sm text-muted-foreground">Select an item to see its linked items.</p>
      ))
    : props.resources;
  const resourcesLabel = linkedOnly && !state ? "Linked items" : "Resources";
  const onResourcesChange = (open: boolean) => {
    if (state) {
      if (open) state.reopen();
      else state.close();
    } else if (linkedOnly && wide) setLinkedDockOpen(open);
    else props.onResourcesChange(open);
  };
  return (
    <div
      data-workspace-engagement=""
      data-workspace-dock-open={wide && resourcesOpen}
      className="flex min-h-0 min-w-0 flex-1"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <WorkspaceHeader
          model={props.header}
          resourcesOpen={resourcesOpen}
          resourcesLabel={resourcesLabel}
          onResources={() => onResourcesChange(!resourcesOpen)}
          {...(props.onLinkedContext ? { onLinkedContext: props.onLinkedContext } : {})}
        />
        {!linkedOnly && props.linked !== undefined ? (
          <button
            type="button"
            className="px-3 text-left text-xs text-muted-foreground"
            aria-expanded={wide ? linkedDockOpen : linkedSheetOpen}
            onClick={() =>
              wide ? setLinkedDockOpen(!linkedDockOpen) : setLinkedSheetOpen(!linkedSheetOpen)
            }
          >
            Linked items
          </button>
        ) : null}
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
      {!linkedOnly && props.linked !== undefined ? (
        <WorkspaceResourcesHost
          wide={wide}
          open={wide ? linkedDockOpen : linkedSheetOpen}
          onOpenChange={wide ? setLinkedDockOpen : setLinkedSheetOpen}
          label="Linked items"
        >
          {props.linked ?? (
            <p className="p-3 text-sm text-muted-foreground">
              Select an item to see its linked items.
            </p>
          )}
        </WorkspaceResourcesHost>
      ) : null}
      <WorkspaceResourcesHost
        wide={wide}
        open={resourcesOpen}
        onOpenChange={onResourcesChange}
        label={resourcesLabel}
      >
        {resources}
      </WorkspaceResourcesHost>
    </div>
  );
}

const disconnectedStorage = { getItem: () => null, setItem: () => {} };

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
    storageKey:
      environmentId === null
        ? `pulse.workspace.disconnected.${space}.engagement-width.v2`
        : `pulse.workspace.${environmentId}.${space}.engagement-width.v2`,
    defaultWidth: 170,
    minWidth,
    maxWidth,
    edge: "right",
    ...(environmentId === null ? { storage: disconnectedStorage } : storage ? { storage } : {}),
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
