import * as Schema from "effect/Schema";
import {
  parseTelegramResourceId,
  WorkspaceLinkEndpoint,
  type EnvironmentId,
} from "@t3tools/contracts";
import type {
  ContextMenuItem,
  ProjectId,
  ThreadId,
  WorkspaceItemRef,
  WorkspaceLinkOrigin,
  WorkspaceLinkView,
} from "@t3tools/contracts";

import { mailItemTitle } from "./mailItemRef";

export type ProjectItemRef = Extract<WorkspaceItemRef, { readonly type: "project" }>;

export function projectItemRef(projectId: ProjectId): ProjectItemRef {
  return { type: "project", projectId };
}

const TITLE_MAX = 300;

/** A link endpoint's title must fit the contract's 300 characters; long subjects are cut. */
export function endpointTitle(title: string): string {
  if (title.length <= TITLE_MAX) return title;
  const clipped = title.slice(0, TITLE_MAX - 1).replace(/[\uD800-\uDBFF]$/, "");
  return `${clipped}…`;
}

/** "You linked this on 14 Oct while viewing 'Re: Q3 brief'". */
export function originText(
  origin: WorkspaceLinkOrigin | undefined,
  locale?: string,
): string | undefined {
  if (origin === undefined) return undefined;
  const date = new Date(origin.confirmedAt).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  });
  const viewing = origin.viewing?.title;
  return viewing === undefined
    ? `You linked this on ${date}`
    : `You linked this on ${date} while viewing '${viewing}'`;
}

export interface LinkedItemLabel {
  readonly title: string;
  /** Why the item cannot open, in words for the user. */
  readonly unavailable?: string;
}

/**
 * What a linked row shows. `projectTitles` is null until projects have loaded, so a project
 * is never called removed while the list is still arriving.
 */
export function linkedItemLabel(
  view: WorkspaceLinkView,
  projectTitles: ReadonlyMap<ProjectId, string> | null,
  threadTitles?: ReadonlyMap<ThreadId, string>,
): LinkedItemLabel {
  const { ref, title } = view.item;
  switch (ref.type) {
    case "project": {
      const current = projectTitles?.get(ref.projectId);
      if (current !== undefined) return { title: current };
      return projectTitles === null
        ? { title: title ?? "Project" }
        : { title: title ?? "Project", unavailable: "Unavailable: this project was removed." };
    }
    case "mail":
      return { title: title === undefined ? "Mail message" : mailItemTitle(title) };
    case "thread":
      return { title: threadTitles?.get(ref.threadId) ?? title ?? "Thread" };
    case "url":
      return { title: title ?? ref.url };
    case "file":
      return { title: title ?? "Drive file" };
    case "task":
      return { title: title ?? "Task" };
    case "provider-resource":
      return { title: title ?? ref.resourceId };
  }
}

/** Items this client can open today. Others still show, so agents' links stay visible. */
export function canOpenLinkedItem(ref: WorkspaceItemRef): boolean {
  return (
    ref.type === "task" ||
    ref.type === "mail" ||
    ref.type === "project" ||
    ref.type === "thread" ||
    ref.type === "url" ||
    ref.type === "file" ||
    (ref.type === "provider-resource" &&
      ref.provider === "telegram" &&
      parseTelegramResourceId(ref.resourceId) !== undefined)
  );
}

const PROJECT_MENU_PREFIX = "project:";

/** The choices under "Link to project". A linked project shows checked and cannot be picked. */
export function projectMenuItems(
  projects: ReadonlyArray<{ readonly id: ProjectId; readonly title: string }>,
  linked: ReadonlySet<ProjectId>,
): ContextMenuItem[] {
  if (projects.length === 0) {
    return [{ id: "no-projects", label: "No projects yet", disabled: true }];
  }
  return projects.map((project) => ({
    id: `${PROJECT_MENU_PREFIX}${project.id}`,
    label: project.title,
    ...(linked.has(project.id) ? { checked: true, disabled: true } : {}),
  }));
}

/** The project a menu choice picked, if it picked one. */
export function pickedProject<P extends { readonly id: ProjectId }>(
  projects: ReadonlyArray<P>,
  choice: string | null,
): P | undefined {
  if (choice === null || !choice.startsWith(PROJECT_MENU_PREFIX)) return undefined;
  const id = choice.slice(PROJECT_MENU_PREFIX.length);
  return projects.find((project) => project.id === id);
}

const isWorkspaceEndpoint = Schema.is(WorkspaceLinkEndpoint);

/** Dragged references are checked locally before the server validates the link mutation. */
export function parseWorkspaceItemDrag(
  raw: string,
  environmentId: EnvironmentId,
): WorkspaceLinkEndpoint | undefined {
  try {
    const payload: unknown = JSON.parse(raw);
    return typeof payload === "object" &&
      payload !== null &&
      "environmentId" in payload &&
      payload.environmentId === environmentId &&
      "item" in payload &&
      isWorkspaceEndpoint(payload.item)
      ? payload.item
      : undefined;
  } catch {
    return undefined;
  }
}

/** Human labels shared by Linked rows and removable composer references. */
export function workspaceEndpointTitle(endpoint: WorkspaceLinkEndpoint): string {
  if (endpoint.title?.trim()) return endpointTitle(endpoint.title);
  switch (endpoint.ref.type) {
    case "mail":
      return endpoint.title === undefined ? "Mail message" : mailItemTitle(endpoint.title);
    case "file":
      return "Drive file";
    case "project":
      return "Project";
    case "thread":
      return "Thread";
    case "task":
      return "Task";
    case "url":
      return endpoint.ref.url;
    case "provider-resource":
      return endpoint.ref.resourceId;
  }
}
