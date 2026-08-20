import {
  EnvironmentId,
  IntegrationActionActorId,
  IntegrationActionConfirmationToken,
  type IntegrationConnectionSnapshot,
  IntegrationProviderProjectId,
  IsoDateTime,
  type Issue,
  IssueId,
  IssueOperationError,
  ProjectId,
  PulseProjectId,
} from "@t3tools/contracts";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { describe, expect, vi } from "vite-plus/test";

import {
  type IntegrationConnectionLifecycle,
  type IntegrationIssueLifecycle,
  makeIntegrationContextService,
} from "./IntegrationContextService.ts";
import { PULSE_ISSUES_CONNECTION_ID, PULSE_INTEGRATION_PROVIDER_ID } from "./IntegrationAdapter.ts";

const environmentId = EnvironmentId.make("environment-local");
const projectId = ProjectId.make("project-local");
const issueId = IssueId.make("issue-1");
const pulseProjectId = PulseProjectId.make("pulse-project-1");
const actorId = IntegrationActionActorId.make("user-1");

const connection = (): IntegrationConnectionSnapshot => ({
  connectionId: PULSE_ISSUES_CONNECTION_ID,
  environmentId,
  providerId: PULSE_INTEGRATION_PROVIDER_ID,
  state: "connected",
  accountHint: null,
  endpointHint: "https://pulse.example.test",
  credentialConfigured: true,
  capabilities: ["work.read", "work.write", "evidence.read", "workspace.read"],
  health: {
    state: "connected",
    lastCheckedAt: IsoDateTime.make("2026-08-20T05:00:00.000Z"),
    lastSuccessfulAt: IsoDateTime.make("2026-08-20T05:00:00.000Z"),
    failure: null,
  },
  mappings: [
    {
      projectId,
      providerWorkspaceId: null,
      providerProjectId: IntegrationProviderProjectId.make(pulseProjectId),
      providerProjectName: "Storefront",
      sourceUrl: null,
      updatedAt: IsoDateTime.make("2026-08-20T05:00:00.000Z"),
    },
  ],
  updatedAt: IsoDateTime.make("2026-08-20T05:00:00.000Z"),
});

const issue = (overrides: Partial<Issue> = {}): Issue => ({
  id: issueId,
  pulseProjectId,
  ref: "ISS-1",
  title: "Checkout total is stale",
  description: "The total does not refresh after quantity changes.",
  severity: "high",
  status: "todo",
  assignedToId: null,
  labels: ["checkout"],
  resolvedAt: null,
  archivedAt: null,
  version: 7,
  createdAt: IsoDateTime.make("2026-08-19T10:00:00.000Z"),
  updatedAt: IsoDateTime.make("2026-08-20T04:55:00.000Z"),
  ...overrides,
});

function harness(initialIssue: Issue = issue()) {
  let currentIssue = initialIssue;
  let now = "2026-08-20T05:00:00.000Z";
  let id = 0;
  const getConnection = vi.fn(() => Effect.succeed(connection()));
  const detail = vi.fn(() =>
    Effect.succeed({
      issue: currentIssue,
      mapping: {
        projectId,
        pulseProjectId,
        pulseProjectName: "Storefront",
        pulseProjectSlug: "storefront",
        updatedAt: IsoDateTime.make("2026-08-20T05:00:00.000Z"),
      },
    }),
  );
  const update = vi.fn<IntegrationIssueLifecycle["update"]>((input) => {
    currentIssue = issue({
      ...currentIssue,
      status: input.status ?? currentIssue.status,
      version: currentIssue.version + 1,
      updatedAt: IsoDateTime.make(now),
    });
    return Effect.succeed(currentIssue);
  });
  const integrations: IntegrationConnectionLifecycle = { getConnection };
  const issues: IntegrationIssueLifecycle = { detail, update };
  const service = makeIntegrationContextService({
    integrations,
    issues,
    clock: Effect.sync(() => IsoDateTime.make(now)),
    randomId: Effect.sync(() => `generated-${++id}`),
  });
  return {
    service,
    getConnection,
    detail,
    update,
    setIssue: (next: Issue) => {
      currentIssue = next;
    },
    setNow: (next: string) => {
      now = next;
    },
  };
}

