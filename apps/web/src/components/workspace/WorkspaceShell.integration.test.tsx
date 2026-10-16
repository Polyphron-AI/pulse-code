// @vitest-environment happy-dom
import { act, StrictMode, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getByRole, getAllByRole, queryByRole } from "@testing-library/dom";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { WorkspaceEngagement } from "./WorkspaceEngagement";
import { WorkspaceShellLayout } from "./WorkspaceShellLayout";
import { WorkspaceResourcesPanelView } from "./WorkspaceResourcesPanelView";
import { WorkspaceViewRail, workspaceRailItems } from "./WorkspaceViewRail";
import { useWorkspaceResourceState, WorkspaceResourcesProvider } from "./workspaceResourceState";

function createViewport() {
  let width = 1280;
  let centerWidth = 681;
  const queries = new Set<MediaQueryList>();
  const observers = new Map<
    ResizeObserver,
    { callback: ResizeObserverCallback; targets: Set<Element> }
  >();
  const matches = (query: string) =>
    [...query.matchAll(/(min|max)-width:\s*(\d+)px/g)].every(([, bound, px]) =>
      bound === "min" ? width >= Number(px) : width <= Number(px),
    );
  const notify = (observer: ResizeObserver) => {
    const record = observers.get(observer)!;
    const size = [{ inlineSize: centerWidth, blockSize: 722 }];
    record.callback(
      [...record.targets].map((target) => ({
        target,
        contentRect: new DOMRect(0, 0, centerWidth, 722),
        borderBoxSize: size,
        contentBoxSize: size,
        devicePixelContentBoxSize: size,
      })),
      observer,
    );
  };
  vi.stubGlobal("matchMedia", (media: string) => {
    const query = new EventTarget() as MediaQueryList;
    Object.defineProperties(query, {
      media: { value: media },
      matches: { get: () => matches(media) },
      onchange: { value: null, writable: true },
    });
    query.addListener = (listener) => {
      if (listener) query.addEventListener("change", listener);
    };
    query.removeListener = (listener) => {
      if (listener) query.removeEventListener("change", listener);
    };
    queries.add(query);
    return query;
  });
  vi.stubGlobal(
    "ResizeObserver",
    class implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        observers.set(this, { callback, targets: new Set() });
      }
      observe(target: Element) {
        observers.get(this)!.targets.add(target);
        notify(this);
      }
      unobserve(target: Element) {
        observers.get(this)!.targets.delete(target);
      }
      disconnect() {
        observers.delete(this);
      }
    },
  );
  return {
    set(next: number, observedCenterWidth = 681) {
      width = next;
      centerWidth = observedCenterWidth;
      Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
      Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
      for (const query of queries) {
        const event = new Event("change") as MediaQueryListEvent;
        Object.defineProperties(event, {
          matches: { value: query.matches },
          media: { value: query.media },
        });
        query.dispatchEvent(event);
        query.onchange?.(event);
      }
      for (const observer of observers.keys()) notify(observer);
      window.dispatchEvent(new Event("resize"));
    },
  };
}

let root: Root;
let node: HTMLDivElement;
let viewport: ReturnType<typeof createViewport>;
let originalWidth: PropertyDescriptor | undefined;
let originalHeight: PropertyDescriptor | undefined;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  originalWidth = Object.getOwnPropertyDescriptor(window, "innerWidth");
  originalHeight = Object.getOwnPropertyDescriptor(window, "innerHeight");
  viewport = createViewport();
  viewport.set(1280);
  node = document.createElement("div");
  document.body.append(node);
  root = createRoot(node);
});
afterEach(async () => {
  await act(() => root.unmount());
  node.remove();
  vi.unstubAllGlobals();
  if (originalWidth) Object.defineProperty(window, "innerWidth", originalWidth);
  else Reflect.deleteProperty(window, "innerWidth");
  if (originalHeight) Object.defineProperty(window, "innerHeight", originalHeight);
  else Reflect.deleteProperty(window, "innerHeight");
});

