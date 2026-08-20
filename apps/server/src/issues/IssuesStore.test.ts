import { IssueId, ProjectId, PulseProjectId, ThreadId } from "@t3tools/contracts";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import { IssuesStore, layer as issuesStoreLayer } from "./IssuesStore.ts";

const layer = it.layer(
  Layer.mergeAll(
    issuesStoreLayer.pipe(Layer.provideMerge(SqlitePersistenceMemory)),
    SqlitePersistenceMemory,
  ),
);

const projectId = ProjectId.make("project-1");
const pulseProjectId = PulseProjectId.make("pulse-project-1");

layer("IssuesStore", (it) => {
  it.effect("stores endpoint metadata and remappable public project configuration", () =>
    Effect.gen(function* () {
      const store = yield* IssuesStore;
      const firstUpdatedAt = "2026-08-19T00:00:00.000Z";
      const secondUpdatedAt = "2026-08-19T00:05:00.000Z";

      yield* store.setConnection({
        endpoint: "https://pulse.example.test",
        updatedAt: firstUpdatedAt,
      });
      yield* store.setMapping({
        projectId,
        pulseProjectId,
        pulseProjectName: "Storefront",
        pulseProjectSlug: "storefront",
        ingestPublicKey: "pk_live_first",
        updatedAt: firstUpdatedAt,
      });
      yield* store.setMapping({
        projectId,
        pulseProjectId: PulseProjectId.make("pulse-project-2"),
        pulseProjectName: "Storefront Next",
        pulseProjectSlug: "storefront-next",
        ingestPublicKey: "pk_live_second",
        updatedAt: secondUpdatedAt,
      });

      assert.deepStrictEqual(Option.getOrNull(yield* store.getConnection()), {
        endpoint: "https://pulse.example.test",
        updatedAt: firstUpdatedAt,
      });
      assert.deepStrictEqual(Option.getOrNull(yield* store.getMapping(projectId)), {
        projectId,
        pulseProjectId: PulseProjectId.make("pulse-project-2"),
        pulseProjectName: "Storefront Next",
        pulseProjectSlug: "storefront-next",
        ingestPublicKey: "pk_live_second",
        updatedAt: secondUpdatedAt,
      });
      assert.equal((yield* store.listMappings()).length, 1);
    }),
  );

  it.effect("relinks one thread atomically and supports both lookup directions", () =>
    Effect.gen(function* () {
      const store = yield* IssuesStore;
      const threadId = ThreadId.make("thread-1");
      const firstIssueId = IssueId.make("issue-1");
      const secondIssueId = IssueId.make("issue-2");

      yield* store.setLink({
        projectId,
        pulseProjectId,
        issueId: firstIssueId,
        threadId,
        now: "2026-08-19T00:00:00.000Z",
      });
      const relinked = yield* store.setLink({
        projectId,
        pulseProjectId,
        issueId: secondIssueId,
        threadId,
        now: "2026-08-19T00:10:00.000Z",
      });

      assert.equal(
        Option.isNone(yield* store.getLinkForIssue({ projectId, issueId: firstIssueId })),
        true,
      );
      assert.deepStrictEqual(Option.getOrNull(yield* store.getLinkForThread(threadId)), relinked);
      assert.deepStrictEqual(
        Option.getOrNull(yield* store.getLinkForIssue({ projectId, issueId: secondIssueId })),
        relinked,
      );

      assert.equal(yield* store.removeLinkForIssue({ projectId, issueId: secondIssueId }), true);
      assert.equal(yield* store.removeLinkForThread(threadId), false);
    }),
  );

  it.effect("disconnect clears endpoint and mappings but preserves historical thread links", () =>
    Effect.gen(function* () {
      const store = yield* IssuesStore;
      const issueId = IssueId.make("issue-history");
      const threadId = ThreadId.make("thread-history");

      yield* store.setConnection({
        endpoint: "https://pulse.example.test",
        updatedAt: "2026-08-19T00:00:00.000Z",
      });
      yield* store.setMapping({
        projectId,
        pulseProjectId,
        pulseProjectName: "Storefront",
        pulseProjectSlug: "storefront",
        ingestPublicKey: "pk_live_storefront",
        updatedAt: "2026-08-19T00:00:00.000Z",
      });
      yield* store.setLink({
        projectId,
        pulseProjectId,
        issueId,
        threadId,
        now: "2026-08-19T00:00:00.000Z",
      });

      yield* store.clearConnection();

      assert.equal(Option.isNone(yield* store.getConnection()), true);
      assert.deepStrictEqual(yield* store.listMappings(), []);
      assert.equal(Option.getOrNull(yield* store.getLinkForThread(threadId))?.issueId, issueId);
    }),
  );
});
