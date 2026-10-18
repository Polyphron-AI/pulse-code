// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { ProjectsOverviewView } from "./ProjectsOverviewView";
import { resolveResourceProject, useWorkspaceResourceState } from "./workspaceResourceState";
import { ProjectPickerView } from "./ProjectPickerView";
let root: Root | undefined;
let node: HTMLDivElement;
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = undefined;
  node?.remove();
  vi.unstubAllGlobals();
});
async function mount(allowAll = false) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  const choose = vi.fn();
  function App() {
    const [selected, setSelected] = useState<ProjectId | null>(null);
    return (
      <ProjectPickerView
        projects={[
          { id: ProjectId.make("a"), title: "Alpha" },
          { id: ProjectId.make("b"), title: "Beta" },
        ]}
        selectedProjectId={selected}
        allowAll={allowAll}
        onChooseProject={(id) => {
          choose(id);
          setSelected(id);
        }}
      />
    );
  }
  await act(() => root!.render(<App />));
  return choose;
}
it("searches and selects a project before an item exists without an All projects option", async () => {
  const choose = await mount();
  await act(() => getByRole(node, "combobox", { name: "Choose project" }).click());
  expect(queryByRole(document.body, "option", { name: "All projects" })).toBeNull();
  const input = getByRole(document.body, "combobox", {
    name: "Search projects",
  }) as HTMLInputElement;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Beta");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(queryByRole(document.body, "option", { name: "Alpha" })).toBeNull();
  await act(() => getByRole(document.body, "option", { name: "Beta" }).click());
  expect(choose).toHaveBeenCalledWith("b");
  expect(getByRole(node, "combobox", { name: "Choose project" }).textContent).toContain("Beta");
});
it("offers All projects only when explicitly allowed", async () => {
  const choose = await mount(true);
  await act(() => getByRole(node, "combobox", { name: "Choose project" }).click());
  await act(() => getByRole(document.body, "option", { name: "All projects" }).click());
  expect(choose).toHaveBeenCalledWith(null);
});
it("returns from an explicit project to Auto without choosing another project", async () => {
  const choose = await mount();
  const automatic = vi.fn();
  await act(() =>
    root!.render(
      <ProjectPickerView
        projects={[{ id: ProjectId.make("a"), title: "Alpha" }]}
        selectedProjectId={ProjectId.make("a")}
        onChooseProject={choose}
        onAutoProject={automatic}
      />,
    ),
  );
  await act(() => getByRole(node, "combobox", { name: "Choose project" }).click());
  await act(() => getByRole(document.body, "option", { name: "Auto" }).click());
  expect(automatic).toHaveBeenCalledOnce();
  expect(choose).not.toHaveBeenCalled();
});
it("keeps Choose a project reachable and distinguishes inferred from manual selection", async () => {
  await mount();
  const props = {
    projects: [{ id: ProjectId.make("a"), title: "Alpha" }],
    onChooseProject: vi.fn(),
    onAutoProject: vi.fn(),
  };
  await act(() =>
    root!.render(<ProjectPickerView {...props} selectedProjectId={null} automatic />),
  );
  expect(getByRole(node, "combobox", { name: "Choose project" }).textContent).toContain(
    "Choose a project",
  );
  await act(() =>
    root!.render(
      <ProjectPickerView {...props} selectedProjectId={ProjectId.make("a")} automatic />,
    ),
  );
  expect(getByRole(node, "combobox", { name: "Choose project" }).textContent).toContain(
    "Auto: Alpha",
  );
  await act(() => getByRole(node, "combobox", { name: "Choose project" }).click());
  expect(getByRole(document.body, "option", { name: "Auto" }).getAttribute("aria-selected")).toBe(
    "true",
  );
  await act(() => getByRole(document.body, "option", { name: "Alpha" }).click());
  await act(() =>
    root!.render(
      <ProjectPickerView {...props} selectedProjectId={ProjectId.make("a")} automatic={false} />,
    ),
  );
  expect(getByRole(node, "combobox", { name: "Choose project" }).textContent).toBe("Alpha");
});

