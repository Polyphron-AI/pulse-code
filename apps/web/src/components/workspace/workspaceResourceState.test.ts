import { act, createElement, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  resolveResourceProject,
  useWorkspaceResourceState,
  useWorkspaceResources,
  WorkspaceResourcesProvider,
  type WorkspaceResourcesState,
} from "./workspaceResourceState";

const a = EnvironmentId.make("a");
const b = EnvironmentId.make("b");
const p = ProjectId.make("same-id");
const q = ProjectId.make("other");
const projects = [
  { environmentId: a, id: p, title: "A project" },
  { environmentId: a, id: q, title: "Other project" },
  { environmentId: b, id: p, title: "B project" },
];
const resolve = (
  explicitProjectId: ProjectId | null,
  owningProjectIds: ProjectId[] = [],
  confirmedProjectIds: ProjectId[] = [],
) =>
  resolveResourceProject({
    environmentId: a,
    projects,
    explicitProjectId,
    owningProjectIds,
    confirmedProjectIds,
  });

it("chooses only a single related project in the selected environment", () => {
  expect(resolve(null)).toEqual({ kind: "choose", candidates: [] });
  expect(resolve(null, [p])).toEqual({
    kind: "selected",
    scope: { environmentId: a, projectId: p },
    title: "A project",
  });
  expect(resolve(null, [], [p])).toEqual(resolve(null, [p]));
  expect(resolve(null, [p], [q])).toEqual({ kind: "choose", candidates: [p, q] });
  expect(resolve(p, [q])).toEqual(resolve(null, [p]));
  expect(resolve(ProjectId.make("deleted"))).toEqual({ kind: "unavailable", projectId: "deleted" });
  expect(
    resolveResourceProject({
      environmentId: a,
      projects: [projects[2]!],
      explicitProjectId: null,
      owningProjectIds: [],
      confirmedProjectIds: [p],
    }),
  ).toEqual({ kind: "choose", candidates: [] });
});

