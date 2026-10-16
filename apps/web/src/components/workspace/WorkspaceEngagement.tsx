import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useResizableWidth } from "../../hooks/useResizableWidth";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Sheet, SheetPopup, SheetTitle } from "../ui/sheet";

/** Per-space list/detail split and a Linked sheet on compact clients. */
export function WorkspaceEngagement({
  space,
  selected,
  list,
  children,
  linked,
}: {
  readonly space: string;
  readonly selected: boolean;
  readonly list: ReactNode;
  readonly children: ReactNode;
  readonly linked: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [hostWidth, setHostWidth] = useState(1000);
  const [linkedOpen, setLinkedOpen] = useState(false);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHostWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const minWidth = Math.min(160, hostWidth * 0.2);
  const maxWidth = hostWidth * 0.6;
  const split = useResizableWidth({
    storageKey: `pulse.workspace.${space}.engagement-width`,
    defaultWidth: hostWidth * 0.2,
    minWidth,
    maxWidth,
    edge: "right",
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 justify-end border-b border-border px-3 py-2 xl:hidden">
        <Button size="sm" variant="outline" onClick={() => setLinkedOpen(true)}>
          Context
        </Button>
      </div>
      <div className="flex min-h-0 flex-1">
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
            className="hidden w-1 shrink-0 touch-none cursor-col-resize border-r border-border hover:bg-accent focus-visible:bg-accent md:block"
          />
          <section
            aria-label="Selected item"
            className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto", !selected && "hidden md:block")}
          >
            {children}
          </section>
        </div>
        <aside
          aria-label="Linked items"
          className="hidden w-80 shrink-0 overflow-y-auto border-l border-border p-3 xl:block"
        >
          {!linkedOpen ? (linked ?? <EmptyContext />) : null}
        </aside>
        <Sheet open={linkedOpen} onOpenChange={setLinkedOpen}>
          <SheetPopup>
            <div className="p-4">
              <SheetTitle>Context</SheetTitle>
            </div>
            <div className="overflow-y-auto p-3">
              {linkedOpen ? (linked ?? <EmptyContext />) : null}
            </div>
          </SheetPopup>
        </Sheet>
      </div>
    </div>
  );
}

function EmptyContext() {
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Context views" className="flex flex-wrap gap-1">
        {["Links", "Projects", "Browser", "Files", "Agents"].map((label) => (
          <Button key={label} size="xs" variant="ghost" disabled>
            {label}
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Select an item to see its links, projects, browser, files, and agents.
      </p>
    </div>
  );
}