const environmentId = EnvironmentId.make("remote-a");
const projectId = ProjectId.make("same-project");
const header = { title: "Projects", environmentLabel: "Remote A", spaceLabel: "Projects" };
async function mount(width = 1280, rememberedOpen = true, strict = false) {
  viewport.set(width);
  const preferences = new Map<string, string>();
  const storage = {
    getItem: (key: string) =>
      preferences.get(key) ?? JSON.stringify({ version: 1, open: rememberedOpen }),
    setItem: (key: string, value: string) => {
      preferences.set(key, value);
    },
  };
  let active = 0;
  let maximum = 0;
  const acquire = vi.fn(() => {
    active += 1;
    maximum = Math.max(maximum, active);
  });
  const release = vi.fn(() => {
    active -= 1;
  });
  function BrowserBody() {
    const [draft, setDraft] = useState("");
    useEffect(() => {
      acquire();
      return release;
    }, []);
    return (
      <input
        aria-label="Resource draft"
        value={draft}
        onInput={(event) => setDraft(event.currentTarget.value)}
      />
    );
  }
  function App() {
    const wide = useMediaQuery("xl");
    const state = useWorkspaceResourceState(environmentId, {
      presentation: wide ? "dock" : "sheet",
      storage,
    });
    const [selected, setSelected] = useState(false);
    const [search, setSearch] = useState("");
    return (
      <WorkspaceResourcesProvider value={state}>
        <WorkspaceShellLayout
          navigation={<button>Navigation</button>}
          header={header}
          onOpenWorkspace={() => {}}
          rail={
            <WorkspaceViewRail
              items={workspaceRailItems.projects}
              selected="projects"
              onSelect={() => {}}
            />
          }
          engagement={
            <WorkspaceEngagement
              environmentId={environmentId}
              space="projects"
              header={header}
              layout="split"
              selected={selected}
              onBack={() => setSelected(false)}
              list={
                <>
                  <input
                    aria-label="Search items"
                    value={search}
                    onInput={(event) => setSearch(event.currentTarget.value)}
                  />
                  <button onClick={() => setSelected(true)}>Open item</button>
                </>
              }
              linkedContext={{
                item: { ref: { type: "url", url: "https://example.invalid/a" }, title: "Item A" },
                render: () => <p>Item links</p>,
              }}
              resources={
                <WorkspaceResourcesPanelView
                  projects={[{ id: projectId, title: "Project" }]}
                  selectedProjectId={projectId}
                  status="selected"
                  tab={state.selectedTab}
                  onTabChange={state.selectTab}
                  onChooseProject={state.chooseProject}
                  onClose={state.close}
                  body={<BrowserBody />}
                  footer="Connection status unavailable"
                />
              }
            >
              <input aria-label="Center draft" defaultValue="Center draft" />
            </WorkspaceEngagement>
          }
        />
      </WorkspaceResourcesProvider>
    );
  }
  await act(() =>
    root.render(
      strict ? (
        <StrictMode>
          <App />
        </StrictMode>
      ) : (
        <App />
      ),
    ),
  );
  return { acquire, release, active: () => active, maximum: () => maximum, preferences };
}
async function type(input: HTMLInputElement, value: string) {
  await act(() => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function linked() {
  const trigger = queryByRole(node, "button", { name: "Linked context" });
  if (trigger) await act(() => trigger.click());
  else {
    await act(() => getByRole(node, "button", { name: "Workspace actions" }).click());
    await act(() => getByRole(document.body, "menuitem", { name: "Linked context" }).click());
  }
}

it("keeps the resource container attached through the live app's StrictMode mount cycle", async () => {
  const probe = await mount(1280, true, true);
  const input = getByRole(node, "textbox", { name: "Resource draft" });
  expect(input.isConnected).toBe(true);
  expect(probe.active()).toBe(1);
  expect(probe.maximum()).toBe(1);
  await act(() => viewport.set(390));
  expect(getByRole(document.body, "textbox", { name: "Resource draft" })).toBe(input);
  expect(probe.active()).toBe(1);
});

it("keeps one preview lease, the same draft and focus across every dock/sheet breakpoint and Linked context", async () => {
  const probe = await mount();
  const input = getByRole(node, "textbox", { name: "Resource draft" }) as HTMLInputElement;
  await type(input, "keep me");
  input.focus();
  for (const width of [1279, 1024, 768, 390, 1280]) {
    await act(() => viewport.set(width, width === 1280 ? 480 : 681));
    const host =
      width >= 1280
        ? getByRole(node, "complementary", { name: "Resources" })
        : getByRole(document.body, "dialog", { name: "Resources" });
    expect(getByRole(host, "textbox", { name: "Resource draft" })).toBe(input);
    expect(input.value).toBe("keep me");
    expect(document.activeElement).toBe(input);
    expect(probe.active()).toBe(1);
    expect(probe.acquire).toHaveBeenCalledTimes(1);
  }
  await linked();
  expect(queryByRole(document.body, "textbox", { name: "Resource draft" })).toBeNull();
  expect(probe.active()).toBe(1);
  await act(() => viewport.set(390));
  expect(getByRole(document.body, "dialog", { name: "Linked context" }).textContent).toContain(
    "Item A",
  );
  await act(() => getByRole(document.body, "button", { name: "Back to resources" }).click());
  expect(getByRole(document.body, "textbox", { name: "Resource draft" })).toBe(input);
  expect(input.value).toBe("keep me");
  expect(probe.maximum()).toBe(1);
  expect(probe.release).not.toHaveBeenCalled();
  await act(() => root.unmount());
  expect(probe.active()).toBe(0);
  root = createRoot(node);
});

it.each([390, 768, 1024, 1279])(
  "opens Resources before selection at %ipx and restores focus on Escape and close",
  async (width) => {
    const probe = await mount(width);
    expect(queryByRole(document.body, "dialog")).toBeNull();
    expect(probe.acquire).not.toHaveBeenCalled();
    const trigger = getByRole(node, "button", { name: "Resources" });
    const center = getByRole(node, "textbox", {
      name: "Center draft",
      hidden: true,
    }) as HTMLInputElement;
    center.value = "keep center";
    await act(() => {
      trigger.focus();
      trigger.click();
    });
    const dialog = getByRole(document.body, "dialog", { name: "Resources" });
    expect(getAllByRole(dialog, "tab")).toHaveLength(6);
    const files = getByRole(dialog, "tab", { name: "Files" });
    await act(() => {
      files.focus();
      files.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    });
    expect(document.activeElement).toBe(getByRole(dialog, "tab", { name: "PRs" }));
    await act(() =>
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
      ),
    );
    expect(queryByRole(document.body, "dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(center.value).toBe("keep center");
    expect(probe.active()).toBe(0);
    await act(() => trigger.click());
    await act(() =>
      getByRole(getByRole(document.body, "dialog"), "button", { name: "Close" }).click(),
    );
    expect(document.activeElement).toBe(trigger);
    expect(probe.active()).toBe(0);
  },
);

it("retains list search and scroll through detail, Back and a compact resource sheet", async () => {
  await mount(390);
  const list = getByRole(node, "region", { name: "Item list" });
  const search = getByRole(list, "textbox", { name: "Search items" }) as HTMLInputElement;
  await type(search, "launch");
  list.scrollTop = 120;
  await act(() => getByRole(list, "button", { name: "Open item" }).click());
  await act(() => getByRole(node, "button", { name: "Resources" }).click());
  await act(() =>
    getByRole(getByRole(document.body, "dialog"), "button", { name: "Close" }).click(),
  );
  await act(() => getByRole(node, "button", { name: "Back to list" }).click());
  expect(getByRole(node, "textbox", { name: "Search items" })).toBe(search);
  expect(search.value).toBe("launch");
  expect(list.scrollTop).toBe(120);
});
