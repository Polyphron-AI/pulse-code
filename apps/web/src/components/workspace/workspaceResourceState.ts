import { ProjectId, WorkspaceItemRef, type EnvironmentId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type WorkspaceResourceTab = "files" | "browser" | "agents" | "tasks" | "docs" | "prs";
export interface WorkspaceResourceScope {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
}
export interface OpenWorkspaceResourceInput {
  readonly tab: WorkspaceResourceTab;
  readonly projectId: ProjectId;
  readonly request?: WorkspaceItemRef | null;
}
export interface WorkspaceResourcesState {
  readonly environmentId: EnvironmentId | null;
  readonly open: boolean;
  readonly projectId: ProjectId | null;
  readonly selectedTab: WorkspaceResourceTab;
  readonly request: WorkspaceItemRef | null;
  readonly chooseProject: (projectId: ProjectId) => void;
  readonly resetProject: () => void;
  readonly selectTab: (tab: WorkspaceResourceTab) => void;
  readonly close: () => void;
  readonly reopen: () => void;
  /** Throws on invalid destinations or malformed/mismatched refs. UI wrappers must validate first. */
  readonly openResource: (input: OpenWorkspaceResourceInput) => void;
}
export interface WorkspaceResourceStateOptions {
  readonly presentation?: "dock" | "sheet";
  readonly storage?: Pick<Storage, "getItem" | "setItem">;
}
export type WorkspaceResourceProject =
  | { readonly kind: "selected"; readonly scope: WorkspaceResourceScope; readonly title: string }
  | { readonly kind: "choose"; readonly candidates: readonly ProjectId[] }
  | { readonly kind: "unavailable"; readonly projectId: ProjectId };

export function resolveResourceProject(input: {
  readonly environmentId: EnvironmentId;
  readonly projects: readonly {
    readonly environmentId: EnvironmentId;
    readonly id: ProjectId;
    readonly title: string;
  }[];
  readonly explicitProjectId: ProjectId | null;
  readonly owningProjectIds: readonly ProjectId[];
  readonly confirmedProjectIds: readonly ProjectId[];
}): WorkspaceResourceProject {
  const available = input.projects.filter(
    (project) => project.environmentId === input.environmentId,
  );
  if (input.explicitProjectId !== null) {
    const chosen = available.find((project) => project.id === input.explicitProjectId);
    return chosen
      ? {
          kind: "selected",
          scope: { environmentId: input.environmentId, projectId: chosen.id },
          title: chosen.title,
        }
      : { kind: "unavailable", projectId: input.explicitProjectId };
  }
  const ids = new Set([...input.owningProjectIds, ...input.confirmedProjectIds]);
  const candidates = available.filter((project) => ids.has(project.id));
  const only = candidates.length === 1 ? candidates[0] : undefined;
  return only
    ? {
        kind: "selected",
        scope: { environmentId: input.environmentId, projectId: only.id },
        title: only.title,
      }
    : { kind: "choose", candidates: candidates.map((project) => project.id) };
}

const tabs: readonly WorkspaceResourceTab[] = [
  "files",
  "browser",
  "agents",
  "tasks",
  "docs",
  "prs",
];
function isTab(value: unknown): value is WorkspaceResourceTab {
  return tabs.some((tab) => tab === value);
}
const isProjectId = Schema.is(ProjectId);
const decodeRequest = Schema.decodeSync(WorkspaceItemRef);
function projectTab(
  tabs: Readonly<Record<string, WorkspaceResourceTab>>,
  projectId: ProjectId,
): WorkspaceResourceTab {
  return Object.hasOwn(tabs, projectId) && isTab(tabs[projectId]) ? tabs[projectId]! : "files";
}
const browserStorage = {
  getItem: (key: string) =>
    typeof window === "undefined" ? null : window.localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  },
};
interface ResourceSession {
  readonly generation: number;
  readonly environmentId: EnvironmentId | null;
  readonly presentation: "dock" | "sheet";
  readonly wideOpen: boolean;
  readonly open: boolean;
  readonly projectId: ProjectId | null;
  readonly selectedTab: WorkspaceResourceTab;
  readonly tabs: Readonly<Record<string, WorkspaceResourceTab>>;
  readonly request: WorkspaceItemRef | null;
}
function readSession(
  environmentId: EnvironmentId | null,
  presentation: "dock" | "sheet",
  storage: typeof browserStorage,
): ResourceSession {
  let projectId: ProjectId | null = null;
  let wideOpen = true;
  const savedTabs: Record<string, WorkspaceResourceTab> = {};
  try {
    const raw =
      environmentId === null
        ? null
        : storage.getItem(`pulse.workspace.resources.v1:${environmentId}`);
    const saved: unknown = raw === null ? null : JSON.parse(raw);
    if (saved && typeof saved === "object" && "version" in saved && saved.version === 1) {
      if ("projectId" in saved && isProjectId(saved.projectId)) projectId = saved.projectId;
      if ("open" in saved && typeof saved.open === "boolean") wideOpen = saved.open;
      if ("tabs" in saved && saved.tabs && typeof saved.tabs === "object") {
        for (const [id, tab] of Object.entries(saved.tabs))
          if (isProjectId(id) && isTab(tab)) savedTabs[id] = tab;
      }
    }
  } catch {
    /* Unavailable storage leaves this session in memory. */
  }
  return {
    generation: 0,
    environmentId,
    presentation,
    wideOpen,
    open: presentation === "dock" && wideOpen,
    projectId,
    selectedTab: projectId === null ? "files" : projectTab(savedTabs, projectId),
    tabs: savedTabs,
    request: null,
  };
}

