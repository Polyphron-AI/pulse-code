import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  createContext,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  workspaceItemKey,
  type EnvironmentId,
  type WorkspaceLinkEndpoint,
  type WorkspaceItemRef,
} from "@t3tools/contracts";
import { useResizableWidth } from "../../hooks/useResizableWidth";
import { cn } from "../../lib/utils";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { WorkspaceResourcesHost } from "./WorkspaceShellLayout";
import {
  useWorkspaceResources,
  WorkspaceResourcesCloseFocusContext,
} from "./workspaceResourceState";
import { WorkspaceHeader, type WorkspaceHeaderModel } from "./WorkspaceHeader";
import { workspaceEndpointTitle } from "./mail/linkedItems";
import { XIcon } from "lucide-react";
import type { WorkspaceDestination } from "./workspaceNavigation";

export interface WorkspaceEngagementCommonProps {
  readonly environmentId: EnvironmentId | null;
  readonly space: WorkspaceDestination;
  readonly header: WorkspaceHeaderModel;
  readonly children: ReactNode;
  readonly resources?: ReactNode;
  readonly linkedContext?: {
    readonly item: WorkspaceLinkEndpoint | null;
    readonly render: (item: WorkspaceLinkEndpoint) => ReactNode;
  };
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

/** Item editors invalidate a held capture after deleting or moving its target. */
export const WorkspaceItemMutationContext = createContext<
  ((environmentId: EnvironmentId, item: WorkspaceItemRef) => void) | null
>(null);

export function WorkspaceEngagement(props: WorkspaceEngagementProps) {
  const wide = useMediaQuery("xl");
  const state = useWorkspaceResources();
  const [contextTarget, setContextTarget] = useState<{
    readonly environmentId: EnvironmentId | null;
    readonly presentation: boolean;
    readonly context: NonNullable<WorkspaceEngagementCommonProps["linkedContext"]>;
  } | null>(null);
  if (
    contextTarget &&
    (contextTarget.environmentId !== props.environmentId ||
      contextTarget.presentation !== wide ||
      !props.linkedContext)
  ) {
    setContextTarget(null);
  }
  if (
    contextTarget &&
    !contextTarget.context.item &&
    props.linkedContext?.item &&
    contextTarget.environmentId === props.environmentId &&
    contextTarget.presentation === wide
  ) {
    setContextTarget({ ...contextTarget, context: props.linkedContext });
  }
  const context =
    contextTarget?.environmentId === props.environmentId && contextTarget.presentation === wide
      ? contextTarget.context
      : null;
  const resourcesTrigger = useRef<HTMLButtonElement>(null);
  const contextTrigger = useRef<HTMLButtonElement>(null);
  const resourcesBody = useRef<HTMLDivElement>(null);
  const focusResourceBody = useRef(false);
  const closeFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!focusResourceBody.current || context) return;
    focusResourceBody.current = false;
    (
      resourcesBody.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ??
      resourcesBody.current
    )?.focus();
  });
  const restoreResourcesFocus = useCallback(() => resourcesTrigger.current?.focus(), []);
  const close = () => {
    closeFocus.current = (context ? contextTrigger : resourcesTrigger).current;
    if (!context) state.close();
    setContextTarget(null);
    if (wide) (context ? contextTrigger : resourcesTrigger).current?.focus();
    else if (context && state.open) focusResourceBody.current = true;
  };
  const backToResources = () => {
    setContextTarget(null);
    state.reopen();
    if (wide) restoreResourcesFocus();
    else focusResourceBody.current = true;
  };
  const open = context !== null || state.open;
  const invalidateItem = useCallback((environmentId: EnvironmentId, item: WorkspaceItemRef) => {
    setContextTarget((target) =>
      target?.environmentId === environmentId &&
      target.context.item &&
      workspaceItemKey(target.context.item.ref) === workspaceItemKey(item)
        ? null
        : target,
    );
  }, []);
  return (
    <WorkspaceItemMutationContext value={invalidateItem}>
      <div
        data-workspace-engagement=""
        data-workspace-dock-open={wide && open}
        className="flex min-h-0 min-w-0 flex-1"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <WorkspaceHeader
            model={props.header}
            resourcesOpen={context === null && state.open}
            resourcesTriggerRef={resourcesTrigger}
            onResources={() => {
              closeFocus.current = context || !state.open ? null : resourcesTrigger.current;
              setContextTarget(null);
              if (context || !state.open) state.reopen();
              else state.close();
            }}
            linkedContextTriggerRef={contextTrigger}
            linkedContextOpen={context !== null}
            onLinkedContext={
              props.linkedContext
                ? () => {
                    closeFocus.current = context ? contextTrigger.current : null;
                    if (context) setContextTarget(null);
                    else
                      setContextTarget({
                        environmentId: props.environmentId,
                        presentation: wide,
                        context: props.linkedContext!,
                      });
                  }
                : undefined
            }
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
        <WorkspaceResourcesHost
          wide={wide}
          open={open}
          onOpenChange={(value) => {
            if (!value) close();
          }}
          label={context ? "Linked context" : "Resources"}
          closeFocus={() => closeFocus.current ?? false}
        >
          {context ? (
            <div data-workspace-linked-context="" className="flex h-full min-h-0 flex-col">
              <header className="flex shrink-0 items-center gap-2 border-b border-border p-3">
                <h2 className="min-w-0 flex-1 text-sm font-medium">Linked context</h2>
                <button
                  type="button"
                  aria-label="Close linked context"
                  className="flex size-7 items-center justify-center"
                  onClick={close}
                >
                  <XIcon className="size-3" />
                </button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <button type="button" className="mb-3 text-sm underline" onClick={backToResources}>
                  Back to resources
                </button>
                {context.item ? (
                  <>
                    <h3 className="mb-3 break-words text-sm font-medium">
                      {workspaceEndpointTitle(context.item)}
                    </h3>
                    {!props.linkedContext?.item ||
                    workspaceItemKey(context.item.ref) !==
                      workspaceItemKey(props.linkedContext.item.ref) ? (
                      <p className="mb-3 text-xs text-muted-foreground">
                        Held item. Selection has changed.
                        {props.linkedContext?.item ? (
                          <button
                            type="button"
                            className="ml-2 underline"
                            onClick={() =>
                              setContextTarget({
                                environmentId: props.environmentId,
                                presentation: wide,
                                context: props.linkedContext!,
                              })
                            }
                          >
                            Show current item
                          </button>
                        ) : null}
                      </p>
                    ) : null}
                    {context.render(context.item)}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Select an item to see its linked context.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <WorkspaceResourcesCloseFocusContext value={restoreResourcesFocus}>
              <div ref={resourcesBody} tabIndex={-1} className="h-full min-h-0">
                {props.resources}
              </div>
            </WorkspaceResourcesCloseFocusContext>
          )}
        </WorkspaceResourcesHost>
      </div>
    </WorkspaceItemMutationContext>
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
