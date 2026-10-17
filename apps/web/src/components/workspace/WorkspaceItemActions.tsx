import { ProjectId } from "@t3tools/contracts";
import {
  ComposerContextId,
  workspaceItemKey,
  type EnvironmentId,
  type WorkspaceLinkEndpoint,
  type ScopedProjectRef,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useRouter } from "@tanstack/react-router";
import { isTerminalFocused } from "../../lib/terminalFocus";
import { useAtomValue } from "@effect/atom-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type ReactNode,
} from "react";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { resolveShortcutCommand, shortcutLabelForCommand } from "../../keybindings";
import { isEditableFocused } from "../../lib/editableFocus";
import { useProjects, useThreadShells } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { workspaceLinks } from "../../state/workspaceLinks";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useNewProject } from "../../hooks/useNewProject";
import { useComposerDraftStore } from "../../composerDraftStore";
import { randomUUID } from "../../lib/utils";
import { readLocalApi } from "../../localApi";
import { WorkspaceItemMenuView } from "./WorkspaceItemMenuView";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  workspaceEndpointTitle,
  parseWorkspaceItemDrag,
  pickedProject,
  projectMenuItems,
} from "./mail/linkedItems";
import { MailDraftReply } from "./mail/MailDraftReply";
import { linkErrorText, useMailLinks } from "./mail/useMailLinks";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
import { workspaceActionButton } from "./WorkspaceNativeActions.logic";
import { WorkspaceItemActionButtons } from "./WorkspaceItemActionButtons";

const WorkspaceAutomationEditor = lazy(() => import("./WorkspaceAutomationEditor"));

const EMPTY_CONFIRMED: ReadonlyArray<WorkspaceLinkEndpoint> = [];

function dispatchWorkspaceShortcut(
  event: KeyboardEvent,
  keybindings: ResolvedKeybindingsConfig,
  selectedHost: Element | null,
) {
  if (event.defaultPrevented || event.repeat) return;
  const command = resolveShortcutCommand(event, keybindings, {
    context: { terminalFocus: isTerminalFocused(), editableFocus: isEditableFocused() },
  });
  const action =
    command === "workspace.startThread"
      ? "startThread"
      : command === "workspace.addToProject"
        ? "addToProject"
        : command === "workspace.startAutomation"
          ? "startAutomation"
          : command === "workspace.startProject"
            ? "startProject"
            : null;
  const button = action === null ? null : workspaceActionButton(action, selectedHost);
  if (button === null || !button.isConnected || button.disabled) return;
  event.preventDefault();
  button.click();
}

/** Shared header, keyboard, touch and context-menu entrances into item actions. */
type ItemActionProps = {
  environmentId: EnvironmentId;
  item: WorkspaceLinkEndpoint;
  layout?: "toolbar" | "menu" | undefined;
  shortcuts?: boolean;
  onlyStartThread?: boolean;
  initialAction?: import("./WorkspaceNativeActions.logic").WorkspaceNativeAction;
  confirmed?: ReadonlyArray<WorkspaceLinkEndpoint>;
};
export function WorkspaceItemActions(props: ItemActionProps) {
  const capability = useMailCapabilities(props.environmentId);
  const canOperate = useWorkspaceCanOperate(props.environmentId);
  const [captured, setCaptured] = useState<ItemActionProps | null>(null);
  if (captured && (captured.environmentId !== props.environmentId || !capability.workspaceLinks))
    setCaptured(null);
  const active = captured?.environmentId === props.environmentId ? captured : props;
  const current = useRef({ environmentId: props.environmentId, capability, canOperate });
  useLayoutEffect(() => {
    current.current = { environmentId: props.environmentId, capability, canOperate };
  });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const canAct = (action?: "start-thread" | "start-automation") => {
    const live = current.current;
    return (
      mounted.current &&
      live.environmentId === props.environmentId &&
      live.capability.workspaceLinks &&
      live.canOperate &&
      (action !== "start-thread" || live.capability.workspaceItemContext) &&
      (action !== "start-automation" || live.capability.workspaceTools)
    );
  };
  return capability.workspaceLinks ? (
    <AvailableWorkspaceItemActions
      key={`${active.environmentId}:${workspaceItemKey(active.item.ref)}:${active.initialAction ?? ""}`}
      {...active}
      canAct={canAct}
      canOperate={canOperate}
      hold={() => setCaptured((target) => target ?? props)}
      release={() => setCaptured(null)}
    />
  ) : null;
}