/** One environment-owned producer. Consumers use the provider rather than another hook instance. */
export function useWorkspaceResourceState(
  environmentId: EnvironmentId | null,
  options?: WorkspaceResourceStateOptions,
): WorkspaceResourcesState {
  const storage = options?.storage ?? browserStorage;
  const presentation = options?.presentation ?? "dock";
  const [session, setSession] = useState(() => readSession(environmentId, presentation, storage));
  if (session.environmentId !== environmentId) {
    setSession({
      ...readSession(environmentId, presentation, storage),
      generation: session.generation + 1,
    });
  } else if (session.presentation !== presentation) {
    setSession({
      ...session,
      presentation,
      open: session.open || (presentation === "dock" && session.wideOpen),
    });
  }
  const currentGeneration = session.generation;
  useEffect(() => {
    if (session.environmentId === null) return;
    try {
      storage.setItem(
        `pulse.workspace.resources.v1:${session.environmentId}`,
        JSON.stringify({
          version: 1,
          open: session.wideOpen,
          projectId: session.projectId,
          tabs: session.tabs,
        }),
      );
    } catch {
      /* Keep the usable in-memory selection when persistence is denied. */
    }
  }, [session, storage]);
  const update = useCallback(
    (change: (value: ResourceSession) => ResourceSession) => {
      setSession((previous) => {
        return previous.environmentId !== environmentId || previous.generation !== currentGeneration
          ? previous
          : change(previous);
      });
    },
    [environmentId, currentGeneration],
  );
  const chooseProject = useCallback(
    (projectId: ProjectId) => {
      if (!isProjectId(projectId)) throw new Error("Invalid resource project.");
      if (environmentId === null) return;
      update((value) =>
        value.projectId === projectId
          ? value
          : {
              ...value,
              projectId,
              selectedTab: projectTab(value.tabs, projectId),
              request: null,
            },
      );
    },
    [environmentId, update],
  );
  const selectTab = useCallback(
    (tab: WorkspaceResourceTab) => {
      if (!isTab(tab)) throw new Error("Invalid resource tab.");
      update((value) =>
        value.selectedTab === tab
          ? value
          : {
              ...value,
              selectedTab: tab,
              request: null,
              tabs:
                value.projectId === null ? value.tabs : { ...value.tabs, [value.projectId]: tab },
            },
      );
    },
    [update],
  );
  const resetProject = useCallback(
    () => update((value) => ({ ...value, projectId: null, request: null })),
    [update],
  );
  const close = useCallback(
    () =>
      update((value) => ({
        ...value,
        open: false,
        wideOpen: value.presentation === "dock" ? false : value.wideOpen,
      })),
    [update],
  );
  const reopen = useCallback(
    () =>
      update((value) => ({
        ...value,
        open: true,
        wideOpen: value.presentation === "dock" ? true : value.wideOpen,
      })),
    [update],
  );
  const openResource = useCallback(
    (input: OpenWorkspaceResourceInput) => {
      if (!isProjectId(input.projectId) || !isTab(input.tab))
        throw new Error("Invalid resource destination.");
      const request = input.request == null ? null : decodeRequest(input.request);
      if (request !== null) {
        const matches =
          input.tab === "files"
            ? request.type === "file"
            : input.tab === "browser"
              ? request.type === "url"
              : input.tab === "agents"
                ? request.type === "thread"
                : input.tab === "tasks"
                  ? request.type === "task"
                  : input.tab === "docs"
                    ? request.type === "file" || request.type === "provider-resource"
                    : request.type === "url" || request.type === "provider-resource";
        if (!matches) throw new Error("This item does not belong in the requested resource tab.");
      }
      if (environmentId === null) return;
      update((value) => ({
        ...value,
        projectId: input.projectId,
        selectedTab: input.tab,
        request,
        tabs: { ...value.tabs, [input.projectId]: input.tab },
        open: true,
        wideOpen: value.presentation === "dock" ? true : value.wideOpen,
      }));
    },
    [environmentId, update],
  );
  return useMemo(
    () => ({
      environmentId: session.environmentId,
      open: session.open,
      projectId: session.projectId,
      selectedTab: session.selectedTab,
      request: session.request,
      chooseProject,
      resetProject,
      selectTab,
      close,
      reopen,
      openResource,
    }),
    [session, chooseProject, resetProject, selectTab, close, reopen, openResource],
  );
}

export const WorkspaceResourcesContext = createContext<WorkspaceResourcesState | null>(null);
export const WorkspaceResourcesCloseFocusContext = createContext<{
  readonly restoreFocus: () => void;
  readonly hidden: boolean;
} | null>(null);
export function WorkspaceResourcesProvider(props: {
  readonly value: WorkspaceResourcesState;
  readonly children: ReactNode;
}): ReactNode {
  return createElement(WorkspaceResourcesContext, { value: props.value }, props.children);
}
export function useWorkspaceResources(): WorkspaceResourcesState {
  const value = useContext(WorkspaceResourcesContext);
  if (value === null) throw new Error("useWorkspaceResources requires WorkspaceResourcesProvider.");
  return value;
}
