import type {
  EnvironmentId,
  ProjectId,
  ThreadId,
  ThreadLinkedPullRequest,
  ThreadPullRequestLink,
  WorkspaceLinkId,
  WorkspaceLinkView,
} from "@t3tools/contracts";
import { parseChangeRequestUrl } from "@t3tools/shared/changeRequestUrl";
import {
  legacyThreadPullRequestKey,
  threadPullRequestKeyOf,
  visibleThreadPullRequests,
} from "@t3tools/shared/threadPullRequests";
import type { threadPullRequestLinkMode } from "./threadPullRequestCompatibility.ts";

export interface ProjectPullRequestThread {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly id: ThreadId;
  readonly title: string;
  readonly deletedAt?: string | null | undefined;
  readonly pullRequests?: readonly ThreadPullRequestLink[] | undefined;
  readonly linkedPullRequest?: ThreadLinkedPullRequest | null | undefined;
}

export type ProjectPullRequestProvenance =
  | {
      readonly type: "thread";
      readonly threadId: ThreadId;
      readonly title: string;
      readonly url: string;
    }
  | { readonly type: "project-link"; readonly linkId: WorkspaceLinkId };

export interface ProjectPullRequestEntry {
  readonly key: string;
  readonly url: string;
  readonly reference?: ThreadPullRequestLink;
  readonly provenance: readonly ProjectPullRequestProvenance[];
}

/** Compose confirmed direct links and loaded source shells without reading PR details. */
export function collectProjectPullRequests({
  environmentId,
  projectId,
  threads,
  projectLinks,
  threadsComplete,
  linksComplete,
  linkMode,
}: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly threads: readonly ProjectPullRequestThread[];
  /** The confirmed project list read from this environment, never project-hub discoveries. */
  readonly projectLinks: readonly WorkspaceLinkView[];
  readonly threadsComplete: boolean;
  readonly linksComplete: boolean;
  readonly linkMode: ReturnType<typeof threadPullRequestLinkMode>;
}): { entries: readonly ProjectPullRequestEntry[]; incomplete: boolean } {
  let incomplete = !threadsComplete || !linksComplete;
  const entries = new Map<string, ProjectPullRequestEntry>();
  const edges = new Map<string, Set<string>>();
  const explicitThreads = new Set<ThreadId>();
  const add = (
    key: string,
    url: string,
    edge: ProjectPullRequestProvenance,
    reference?: ThreadPullRequestLink,
  ) => {
    const previous = entries.get(key);
    if (!previous && entries.size >= 100) {
      incomplete = true;
      return;
    }
    const edgeKey =
      edge.type === "thread" ? JSON.stringify([edge.threadId, edge.url]) : edge.linkId;
    const seen = edges.get(key) ?? new Set<string>();
    const provenance = previous?.provenance ?? [];
    const bestReference =
      reference?.snapshot &&
      (!previous?.reference?.snapshot ||
        reference.snapshot.syncedAt > previous.reference.snapshot.syncedAt)
        ? reference
        : (previous?.reference ?? reference);
    entries.set(key, {
      key,
      url: previous?.url ?? url,
      ...(bestReference ? { reference: bestReference } : {}),
      provenance: seen.has(edgeKey) ? provenance : [...provenance, edge],
    });
    seen.add(edgeKey);
    edges.set(key, seen);
  };
  for (const link of projectLinks) {
    if (link.status !== "confirmed") continue;
    const ref = link.item.ref;
    if (ref.type === "thread") explicitThreads.add(ref.threadId);
    if (ref.type !== "url") continue;
    const parsed = parseChangeRequestUrl(ref.url);
    if (parsed)
      add(threadPullRequestKeyOf(parsed), ref.url, { type: "project-link", linkId: link.id });
  }
  const seenThreads = new Set<ThreadId>();
  for (const thread of threads) {
    if (
      thread.environmentId !== environmentId ||
      thread.deletedAt ||
      (thread.projectId !== projectId && !explicitThreads.has(thread.id)) ||
      seenThreads.has(thread.id)
    )
      continue;
    if (seenThreads.size >= 30) {
      incomplete = true;
      continue;
    }
    seenThreads.add(thread.id);
    if (linkMode === "unsupported") continue;
    const modern = thread.pullRequests;
    const legacy = thread.linkedPullRequest;
    const legacyKey = legacy ? threadPullRequestKeyOf(legacyThreadPullRequestKey(legacy)) : null;
    const dismissedLegacy =
      legacyKey !== null &&
      modern?.some(
        (link) => link.source === "stack-dismissed" && threadPullRequestKeyOf(link) === legacyKey,
      );
    const links =
      linkMode === "multiple" && modern !== undefined
        ? visibleThreadPullRequests(modern)
        : legacy && !dismissedLegacy
          ? [
              {
                ...legacyThreadPullRequestKey(legacy),
                url: legacy.url,
                source: "manual" as const,
                linkedAt: "1970-01-01T00:00:00Z",
                snapshot: null,
                stack: null,
              },
            ]
          : [];
    for (const link of links) {
      add(
        threadPullRequestKeyOf(link),
        link.url,
        {
          type: "thread",
          threadId: thread.id,
          title: thread.title,
          url: link.url,
        },
        link,
      );
    }
  }
  if ([...explicitThreads].some((id) => !seenThreads.has(id))) incomplete = true;
  return { entries: [...entries.values()], incomplete };
}