const readInput = {
  connectionId: PULSE_ISSUES_CONNECTION_ID,
  projectId,
  issueId,
  detailLevel: "summary" as const,
};

describe("IntegrationContextService", () => {
  it.effect("returns bounded summary/detail context with provenance and no heavy evidence", () =>
    Effect.gen(function* () {
      const test = harness(
        issue({
          description: "d".repeat(25_000),
          labels: Array.from({ length: 55 }, (_, index) => `label-${index}`),
          assignedToId: "assignee-1",
        }),
      );

      const summary = yield* test.service.readIssueContext(readInput);
      const detail = yield* test.service.readIssueContext({
        ...readInput,
        detailLevel: "detail",
      });

      expect(summary).toMatchObject({
        provenance: {
          environmentId,
          projectId,
          providerId: PULSE_INTEGRATION_PROVIDER_ID,
          providerProjectId: pulseProjectId,
          detailLevel: "summary",
          stale: false,
        },
        resource: { id: issueId, version: 7, detail: null, truncated: true },
      });
      expect(summary.resource.descriptionExcerpt).toHaveLength(2_000);
      expect(detail.resource.descriptionExcerpt).toHaveLength(2_000);
      expect(detail.resource.detail?.description).toHaveLength(20_000);
      expect(detail.resource.detail?.labels).toHaveLength(50);
      expect(detail).not.toHaveProperty("token");
      expect(detail.resource.detail).not.toHaveProperty("reports");
      expect(detail.resource.detail).not.toHaveProperty("evidence");
      expect(detail.resource.detail).not.toHaveProperty("providerBody");
    }),
  );

  it.effect("rejects a native detail outside the shared project mapping", () =>
    Effect.gen(function* () {
      const test = harness();
      test.detail.mockImplementationOnce(() =>
        Effect.succeed({
          issue: issue(),
          mapping: {
            projectId,
            pulseProjectId: PulseProjectId.make("other-project"),
            pulseProjectName: "Other",
            pulseProjectSlug: "other",
            updatedAt: IsoDateTime.make("2026-08-20T05:00:00.000Z"),
          },
        }),
      );

      const error = yield* test.service.readIssueContext(readInput).pipe(Effect.flip);

      expect(error).toMatchObject({ reason: "invalid_response" });
    }),
  );

  it.effect("previews an exact status change without mutating Pulse", () =>
    Effect.gen(function* () {
      const test = harness();

      const action = yield* test.service.previewIssueStatusAction({
        connectionId: PULSE_ISSUES_CONNECTION_ID,
        projectId,
        issueId,
        expectedVersion: 7,
        status: "resolved",
      });

      expect(action.preview).toMatchObject({
        capability: "work.write",
        operation: "issue.status.update",
        resourceId: issueId,
        changes: [{ field: "status", before: "todo", after: "resolved" }],
        requiresConfirmation: true,
      });
      expect(action.preview.summary).toBe("Change Pulse Issue ISS-1 status from todo to resolved.");
      expect(action.confirmationToken).toBe("generated-2");
      expect(test.update).not.toHaveBeenCalled();
    }),
  );

  it.effect(
    "confirms once, rechecks optimistic state, mutates, and returns a success receipt",
    () =>
      Effect.gen(function* () {
        const test = harness();
        const action = yield* test.service.previewIssueStatusAction({
          connectionId: PULSE_ISSUES_CONNECTION_ID,
          projectId,
          issueId,
          expectedVersion: 7,
          status: "resolved",
        });

        const receipt = yield* test.service.confirmIssueStatusAction({
          previewId: action.preview.previewId,
          confirmationToken: action.confirmationToken,
          actorId,
        });

        expect(test.update).toHaveBeenCalledWith({
          projectId,
          issueId,
          expectedVersion: 7,
          status: "resolved",
        });
        expect(receipt).toMatchObject({
          status: "succeeded",
          reason: null,
          actorId,
          operation: "issue.status.update",
          resourceId: issueId,
        });
        const replayError = yield* test.service
          .confirmIssueStatusAction({
            previewId: action.preview.previewId,
            confirmationToken: action.confirmationToken,
            actorId,
          })
          .pipe(Effect.flip);
        expect(replayError).toMatchObject({ reason: "action_expired" });
      }),
  );

  it.effect("rejects the wrong token without consuming the valid confirmation", () =>
    Effect.gen(function* () {
      const test = harness();
      const action = yield* test.service.previewIssueStatusAction({
        connectionId: PULSE_ISSUES_CONNECTION_ID,
        projectId,
        issueId,
        expectedVersion: 7,
        status: "resolved",
      });

      const wrongTokenError = yield* test.service
        .confirmIssueStatusAction({
          previewId: action.preview.previewId,
          confirmationToken: IntegrationActionConfirmationToken.make("wrong-token"),
          actorId,
        })
        .pipe(Effect.flip);
      expect(wrongTokenError).toMatchObject({ reason: "action_not_confirmed" });
      const receipt = yield* test.service.confirmIssueStatusAction({
        previewId: action.preview.previewId,
        confirmationToken: action.confirmationToken,
        actorId,
      });
      expect(receipt).toMatchObject({ status: "succeeded" });
      expect(test.update).toHaveBeenCalledOnce();
    }),
  );

  it.effect("returns a failed receipt and never writes when the Issue changed after preview", () =>
    Effect.gen(function* () {
      const test = harness();
      const action = yield* test.service.previewIssueStatusAction({
        connectionId: PULSE_ISSUES_CONNECTION_ID,
        projectId,
        issueId,
        expectedVersion: 7,
        status: "resolved",
      });
      test.setIssue(issue({ version: 8, status: "in_progress" }));

      const receipt = yield* test.service.confirmIssueStatusAction({
        previewId: action.preview.previewId,
        confirmationToken: action.confirmationToken,
        actorId,
      });

      expect(receipt.status).toBe("failed");
      expect(receipt.reason).toContain("changed after preview");
      expect(test.update).not.toHaveBeenCalled();
    }),
  );

  it.effect("turns provider permission loss into a failed receipt without blind replay", () =>
    Effect.gen(function* () {
      const test = harness();
      const action = yield* test.service.previewIssueStatusAction({
        connectionId: PULSE_ISSUES_CONNECTION_ID,
        projectId,
        issueId,
        expectedVersion: 7,
        status: "resolved",
      });
      test.update.mockImplementationOnce(() =>
        Effect.fail(
          new IssueOperationError({
            operation: "issues.update",
            reason: "permission",
            detail: "Pulse denied this status change.",
            retryable: false,
          }),
        ),
      );

      const receipt = yield* test.service.confirmIssueStatusAction({
        previewId: action.preview.previewId,
        confirmationToken: action.confirmationToken,
        actorId,
      });

      expect(receipt).toMatchObject({
        status: "failed",
        reason: "Pulse denied this status change.",
      });
      const replayError = yield* test.service
        .confirmIssueStatusAction({
          previewId: action.preview.previewId,
          confirmationToken: action.confirmationToken,
          actorId,
        })
        .pipe(Effect.flip);
      expect(replayError).toMatchObject({ reason: "action_expired" });
    }),
  );

  it.effect("expires previews before execution", () =>
    Effect.gen(function* () {
      const test = harness();
      const action = yield* test.service.previewIssueStatusAction({
        connectionId: PULSE_ISSUES_CONNECTION_ID,
        projectId,
        issueId,
        expectedVersion: 7,
        status: "resolved",
      });
      test.setNow("2026-08-20T05:05:00.001Z");

      const error = yield* test.service
        .confirmIssueStatusAction({
          previewId: action.preview.previewId,
          confirmationToken: action.confirmationToken,
          actorId,
        })
        .pipe(Effect.flip);
      expect(error).toMatchObject({ reason: "action_expired" });
      expect(test.update).not.toHaveBeenCalled();
    }),
  );
});
