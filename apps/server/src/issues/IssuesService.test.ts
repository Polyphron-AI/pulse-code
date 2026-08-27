import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  IssueId,
  IssueReportId,
  ProjectId,
  PulseProjectId,
  ThreadId,
  type Issue,
  type IssueReport,
} from "@t3tools/contracts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as TestClock from "effect/testing/TestClock";

import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import {
  IssuesService,
  PULSE_ISSUES_PAT_SECRET,
  layer as issuesServiceLayer,
} from "./IssuesService.ts";
import { IssuesStore, layer as issuesStoreLayer } from "./IssuesStore.ts";
import {
  PulseIssuesClient,
  PulseIssuesClientError,
  type DiscoveredPulseIssueProject,
  type PulseCaptureInput,
  type PulseCreateIssueInput,
} from "./PulseIssuesClient.ts";

const localProjectId = ProjectId.make("local-project-1");
const pulseProjectId = PulseProjectId.make("pulse-project-1");
const secondPulseProjectId = PulseProjectId.make("pulse-project-2");
const issueId = IssueId.make("ticket-1");
const reportId = IssueReportId.make("report-1");

const pulseProjects: ReadonlyArray<DiscoveredPulseIssueProject> = [
  {
    id: pulseProjectId,
    name: "Storefront",
    slug: "storefront",
    archivedAt: null,
    allowLoopbackOrigins: true,
    ingestPublicKey: "pk_live_storefront",
  },
  {
    id: secondPulseProjectId,
    name: "Storefront Next",
    slug: "storefront-next",
    archivedAt: null,
    allowLoopbackOrigins: false,
    ingestPublicKey: "pk_live_storefront_next",
  },
];

const issue: Issue = {
  id: issueId,
  pulseProjectId,
  ref: "T-42",
  title: "Checkout fails",
  description: "Card form freezes",
  severity: "high",
  status: "triage",
  assignedToId: null,
  labels: ["checkout"],
  resolvedAt: null,
  archivedAt: null,
  version: 3,
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:01:00.000Z",
};

const report: IssueReport = {
  id: reportId,
  pulseProjectId,
  issueId,
  title: "Checkout fails",
  description: "Card form freezes",
  severity: "high",
  kind: "bug",
  status: "acknowledged",
  duplicateOfId: null,
  environmentLabel: "local",
  reporterEmail: null,
  version: 2,
  createdAt: "2026-08-19T00:00:00.000Z",
  updatedAt: "2026-08-19T00:01:00.000Z",
  screenshotStatus: "uploaded",
  transcriptionStatus: "none",
  transcriptionSource: "none",
  transcriptionConfidence: null,
  labels: [],
  reporterIdentity: null,
  environment: null,
  consoleEntries: [],
  networkEntries: [],
  errors: [],
  breadcrumbs: [],
  backendContext: null,
  pageMetadata: null,
  screenshotUrl: "https://r2.example.test/screenshot",
  annotatedScreenshotUrl: null,
  audioUrl: null,
  videoUrl: null,
};

const unused = <A = never>(): Effect.Effect<A> => Effect.die("unused PulseIssuesClient operation");

const makePulse = (
  overrides: Partial<PulseIssuesClient["Service"]> = {},
): PulseIssuesClient["Service"] =>
  PulseIssuesClient.of({
    listProjects: () => Effect.succeed(pulseProjects),
    listIssues: () => unused(),
    getIssue: () => unused(),
    listReports: () => unused(),
    listProjectReports: () => unused(),
    getReport: () => unused(),
    listActivity: () => unused(),
    listAssignees: () => unused(),
    updateIssue: () => unused(),
    updateReport: () => unused(),
    createIssue: () => unused(),
    capture: () => unused(),
    ...overrides,
  });

const testLayer = (pulse: PulseIssuesClient["Service"]) => {
  const configLayer = ServerConfig.layerTest(process.cwd(), { prefix: "t3-issues-service-test-" });
  const storeLayer = issuesStoreLayer.pipe(Layer.provideMerge(SqlitePersistenceMemory));
  const secretLayer = ServerSecretStore.layer.pipe(Layer.provide(configLayer));
  const dependencies = Layer.mergeAll(
    storeLayer,
    secretLayer,
    Layer.succeed(PulseIssuesClient, pulse),
    configLayer,
  );
  return issuesServiceLayer.pipe(
    Layer.provideMerge(dependencies),
    Layer.provideMerge(NodeServices.layer),
  );
};

const connectAndMap = Effect.gen(function* () {
  const service = yield* IssuesService;
  yield* service.updateConnection({
    endpoint: "https://pulse.example.test/",
    token: "pat_secret_value",
  });
  yield* service.setProjectMapping({ projectId: localProjectId, pulseProjectId });
  return service;
});