it("synchronizes an external card selection while the dropdown search is open", async () => {
  await mount();
  const choose = vi.fn();
  const projects = [
    { id: ProjectId.make("a"), title: "Alpha" },
    { id: ProjectId.make("b"), title: "Beta" },
  ];
  await act(() =>
    root!.render(
      <ProjectPickerView
        projects={projects}
        selectedProjectId={projects[0]!.id}
        onChooseProject={choose}
      />,
    ),
  );
  await act(() => getByRole(node, "combobox", { name: "Choose project" }).click());
  const input = getByRole(document.body, "combobox", {
    name: "Search projects",
  }) as HTMLInputElement;
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Alpha");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(() =>
    root!.render(
      <ProjectPickerView
        projects={projects}
        selectedProjectId={projects[1]!.id}
        onChooseProject={choose}
      />,
    ),
  );
  expect(getByRole(node, "combobox", { name: "Choose project" }).textContent).toContain("Beta");
  expect(getByRole(document.body, "option", { name: "Beta" })).toBeDefined();
  expect(choose).not.toHaveBeenCalled();
});

it("keeps card and dropdown selection aligned while resource-only changes retain the center item", async () => {
  await mount();
  const environmentId = EnvironmentId.make("remote");
  const projects = [
    { id: ProjectId.make("a"), title: "Alpha", environmentId },
    { id: ProjectId.make("b"), title: "Beta", environmentId },
  ];
  function App() {
    const [selected, setSelected] = useState(projects[0]!.id);
    const resources = useWorkspaceResourceState(environmentId, {
      storage: { getItem: () => null, setItem() {} },
    });
    const target = resolveResourceProject({
      environmentId,
      projects,
      explicitProjectId: resources.projectId,
      owningProjectIds: [selected],
      confirmedProjectIds: [],
    });
    return (
      <>
        <fieldset>
          <legend>Selected project</legend>
          <ProjectPickerView
            projects={projects}
            selectedProjectId={selected}
            onChooseProject={(id) => {
              if (id) setSelected(id);
            }}
          />
        </fieldset>
        <ProjectsOverviewView
          projects={projects.map((p) => ({
            projectId: p.id,
            title: p.title,
            description: null,
            driveRoot: "none",
            channels: { count: 0, complete: true, providers: [] },
          }))}
          selectedProjectId={selected}
          query=""
          driveFilter="all"
          pending={false}
          error={null}
          hasMore={false}
          roster={[]}
          onQueryChange={() => {}}
          onSearch={() => {}}
          onDriveFilterChange={() => {}}
          onSelect={setSelected}
          onCreate={() => {}}
          onMore={() => {}}
          onRetry={() => {}}
          createButtonRef={null}
        />
        <fieldset>
          <legend>Project resources</legend>
          <ProjectPickerView
            projects={projects}
            selectedProjectId={target.kind === "selected" ? target.scope.projectId : null}
            automatic={resources.projectId === null}
            onAutoProject={resources.resetProject}
            onChooseProject={(id) => {
              if (id) resources.chooseProject(id);
            }}
          />
        </fieldset>
      </>
    );
  }
  await act(() => root!.render(<App />));
  await act(() => getByRole(node, "button", { name: "Select Beta" }).click());
  const header = getByRole(node, "group", { name: "Selected project" });
  const resources = getByRole(node, "group", { name: "Project resources" });
  expect(getByRole(header, "combobox", { name: "Choose project" }).textContent).toBe("Beta");
  expect(getByRole(resources, "combobox", { name: "Choose project" }).textContent).toBe(
    "Auto: Beta",
  );
  await act(() => getByRole(resources, "combobox", { name: "Choose project" }).click());
  await act(() => getByRole(document.body, "option", { name: "Alpha" }).click());
  expect(getByRole(resources, "combobox", { name: "Choose project" }).textContent).toBe("Alpha");
  expect(getByRole(header, "combobox", { name: "Choose project" }).textContent).toBe("Beta");
  expect(getByRole(node, "button", { name: "Select Beta" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
});
