import type { ContextMenuItem, EnvironmentId, WorkspaceLinkEndpoint } from "@t3tools/contracts";

/** Resolve current focus, falling back to the selected reader's action host. */
export function workspaceActionButton(
  action:
    | "startThread"
    | "addToProject"
    | "startProject"
    | "startAutomation"
    | "resources"
    | "linkedContext",
  selectedHost?: Element | null,
): HTMLButtonElement | null {
  if (typeof document === "undefined") return null;
  const selector = `[data-workspace-action="${action}"]`;
  if (action === "resources" || action === "linkedContext")
    return document.querySelector<HTMLButtonElement>(selector);
  const host =
    document.activeElement?.closest("[data-workspace-action-host]") ??
    (selectedHost === undefined
      ? document.querySelector('[data-workspace-action-host="selected"]')
      : selectedHost);
  return host?.querySelector<HTMLButtonElement>(selector) ?? null;
}

export type WorkspaceNativeAction =
  | "start-thread"
  | "add-to-project"
  | "start-project"
  | "start-automation";
export function workspaceNativeAction(
  raw: string | null | undefined,
): WorkspaceNativeAction | null {
  if (!raw?.startsWith("workspace:")) return null;
  const action = raw.slice("workspace:".length);
  return action === "start-thread" ||
    action === "add-to-project" ||
    action === "start-project" ||
    action === "start-automation"
    ? action
    : null;
}
export function workspaceNativeMenu(
  project: boolean,
  capabilities: {
    workspaceLinks?: boolean;
    workspaceItemContext?: boolean;
    workspaceTools?: boolean;
  },
): ContextMenuItem[] {
  return capabilities.workspaceLinks
    ? [
        {
          id: "workspace-actions",
          label: "Workspace actions",
          separatorBefore: true,
          children: [
            {
              id: "workspace:start-thread",
              label: "Start thread",
              disabled: capabilities.workspaceItemContext !== true,
            },
            ...(!project
              ? [
                  { id: "workspace:add-to-project", label: "Add to project" },
                  { id: "workspace:start-project", label: "Start project" },
                ]
              : []),
            {
              id: "workspace:start-automation",
              label: "Start automation",
              disabled: capabilities.workspaceTools !== true,
            },
          ],
        },
      ]
    : [];
}
export interface WorkspaceNativeRequest {
  environmentId: EnvironmentId;
  item: WorkspaceLinkEndpoint;
  action: WorkspaceNativeAction;
}

export function workspaceProjectNativeMenu(
  members: ReadonlyArray<{
    label: string;
    capabilities: Parameters<typeof workspaceNativeMenu>[1];
  }>,
): ContextMenuItem[] {
  if (members.length === 1) return workspaceNativeMenu(true, members[0]!.capabilities);
  const children = members.flatMap((member, index) => {
    const actions = workspaceNativeMenu(true, member.capabilities)[0]?.children ?? [];
    return actions.length
      ? [
          {
            id: `workspace-member:${index}`,
            label: member.label,
            children: actions.map((action) => ({ ...action, id: `member:${index}:${action.id}` })),
          },
        ]
      : [];
  });
  return children.length
    ? [{ id: "workspace-environments", label: "Workspace actions", children }]
    : [];
}