describe("IssuesService", () => {
  it.effect("lists mapped project Reports with a bounded cursor and lazy evidence", () => {
    const calls: Array<{
      readonly projectId: PulseProjectId;
      readonly createdAfter?: string;
      readonly limit: number;
      readonly offset: number;
    }> = [];
    const layer = testLayer(
      makePulse({
        listProjectReports: (input) => {
          calls.push({
            projectId: input.pulseProjectId,
            ...(input.createdAfter === undefined ? {} : { createdAfter: input.createdAfter }),
            limit: input.limit,
            offset: input.offset,
          });
          return Effect.succeed({
            reports: [
              {
                id: reportId,
                issueId,
                title: report.title,
                severity: report.severity,
                status: report.status,
                kind: report.kind,
              },
            ],
            nextCursor: null,
            total: 3,
          });
        },
      }),
    );

    return Effect.gen(function* () {
      yield* TestClock.setTime(Date.parse("2026-08-20T00:00:00.000Z"));
      const service = yield* connectAndMap;
      const first = yield* service.listProjectReports({ projectId: localProjectId, limit: 1 });
      assert.equal(first.reports[0]?.id, reportId);
      assert.equal(first.nextCursor, "1:2026-07-21T00:00:00.000Z");
      const second = yield* service.listProjectReports({
        projectId: localProjectId,
        limit: 1,
        cursor: first.nextCursor ?? undefined,
      });
      assert.equal(second.nextCursor, "2:2026-07-21T00:00:00.000Z");
      assert.deepStrictEqual(
        calls.map(({ projectId, createdAfter, limit, offset }) => ({
          projectId,
          createdAfter,
          limit,
          offset,
        })),
        [0, 1].map((offset) => ({
          projectId: pulseProjectId,
          createdAfter: "2026-07-21T00:00:00.000Z",
          limit: 1,
          offset,
        })),
      );
      const invalid = yield* service
        .listProjectReports({ projectId: localProjectId, cursor: "not-a-cursor" })
        .pipe(Effect.flip);
      assert.equal(invalid.reason, "invalid-input");
    }).pipe(Effect.provide(layer), Effect.scoped);
  });

  it.effect(
    "stores only the PAT in the secret store and supports remap, unmap, and disconnect",
    () => {
      const layer = testLayer(makePulse());
      return Effect.gen(function* () {
        const service = yield* IssuesService;
        const secrets = yield* ServerSecretStore.ServerSecretStore;
        const store = yield* IssuesStore;

        const connected = yield* service.updateConnection({
          endpoint: "https://pulse.example.test/",
          token: "pat_secret_value",
        });
        assert.equal(connected.endpoint, "https://pulse.example.test");
        assert.equal(connected.tokenConfigured, true);
        assert.equal("ingestPublicKey" in (connected.projects[0] ?? {}), false);
        assert.equal(
          new TextDecoder().decode(Option.getOrThrow(yield* secrets.get(PULSE_ISSUES_PAT_SECRET))),
          "pat_secret_value",
        );
        assert.deepStrictEqual(Option.getOrNull(yield* store.getConnection()), {
          endpoint: "https://pulse.example.test",
          updatedAt: connected.lastCheckedAt,
        });

        yield* service.setProjectMapping({ projectId: localProjectId, pulseProjectId });
        const remapped = yield* service.setProjectMapping({
          projectId: localProjectId,
          pulseProjectId: secondPulseProjectId,
        });
        assert.equal(remapped.mappings[0]?.pulseProjectId, secondPulseProjectId);

        const unmapped = yield* service.removeProjectMapping({ projectId: localProjectId });
        assert.deepStrictEqual(unmapped.mappings, []);
        const disconnected = yield* service.disconnect();
        assert.equal(disconnected.status, "disconnected");
        assert.equal(Option.isNone(yield* secrets.get(PULSE_ISSUES_PAT_SECRET)), true);
        assert.equal(Option.isNone(yield* store.getConnection()), true);
      }).pipe(Effect.provide(layer), Effect.scoped);
    },
  );

  it.effect(
    "enforces mapping boundaries for reads, lazy evidence, lifecycle, and assignees",
    () => {
      const calls: string[] = [];
      const layer = testLayer(
        makePulse({
          listIssues: (input) => {
            calls.push(`list:${input.pulseProjectId}:${input.offset}`);
            return Effect.succeed({
              issues: [issue],
              total: 1,
              limit: 100,
              offset: input.offset ?? 0,
            });
          },
          getIssue: () => {
            calls.push("detail");
            return Effect.succeed(issue);
          },
          listReports: (input) => {
            calls.push(`reports:${input.limit}:${input.offset}`);
            return Effect.succeed({
              reports: [
                {
                  id: reportId,
                  title: report.title,
                  severity: report.severity,
                  status: report.status,
                  kind: report.kind,
                },
              ],
              total: 1,
              limit: input.limit,
              offset: input.offset,
            });
          },
          getReport: () => {
            calls.push("report-detail");
            return Effect.succeed(report);
          },
          listActivity: (input) => {
            calls.push("activity");
            return Effect.succeed({
              activity: [],
              total: 0,
              limit: input.limit,
              offset: input.offset,
            });
          },
          listAssignees: () => {
            calls.push("assignees");
            return Effect.succeed([
              {
                id: "user-1",
                email: "owner@example.test",
                role: "owner",
                pending: false,
                implicit: true,
              },
            ]);
          },
          updateIssue: (input) => {
            calls.push(`update:${input.expectedVersion}`);
            return Effect.succeed({ ...issue, status: input.status ?? issue.status, version: 4 });
          },
          updateReport: () => Effect.succeed({ ...report, version: 3 }),
        }),
      );

      return Effect.gen(function* () {
        const service = yield* connectAndMap;
        const page = yield* service.list({ projectId: localProjectId, limit: 20, offset: 0 });
        assert.equal(page.issues[0]?.id, issueId);
        assert.equal(calls.includes("report-detail"), false);

        const detail = yield* service.detail({ projectId: localProjectId, issueId });
        assert.equal(detail.mapping.pulseProjectId, pulseProjectId);
        const summaries = yield* service.reports({
          projectId: localProjectId,
          issueId,
          limit: 10,
          offset: 0,
        });
        assert.equal(summaries.reports[0]?.id, reportId);
        assert.equal(calls.includes("report-detail"), false);
        assert.equal(
          (yield* service.reportDetail({ projectId: localProjectId, reportId })).id,
          reportId,
        );
        assert.deepStrictEqual(
          (yield* service.assignees({ projectId: localProjectId })).assignees.map(
            ({ email }) => email,
          ),
          ["owner@example.test"],
        );
        assert.equal(
          (yield* service.update({
            projectId: localProjectId,
            issueId,
            expectedVersion: 3,
            status: "in_progress",
          })).version,
          4,
        );
        assert.equal(calls.includes("update:3"), true);
      }).pipe(Effect.provide(layer), Effect.scoped);
    },
  );

  it.effect("turns inline and contained Preview artifacts into one Report and one Issue", () => {
    const captures: PulseCaptureInput[] = [];
    const creations: PulseCreateIssueInput[] = [];
    const layer = testLayer(
      makePulse({
        capture: (input) => {
          captures.push(input);
          return Effect.succeed(reportId);
        },
        createIssue: (input) => {
          creations.push(input);
          return Effect.succeed(issue);
        },
      }),
    );

    return Effect.gen(function* () {
      const service = yield* connectAndMap;
      const config = yield* ServerConfig.ServerConfig;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const artifacts = path.join(config.stateDir, "browser-artifacts");
      yield* fileSystem.makeDirectory(artifacts, { recursive: true });
      const recording = path.join(artifacts, "browser-recording.webm");
      yield* fileSystem.writeFile(recording, new Uint8Array([4, 5, 6]));

      const created = yield* service.capture({
        projectId: localProjectId,
        origin: "http://localhost:5173",
        title: "Checkout fails",
        description: "Card form freezes",
        severity: "high",
        pageUrl: "http://localhost:5173/checkout",
        pageTitle: "Checkout",
        labels: ["checkout"],
        media: [
          {
            source: "data-url",
            kind: "screenshot",
            fileName: "checkout.png",
            mimeType: "image/png",
            dataUrl: "data:image/png;base64,AQID",
          },
          {
            source: "preview-artifact",
            kind: "video",
            fileName: "checkout.webm",
            mimeType: "video/webm",
            artifactPath: recording,
          },
        ],
      });

      assert.deepStrictEqual(created, { reportId, issue });
      assert.deepStrictEqual(
        captures[0]?.media?.map(({ kind, bytes }) => [kind, [...bytes]]),
        [
          ["screenshot", [1, 2, 3]],
          ["video", [4, 5, 6]],
        ],
      );
      assert.equal(captures[0]?.ingestPublicKey, "pk_live_storefront");
      assert.deepStrictEqual(captures[0]?.pageMetadata, {
        url: "http://localhost:5173/checkout",
        title: "Checkout",
      });
      assert.equal(creations[0]?.reportId, reportId);
      assert.deepStrictEqual(creations[0]?.labels, ["checkout"]);
    }).pipe(Effect.provide(layer), Effect.scoped);
  });

  it.effect(
    "rejects cross-project reads and mutations before calling their Pulse operation",
    () => {
      const calls: string[] = [];
      const foreignIssue = { ...issue, pulseProjectId: secondPulseProjectId };
      const foreignReport = { ...report, pulseProjectId: secondPulseProjectId };
      const layer = testLayer(
        makePulse({
          listIssues: (input) =>
            Effect.succeed({
              issues: [foreignIssue],
              total: 1,
              limit: input.limit ?? 50,
              offset: input.offset ?? 0,
            }),
          getIssue: () => Effect.succeed(foreignIssue),
          getReport: () => Effect.succeed(foreignReport),
          listReports: () => {
            calls.push("reports");
            return unused();
          },
          listActivity: () => {
            calls.push("activity");
            return unused();
          },
          updateIssue: () => {
            calls.push("update-issue");
            return unused();
          },
          updateReport: () => {
            calls.push("update-report");
            return unused();
          },
          createIssue: () => {
            calls.push("create-issue");
            return unused();
          },
        }),
      );

      return Effect.gen(function* () {
        const service = yield* connectAndMap;
        const listFailure = yield* service.list({ projectId: localProjectId }).pipe(Effect.flip);
        assert.equal(listFailure.reason, "invalid-response");

        const reportsFailure = yield* service
          .reports({ projectId: localProjectId, issueId, limit: 10, offset: 0 })
          .pipe(Effect.flip);
        const activityFailure = yield* service
          .activity({ projectId: localProjectId, issueId, limit: 10, offset: 0 })
          .pipe(Effect.flip);
        const updateFailure = yield* service
          .update({ projectId: localProjectId, issueId, expectedVersion: 3, status: "todo" })
          .pipe(Effect.flip);
        const reportUpdateFailure = yield* service
          .updateReport({
            projectId: localProjectId,
            reportId,
            expectedVersion: 2,
            severity: "low",
          })
          .pipe(Effect.flip);
        const createFailure = yield* service
          .createFromReport({ projectId: localProjectId, reportId, title: "Foreign" })
          .pipe(Effect.flip);

        assert.deepStrictEqual(
          [reportsFailure, activityFailure, updateFailure, reportUpdateFailure, createFailure].map(
            ({ reason }) => reason,
          ),
          ["not-found", "not-found", "not-found", "not-found", "not-found"],
        );
        assert.deepStrictEqual(calls, []);
      }).pipe(Effect.provide(layer), Effect.scoped);
    },
  );

  it.effect("keeps Issue links reversible and returns actionable policy failures", () => {
    const layer = testLayer(
      makePulse({
        getIssue: () => Effect.succeed(issue),
        capture: () =>
          Effect.fail(
            new PulseIssuesClientError({
              operation: "issues.capture",
              reason: "origin-not-allowed",
              detail: "Pulse does not allow captures from this Preview origin.",
              retryable: false,
              requiredOrigin: "http://localhost:5173",
            }),
          ),
      }),
    );

    return Effect.gen(function* () {
      const service = yield* IssuesService;
      const notConnected = yield* service.list({ projectId: localProjectId }).pipe(Effect.flip);
      assert.equal(notConnected.reason, "not-connected");

      yield* service.updateConnection({
        endpoint: "https://pulse.example.test",
        token: "pat_secret_value",
      });
      const unmapped = yield* service
        .detail({ projectId: localProjectId, issueId })
        .pipe(Effect.flip);
      assert.equal(unmapped.reason, "unmapped-project");
      yield* service.setProjectMapping({ projectId: localProjectId, pulseProjectId });

      const threadId = ThreadId.make("thread-1");
      const linked = yield* service.setThreadLink({ projectId: localProjectId, issueId, threadId });
      assert.equal(linked.link?.threadId, threadId);
      assert.equal((yield* service.getForThread({ threadId })).link?.issueId, issueId);
      assert.equal(
        (yield* service.getThreadLink({ projectId: localProjectId, issueId })).link?.threadId,
        threadId,
      );
      assert.equal(
        (yield* service.removeThreadLink({ projectId: localProjectId, issueId })).link,
        null,
      );

      const origin = yield* service
        .capture({
          projectId: localProjectId,
          origin: "http://localhost:5173",
          title: "Broken",
          description: "Broken",
          severity: "low",
        })
        .pipe(Effect.flip);
      assert.equal(origin.reason, "origin-not-allowed");
      assert.equal(origin.requiredOrigin, "http://localhost:5173");
    }).pipe(Effect.provide(layer), Effect.scoped);
  });
});
