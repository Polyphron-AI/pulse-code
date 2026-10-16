// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { ProjectId } from "@t3tools/contracts";
import { afterEach, expect, it, vi } from "vite-plus/test";
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
