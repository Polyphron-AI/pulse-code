import { parseCalendarLocation } from "./calendar/calendarItemRef";
import { WorkspaceTaskDueOn } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  CalendarDaysIcon,
  FolderIcon,
  ListTodoIcon,
  MailIcon,
  MessagesSquareIcon,
  MicIcon,
} from "lucide-react";
import { resolveThreadRouteTarget } from "../../threadRoutes";

export const workspaceViews = {
  communications: ["chats", "unread", "later"],
  meetings: ["upcoming", "recordings"],
  calendar: ["agenda", "week"],
  mail: ["inbox", "unread", "later"],
  tasks: ["all", "open", "done"],
  projects: ["projects", "linked"],
} as const;
export type WorkspaceDestination = keyof typeof workspaceViews;
export type WorkspaceView = (typeof workspaceViews)[WorkspaceDestination][number];

export const workspaceDestinations = [
  { id: "communications", label: "Communications", Icon: MessagesSquareIcon },
  { id: "meetings", label: "Meetings", Icon: MicIcon },
  { id: "calendar", label: "Calendar", Icon: CalendarDaysIcon },
  { id: "mail", label: "Email", Icon: MailIcon },
  { id: "tasks", label: "Tasks", Icon: ListTodoIcon },
  { id: "projects", label: "Projects", Icon: FolderIcon },
] as const;

export interface WorkspaceSearch {
  readonly space?: WorkspaceDestination | "office";
  readonly view?: WorkspaceView;
  readonly officeView?: "communications";
  readonly communicationProvider?: "telegram";
  readonly account?: string;
  readonly folder?: string;
  readonly project?: string;
  readonly environment?: string;
  readonly item?: string;
  readonly day?: string;
  readonly taskLayout?: "list" | "board";
  readonly taskText?: string;
  readonly taskLimit?: number;
  readonly taskDueFrom?: string;
  readonly taskDueTo?: string;
  readonly taskOwner?: "all" | "environment-owner" | "unassigned";
}

const isTaskDate = Schema.is(WorkspaceTaskDueOn);
const text = (value: unknown) =>
  typeof value === "string" && value.length > 0 && value.length <= 1_024 ? value : undefined;

export function parseWorkspaceSearch(raw: Record<string, unknown>): WorkspaceSearch {
  const space =
    raw.space === "office" && raw.officeView === "communications" ? "communications" : raw.space;
  const destination = workspaceDestinations.find(({ id }) => id === space)?.id;
  if (!destination) return space === "office" ? { space: "office" } : {};
  const environment = text(raw.environment);
  const telegram = destination === "communications" && raw.communicationProvider === "telegram";
  const carriesIdentity = telegram || destination === "mail" || destination === "projects";
  const taskScope = destination === "tasks";
  const account = carriesIdentity ? text(raw.account) : undefined;
  const folder = !telegram && carriesIdentity ? text(raw.folder) : undefined;
  const project = text(raw.project);
  const calendar = destination === "calendar";
  const day = calendar && isTaskDate(raw.day) ? raw.day : undefined;
  const item = calendar
    ? typeof raw.item === "string" && raw.item.length <= 8192 && parseCalendarLocation(raw.item)
      ? raw.item
      : undefined
    : telegram
      ? text(raw.item)
      : (carriesIdentity || taskScope) && typeof raw.item === "string" && raw.item.length <= 8192
        ? raw.item
        : undefined;
  const view = (workspaceViews[destination] as readonly unknown[]).includes(raw.view)
    ? (raw.view as WorkspaceView)
    : undefined;
  const dueFrom = taskScope && isTaskDate(raw.taskDueFrom) ? raw.taskDueFrom : undefined;
  const dueTo = taskScope && isTaskDate(raw.taskDueTo) ? raw.taskDueTo : undefined;
  const limit =
    typeof raw.taskLimit === "string" && /^\d{1,3}$/.test(raw.taskLimit)
      ? Number(raw.taskLimit)
      : raw.taskLimit;
  const ordered = !dueFrom || !dueTo || dueFrom <= dueTo;
  return {
    space: destination,
    ...(taskScope &&
    typeof limit === "number" &&
    Number.isInteger(limit) &&
    limit >= 1 &&
    limit <= 100 &&
    limit !== 50
      ? { taskLimit: limit }
      : {}),
    ...(taskScope && (raw.taskLayout === "list" || raw.taskLayout === "board")
      ? { taskLayout: raw.taskLayout }
      : {}),
    ...(taskScope &&
    typeof raw.taskText === "string" &&
    raw.taskText.trim().length > 0 &&
    raw.taskText.length <= 240
      ? { taskText: raw.taskText.trim() }
      : {}),
    ...(ordered && dueFrom ? { taskDueFrom: dueFrom } : {}),
    ...(ordered && dueTo ? { taskDueTo: dueTo } : {}),
    ...(taskScope &&
    (raw.taskOwner === "all" ||
      raw.taskOwner === "environment-owner" ||
      raw.taskOwner === "unassigned")
      ? { taskOwner: raw.taskOwner }
      : {}),
    ...(day ? { day } : {}),
    ...(view !== undefined ? { view } : {}),
    ...(environment !== undefined ? { environment } : {}),
    ...(telegram ? { communicationProvider: "telegram" as const } : {}),
    ...(account !== undefined ? { account } : {}),
    ...(folder !== undefined ? { folder } : {}),
    ...(project !== undefined ? { project } : {}),
    ...(item !== undefined ? { item } : {}),
  };
}

