import { useState, type ReactNode } from "react";
import { MoreHorizontalIcon } from "lucide-react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

export interface WorkspaceAgentsViewProps {
  readonly projectTitle: string;
  readonly rows: ReadonlyArray<{
    key: string;
    title: string;
    initials: string;
    status: string;
    active: boolean;
    unavailableReason?: string;
  }>;
  readonly onOpen: (key: string) => void;
  readonly onAssign: () => void;
  readonly onUnassign: (key: string) => void;
  readonly canAssign?: boolean;
  readonly busy?: boolean;
  readonly notice?: ReactNode;
  readonly picker?: ReactNode;
  readonly projectActions?: ReactNode;
}

/** Flat project assignments shared by the live resource and isolated fixture. */
export function WorkspaceAgentsView({
  projectTitle,
  rows,
  onOpen,
  onAssign,
  onUnassign,
  canAssign = true,
  busy = false,
  notice,
  picker,
  projectActions,
}: WorkspaceAgentsViewProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <section aria-label="Project agents" className="min-w-0 text-sm sm:text-xs">
      <div className="group relative mb-[16px]">
        <h2 className="text-sm font-semibold leading-5">Project agents</h2>
        <p className="mt-0.5 pr-6 text-2xs leading-4 text-muted-foreground">
          General agents assigned to {projectTitle}
        </p>
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <span className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
            <PopoverTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                  aria-label="Project agent actions"
                />
              }
            >
              <MoreHorizontalIcon />
            </PopoverTrigger>
          </span>
          <PopoverPopup
            align="end"
            padding="compact"
            variant="opaque"
            aria-label="Project agent actions"
          >
            <div className="flex flex-col items-start gap-1 pointer-coarse:[&_button]:min-h-11 pointer-coarse:[&_button]:min-w-11">
              <Button
                size="xs"
                variant="ghost"
                disabled={!canAssign || busy}
                onClick={() => {
                  onAssign();
                  setMenuOpen(false);
                }}
              >
                Link existing thread
              </Button>
              {projectActions}
            </div>
          </PopoverPopup>
        </Popover>
      </div>
      {notice}
      {picker}
      {rows.length === 0 && !notice ? (
        <p className="text-muted-foreground">No agents assigned to this project.</p>
      ) : null}
      <ul aria-label="Assigned project agents" className="min-w-0">
        {rows.map((row) => (
          <li
            key={row.key}
            className="group relative h-[85px] pointer-coarse:h-auto pointer-coarse:min-h-[105px] min-w-0 border-b border-border/40 pt-3.75"
          >
            <div className="flex min-w-0 items-start gap-2.25">
              <span
                aria-hidden="true"
                className="flex h-[30px] w-[29px] shrink-0 items-center justify-center rounded-lg bg-primary/12 text-3xs font-semibold text-primary"
              >
                {row.initials}
              </span>
              <div className="min-w-0 flex-1">
                <Tooltip>
                  <TooltipTrigger
                    render={<p className="truncate text-xs font-semibold leading-4" />}
                  >
                    {row.title}
                  </TooltipTrigger>
                  <TooltipPopup>{row.title}</TooltipPopup>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <p className="mt-1 truncate text-3xs leading-3.5 text-muted-foreground" />
                    }
                  >
                    {row.status}
                  </TooltipTrigger>
                  <TooltipPopup>{row.status}</TooltipPopup>
                </Tooltip>
              </div>
              <span
                aria-label={row.active ? "Active" : "Inactive"}
                className={`mt-3 size-[7px] shrink-0 rounded-full ${row.active ? "bg-primary" : "bg-muted-foreground/50"}`}
              />
            </div>
            <div className="mt-[10px] flex items-center justify-between">
              <button
                type="button"
                className="text-3xs leading-4 text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring disabled:text-muted-foreground pointer-coarse:min-h-11"
                disabled={Boolean(row.unavailableReason)}
                aria-description={row.unavailableReason}
                onClick={() => onOpen(row.key)}
              >
                Open conversation →
              </button>
              <Popover>
                <span className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
                  <PopoverTrigger
                    render={
                      <Button
                        size="icon-tiny"
                        variant="ghost"
                        className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                        aria-label={`Actions for ${row.title}`}
                      />
                    }
                  >
                    <MoreHorizontalIcon />
                  </PopoverTrigger>
                </span>
                <PopoverPopup
                  align="end"
                  padding="compact"
                  variant="opaque"
                  aria-label={`Actions for ${row.title}`}
                >
                  {row.unavailableReason ? (
                    <p className="text-sm text-muted-foreground sm:text-xs">
                      {row.unavailableReason}
                    </p>
                  ) : null}
                  <Button
                    size="xs"
                    variant="ghost"
                    className="pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                    disabled={!canAssign || busy}
                    onClick={() => onUnassign(row.key)}
                  >
                    Unassign from project
                  </Button>
                </PopoverPopup>
              </Popover>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
