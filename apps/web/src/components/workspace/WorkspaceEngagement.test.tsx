// @vitest-environment happy-dom
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, queryByRole } from "@testing-library/dom";
import { EnvironmentId, type WorkspaceLinkEndpoint } from "@t3tools/contracts";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { useWorkspaceResourceState, WorkspaceResourcesProvider } from "./workspaceResourceState";
import { useMediaQuery } from "../../hooks/useMediaQuery";

let root: Root;
let node: HTMLDivElement;
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  node?.remove();
  vi.unstubAllGlobals();
});
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>Saved {count}</button>;
}
async function mount(
  layout: "full" | "split" = "full",
  viewport = 1280,
  initialOpen = true,
  options: {
    linked?: ReactNode;
    item?: WorkspaceLinkEndpoint | null;
    resources?: ReactNode;
    environmentId?: EnvironmentId | null;
  } = {},
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  (
    window as unknown as {
      happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
    }
  ).happyDOM.setWindowSize({ width: viewport, height: 800 });
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  const back = vi.fn();
  function App({ selectedItem }: { selectedItem?: WorkspaceLinkEndpoint | null | undefined }) {
    const wide = useMediaQuery("xl");
    const environmentId =
      options.environmentId === undefined ? EnvironmentId.make("a") : options.environmentId;
    const state = useWorkspaceResourceState(environmentId, {
      presentation: wide ? "dock" : "sheet",
      storage: {
        getItem: () => JSON.stringify({ version: 1, open: initialOpen }),
        setItem: () => {},
      },
    });
    return (
      <WorkspaceResourcesProvider value={state}>
        <WorkspaceEngagement
          environmentId={
            options.environmentId === undefined ? EnvironmentId.make("a") : options.environmentId
          }
          space="projects"
          header={{ title: "Projects", environmentLabel: "A", spaceLabel: "Projects" }}
          {...("linked" in options
            ? {
                linkedContext: {
                  item:
                    selectedItem !== undefined
                      ? selectedItem
                      : options.linked === null
                        ? null
                        : {
                            ref: { type: "url" as const, url: "https://example.invalid/a" },
                            title: "Page A",
                          },
                  render: () => options.linked,
                },
                resources: <p>Project resources</p>,
              }
            : { resources: "resources" in options ? options.resources : <p>Project resources</p> })}
          storage={storage}
          {...(layout === "full"
            ? { layout }
            : { layout, selected: true, list: <p>Project list</p>, onBack: back })}
        >
          <Counter />
        </WorkspaceEngagement>
      </WorkspaceResourcesProvider>
    );
  }
  await act(async () => root.render(<App selectedItem={options.item} />));
  return {
    values,
    back,
    rerender: () => act(() => root.render(<App selectedItem={options.item} />)),
  };
}
it("lets a full-width form work without subscribing to list sizing and keeps its state across Resources", async () => {
  const { values } = await mount();
  await act(async () => getByRole(node, "button", { name: "Saved 0" }).click());
  expect(queryByRole(node, "region", { name: "Item list" })).toBeNull();
  expect(queryByRole(node, "separator", { name: "Resize item list" })).toBeNull();
  const resources = getByRole(node, "button", { name: "Resources" });
  await act(async () => resources.click());
  expect(resources.getAttribute("aria-expanded")).toBe("false");
  await act(async () => resources.click());
  expect(getByRole(node, "button", { name: "Saved 1" })).toBeDefined();
  expect(values.size).toBe(0);
});

it("opens captured linked context explicitly on wide screens and supports Back and reopen", async () => {
  await mount("full", 1280, false, { linked: <p>Linked page</p> });
  expect(queryByRole(node, "complementary", { name: "Linked context" })).toBeNull();
  await act(() => getByRole(node, "button", { name: "Linked context" }).click());
  const dock = getByRole(node, "complementary", { name: "Linked context" });
  expect(dock.textContent).toContain("Linked page");
  const toggle = getByRole(node, "button", { name: "Linked context" });
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  await act(async () => toggle.click());
  expect(queryByRole(node, "complementary", { name: "Linked context" })).toBeNull();
  await act(async () => toggle.click());
  expect(getByRole(node, "complementary", { name: "Linked context" }).textContent).toContain(
    "Linked page",
  );
});

it("keeps compact linked items closed until requested", async () => {
  await mount("full", 390, false, { linked: <p>Linked page</p> });
  expect(queryByRole(document.body, "dialog")).toBeNull();
  await act(async () => getByRole(node, "button", { name: "Workspace actions" }).click());
  await act(async () => getByRole(document.body, "menuitem", { name: "Linked context" }).click());
  expect(getByRole(document.body, "dialog", { name: "Linked context" }).textContent).toContain(
    "Linked page",
  );
});

it("explains the empty linked dock instead of leaving a blank column", async () => {
  await mount("full", 1280, false, { linked: null });
  await act(() => getByRole(node, "button", { name: "Linked context" }).click());
  expect(getByRole(node, "complementary", { name: "Linked context" }).textContent).toContain(
    "Select an item to see its linked context.",
  );
});

it("renders explicit empty resources without telling spaces to choose a project", async () => {
  await mount("full", 1280, true, { resources: null });
  expect(getByRole(node, "complementary", { name: "Resources" }).textContent).toBe("");
});