export function workspaceDestinationSearch(
  destination: WorkspaceDestination,
  environmentId?: EnvironmentId | null,
): WorkspaceSearch {
  return {
    space: destination,
    view: workspaceViews[destination][0],
    ...(environmentId ? { environment: environmentId } : {}),
  };
}

const codeLocations = new Map<EnvironmentId, string>();
let lastCodeEnvironmentId: EnvironmentId | undefined;

export function getLastCodeEnvironmentId(): EnvironmentId | undefined {
  return lastCodeEnvironmentId;
}

export function rememberCodeLocation(environmentId: EnvironmentId, href: string): void {
  let url: URL;
  try {
    url = new URL(href, "https://workspace.invalid");
  } catch {
    return;
  }
  if (url.origin !== "https://workspace.invalid" || href.startsWith("//")) return;
  if (url.pathname === "/workspace" || url.pathname.startsWith("/settings")) return;
  const segments = url.pathname.split("/").slice(1);
  let target: ReturnType<typeof resolveThreadRouteTarget> = null;
  try {
    if (segments.length === 2) {
      target =
        segments[0] === "draft"
          ? resolveThreadRouteTarget({ draftId: decodeURIComponent(segments[1]!) })
          : resolveThreadRouteTarget({
              environmentId: decodeURIComponent(segments[0]!),
              threadId: decodeURIComponent(segments[1]!),
            });
    }
  } catch {
    return;
  }
  if (
    url.pathname !== "/" &&
    url.pathname !== "/pull-requests" &&
    (!target || (target.kind === "server" && target.threadRef.environmentId !== environmentId))
  )
    return;
  codeLocations.set(environmentId, `${url.pathname}${url.search}${url.hash}`);
  lastCodeEnvironmentId = environmentId;
}

export function codeReturnHref(environmentId: EnvironmentId): string {
  return codeLocations.get(environmentId) ?? "/";
}

const workspaceLocations = new Map<EnvironmentId, WorkspaceSearch>();

export function rememberWorkspaceLocation(
  environmentId: EnvironmentId,
  search: WorkspaceSearch,
): void {
  const normalized = parseWorkspaceSearch({ ...search });
  if (!normalized.space || normalized.space === "office") return;
  workspaceLocations.set(environmentId, { ...normalized, environment: environmentId });
}

export function workspaceReturnSearch(environmentId?: EnvironmentId | null): WorkspaceSearch {
  return (
    (environmentId ? workspaceLocations.get(environmentId) : undefined) ??
    workspaceDestinationSearch("projects", environmentId)
  );
}
