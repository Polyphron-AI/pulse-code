import type {
  ContextMenuItem,
  ProjectId,
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
      return { title: mailItemTitle(title) };
    case "thread":
      return { title: title ?? "Thread" };
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
    ref.type === "mail" || ref.type === "project" || ref.type === "thread" || ref.type === "url"
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
