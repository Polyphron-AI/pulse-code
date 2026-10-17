// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { act, useSyncExternalStore, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { createRoot } from "react-dom/client";
import { fireEvent, getAllByRole, getByRole } from "@testing-library/dom";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  compileResolvedKeybindingsConfig,
  DEFAULT_RESOLVED_KEYBINDINGS,
} from "@t3tools/shared/keybindings";
import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type ScopedProjectRef,
  type ResolvedKeybindingsConfig,
  type WorkspaceLinkEndpoint,
} from "@t3tools/contracts";
import { useComposerDraftStore, type DraftId } from "../../composerDraftStore";
import { newDraftId } from "../../lib/utils";
import { WorkspaceItemActions, WorkspaceItemMenu } from "./WorkspaceItemActions";
import { projectMenuItems } from "./mail/linkedItems";
import { buildWorkspaceActionItems } from "../CommandPalette.logic";

const mocks = vi.hoisted(() => ({
  createProject:
    vi.fn<
      (input: { onCreated?: (project: ScopedProjectRef) => Promise<void> }) => Promise<boolean>
    >(),
  linkToProject: vi.fn<(...args: unknown[]) => Promise<void>>(),
  startThread: vi.fn<
    (...args: unknown[]) => Promise<{ draftId: DraftId; threadId: ThreadId } | null>
  >(async () => null),
  contextMenuShow: vi.fn(),
  operate: true,
  pending: false,
  keybindings: null as ResolvedKeybindingsConfig | null,
  sessionListeners: new Set<() => void>(),
}));
vi.mock("../../localApi", () => ({
  readLocalApi: () => ({ contextMenu: { show: mocks.contextMenuShow } }),
}));
vi.mock("../../state/session", () => ({
  useEnvironmentSessionState: () => {
    useSyncExternalStore(
      (listener) => {
        mocks.sessionListeners.add(listener);
        return () => {
          mocks.sessionListeners.delete(listener);
        };
      },
      () => `${mocks.operate}:${mocks.pending}`,
      () => `${mocks.operate}:${mocks.pending}`,
    );
    return {
      isPending: mocks.pending,
      data: { authenticated: true, scopes: mocks.operate ? ["orchestration:operate"] : [] },
    };
  },
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ state: { location: { href: "/workspace" } } }),
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => mocks.keybindings ?? DEFAULT_RESOLVED_KEYBINDINGS,
}));
vi.mock("../../state/server", () => ({ primaryServerKeybindingsAtom: {} }));
vi.mock("../../state/entities", () => ({
  useProjects: () => [
    { id: ProjectId.make("project-a"), title: "A project", environmentId: EnvironmentId.make("a") },
  ],
  useThreadShells: () => [],
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: () => ({ data: { linked: [] }, error: null, refresh: vi.fn() }),
}));
vi.mock("../../state/workspaceLinks", () => ({ workspaceLinks: { list: vi.fn() } }));
vi.mock("../../hooks/useHandleNewThread", () => ({ useNewThreadHandler: () => mocks.startThread }));
vi.mock("../../hooks/useNewProject", () => ({ useNewProject: () => mocks.createProject }));
vi.mock("./mail/useMailLinks", () => ({
  useMailLinks: () => ({ linkToProject: mocks.linkToProject }),
  linkErrorText: (cause: unknown) => (cause instanceof Error ? cause.message : "Failed"),
}));
vi.mock("./mail/useMailCapabilities", () => ({
  useMailCapabilities: () => ({ workspaceLinks: true, workspaceItemContext: true }),
}));
vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipPopup: () => null,
}));
vi.mock("../ui/button", () => ({ Button: "button" }));
vi.mock("../ui/input", () => ({ Input: "input" }));
vi.mock("../ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => children,
  PopoverTrigger: ({ render }: { render: ReactNode }) => render,
  PopoverPopup: ({ children }: { children: ReactNode }) => children,
}));
beforeEach(() => {
  mocks.operate = true;
  mocks.pending = false;
  mocks.keybindings = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const a = { ref: { type: "url" as const, url: "https://example.invalid/a" }, title: "A" };
const b = { ref: { type: "url" as const, url: "https://example.invalid/b" }, title: "B" };
const environmentId = EnvironmentId.make("a");
const choiceId = projectMenuItems(
  [{ id: ProjectId.make("project-a"), title: "A project" }],
  new Set(),
)[0]!.id;
const target = document.createElement("button");
it("offers only local handoffs in a read-only item menu with workspace links enabled", async () => {
  mocks.operate = false;
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  try {
    await act(() =>
      root.render(
        <WorkspaceItemMenu
          environmentId={environmentId}
          item={a}
          actions={
            <>
              <a href="https://meet.google.com/abc-defg-hij">Join meeting</a>
              <button type="button">Copy meeting link</button>
            </>
          }
        >
          <span>A row</span>
        </WorkspaceItemMenu>,
      ),
    );
    await act(() => fireEvent.contextMenu(node.querySelector('[draggable="true"]')!));
    expect(getByRole(node, "link", { name: "Join meeting" })).toBeDefined();
    expect(getAllByRole(node, "button").map((button) => button.textContent)).toEqual([
      "",
      "Copy meeting link",
    ]);
    expect(node.querySelector("input, select, textarea")).toBeNull();
  } finally {
    await act(() => root.unmount());
    node.remove();
  }
});
function add(view: ReactTestRenderer) {
  return view.root
    .findAllByType("button")
    .find((button) => button.props.children === "Add to project")!;
}
it.each(["choose", "cancel", "revoked", "environment"])(
  "keeps the pending item chooser scoped: %s",
  async (outcome) => {
    let resolve!: (value: string | null) => void;
    const choice = new Promise<string | null>((done) => {
      resolve = done;
    });
    mocks.contextMenuShow.mockReturnValueOnce(choice);
    mocks.linkToProject.mockResolvedValue(undefined);
    let view!: ReactTestRenderer;
    await act(() => {
      view = create(<WorkspaceItemActions environmentId={environmentId} item={a} />);
    });
    try {
      await act(async () => {
        add(view).props.onClick({ currentTarget: target });
      });
      if (outcome === "revoked") mocks.operate = false;
      await act(() => {
        view.update(
          <WorkspaceItemActions
            environmentId={outcome === "environment" ? EnvironmentId.make("b") : environmentId}
            item={b}
          />,
        );
      });
      await act(async () => {
        resolve(outcome === "cancel" ? null : choiceId);
        await choice;
      });
      if (outcome === "choose")
        expect(mocks.linkToProject).toHaveBeenCalledWith(
          a,
          expect.objectContaining({ id: "project-a" }),
          { type: "action", action: "add-to-project" },
        );
      else expect(mocks.linkToProject).not.toHaveBeenCalled();
      expect(mocks.startThread).not.toHaveBeenCalled();
      expect(mocks.createProject).not.toHaveBeenCalled();
    } finally {
      await act(() => view.unmount());
    }
  },
);
it("holds a row's item when selection changes while its menu is open", async () => {
  let view!: ReactTestRenderer;
  await act(() => {
    view = create(
      <WorkspaceItemMenu environmentId={environmentId} item={a}>
        <button>A row</button>
      </WorkspaceItemMenu>,
    );
  });
  try {
    await act(() =>
      view.root.findByProps({ draggable: true }).props.onContextMenu({ preventDefault() {} }),
    );
    await act(() =>
      view.update(
        <WorkspaceItemMenu environmentId={environmentId} item={b}>
          <button>B row</button>
        </WorkspaceItemMenu>,
      ),
    );
    mocks.contextMenuShow.mockResolvedValueOnce(choiceId);
    mocks.linkToProject.mockResolvedValue(undefined);
    await act(async () => {
      add(view).props.onClick({ currentTarget: target });
    });
    expect(mocks.linkToProject).toHaveBeenCalledWith(a, expect.anything(), expect.anything());
  } finally {
    await act(() => view.unmount());
  }
});
it("keeps a native menu's project editor on A after selection changes to B", async () => {
  let resolve!: (value: string | null) => void;
  const choice = new Promise<string | null>((done) => {
    resolve = done;
  });
  mocks.contextMenuShow.mockReturnValueOnce(choice);
  mocks.linkToProject.mockResolvedValue(undefined);
  mocks.createProject.mockImplementation(async (input) => {
    await input.onCreated?.(scopeProjectRef(environmentId, ProjectId.make("new")));
    return true;
  });
  let view!: ReactTestRenderer;
  await act(() => {
    view = create(<WorkspaceItemActions environmentId={environmentId} item={a} />);
  });
  try {
    await act(() =>
      view.root
        .findByProps({ className: "flex flex-wrap items-center gap-2" })
        .props.onContextMenu({
          preventDefault() {},
          currentTarget: target,
          clientX: 0,
          clientY: 0,
        }),
    );
    await act(() => view.update(<WorkspaceItemActions environmentId={environmentId} item={b} />));
    await act(async () => {
      resolve("new-project");
      await choice;
    });
    await act(() => view.root.findByType("input").props.onChange({ target: { value: "New" } }));
    await act(async () => {
      view.root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
    expect(mocks.linkToProject).toHaveBeenCalledWith(a, expect.anything(), {
      type: "action",
      action: "start-project",
    });
  } finally {
    await act(() => view.unmount());
  }
});
it("retains a held project draft while disabling actions after permission loss", async () => {
  let view!: ReactTestRenderer;
  await act(() => {
    view = create(<WorkspaceItemActions environmentId={environmentId} item={a} />);
  });
  try {
    await act(() =>
      view.root
        .findAllByType("button")
        .find((button) => button.props.children === "Start project")!
        .props.onClick(),
    );
    expect(view.root.findAllByType("form")).toHaveLength(1);
    await act(() =>
      view.root.findByType("input").props.onChange({ target: { value: "Half typed" } }),
    );
    mocks.operate = false;
    await act(() => view.update(<WorkspaceItemActions environmentId={environmentId} item={b} />));
    expect(view.root.findByType("input").props.value).toBe("Half typed");
    expect(view.root.findByType("input").props.disabled).toBe(true);
    await act(() => view.root.findByType("form").props.onSubmit({ preventDefault() {} }));
    expect(mocks.createProject).not.toHaveBeenCalled();
    mocks.operate = true;
    mocks.pending = false;
    await act(() => view.update(<WorkspaceItemActions environmentId={environmentId} item={b} />));
    expect(view.root.findByType("input").props.value).toBe("Half typed");
    expect(view.root.findByType("input").props.disabled).toBe(false);
  } finally {
    await act(() => view.unmount());
  }
});
it.each(["header", "row menu"])(
  "keeps the %s project input focused and its draft editable during session revalidation",
  async (entrance) => {
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    mocks.createProject.mockResolvedValue(false);
    try {
      await act(() =>
        root.render(
          entrance === "header" ? (
            <WorkspaceItemActions environmentId={environmentId} item={a} />
          ) : (
            <WorkspaceItemMenu environmentId={environmentId} item={a}>
              <button>Item A</button>
            </WorkspaceItemMenu>
          ),
        ),
      );
      if (entrance === "row menu")
        await act(() =>
          node
            .querySelector('[draggable="true"]')!
            .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
        );
      await act(() => getByRole(node, "button", { name: "Start project" }).click());
      const input = getByRole<HTMLInputElement>(node, "textbox", { name: "New project name" });
      input.focus();
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      await act(() => {
        setValue.call(input, "Half typed");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(input.value).toBe("Half typed");
      expect(document.activeElement).toBe(input);
      await act(() => {
        mocks.pending = true;
        for (const notify of mocks.sessionListeners) notify();
      });
      expect(document.activeElement).toBe(input);
      expect(input.value).toBe("Half typed");
      expect(input.disabled).toBe(false);
      await act(() => {
        setValue.call(input, "Half typed project");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(() =>
        input
          .closest("form")!
          .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
      );
      expect(mocks.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Half typed project" }),
      );
      expect(document.activeElement).toBe(input);
    } finally {
      await act(() => root.unmount());
      node.remove();
    }
  },
);
it("records a project created during permission loss and retries its link against the held item", async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const project = scopeProjectRef(environmentId, ProjectId.make("created"));
  mocks.createProject.mockImplementation(async (input) => {
    await pending;
    await input.onCreated?.(project);
    return true;
  });
  mocks.linkToProject.mockImplementation(async () => {
    if (!mocks.operate) throw new Error("Operate unavailable");
  });
  let view!: ReactTestRenderer;
  await act(() => {
    view = create(<WorkspaceItemActions environmentId={environmentId} item={a} />);
  });
  try {
    await act(() =>
      view.root
        .findAllByType("button")
        .find((button) => button.props.children === "Start project")!
        .props.onClick(),
    );
    await act(() => view.root.findByType("input").props.onChange({ target: { value: "Launch" } }));
    await act(() => view.root.findByType("form").props.onSubmit({ preventDefault() {} }));
    mocks.operate = false;
    await act(() => view.update(<WorkspaceItemActions environmentId={environmentId} item={b} />));
    await act(async () => {
      finish();
      await pending;
    });
    expect(view.root.findByProps({ role: "alert" }).children.join("")).toContain(
      "Project created, link failed",
    );
    mocks.operate = true;
    await act(() => view.update(<WorkspaceItemActions environmentId={environmentId} item={b} />));
    await act(() => view.root.findByType("form").props.onSubmit({ preventDefault() {} }));
    expect(mocks.createProject).toHaveBeenCalledTimes(1);
    expect(mocks.linkToProject).toHaveBeenLastCalledWith(
      a,
      { id: project.projectId, title: "Launch" },
      { type: "action", action: "start-project" },
    );
    expect(mocks.startThread).toHaveBeenCalledWith(project);
  } finally {
    await act(() => view.unmount());
  }
});
it("finishes the captured project link after the action host unmounts", async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const project = scopeProjectRef(environmentId, ProjectId.make("created-after-unmount"));
  let created!: Promise<boolean>;
  mocks.createProject.mockImplementation((input) => {
    created = pending.then(async () => {
      await input.onCreated?.(project);
      return true;
    });
    return created;
  });
  mocks.linkToProject.mockResolvedValue(undefined);
  let view!: ReactTestRenderer;
  await act(() => {
    view = create(<WorkspaceItemActions environmentId={environmentId} item={a} />);
  });
  await act(() =>
    view.root
      .findAllByType("button")
      .find((button) => button.props.children === "Start project")!
      .props.onClick(),
  );
  await act(() => view.root.findByType("input").props.onChange({ target: { value: "Launch" } }));
  await act(() => view.root.findByType("form").props.onSubmit({ preventDefault() {} }));
  await act(() => view.unmount());
  await act(async () => {
    finish();
    await created;
  });
  expect(mocks.linkToProject).toHaveBeenCalledWith(
    a,
    { id: project.projectId, title: "Launch" },
    { type: "action", action: "start-project" },
  );
});
it("retains an open row menu and its error while permission revalidates", async () => {
  let view!: ReactTestRenderer;
  await act(() => {
    view = create(
      <WorkspaceItemMenu environmentId={environmentId} item={a}>
        <button>A row</button>
      </WorkspaceItemMenu>,
    );
  });
  try {
    await act(() =>
      view.root.findByProps({ draggable: true }).props.onContextMenu({ preventDefault() {} }),
    );
    mocks.contextMenuShow.mockResolvedValueOnce(choiceId);
    mocks.linkToProject.mockRejectedValueOnce(new Error("Link unavailable"));
    await act(async () => {
      add(view).props.onClick({ currentTarget: target });
    });
    // A failed link retains the same host, even when the current row changes.
    mocks.pending = true;
    await act(() => {
      for (const listener of mocks.sessionListeners) listener();
    });
    await act(() =>
      view.update(
        <WorkspaceItemMenu environmentId={environmentId} item={b}>
          <button>B row</button>
        </WorkspaceItemMenu>,
      ),
    );
    expect(view.root.findByProps({ role: "alert" }).children.join("")).toContain(
      "Link unavailable",
    );
    expect(add(view).props.disabled).toBe(false);
  } finally {
    await act(() => view.unmount());
  }
});
it.each(["long-press", "move", "cancel", "release", "unmount"])(
  "handles the touch menu gesture: %s",
  async (gesture) => {
    vi.useFakeTimers();
    let view!: ReactTestRenderer;
    await act(() => {
      view = create(
        <WorkspaceItemMenu environmentId={environmentId} item={a}>
          <button>A row</button>
        </WorkspaceItemMenu>,
      );
    });
    try {
      const row = view.root.findByProps({ draggable: true });
      await act(() => row.props.onPointerDown({ pointerType: "touch", clientX: 0, clientY: 0 }));
      if (gesture === "move") await act(() => row.props.onPointerMove({ clientX: 11, clientY: 0 }));
      if (gesture === "cancel") await act(() => row.props.onPointerCancel());
      if (gesture === "release") await act(() => row.props.onPointerUp());
      if (gesture === "unmount") await act(() => view.unmount());
      else
        await act(() =>
          view.update(
            <WorkspaceItemMenu environmentId={environmentId} item={b}>
              <button>B row</button>
            </WorkspaceItemMenu>,
          ),
        );
      await act(() => vi.advanceTimersByTime(500));
      if (gesture === "long-press") {
        mocks.contextMenuShow.mockResolvedValueOnce(choiceId);
        await act(async () => {
          add(view).props.onClick({ currentTarget: target });
        });
        expect(mocks.linkToProject).toHaveBeenCalledWith(a, expect.anything(), expect.anything());
      } else if (gesture !== "unmount")
        expect(view.root.findAllByType(WorkspaceItemActions)).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      if (gesture !== "unmount") await act(() => view.unmount());
      vi.useRealTimers();
    }
  },
);
it.each<WorkspaceLinkEndpoint>([
  a,
  {
    ref: {
      type: "provider-resource",
      provider: "workspace-calendar",
      resourceId: "wce_00000000-0000-0000-0000-000000000001",
    },
    title: "Calendar event",
  },
])("dispatches one selected-item shortcut and captured palette action for %j", async (source) => {
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  function App({ selected }: { selected: WorkspaceLinkEndpoint }) {
    return (
      <>
        <WorkspaceItemActions environmentId={environmentId} item={selected} shortcuts />
        <WorkspaceItemMenu environmentId={environmentId} item={b} shortcuts>
          <button>Resource B</button>
        </WorkspaceItemMenu>
      </>
    );
  }
  mocks.contextMenuShow.mockResolvedValue(choiceId);
  mocks.linkToProject.mockResolvedValue(undefined);
  try {
    await act(() => root.render(<App selected={source} />));
    await act(() =>
      node
        .querySelector('[draggable="true"]')!
        .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
    );
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "p",
          code: "KeyP",
          ctrlKey: true,
          altKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(mocks.linkToProject).toHaveBeenCalledTimes(1);
    expect(mocks.linkToProject).toHaveBeenCalledWith(source, expect.anything(), expect.anything());
    const palette = buildWorkspaceActionItems(null).find(
      (action) => action.shortcutCommand === "workspace.addToProject",
    )!;
    await act(() => root.render(<App selected={b} />));
    mocks.linkToProject.mockClear();
    await act(async () => palette.run());
    expect(mocks.linkToProject).not.toHaveBeenCalled();
    await act(async () =>
      buildWorkspaceActionItems(null)
        .find((action) => action.shortcutCommand === "workspace.addToProject")!
        .run(),
    );
    expect(mocks.linkToProject).toHaveBeenCalledTimes(1);
    expect(mocks.linkToProject).toHaveBeenCalledWith(b, expect.anything(), expect.anything());
  } finally {
    await act(() => root.unmount());
    node.remove();
  }
});

it.each([true, false])(
  "dispatches focused page shortcuts and captured palette actions with central host %s",
  async (centralHost) => {
    const node = document.createElement("div");
    document.body.append(node);
    const root = createRoot(node);
    const globalListener = vi.spyOn(window, "addEventListener");
    mocks.keybindings = compileResolvedKeybindingsConfig([
      { key: "ctrl+alt+q", command: "workspace.addToProject" },
    ]);
    mocks.contextMenuShow.mockResolvedValue(choiceId);
    mocks.linkToProject.mockResolvedValue(undefined);
    function App({ popup = true }: { popup?: boolean }) {
      return (
        <>
          {centralHost ? (
            <div data-testid="center">
              <WorkspaceItemActions environmentId={environmentId} item={a} shortcuts />
            </div>
          ) : null}
          {popup ? (
            <div data-testid="captured-page">
              <WorkspaceItemActions environmentId={environmentId} item={b} />
            </div>
          ) : null}
          <input aria-label="Palette search" />
        </>
      );
    }
    try {
      await act(() => root.render(<App />));
      expect(globalListener.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(
        centralHost ? 1 : 0,
      );
      const pageHost = node.querySelector<HTMLElement>('[data-testid="captured-page"]')!;
      const pageAction = getByRole(pageHost, "button", { name: "Add to project" });
      await act(() => pageAction.focus());
      await act(async () => {
        const event = new KeyboardEvent("keydown", {
          key: "q",
          code: "KeyQ",
          ctrlKey: true,
          altKey: true,
          bubbles: true,
          cancelable: true,
        });
        (centralHost ? window : pageAction).dispatchEvent(event);
      });
      expect(mocks.linkToProject).toHaveBeenCalledTimes(1);
      expect(mocks.linkToProject).toHaveBeenCalledWith(b, expect.anything(), expect.anything());
      mocks.linkToProject.mockClear();

      await act(() => getByRole(node, "textbox", { name: "Palette search" }).focus());
      const palette = buildWorkspaceActionItems(null).find(
        (action) => action.shortcutCommand === "workspace.addToProject",
      )!;
      expect(palette).toBeDefined();
      await act(async () => palette.run());
      expect(mocks.linkToProject).toHaveBeenCalledTimes(1);
      expect(mocks.linkToProject).toHaveBeenCalledWith(b, expect.anything(), expect.anything());

      await act(() => root.render(<App popup={false} />));
      mocks.linkToProject.mockClear();
      await act(async () => palette.run());
      expect(mocks.linkToProject).not.toHaveBeenCalled();
      const fallback = buildWorkspaceActionItems(null).find(
        (action) => action.shortcutCommand === "workspace.addToProject",
      );
      if (centralHost) {
        expect(fallback).toBeDefined();
        await act(async () => fallback!.run());
        expect(mocks.linkToProject).toHaveBeenCalledTimes(1);
        expect(mocks.linkToProject).toHaveBeenCalledWith(a, expect.anything(), expect.anything());
      } else expect(fallback).toBeUndefined();
    } finally {
      await act(() => root.unmount());
      node.remove();
      globalListener.mockRestore();
    }
  },
);

describe("workspace action entrances", () => {
  it("renders selected-item actions and shortcut labels without crashing the reader", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceItemActions
        shortcuts
        environmentId={EnvironmentId.make("test-env")}
        item={{ ref: { type: "url", url: "https://example.test/brief" }, title: "Brief" }}
      />,
    );
    expect(markup).toContain("Start thread");
    expect(markup).toContain("Add to project");
    expect(markup).toContain("Start project");
    expect(markup).toContain('data-workspace-action="startThread"');
    expect(markup).not.toContain('title="');
  });
});

it("retries source linking against the created project without creating a duplicate", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.createProject.mockClear();
  mocks.linkToProject.mockReset();
  mocks.startThread.mockClear();
  const environmentId = EnvironmentId.make("test-env");
  const project = scopeProjectRef(environmentId, ProjectId.make("created-project"));
  mocks.createProject.mockImplementation(async (input) => {
    await input.onCreated?.(project);
    return true;
  });
  mocks.linkToProject
    .mockRejectedValueOnce(new Error("Link unavailable"))
    .mockResolvedValue(undefined);
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <WorkspaceItemActions
        environmentId={environmentId}
        item={{ ref: { type: "url", url: "https://example.test/source" }, title: "Source" }}
      />,
    );
  });
  try {
    await act(async () => {
      renderer.root
        .findAllByType("button")
        .find((button) => button.props.children === "Start project")!
        .props.onClick();
    });
    await act(async () => {
      renderer.root
        .findAllByType("button")
        .find((button) => button.props.children === "Cancel")!
        .props.onClick();
    });
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(mocks.linkToProject).not.toHaveBeenCalled();
    await act(async () => {
      renderer.root
        .findAllByType("button")
        .find((button) => button.props.children === "Start project")!
        .props.onClick();
    });
    await act(async () => {
      renderer.root.findByType("input").props.onChange({ target: { value: "Launch" } });
    });
    await act(async () => {
      renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
    expect(mocks.createProject).toHaveBeenCalledTimes(1);
    expect(renderer.root.findByType("input").props.disabled).toBe(true);
    await act(async () => {
      renderer.root.findByType("form").props.onSubmit({ preventDefault() {} });
    });
    expect(mocks.createProject).toHaveBeenCalledTimes(1);
    expect(mocks.linkToProject).toHaveBeenCalledTimes(2);
    expect(mocks.startThread).toHaveBeenCalledWith(project);
  } finally {
    await act(async () => renderer.unmount());
    vi.unstubAllGlobals();
  }
});

it("cancels a task menu's Start thread chooser without a thread or link", async () => {
  const task = {
    ref: { type: "task" as const, taskId: "wskt_00000000-0000-4000-8000-000000000001" },
    title: "Launch",
  };
  mocks.contextMenuShow.mockResolvedValue(null);
  let view!: ReactTestRenderer;
  await act(() => {
    view = create(
      <WorkspaceItemMenu environmentId={environmentId} item={task}>
        <button>Task</button>
      </WorkspaceItemMenu>,
    );
  });
  try {
    await act(() =>
      view.root.findByProps({ draggable: true }).props.onContextMenu({ preventDefault() {} }),
    );
    await act(() =>
      view.root
        .findAllByType("button")
        .find((b) => b.children.join("") === "Start thread")!
        .props.onClick({ currentTarget: target }),
    );
    expect(mocks.contextMenuShow).toHaveBeenCalled();
    expect(mocks.startThread).not.toHaveBeenCalled();
    expect(mocks.linkToProject).not.toHaveBeenCalled();
  } finally {
    await act(() => view.unmount());
  }
});
it("starts from a stable task ref with its structural project as explicit context", async () => {
  const task = {
    ref: { type: "task" as const, taskId: "wskt_00000000-0000-4000-8000-000000000001" },
    title: "Launch",
  };
  const project = { ref: { type: "project" as const, projectId: ProjectId.make("project-a") } };
  const draftId = newDraftId();
  mocks.startThread.mockResolvedValueOnce({ draftId, threadId: ThreadId.make("thread-a") });
  const addContexts = vi
    .spyOn(useComposerDraftStore.getState(), "addThreadContexts")
    .mockImplementation(() => {});
  let view!: ReactTestRenderer;
  await act(() => {
    view = create(
      <WorkspaceItemActions environmentId={environmentId} item={task} confirmed={[project]} />,
    );
  });
  try {
    await act(() =>
      view.root
        .findAllByType("button")
        .find((b) => b.children.join("") === "Start thread")!
        .props.onClick({ currentTarget: target }),
    );
    expect(mocks.startThread).toHaveBeenCalledWith(
      scopeProjectRef(environmentId, project.ref.projectId),
    );
    expect(addContexts).toHaveBeenCalledWith(
      draftId,
      [
        expect.objectContaining({ item: task, viewing: task }),
        expect.objectContaining({ item: project, viewing: task }),
      ],
      { insertAtCaret: false },
    );
    expect(mocks.linkToProject).not.toHaveBeenCalled();
  } finally {
    addContexts.mockRestore();
    await act(() => view.unmount());
  }
});

it("keeps an event and its environment captured across delayed project selection", async () => {
  const event = {
    ref: {
      type: "provider-resource",
      provider: "workspace-calendar",
      resourceId: "wce_00000000-0000-0000-0000-000000000001",
    },
    title: "Captured event",
  } as const;
  let resolve!: (choice: string) => void;
  const choice = new Promise<string>((done) => {
    resolve = done;
  });
  mocks.contextMenuShow.mockReturnValueOnce(choice);
  mocks.linkToProject.mockResolvedValue(undefined);
  let view!: ReactTestRenderer;
  await act(() => {
    view = create(<WorkspaceItemActions environmentId={environmentId} item={event} />);
  });
  try {
    await act(() => {
      add(view).props.onClick({ currentTarget: target });
    });
    await act(() => view.update(<WorkspaceItemActions environmentId={environmentId} item={b} />));
    await act(async () => {
      resolve(choiceId);
      await choice;
    });
    expect(mocks.linkToProject).toHaveBeenCalledWith(
      event,
      expect.objectContaining({ id: "project-a" }),
      { type: "action", action: "add-to-project" },
    );
    expect(mocks.startThread).not.toHaveBeenCalled();
  } finally {
    await act(() => view.unmount());
  }
});
