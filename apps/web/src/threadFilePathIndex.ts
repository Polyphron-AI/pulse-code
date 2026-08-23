import {
  buildWorkspaceBasenameIndex,
  resolveBasenameFromIndex,
  type WorkspaceBasenameResolution,
} from "@t3tools/shared/workspaceFileReference";

/**
 * Workspace-relative paths a thread has already shown — checkpoint diffs and
 * anything else that names a real file. A chip that only carries a filename
 * resolves against this before asking the workspace index, because the file an
 * agent talks about is nearly always one it just touched, and a path from the
 * thread beats a search hit that the ranker had to guess at.
 *
 * Deliberately not persisted and not a store: nothing renders from it, it is
 * read once per click, and a cold cache only costs a round trip.
 */
const filePathsByThreadKey = new Map<string, Set<string>>();

// A long thread touches hundreds of files; these bounds keep an all-day session
// from growing the map without limit while staying far above real usage.
const MAX_TRACKED_THREADS = 8;
const MAX_PATHS_PER_THREAD = 2000;

export function recordThreadFilePaths(threadKey: string, paths: ReadonlyArray<string>): void {
  if (paths.length === 0) return;
  const existing = filePathsByThreadKey.get(threadKey);
  // Re-insert so the eviction order below is least-recently-used.
  if (existing) filePathsByThreadKey.delete(threadKey);
  const tracked = existing ?? new Set<string>();
  filePathsByThreadKey.set(threadKey, tracked);
  for (const path of paths) {
    if (tracked.size >= MAX_PATHS_PER_THREAD) break;
    const trimmed = path.trim();
    if (trimmed.length > 0) tracked.add(trimmed);
  }
  while (filePathsByThreadKey.size > MAX_TRACKED_THREADS) {
    const oldest = filePathsByThreadKey.keys().next();
    if (oldest.done) break;
    filePathsByThreadKey.delete(oldest.value);
  }
}

export function resolveThreadFileBasename(
  threadKey: string,
  basename: string,
): WorkspaceBasenameResolution {
  const tracked = filePathsByThreadKey.get(threadKey);
  if (!tracked || tracked.size === 0) return { _tag: "unresolved" };
  return resolveBasenameFromIndex(basename, buildWorkspaceBasenameIndex([...tracked]));
}

/** Test seam; the index is process-lifetime state otherwise. */
export function clearThreadFilePaths(): void {
  filePathsByThreadKey.clear();
}
