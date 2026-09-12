import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import { ChevronRightIcon, PlusIcon, RadarIcon } from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";

import {
  buildSidebarManagerContextMenuItems,
  buildSidebarManagerRows,
  type SidebarManagerRow,
} from "~/components/Sidebar.logic";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { useManagerActions, useManagers } from "~/hooks/useManagers";
import { cn } from "~/lib/utils";
import { readLocalApi } from "~/localApi";

/**
 * The Argo section, drawn above projects. A role is shown where the thing it
 * governs lives, so children nest under their Argo rather than getting a
 * dashboard of their own.
 */
export const SidebarManagerSection = memo(function SidebarManagerSection(props: {
  readonly threads: ReadonlyArray<EnvironmentThreadShell>;
  readonly activeThreadKey: string | null;
  readonly onOpenThread: (threadRef: ScopedThreadRef) => void;
  readonly newManagerEnvironmentId: EnvironmentId | null;
}) {
  const managers = useManagers();
  const { createManager, togglePause, deleteManager, cycleManagerNow } = useManagerActions();
  const [collapsedKeys, setCollapsedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingDelete, setPendingDelete] = useState<SidebarManagerRow | null>(null);
  const [creating, setCreating] = useState(false);

  const rows = useMemo(
    () => buildSidebarManagerRows({ managers, threads: props.threads }),
    [managers, props.threads],
  );
  const managerById = useMemo(
    () => new Map(managers.map((manager) => [manager.id, manager] as const)),
    [managers],
  );

  const openManagerThread = useCallback(
    (row: SidebarManagerRow) => {
      // Until the server binds the Argo a thread there is nowhere to go; the
      // pill still reports the state, which is the honest thing to show.
      if (row.threadId === null) return;
      props.onOpenThread({ environmentId: row.environmentId, threadId: row.threadId });
    },
    [props],
  );

  const handlePill = useCallback(
    async (row: SidebarManagerRow) => {
      const manager = managerById.get(row.managerId);
      if (!manager) return;
      if (row.pillAction === "open") {
        openManagerThread(row);
        return;
      }
      await togglePause(manager);
    },
    [managerById, openManagerThread, togglePause],
  );

  const handleContextMenu = useCallback(
    async (row: SidebarManagerRow, position: { x: number; y: number }) => {
      const api = readLocalApi();
      if (!api) return;
      const manager = managerById.get(row.managerId);
      if (!manager) return;
      const clicked = await settlePromise(() =>
        api.contextMenu.show(buildSidebarManagerContextMenuItems(row), position),
      );
      const action = clicked._tag === "Success" ? clicked.value : null;
      if (action === "cycle-now") {
        await cycleManagerNow(manager);
        return;
      }
      if (action === "pause" || action === "resume") {
        await togglePause(manager);
        return;
      }
      if (action === "delete") setPendingDelete(row);
    },
    [cycleManagerNow, managerById, togglePause],
  );

  const handleNewManager = useCallback(async () => {
    if (props.newManagerEnvironmentId === null || creating) return;
    setCreating(true);
    await createManager(props.newManagerEnvironmentId);
    setCreating(false);
    // Navigation waits for the server to bind a thread; the new row shows a
    // "No mission" pill until then.
  }, [creating, createManager, props.newManagerEnvironmentId]);

  const confirmDelete = useCallback(
    async (keepChildren: boolean) => {
      const row = pendingDelete;
      setPendingDelete(null);
      if (!row) return;
      const manager = managerById.get(row.managerId);
      if (!manager) return;
      await deleteManager(manager, keepChildren);
    },
    [deleteManager, managerById, pendingDelete],
  );

  const toggleCollapsed = useCallback((row: SidebarManagerRow) => {
    setCollapsedKeys((current) => {
      const next = new Set(current);
      if (next.has(row.key)) next.delete(row.key);
      else next.add(row.key);
      return next;
    });
  }, []);

  if (rows.length === 0 && props.newManagerEnvironmentId === null) return null;

  return (
    <>
      <div className="mb-1 flex h-7 items-center gap-1 border-y border-sidebar-border/50 px-2.5 text-[10px] font-medium uppercase tracking-wide text-sidebar-muted-foreground/70">
        <span>Argo</span>
        {props.newManagerEnvironmentId !== null ? (
          <button
            type="button"
            data-testid="sidebar-new-manager"
            aria-label="New Argo"
            title="New Argo"
            disabled={creating}
            onClick={() => void handleNewManager()}
            className="ml-auto flex items-center gap-1 rounded px-1 py-0.5 normal-case tracking-normal text-sidebar-muted-foreground transition-colors hover:bg-sidebar-row-hover hover:text-sidebar-foreground disabled:opacity-50"
          >
            <PlusIcon className="-mx-0.5 size-3" aria-hidden />
            New Argo
          </button>
        ) : null}
      </div>
      <ul role="list" aria-label="Argo" className="mb-1 flex flex-col gap-px">
        {rows.map((row) => {
          const expanded = collapsedKeys.has(row.key) ? false : row.defaultExpanded;
          const isActive =
            row.threadId !== null &&
            props.activeThreadKey ===
              scopedThreadKey({ environmentId: row.environmentId, threadId: row.threadId });
          return (
            <li key={row.key} className="list-none">
              <div
                data-testid="sidebar-manager-row"
                onContextMenu={(event) => {
                  event.preventDefault();
                  void handleContextMenu(row, { x: event.clientX, y: event.clientY });
                }}
                className={cn(
                  "flex min-h-8 w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left transition-colors",
                  isActive
                    ? "bg-sidebar-row-active text-sidebar-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-row-hover",
                )}
              >
                {row.children.length > 0 ? (
                  <button
                    type="button"
                    aria-label={expanded ? "Collapse children" : "Expand children"}
                    aria-expanded={expanded}
                    onClick={() => toggleCollapsed(row)}
                    className="shrink-0 text-sidebar-muted-foreground"
                  >
                    <ChevronRightIcon
                      className={cn("size-3.5 transition-transform", expanded && "rotate-90")}
                      aria-hidden
                    />
                  </button>
                ) : (
                  <span className="size-3.5 shrink-0" aria-hidden />
                )}
                <RadarIcon className="size-3.5 shrink-0 text-primary/70" aria-hidden />
                <button
                  type="button"
                  onClick={() => openManagerThread(row)}
                  disabled={row.threadId === null}
                  className="min-w-0 flex-1 truncate text-left text-sm font-medium disabled:cursor-default"
                >
                  {row.name}
                </button>
                <button
                  type="button"
                  data-testid="sidebar-manager-pill"
                  aria-label={`${row.name}: ${row.stateLabel}`}
                  onClick={() => void handlePill(row)}
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                    row.state === "watching" && "bg-primary/15 text-primary",
                    row.state === "paused" &&
                      "bg-sidebar-row-hover text-sidebar-muted-foreground hover:text-sidebar-foreground",
                    row.state === "no-mission" && "bg-transparent text-secondary-label",
                  )}
                >
                  {row.stateLabel}
                </button>
              </div>
              {expanded && row.children.length > 0 ? (
                <ul role="list" className="flex flex-col gap-px ps-6">
                  {row.children.map((child) => (
                    <li key={child.key} className="list-none">
                      <button
                        type="button"
                        data-testid="sidebar-manager-child"
                        onClick={() =>
                          props.onOpenThread({
                            environmentId: child.environmentId,
                            threadId: child.threadId as ThreadId,
                          })
                        }
                        className={cn(
                          "flex min-h-7 w-full items-center rounded-md px-2.5 py-1 text-left text-[13px] transition-colors",
                          props.activeThreadKey ===
                            scopedThreadKey({
                              environmentId: child.environmentId,
                              threadId: child.threadId,
                            })
                            ? "bg-sidebar-row-active text-sidebar-foreground"
                            : "text-sidebar-muted-foreground hover:bg-sidebar-row-hover",
                        )}
                      >
                        <span className="truncate">{child.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogPopup className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name ?? "Argo"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && pendingDelete.children.length > 0
                ? `This Argo has ${pendingDelete.children.length} live ${
                    pendingDelete.children.length === 1 ? "child" : "children"
                  }. Keep them open, or close them along with the Argo.`
                : "This Argo has no live children."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button variant="outline" onClick={() => void confirmDelete(true)}>
              Keep children
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete(false)}>
              Close children
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
});
