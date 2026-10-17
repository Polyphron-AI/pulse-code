import {
  BellIcon,
  BookmarkIcon,
  CalendarDaysIcon,
  CheckIcon,
  Clock3Icon,
  FolderIcon,
  Grid2X2Icon,
  InboxIcon,
  LinkIcon,
  ListTodoIcon,
  MessageSquareIcon,
  MicIcon,
  type LucideIcon,
} from "lucide-react";
import { useId } from "react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { WorkspaceDestination, WorkspaceView } from "./workspaceNavigation";
import "./workspaceShell.css";

export interface WorkspaceRailItem {
  readonly id: WorkspaceView;
  readonly label: string;
  readonly Icon: LucideIcon;
  readonly unavailableReason?: string;
}
export interface WorkspaceViewRailProps {
  readonly items: readonly WorkspaceRailItem[];
  readonly selected: WorkspaceView;
  readonly onSelect: (id: WorkspaceView) => void;
}
export const workspaceRailItems: Readonly<
  Record<WorkspaceDestination, readonly WorkspaceRailItem[]>
> = {
  communications: [
    { id: "chats", label: "Chats", Icon: MessageSquareIcon },
    {
      id: "unread",
      label: "Unread",
      Icon: BellIcon,
      unavailableReason: "Unread conversations are unavailable on this version.",
    },
    {
      id: "later",
      label: "Later",
      Icon: BookmarkIcon,
      unavailableReason: "Saved conversations are unavailable on this version.",
    },
  ],
  meetings: [
    { id: "upcoming", label: "Upcoming", Icon: CalendarDaysIcon },
    {
      id: "recordings",
      label: "Recordings",
      Icon: MicIcon,
      unavailableReason:
        "Workspace recordings are unavailable on this version. Local recording is available in Office tools on Windows.",
    },
  ],
  calendar: [
    { id: "agenda", label: "Agenda", Icon: CalendarDaysIcon },
    {
      id: "week",
      label: "Week",
      Icon: Grid2X2Icon,
      unavailableReason: "Week view is unavailable on this version.",
    },
  ],
  mail: [
    { id: "inbox", label: "Inbox", Icon: InboxIcon },
    {
      id: "unread",
      label: "Unread",
      Icon: BellIcon,
      unavailableReason: "Unread mail is unavailable on this version.",
    },
    {
      id: "later",
      label: "Later",
      Icon: BookmarkIcon,
      unavailableReason: "Saved mail is unavailable on this version.",
    },
  ],
  tasks: [
    { id: "all", label: "All tasks", Icon: ListTodoIcon },
    {
      id: "open",
      label: "Open",
      Icon: Clock3Icon,
    },
    {
      id: "done",
      label: "Done",
      Icon: CheckIcon,
    },
  ],
  projects: [
    { id: "projects", label: "Projects", Icon: FolderIcon },
    {
      id: "linked",
      label: "Linked",
      Icon: LinkIcon,
      unavailableReason: "Linked project filtering is unavailable on this version.",
    },
  ],
};

export function WorkspaceViewRail({ items, selected, onSelect }: WorkspaceViewRailProps) {
  const reasonId = useId();
  return (
    <nav aria-label="Workspace views" data-workspace-view-rail="">
      {items.map(({ id, label, Icon, unavailableReason }) => (
        <div key={id}>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-pressed={selected === id}
                  aria-disabled={Boolean(unavailableReason)}
                  aria-describedby={unavailableReason ? `${reasonId}-${id}` : undefined}
                  onClick={() => {
                    if (!unavailableReason) onSelect(id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      if (!event.repeat && !unavailableReason) onSelect(id);
                    }
                  }}
                />
              }
            >
              <span data-workspace-view-icon="">
                <Icon aria-hidden="true" />
              </span>
              <span>{label}</span>
            </TooltipTrigger>
            {unavailableReason && <TooltipPopup side="right">{unavailableReason}</TooltipPopup>}
          </Tooltip>
          {unavailableReason && (
            <span id={`${reasonId}-${id}`} className="sr-only">
              {unavailableReason}
            </span>
          )}
        </div>
      ))}
    </nav>
  );
}