let renderer: ReactTestRenderer | undefined;
let state: WorkspaceResourcesState;
const values = new Map<string, string>();
const storage = {
  getItem: vi.fn((key: string) => values.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    values.set(key, value);
  }),
};
function Consumer() {
  const current = useWorkspaceResources();
  useLayoutEffect(() => {
    state = current;
  }, [current]);
  return null;
}
function App({
  environmentId = a,
  presentation = "dock",
}: {
  environmentId?: EnvironmentId | null;
  presentation?: "dock" | "sheet";
}) {
  const value = useWorkspaceResourceState(environmentId, { storage, presentation });
  // eslint-disable-next-line react/no-children-prop -- The public provider requires children in this .ts createElement test.
  return createElement(WorkspaceResourcesProvider, { value, children: createElement(Consumer) });
}
async function mount(
  environmentId: EnvironmentId | null = a,
  presentation: "dock" | "sheet" = "dock",
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(() => {
    renderer = create(createElement(App, { environmentId, presentation }));
  });
}
afterEach(async () => {
  if (renderer) await act(() => renderer!.unmount());
  renderer = undefined;
  values.clear();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it("resets explicit selection and requests for Auto while retaining the saved project tab", async () => {
  await mount();
  await act(() =>
    state.openResource({
      projectId: p,
      tab: "browser",
      request: { type: "url", url: "https://example.invalid/a" },
    }),
  );
  await act(() => state.resetProject());
  expect(state).toMatchObject({
    projectId: null,
    request: null,
    selectedTab: "browser",
    open: true,
  });
  expect(JSON.parse(values.get("pulse.workspace.resources.v1:a")!)).toMatchObject({
    projectId: null,
  });
  await act(() => state.chooseProject(p));
  expect(state).toMatchObject({ projectId: p, selectedTab: "browser", request: null });
});

it("opens project/tab/request atomically, preserves close intent and restores tabs per project", async () => {
  await mount();
  const request = { type: "file" as const, provider: "google-drive" as const, fileId: "file-a" };
  await act(() => state.openResource({ projectId: p, tab: "files", request }));
  expect(state).toMatchObject({
    environmentId: a,
    open: true,
    projectId: p,
    selectedTab: "files",
    request,
  });
  await act(() => state.close());
  await act(() => state.reopen());
  expect(state.request).toEqual(request);
  await act(() => state.selectTab("files"));
  await act(() => state.chooseProject(p));
  expect(state.request).toEqual(request);
  await act(() => state.selectTab("browser"));
  expect(state.request).toBeNull();
  await act(() => state.chooseProject(q));
  expect(state.selectedTab).toBe("files");
  await act(() => state.chooseProject(p));
  expect(state.selectedTab).toBe("browser");
  expect([...values.values()].join("")).not.toContain("file-a");
});

it("isolates equal project ids, cancels old callbacks and clears requests on environment changes", async () => {
  await mount();
  const oldOpen = state.openResource;
  await act(() =>
    state.openResource({
      projectId: p,
      tab: "browser",
      request: { type: "url", url: "https://example.invalid/a" },
    }),
  );
  await act(() => renderer!.update(createElement(App, { environmentId: b })));
  expect(state).toMatchObject({
    environmentId: b,
    projectId: null,
    selectedTab: "files",
    request: null,
  });
  await act(() => oldOpen({ projectId: p, tab: "agents" }));
  expect(state.projectId).toBeNull();
  await act(() => state.chooseProject(p));
  expect(state.selectedTab).toBe("files");
  await act(() => renderer!.update(createElement(App, { environmentId: a })));
  expect(state).toMatchObject({ projectId: p, selectedTab: "browser", request: null });
});

it("restores the wide preference and never opens a sheet just because presentation changes", async () => {
  await mount();
  expect(state.open).toBe(true);
  await act(() => renderer!.update(createElement(App, { presentation: "sheet" })));
  expect(state.open).toBe(false);
  await act(() => state.reopen());
  expect(state.open).toBe(true);
  await act(() => state.close());
  await act(() => renderer!.update(createElement(App, { presentation: "dock" })));
  expect(state.open).toBe(true);
  await act(() => state.close());
  await act(() => renderer!.update(createElement(App, { presentation: "sheet" })));
  expect(state.open).toBe(false);
  await act(() => state.reopen());
  await act(() => renderer!.update(createElement(App, { presentation: "dock" })));
  expect(state.open).toBe(false);
  await act(() => renderer!.unmount());
  renderer = undefined;
  await mount();
  expect(state.open).toBe(false);
});

it("uses no fake environment or storage when disconnected and keeps context identity stable", async () => {
  await mount(null);
  const previous = state;
  await act(() => renderer!.update(createElement(App, { environmentId: null })));
  expect(state).toBe(previous);
  await act(() => state.openResource({ projectId: p, tab: "files" }));
  expect(state.environmentId).toBeNull();
  expect(state.projectId).toBeNull();
  expect(storage.getItem).not.toHaveBeenCalled();
  expect(storage.setItem).not.toHaveBeenCalled();
});

it("recovers malformed storage and rejects malformed or mismatched handoff refs", async () => {
  values.set(
    `pulse.workspace.resources.v1:${a}`,
    JSON.stringify({ version: 1, open: false, projectId: 5, tabs: { [p]: "invented" } }),
  );
  await mount();
  expect(state).toMatchObject({ open: false, projectId: null, selectedTab: "files" });
  expect(() =>
    state.openResource({
      projectId: p,
      tab: "files",
      request: { type: "url", url: "https://example.invalid" },
    }),
  ).toThrow();
  expect(() =>
    state.openResource({ projectId: p, tab: "browser", request: { type: "url", url: "invalid" } }),
  ).toThrow();
  await act(() => state.openResource({ projectId: p, tab: "docs" }));
  expect(state.request).toBeNull();
});

it("continues in memory when storage is denied", async () => {
  storage.getItem.mockImplementationOnce(() => {
    throw new Error("denied");
  });
  storage.setItem.mockImplementationOnce(() => {
    throw new Error("denied");
  });
  await mount();
  await act(() => state.chooseProject(p));
  expect(state.projectId).toBe(p);
});