function AvailableWorkspaceItemActions({
  environmentId,
  item,
  layout,
  shortcuts = false,
  onlyStartThread = false,
  initialAction,
  confirmed = EMPTY_CONFIRMED,
  canAct,
  canOperate,
  hold,
  release,
}: ItemActionProps & {
  canAct: (action?: "start-thread" | "start-automation") => boolean;
  canOperate: boolean;
  hold: () => void;
  release: () => void;
}) {
  const router = useRouter();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const actionHost = useRef<HTMLDivElement>(null);
  const threadButton = useRef<HTMLButtonElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const projectButton = useRef<HTMLButtonElement>(null);
  const automationButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!shortcuts) return;
    const keydown = (event: KeyboardEvent) => {
      dispatchWorkspaceShortcut(event, keybindings, actionHost.current);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [shortcuts, keybindings]);
  const capability = useMailCapabilities(environmentId);
  const projects = useProjects().filter((project) => project.environmentId === environmentId);
  const threads = useThreadShells().filter((thread) => thread.environmentId === environmentId);
  const threadTitles = new Map(threads.map((thread) => [thread.id, thread.title]));
  const projectTitles = new Map(projects.map((project) => [project.id, project.title]));
  const labelFor = (endpoint: WorkspaceLinkEndpoint) => {
    const ref = endpoint.ref;
    return (
      (ref.type === "thread"
        ? threadTitles.get(ref.threadId)
        : ref.type === "project"
          ? projectTitles.get(ref.projectId)
          : undefined) ?? workspaceEndpointTitle(endpoint)
    );
  };
  const links = useEnvironmentQuery(
    capability.workspaceLinks
      ? workspaceLinks.list({ environmentId, input: { item: item.ref } })
      : null,
  );
  const startThread = useNewThreadHandler();
  const createProject = useNewProject();
  const { linkToProject } = useMailLinks(environmentId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [automationProject, setAutomationProject] = useState<ProjectId | null>(null);
  const [createdProject, setCreatedProject] = useState<ScopedProjectRef | null>(null);
  const [name, setName] = useState("");
  const run = async (operation: () => Promise<void>) => {
    if (!canAct()) return;
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (cause) {
      setError(linkErrorText(cause));
    } finally {
      setBusy(false);
    }
  };
  const choose = async (
    target: HTMLElement,
    action: "start-thread" | "add-to-project" | "start-automation",
  ) => {
    if (busy || !canAct(action === "add-to-project" ? undefined : action)) return;
    hold();
    let editing = false;
    try {
      if (action === "start-thread" && (!capability.workspaceItemContext || links.data === null)) {
        setError(
          "Wait for linked context to load, or update this server if workspace context is unavailable.",
        );
        return;
      }
      const rect = target.getBoundingClientRect();
      const sourceRef = item.ref;
      const linkedIds = new Set(
        (links.data?.linked ?? []).flatMap((view) =>
          view.item.ref.type === "project" ? [view.item.ref.projectId] : [],
        ),
      );
      if (sourceRef.type === "thread") {
        const own = threads.find((thread) => thread.id === sourceRef.threadId);
        if (own) linkedIds.add(own.projectId);
      }
      for (const endpoint of confirmed)
        if (endpoint.ref.type === "project") linkedIds.add(endpoint.ref.projectId);
      const linkedProjects = projects.filter((project) => linkedIds.has(project.id));
      const implicitProject =
        action !== "add-to-project"
          ? sourceRef.type === "project"
            ? projects.find((project) => project.id === sourceRef.projectId)
            : linkedProjects.length === 1
              ? linkedProjects[0]
              : undefined
          : undefined;
      const choice =
        implicitProject === undefined
          ? await readLocalApi()?.contextMenu.show(projectMenuItems(projects, new Set()), {
              x: rect.left,
              y: rect.bottom,
            })
          : null;
      const project = implicitProject ?? pickedProject(projects, choice ?? null);
      if (!project || !canAct(action === "add-to-project" ? undefined : action)) return;
      if (action === "start-automation") {
        editing = true;
        setAutomationProject(project.id);
        return;
      }
      // Capture the endpoints before navigation or draft creation can change the active reader.
      const source = { ...item, title: labelFor(item) };
      const endpoints = [
        source,
        ...(links.data?.linked.map((view) => view.item) ?? []),
        ...confirmed,
      ];
      const unique = [
        ...new Map(
          endpoints.map((endpoint) => [workspaceItemKey(endpoint.ref), endpoint]),
        ).values(),
      ].slice(0, 200);
      await run(async () => {
        if (action === "add-to-project") {
          await linkToProject({ ref: source.ref, title: source.title }, project, {
            type: "action",
            action,
          });
          return;
        }
        const draft = await startThread(scopeProjectRef(environmentId, project.id));
        if (draft === null) throw new Error("This project is unavailable. Choose another project.");
        useComposerDraftStore.getState().addThreadContexts(
          draft.draftId,
          unique.map((endpoint) => ({
            version: 1,
            kind: "workspace-item",
            contextId: ComposerContextId.make(`workspace_${randomUUID().replaceAll("-", "")}`),
            label: labelFor(endpoint).slice(0, 200),
            item: endpoint,
            viewing: source,
          })),
          { insertAtCaret: false },
        );
      });
    } finally {
      if (!editing) release();
    }
  };
  const initialTriggered = useRef(false);
  useEffect(() => {
    if (!initialAction || initialTriggered.current || links.data === null) return;
    if (
      (initialAction === "start-thread" && !capability.workspaceItemContext) ||
      (initialAction === "start-automation" && !capability.workspaceTools)
    )
      return;
    const button =
      initialAction === "start-thread"
        ? threadButton.current
        : initialAction === "add-to-project"
          ? addButton.current
          : initialAction === "start-project"
            ? projectButton.current
            : automationButton.current;
    if (button && !button.disabled) {
      initialTriggered.current = true;
      button.click();
    }
  }, [initialAction, links.data, capability.workspaceTools, capability.workspaceItemContext]);
  if (!capability.workspaceLinks) return null;
  return (
    <div
      ref={actionHost}
      className="flex flex-wrap items-center gap-2"
      data-workspace-action-host={shortcuts ? "selected" : "item"}
      onKeyDown={
        shortcuts
          ? undefined
          : (event) => dispatchWorkspaceShortcut(event.nativeEvent, keybindings, actionHost.current)
      }
      onContextMenu={(event) => {
        event.preventDefault();
        const menu = readLocalApi()?.contextMenu;
        if (!menu || !canAct()) return;
        hold();
        const target = event.currentTarget;
        void menu
          .show(
            [
              ...(item.ref.type === "mail"
                ? [
                    {
                      id: "reply",
                      label: "Draft reply with agent",
                      disabled: !capability.mailReply || busy || links.data === null,
                    },
                  ]
                : []),
              {
                id: "thread",
                label: "Start thread",
                disabled: !capability.workspaceItemContext || links.data === null || busy,
              },
              {
                id: "automation",
                label: "Start automation",
                disabled: !capability.workspaceTools || busy,
              },
              ...(item.ref.type === "project"
                ? []
                : [
                    { id: "project", label: "Add to project", disabled: busy },
                    { id: "new-project", label: "Start project", disabled: busy },
                  ]),
            ],
            { x: event.clientX, y: event.clientY },
          )
          .then((action) => {
            if (!canAct()) {
              release();
              return;
            }
            if (action === "automation") void choose(target, "start-automation");
            else if (action === "reply") {
              target.querySelector<HTMLButtonElement>("[data-workspace-reply]")?.click();
              release();
            } else if (action === "new-project") setCreating(true);
            else if (action)
              void choose(target, action === "thread" ? "start-thread" : "add-to-project");
            else release();
          })
          .catch((cause) => {
            setError(linkErrorText(cause));
            release();
          });
      }}
    >
      <WorkspaceItemActionButtons
        layout={layout}
        startThread={{
          ref: threadButton,
          disabled: busy || !canOperate || links.data === null || !capability.workspaceItemContext,
          onClick: (event) => void choose(event.currentTarget, "start-thread"),
        }}
        addToProject={
          !onlyStartThread && item.ref.type !== "project"
            ? {
                ref: addButton,
                disabled: busy || !canOperate,
                onClick: (event) => void choose(event.currentTarget, "add-to-project"),
              }
            : undefined
        }
        startProject={
          !onlyStartThread && item.ref.type !== "project"
            ? {
                ref: projectButton,
                disabled: busy || !canOperate,
                onClick: () => {
                  hold();
                  setCreating(true);
                },
              }
            : undefined
        }
        startAutomation={
          !onlyStartThread
            ? {
                ref: automationButton,
                disabled: busy || !canOperate || !capability.workspaceTools || links.data === null,
                onClick: (event) => void choose(event.currentTarget, "start-automation"),
              }
            : undefined
        }
        tooltips={{
          startThread: capability.workspaceItemContext
            ? (shortcutLabelForCommand(keybindings, "workspace.startThread") ?? "Start thread")
            : "Update this server to start a thread with workspace context",
          addToProject:
            shortcutLabelForCommand(keybindings, "workspace.addToProject") ?? "Add to project",
          startProject:
            shortcutLabelForCommand(keybindings, "workspace.startProject") ?? "Start project",
        }}
      />
      {automationProject !== null ? (
        <Suspense
          fallback={<p className="text-sm text-muted-foreground">Loading automation editor...</p>}
        >
          <WorkspaceAutomationEditor
            environmentId={environmentId}
            projectId={automationProject}
            item={{ ...item, title: labelFor(item) }}
            onClose={() => {
              setAutomationProject(null);
              release();
            }}
          />
        </Suspense>
      ) : null}
      {!onlyStartThread && item.ref.type === "mail" ? (
        <MailDraftReply
          environmentId={environmentId}
          item={item}
          linked={links.data?.linked.map((view) => view.item) ?? null}
        />
      ) : null}
      {creating ? (
        <form
          className="flex w-full flex-wrap gap-2"
          aria-label={`Start project from ${labelFor(item)}`}
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || !canAct()) return;
            const source = item;
            const requestingHref = router.state.location.href;
            void run(async () => {
              if (createdProject !== null) {
                await linkToProject(
                  { ref: source.ref, title: source.title ?? "Item" },
                  { id: createdProject.projectId, title: name.trim() },
                  { type: "action", action: "start-project" },
                );
                if (router.state.location.href === requestingHref)
                  await startThread(createdProject);
                setCreating(false);
                setName("");
                setCreatedProject(null);
                release();
                return;
              }
              let createdRef: ScopedProjectRef | null = null;
              const created = await createProject({
                environmentId,
                name: name.trim(),
                github: null,
                openThread: false,
                onCreated: async (project) => {
                  createdRef = project;
                  setCreatedProject(project);
                  try {
                    await linkToProject(
                      { ref: source.ref, title: source.title ?? "Item" },
                      { id: project.projectId, title: name.trim() },
                      { type: "action", action: "start-project" },
                    );
                  } catch (cause) {
                    throw new Error(`Project created, link failed. ${linkErrorText(cause)}`, {
                      cause,
                    });
                  }
                },
              });
              if (created) {
                if (createdRef !== null && router.state.location.href === requestingHref)
                  await startThread(createdRef);
                setCreating(false);
                setName("");
                setCreatedProject(null);
                release();
              }
            });
          }}
        >
          <p className="w-full text-xs text-muted-foreground">
            Link the new project to {labelFor(item)}.
          </p>
          <Input
            disabled={busy || !canOperate || createdProject !== null}
            aria-label="New project name"
            aria-description={`Link to ${labelFor(item)}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Button size="sm" type="submit" disabled={busy || !canOperate || !name.trim()}>
            {createdProject === null ? "Create project" : "Retry linking created project"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            type="button"
            disabled={busy}
            onClick={() => {
              setCreating(false);
              release();
            }}
          >
            Cancel
          </Button>
        </form>
      ) : null}
      {error !== null ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {(links.data?.linked.length ?? 0) + confirmed.length >= 200 ? (
        <p className="w-full text-xs text-muted-foreground">
          New threads include this item and up to 199 linked references. You can link more items
          after sending.
        </p>
      ) : null}
      {links.error !== null ? (
        <Button size="sm" variant="ghost" onClick={links.refresh}>
          Retry loading linked context
        </Button>
      ) : null}
    </div>
  );
}

/** A single item menu for lists and linked rows, including touch long-press. */
export function WorkspaceItemMenu({
  children,
  provenance,
  actions,
  popupVariant = "default",
  ...props
}: ItemActionProps & {
  children: ReactNode;
  provenance?: ReactNode;
  actions?: ReactNode;
  popupVariant?: "default" | "opaque";
}) {
  const [captured, setCaptured] = useState<
    (ItemActionProps & { provenance?: ReactNode; actions?: ReactNode }) | null
  >(null);
  const canOperate = useWorkspaceCanOperate(props.environmentId);
  const capability = useMailCapabilities(props.environmentId);
  const available = (capability.workspaceLinks && canOperate) || Boolean(actions);
  if (captured && (!available || captured.environmentId !== props.environmentId)) setCaptured(null);
  const open = captured !== null && captured.environmentId === props.environmentId;
  const setOpen = (value: boolean) =>
    setCaptured(value && available ? { ...props, shortcuts: false, provenance, actions } : null);
  const { linkItem } = useMailLinks(props.environmentId);
  const [dropError, setDropError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    touchOrigin.current = null;
  };
  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <WorkspaceItemMenuView
      available={available}
      open={open}
      onOpenChange={setOpen}
      popupVariant={popupVariant}
      actions={
        <>
          {captured?.provenance}
          {captured?.actions}
          {dropError !== null ? (
            <p role="alert" className="mb-3 text-xs text-destructive">
              {dropError}
            </p>
          ) : null}
          {open && captured && capability.workspaceLinks && canOperate ? (
            <WorkspaceItemActions {...captured} shortcuts={false} />
          ) : null}
        </>
      }
      draggable
      onDragStart={(event) =>
        event.dataTransfer.setData(
          "application/x-pulse-workspace-item",
          JSON.stringify({ environmentId: props.environmentId, item: props.item }),
        )
      }
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("application/x-pulse-workspace-item")) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const source = parseWorkspaceItemDrag(
          event.dataTransfer.getData("application/x-pulse-workspace-item"),
          props.environmentId,
        );
        if (source === undefined) {
          setDropError("Drop an item from this environment.");
          setOpen(true);
          return;
        }
        void linkItem(props.item, source).catch((cause) => {
          setDropError(linkErrorText(cause));
          setOpen(true);
        });
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        setOpen(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          event.preventDefault();
          setOpen(true);
        }
      }}
      onPointerDown={(event) => {
        if (event.pointerType !== "touch") return;
        cancel();
        touchOrigin.current = { x: event.clientX, y: event.clientY };
        timer.current = setTimeout(() => {
          suppressClick.current = true;
          setOpen(true);
        }, 500);
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerMove={(event) => {
        const origin = touchOrigin.current;
        if (
          origin !== null &&
          (Math.abs(event.clientX - origin.x) > 10 || Math.abs(event.clientY - origin.y) > 10)
        )
          cancel();
      }}
      onClickCapture={(event) => {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {children}
    </WorkspaceItemMenuView>
  );
}
