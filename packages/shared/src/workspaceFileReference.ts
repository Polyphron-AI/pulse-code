/**
 * Agents mention files by bare name (`HostPowerMonitor.ts:69`) far more often
 * than by workspace path. Joining such a name to the workspace root produces a
 * path that is almost never real, so a bare name is treated as a *query* for
 * the workspace index rather than as a location. Both web and mobile resolve it
 * through here so the two surfaces cannot disagree about what a chip points at.
 */

// Enough hits to look past same-named neighbours (`ChatView.test.tsx`) without
// asking for a full listing on a single click.
export const WORKSPACE_BASENAME_LOOKUP_LIMIT = 25;

export interface WorkspaceEntryCandidate {
  readonly path: string;
  readonly kind: "file" | "directory";
}

/**
 * `ambiguous` carries every candidate so callers can offer a choice; it never
 * collapses to a guess, because opening the wrong `index.ts` looks identical to
 * opening the right one until the reader notices the contents are unrelated.
 */
export type WorkspaceBasenameResolution =
  | { readonly _tag: "resolved"; readonly path: string }
  | { readonly _tag: "ambiguous"; readonly candidates: ReadonlyArray<string> }
  | { readonly _tag: "unresolved" };

export function workspacePathBasename(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "") || path;
  const separatorIndex = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1) : trimmed;
}

/** True when the reference names a file but not where it lives. */
export function isBasenameOnlyReference(relativePath: string): boolean {
  const trimmed = relativePath.trim();
  return trimmed.length > 0 && !trimmed.includes("/") && !trimmed.includes("\\");
}

function uniquePaths(paths: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...new Set(paths)];
}

function resolveFromMatches(
  exact: ReadonlyArray<string>,
  folded: ReadonlyArray<string>,
): WorkspaceBasenameResolution {
  // Folded matching covers casing that drifted from disk, but it only gets a
  // say when nothing matched exactly — otherwise `foo.ts` next to `Foo.ts`
  // would report an ambiguity the reference itself already settled.
  const matches = exact.length > 0 ? uniquePaths(exact) : uniquePaths(folded);
  if (matches.length === 0) return { _tag: "unresolved" };
  const [only] = matches;
  if (matches.length === 1 && only !== undefined) return { _tag: "resolved", path: only };
  return { _tag: "ambiguous", candidates: matches };
}

/** Resolve a bare filename against workspace index entries. */
export function resolveWorkspaceBasename(
  basename: string,
  entries: ReadonlyArray<WorkspaceEntryCandidate>,
): WorkspaceBasenameResolution {
  const target = basename.trim();
  if (!target) return { _tag: "unresolved" };
  const folded = target.toLowerCase();
  const filePaths = entries.filter((entry) => entry.kind === "file").map((entry) => entry.path);
  return resolveFromMatches(
    filePaths.filter((path) => workspacePathBasename(path) === target),
    filePaths.filter((path) => workspacePathBasename(path).toLowerCase() === folded),
  );
}

/**
 * Basename index over paths a thread already surfaced (checkpoint diffs, tool
 * activity). A file the agent talks about is usually one it just touched, so
 * this settles most references — including ones the workspace index would call
 * ambiguous — without a round trip.
 */
export type WorkspaceBasenameIndex = ReadonlyMap<string, ReadonlyArray<string>>;

export function buildWorkspaceBasenameIndex(paths: ReadonlyArray<string>): WorkspaceBasenameIndex {
  const index = new Map<string, string[]>();
  for (const path of paths) {
    const key = workspacePathBasename(path).toLowerCase();
    if (key.length === 0) continue;
    const existing = index.get(key);
    if (existing) {
      if (!existing.includes(path)) existing.push(path);
      continue;
    }
    index.set(key, [path]);
  }
  return index;
}

export function resolveBasenameFromIndex(
  basename: string,
  index: WorkspaceBasenameIndex,
): WorkspaceBasenameResolution {
  const target = basename.trim();
  if (!target) return { _tag: "unresolved" };
  const candidates = index.get(target.toLowerCase()) ?? [];
  return resolveFromMatches(
    candidates.filter((path) => workspacePathBasename(path) === target),
    candidates,
  );
}

// One counter for every caller: they all open the same surface, so the newest
// click wins regardless of which one started the lookup.
let latestLookupSequence = 0;

/** Call the returned predicate when the search settles; false means a later click superseded it. */
export function claimWorkspaceBasenameLookup(): () => boolean {
  latestLookupSequence += 1;
  const claimed = latestLookupSequence;
  return () => claimed === latestLookupSequence;
}

// Enough paths to recognise the one you meant without turning the message into
// a file listing.
const AMBIGUOUS_CANDIDATE_PREVIEW = 3;

/**
 * Explains why a filename-only reference could not be opened. Worded for both
 * clients, so neither names a surface the other does not have.
 */
export function describeUnresolvedBasename(
  resolution: Extract<WorkspaceBasenameResolution, { _tag: "ambiguous" | "unresolved" }>,
): string {
  if (resolution._tag === "unresolved") {
    return "The message named the file without a folder, and this project has no file by that name.";
  }
  const shown = resolution.candidates.slice(0, AMBIGUOUS_CANDIDATE_PREVIEW);
  const remaining = resolution.candidates.length - shown.length;
  const listed = remaining > 0 ? `${shown.join(", ")}, and ${remaining} more` : shown.join(", ");
  return `${resolution.candidates.length} files share that name (${listed}). Open the one you meant from the project's files.`;
}
