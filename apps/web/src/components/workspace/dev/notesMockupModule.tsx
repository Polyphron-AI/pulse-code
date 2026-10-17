import { useState, useSyncExternalStore } from "react";
import type { WorkspaceNote } from "@t3tools/contracts";
import { WorkspaceNoteView, type NoteDraft } from "../meetings/WorkspaceNoteView";
import type { CreateWorkspaceMockupModule } from "./workspaceMockupFixtures";

export const createWorkspaceMockupModule: CreateWorkspaceMockupModule = (session) => {
  const seed = session.seed.note;
  const at = session.clock.now().toISOString();
  const initial: WorkspaceNote = {
    id: seed.id,
    title: seed.title,
    body: seed.body,
    revision: 1,
    createdAt: at,
    updatedAt: at,
  };
  let note = session.calendarState === "note-conflict" ? { ...initial, revision: 2 } : initial;
  let deleted = false;
  let disposed = false;
  const listeners = new Set<() => void>();
  const pending = new Set<Promise<void>>();
  const ref = {
    type: "provider-resource" as const,
    provider: "workspace-note",
    resourceId: seed.id,
  };
  const notify = () => {
    if (!disposed) for (const listener of listeners) listener();
  };
  const command = (revision: number, change: () => void) => {
    const work = (async () => {
      if (disposed) throw new Error("Fixture session is disposed.");
      await session.record("save", ref, String(revision));
      if (disposed) throw new Error("Fixture session is disposed.");
      if (revision !== note.revision)
        throw new Error("This note changed. Reload it before saving. Your draft has been kept.");
      change();
      note = { ...note, revision: note.revision + 1, updatedAt: session.clock.now().toISOString() };
      notify();
    })();
    pending.add(work);
    void work.finally(() => pending.delete(work)).catch(() => {});
    return work;
  };
  function Resource() {
    const current = useSyncExternalStore(
      (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      () => note,
    );
    const [draft, setDraft] = useState<NoteDraft | null>(() =>
      session.calendarState === "note-conflict"
        ? {
            title: initial.title,
            body: `${initial.body}\nUnsaved meeting follow-up`,
            revision: initial.revision,
          }
        : null,
    );
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(
      session.calendarState === "note-conflict"
        ? "This note changed. Reload it before saving. Your draft has been kept."
        : null,
    );
    const [confirming, setConfirming] = useState<"cancel" | "reload" | null>(null);
    const run = async (revision: number, change: () => void) => {
      setBusy(true);
      setError(null);
      try {
        await command(revision, change);
        if (!disposed) setDraft(null);
      } catch (cause) {
        if (!disposed) setError(cause instanceof Error ? cause.message : "Notes unavailable.");
      } finally {
        if (!disposed) setBusy(false);
      }
    };
    const discard = (action: "cancel" | "reload") => {
      if (draft && confirming !== action) {
        setConfirming(action);
        return;
      }
      setDraft(null);
      setConfirming(null);
      setError(null);
    };
    return (
      <WorkspaceNoteView
        environmentId={session.environmentId}
        note={current}
        status={deleted ? "unavailable" : "ready"}
        canOperate={!disposed}
        pending={busy}
        draft={draft}
        error={error}
        confirming={confirming}
        deleted={deleted}
        onEdit={setDraft}
        onSave={() => {
          if (draft)
            void run(draft.revision, () => {
              note = { ...note, title: draft.title, body: draft.body };
            });
        }}
        onCancel={() => discard("cancel")}
        onReload={() => discard("reload")}
        onDelete={() =>
          void run(current.revision, () => {
            deleted = true;
          })
        }
        onRestore={() =>
          void run(current.revision, () => {
            deleted = false;
          })
        }
        onKeepDraft={() => setConfirming(null)}
      />
    );
  }
  return {
    area: "notes",
    readyRegions: ["resource"],
    incompleteRegions: ["07.docs-format", "07.docs-comments"],
    resource: <Resource />,
    settled: async () => {
      await Promise.allSettled(pending);
      await session.settled();
    },
    dispose: () => {
      disposed = true;
      listeners.clear();
      note = initial;
      deleted = false;
    },
  };
};
