import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Atom } from "effect/unstable/reactivity";

const harness = vi.hoisted(() => ({
  effects: [] as Array<() => void>,
  document: "",
  readError: null as Error | null,
  write: vi.fn(),
}));

// Exercise the list hook's mount effects and real draft storage/atom pipeline,
// without mounting a composer or requiring a native renderer.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: (effect: () => void) => {
    harness.effects.push(effect);
  },
  useMemo: <T>(compute: () => T) => compute(),
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: <T>(atom: Atom.Atom<T>) => appAtomRegistry.get(atom),
}));
vi.mock("./use-thread-outbox", () => ({ useThreadOutboxMessages: () => ({}) }));
vi.mock("expo-file-system", () => ({
  Directory: class {
    create() {}
  },
  File: class {
    exists = true;
    parentDirectory = null;
    async text() {
      if (harness.readError) throw harness.readError;
      return harness.document;
    }
    write = harness.write;
  },
  Paths: { document: "/documents" },
}));
vi.mock("../lib/composerImages", () => ({ removePersistedComposerAttachmentFile: vi.fn() }));
vi.mock("../lib/attachmentUpload", () => ({ releasePendingAttachmentUploads: vi.fn() }));
vi.mock("../features/sharing/incoming-share-storage", () => ({
  loadIncomingShareDrafts: async () => [],
}));

import { appAtomRegistry } from "./atom-registry";
import { composerDraftsAtom, resetComposerDraftsLoadState } from "./use-composer-drafts";
import { usePendingNewTasks } from "./use-pending-new-tasks";

function savedDrafts() {
  return JSON.stringify({
    schemaVersion: 1,
    drafts: {
      "new-task:first": {
        text: "V40 draft one",
        attachments: [],
        project: {
          environmentId: "environment-one",
          projectId: "project-one",
          createdAt: "2026-09-10T01:00:00.000Z",
        },
      },
      "new-task:second": {
        text: "V40 draft two",
        attachments: [],
        project: {
          environmentId: "environment-one",
          projectId: "project-one",
          createdAt: "2026-09-10T02:00:00.000Z",
        },
      },
    },
  });
}
function commitMount() {
  for (const effect of harness.effects.splice(0)) effect();
}
function loadedDrafts() {
  return new Promise<void>((resolve) => {
    const unsubscribe = appAtomRegistry.subscribe(composerDraftsAtom, (drafts) => {
      if (Object.keys(drafts).length === 2) {
        unsubscribe();
        resolve();
      }
    });
  });
}

afterEach(() => {
  resetComposerDraftsLoadState();
  appAtomRegistry.set(composerDraftsAtom, {});
  harness.effects.length = 0;
  harness.readError = null;
  harness.write.mockClear();
  vi.restoreAllMocks();
});

describe("pending task list cold start", () => {
  it("loads both persisted drafts on list mount without opening a composer", async () => {
    harness.document = savedDrafts();
    expect(usePendingNewTasks()).toEqual([]);
    const hydrated = loadedDrafts();
    commitMount();
    await hydrated;
    expect(usePendingNewTasks().map((task) => [task.kind, task.title])).toEqual([
      ["draft", "V40 draft two"],
      ["draft", "V40 draft one"],
    ]);
    expect(harness.write).not.toHaveBeenCalled();
  });

  it("preserves saved work after a failed read and retries on a later list mount", async () => {
    harness.document = savedDrafts();
    const original = harness.document;
    harness.readError = new Error("storage unavailable");
    const warned = new Promise<void>((resolve) => {
      vi.spyOn(console, "warn").mockImplementation(() => resolve());
    });
    expect(usePendingNewTasks()).toEqual([]);
    commitMount();
    await warned;
    expect(appAtomRegistry.get(composerDraftsAtom)).toEqual({});
    expect(harness.document).toBe(original);
    expect(harness.write).not.toHaveBeenCalled();
    harness.readError = null;
    usePendingNewTasks();
    const hydrated = loadedDrafts();
    commitMount();
    await hydrated;
    expect(usePendingNewTasks()).toHaveLength(2);
  });
});