it("keeps disconnected split widths in memory without persisting a fake environment", async () => {
  const { values } = await mount("split", 1280, false, { environmentId: null });
  const separator = getByRole(node, "separator", { name: "Resize item list" });
  await act(async () =>
    separator.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
  );
  expect(separator.getAttribute("aria-valuenow")).toBe("190");
  expect(values.size).toBe(0);
});
it("retains selection, Back and keyboard split sizing with scoped v2 storage", async () => {
  const { values, back } = await mount("split");
  const separator = getByRole(node, "separator", { name: "Resize item list" });
  expect(separator.getAttribute("aria-valuenow")).toBe("170");
  for (const [key, width] of [
    ["ArrowRight", "190"],
    ["ArrowLeft", "170"],
    ["End", "408.6"],
    ["Home", "160"],
  ] as const) {
    await act(async () =>
      separator.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })),
    );
    expect(Number(values.get("pulse.workspace.a.projects.engagement-width.v2"))).toBeCloseTo(
      Number(width),
    );
  }
  await act(async () => getByRole(node, "button", { name: "Back to list" }).click());
  expect(back).toHaveBeenCalledOnce();
});

it("uses one compact Resources sheet and retains the center form when it closes", async () => {
  await mount("full", 390, false);
  await act(async () => getByRole(node, "button", { name: "Saved 0" }).click());
  await act(async () => getByRole(node, "button", { name: "Resources" }).click());
  const dialog = getByRole(document.body, "dialog", { name: "Resources" });
  expect(dialog.textContent).toContain("Project resources");
  expect(node.querySelector("[data-workspace-resources]")).toBeNull();
  await act(async () => getByRole(dialog, "button", { name: "Close" }).click());
  expect(getByRole(node, "button", { name: "Saved 1" })).toBeDefined();
});

it("does not reopen a compact Linked context sheet after a wide round trip", async () => {
  await mount("full", 390, false, { linked: <p>Captured linked page</p> });
  await act(() => window.dispatchEvent(new Event("resize")));
  await act(() => getByRole(node, "button", { name: "Workspace actions" }).click());
  await act(() => getByRole(document.body, "menuitem", { name: "Linked context" }).click());
  expect(getByRole(document.body, "dialog", { name: "Linked context" })).toBeDefined();
  const resize = (width: number) =>
    act(() => {
      (
        window as unknown as {
          happyDOM: { setWindowSize: (size: { width: number; height: number }) => void };
        }
      ).happyDOM.setWindowSize({ width, height: 800 });
    });
  await resize(1280);
  await resize(390);
  expect(queryByRole(document.body, "dialog")).toBeNull();
});

it("keeps focus on the Linked context toggle and returns explicit close to that trigger", async () => {
  await mount("full", 1280, false, { linked: <p>Linked page</p> });
  const trigger = getByRole(node, "button", { name: "Linked context" });
  await act(() => {
    trigger.focus();
    trigger.click();
  });
  await act(() => trigger.click());
  expect(document.activeElement).toBe(trigger);
  await act(() => trigger.click());
  const close = getByRole(node, "button", { name: "Close linked context" });
  await act(() => {
    close.focus();
    close.click();
  });
  expect(document.activeElement).toBe(trigger);
  expect(queryByRole(node, "complementary", { name: "Linked context" })).toBeNull();
});

it("returns compact context close to its overflow trigger", async () => {
  await mount("full", 390, false, { linked: <p>Linked page</p> });
  const trigger = getByRole(node, "button", { name: "Workspace actions" });
  await act(() => {
    trigger.focus();
    trigger.click();
  });
  await act(() => getByRole(document.body, "menuitem", { name: "Linked context" }).click());
  const dialog = getByRole(document.body, "dialog", { name: "Linked context" });
  const close = getByRole(dialog, "button", { name: "Close linked context" });
  await act(() => {
    close.focus();
    close.click();
  });
  expect(document.activeElement).toBe(trigger);
  expect(queryByRole(document.body, "dialog", { name: "Linked context" })).toBeNull();
});
it("hides Linked context in spaces that cannot supply a selected item", async () => {
  await mount();
  expect(queryByRole(node, "button", { name: "Linked context" })).toBeNull();
});
it("captures the first selection from an empty context and labels it held after selection changes", async () => {
  const options = { linked: <p>Links</p>, item: null as WorkspaceLinkEndpoint | null };
  const { rerender } = await mount("full", 1280, true, options);
  await act(() => getByRole(node, "button", { name: "Linked context" }).click());
  options.item = { ref: { type: "url", url: "https://example.invalid/a" }, title: "First item" };
  await rerender();
  expect(getByRole(node, "heading", { name: "First item" })).toBeDefined();
  options.item = { ref: { type: "url", url: "https://example.invalid/b" }, title: "Next item" };
  await rerender();
  expect(node.textContent).toContain("Held item");
  expect(getByRole(node, "heading", { name: "First item" })).toBeDefined();
  await act(() => getByRole(node, "button", { name: "Show current item" }).click());
  expect(getByRole(node, "heading", { name: "Next item" })).toBeDefined();
});
it("closes context with X without persisting Resources as closed", async () => {
  await mount("full", 1280, true, { linked: <p>Links</p> });
  await act(() => getByRole(node, "button", { name: "Linked context" }).click());
  await act(() => getByRole(node, "button", { name: "Close linked context" }).click());
  expect(getByRole(node, "complementary", { name: "Resources" })).toBeDefined();
});
it("keeps compact Back focus inside the resource sheet", async () => {
  await mount("full", 390, false, {
    linked: <p>Links</p>,
    resources: (
      <button role="tab" aria-selected="true">
        Files
      </button>
    ),
  });
  await act(() => getByRole(node, "button", { name: "Workspace actions" }).click());
  await act(() => getByRole(document.body, "menuitem", { name: "Linked context" }).click());
  const back = getByRole(document.body, "button", { name: "Back to resources" });
  await act(() => {
    back.focus();
    back.click();
  });
  const dialog = getByRole(document.body, "dialog", { name: "Resources" });
  expect(dialog.contains(document.activeElement)).toBe(true);
});
