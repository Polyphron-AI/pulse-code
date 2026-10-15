import {
  normalizeWorkspaceItemRef,
  workspaceItemKey,
  WorkspaceLinksError,
  type ProjectId,
  type ThreadId,
  type WorkspaceItemRef,
  type WorkspaceLinkEndpoint,
  type WorkspaceLinkId,
  type WorkspaceLinkList,
  type WorkspaceLinkSource,
  type WorkspaceLinkView,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";

import * as Repository from "../persistence/WorkspaceLinks.ts";

/** The thread an agent works in, and its project when it has one. */
export interface WorkspaceLinkOwner {
  readonly threadId: ThreadId;
  readonly projectId?: ProjectId | undefined;
}

/** One confirmed linked item an agent can see, addressed by its key. */
export interface WorkspaceContextItem {
  readonly key: string;
  readonly item: WorkspaceLinkEndpoint;
}

export interface WorkspaceContext {
  readonly items: ReadonlyArray<WorkspaceContextItem>;
  readonly truncated: boolean;
}

/**
 * Links between workspace items, as the side panel, the link RPCs and agent context see them.
 * `changes` ticks after every link or unlink so open lists on every device refetch.
 */
export class WorkspaceLinks extends Context.Service<
  WorkspaceLinks,
  {
    readonly list: (
      item: WorkspaceItemRef,
    ) => Effect.Effect<WorkspaceLinkList, WorkspaceLinksError>;
    readonly link: (input: {
      readonly a: WorkspaceLinkEndpoint;
      readonly b: WorkspaceLinkEndpoint;
      readonly viewing?: WorkspaceLinkEndpoint | undefined;
      readonly source?: WorkspaceLinkSource | undefined;
    }) => Effect.Effect<{ readonly id: WorkspaceLinkId }, WorkspaceLinksError>;
    readonly unlink: (id: WorkspaceLinkId) => Effect.Effect<void, WorkspaceLinksError>;
    readonly contextFor: (
      owner: WorkspaceLinkOwner,
    ) => Effect.Effect<WorkspaceContext, WorkspaceLinksError>;
    readonly resolveLinked: (
      owner: WorkspaceLinkOwner,
      key: string,
    ) => Effect.Effect<Option.Option<WorkspaceLinkEndpoint>, WorkspaceLinksError>;
    readonly changes: Stream.Stream<number>;
  }
>()("t3/workspace/WorkspaceLinks") {}

const invalid = (message: string) => new WorkspaceLinksError({ kind: "invalid-input", message });

/** Logs a store failure and replaces it with the copy the user sees. */
const storeFailed = (message: string) => (cause: unknown) =>
  Effect.logError("Workspace links store failed.", cause).pipe(
    Effect.andThen(Effect.fail(new WorkspaceLinksError({ kind: "unavailable", message }))),
  );

const sideOf = (endpoint: WorkspaceLinkEndpoint) => {
  const ref = normalizeWorkspaceItemRef(endpoint.ref);
  return ref === undefined
    ? Effect.fail(invalid("This item cannot be linked."))
    : Effect.succeed<Repository.StoredWorkspaceLinkSide>({
        key: workspaceItemKey(ref),
        endpoint: { ...endpoint, ref },
      });
};

const ownerKeys = (owner: WorkspaceLinkOwner) => [
  workspaceItemKey({ type: "thread", threadId: owner.threadId }),
  ...(owner.projectId === undefined
    ? []
    : [workspaceItemKey({ type: "project", projectId: owner.projectId })]),
];

/** A stored link as seen from the item with `key`: the view's item is the other end. */
const viewFrom = (key: string, link: Repository.StoredWorkspaceLink): WorkspaceLinkView => ({
  id: link.id,
  item: (link.a.key === key ? link.b : link.a).endpoint,
  status: link.status === "suggested" ? "suggested" : "confirmed",
  source: link.source,
  ...(link.origin === undefined ? {} : { origin: link.origin }),
  updatedAt: link.updatedAt,
});

const nowIso = DateTime.now.pipe(Effect.map(DateTime.formatIso));

const make = Effect.gen(function* () {
  const repository = yield* Repository.WorkspaceLinksRepository;
  const crypto = yield* Crypto.Crypto;
  const counter = yield* SubscriptionRef.make(0);
  const changed = SubscriptionRef.update(counter, (count) => count + 1);

  return WorkspaceLinks.of({
    list: (item) =>
      Effect.gen(function* () {
        const { key } = yield* sideOf({ ref: item });
        const page = yield* repository
          .listFor(key)
          .pipe(Effect.catch(storeFailed("Links could not be loaded. Try again.")));
        const views = page.links.map((link) => viewFrom(key, link));
        return {
          linked: views.filter((view) => view.status === "confirmed"),
          suggested: views.filter((view) => view.status === "suggested"),
          truncated: page.truncated,
        };
      }),

    link: (input) =>
      Effect.gen(function* () {
        const first = yield* sideOf(input.a);
        const second = yield* sideOf(input.b);
        if (first.key === second.key) {
          return yield* invalid("An item cannot be linked to itself.");
        }
        const viewing = input.viewing === undefined ? undefined : yield* sideOf(input.viewing);
        const saveFailed = storeFailed("The link could not be saved. Try again.");
        const uuid = yield* crypto.randomUUIDv4.pipe(Effect.catch(saveFailed));
        const now = yield* nowIso;
        const stored = yield* repository
          .confirm({
            id: `wl_${uuid}`,
            first,
            second,
            source: input.source ?? { type: "user" },
            origin:
              viewing === undefined
                ? { confirmedAt: now }
                : { confirmedAt: now, viewing: viewing.endpoint },
            now,
          })
          .pipe(Effect.catch(saveFailed));
        yield* changed;
        return { id: stored.id };
      }),

    unlink: (id) =>
      Effect.gen(function* () {
        const now = yield* nowIso;
        const unlinked = yield* repository
          .unlink(id, now)
          .pipe(Effect.catch(storeFailed("The link could not be removed. Try again.")));
        if (Option.isNone(unlinked)) {
          return yield* new WorkspaceLinksError({
            kind: "not-found",
            message: "This link no longer exists.",
          });
        }
        yield* changed;
      }),

    contextFor: (owner) =>
      Effect.gen(function* () {
        const keys = ownerKeys(owner);
        const page = yield* repository
          .confirmedFor(keys)
          .pipe(Effect.catch(storeFailed("Linked items could not be loaded.")));
        const seen = new Set(keys);
        const items: Array<WorkspaceContextItem> = [];
        for (const link of page.links) {
          const other = keys.includes(link.a.key) ? link.b : link.a;
          if (seen.has(other.key)) continue;
          seen.add(other.key);
          items.push({ key: other.key, item: other.endpoint });
        }
        return { items, truncated: page.truncated };
      }),

    resolveLinked: (owner, key) =>
      repository
        .findConfirmed(ownerKeys(owner), key)
        .pipe(
          Effect.map(Option.map((link) => (link.a.key === key ? link.a : link.b).endpoint)),
          Effect.catch(storeFailed("Linked items could not be loaded.")),
        ),

    changes: SubscriptionRef.changes(counter).pipe(Stream.filter((count) => count > 0)),
  });
});

export const layer = Layer.effect(WorkspaceLinks, make);

export const WorkspaceLinksLive = layer.pipe(Layer.provide(Repository.layer));
