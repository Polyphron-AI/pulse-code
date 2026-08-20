import {
  EnvironmentId,
  IntegrationConnectionId,
  IntegrationOperationError,
  IntegrationProviderId,
  IntegrationProviderProjectId,
  IsoDateTime,
  type IssueConnectionSnapshot,
  IssueOperationError,
  ProjectId,
  PulseProjectId,
} from "@t3tools/contracts";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { describe, expect, vi } from "vite-plus/test";

import {
  makePulseIssuesIntegrationAdapter,
  PULSE_ISSUES_CONNECTION_ID,
  PULSE_INTEGRATION_PROVIDER_ID,
  type PulseIssuesLifecycle,
} from "./IntegrationAdapter.ts";
import { makeIntegrationService } from "./IntegrationService.ts";

const environmentId = EnvironmentId.make("environment-local");
const projectId = ProjectId.make("project-local");
const checkedAt = IsoDateTime.make("2026-08-20T05:00:00.000Z");

const legacySnapshot = (
  overrides: Partial<IssueConnectionSnapshot> = {},
): IssueConnectionSnapshot => ({
  status: "connected",
  endpoint: "https://pulse.example.test",
  tokenConfigured: true,
  projects: [
    {
      id: PulseProjectId.make("pulse-project-1"),
      name: "Storefront",
      slug: "storefront",
      archivedAt: null,
      allowLoopbackOrigins: false,
    },
  ],
  mappings: [
    {
      projectId,
      pulseProjectId: PulseProjectId.make("pulse-project-1"),
      pulseProjectName: "Storefront",
      pulseProjectSlug: "storefront",
      updatedAt: checkedAt,
    },
  ],
  lastCheckedAt: checkedAt,
  error: null,
  ...overrides,
});

function lifecycle(snapshot: IssueConnectionSnapshot = legacySnapshot()): {
  readonly service: PulseIssuesLifecycle;
  readonly setProjectMapping: ReturnType<typeof vi.fn>;
  readonly removeProjectMapping: ReturnType<typeof vi.fn>;
} {
  const setProjectMapping = vi.fn((input) =>
    Effect.succeed(
      legacySnapshot({
        mappings: [
          {
            projectId: input.projectId,
            pulseProjectId: input.pulseProjectId,
            pulseProjectName: "Selected project",
            pulseProjectSlug: "selected-project",
            updatedAt: checkedAt,
          },
        ],
      }),
    ),
  );
  const removeProjectMapping = vi.fn(() => Effect.succeed(legacySnapshot({ mappings: [] })));
  return {
    service: {
      getConnection: () => Effect.succeed(snapshot),
      disconnect: () =>
        Effect.succeed(
          legacySnapshot({
            status: "disconnected",
            endpoint: null,
            tokenConfigured: false,
            projects: [],
            mappings: [],
            lastCheckedAt: null,
          }),
        ),
      setProjectMapping,
      removeProjectMapping,
    },
    setProjectMapping,
    removeProjectMapping,
  };
}

const adapter = (issues: PulseIssuesLifecycle) =>
  makePulseIssuesIntegrationAdapter({
    environmentId,
    issues,
    observedAt: Effect.succeed(checkedAt),
  });

describe("Pulse Issues reference integration adapter", () => {
  it.effect(
    "wraps the legacy connection and mapping fixture without renaming persisted identities",
    () =>
      Effect.gen(function* () {
        const { service: issues } = lifecycle();
        const snapshot = yield* adapter(issues).getConnection();

        expect(snapshot).toMatchObject({
          connectionId: PULSE_ISSUES_CONNECTION_ID,
          environmentId,
          providerId: PULSE_INTEGRATION_PROVIDER_ID,
          state: "connected",
          endpointHint: "https://pulse.example.test",
          credentialConfigured: true,
          health: { state: "connected", lastSuccessfulAt: checkedAt, failure: null },
          mappings: [
            {
              projectId,
              providerWorkspaceId: null,
              providerProjectId: "pulse-project-1",
              providerProjectName: "Storefront",
            },
          ],
        });
        expect(snapshot).not.toHaveProperty("token");
        expect(snapshot.mappings[0]?.projectId).toBe(projectId);
        expect(snapshot.mappings[0]?.providerProjectId).toBe("pulse-project-1");
      }),
  );

  it.effect("projects native health failures without exposing credentials or provider bodies", () =>
    Effect.gen(function* () {
      const { service: issues } = lifecycle(
        legacySnapshot({
          status: "error",
          projects: [],
          lastCheckedAt: checkedAt,
          error: "Pulse is temporarily unavailable.",
        }),
      );

      const snapshot = yield* adapter(issues).getConnection();

      expect(snapshot).toMatchObject({
        state: "error",
        credentialConfigured: true,
        health: {
          state: "error",
          lastCheckedAt: checkedAt,
          lastSuccessfulAt: null,
          failure: {
            reason: "unknown",
            detail: "Pulse is temporarily unavailable.",
            retryable: true,
          },
        },
      });
    }),
  );

  it.effect("delegates mapping selection to native Pulse validation", () =>
    Effect.gen(function* () {
      const native = lifecycle();
      const service = makeIntegrationService([adapter(native.service)]);

      const result = yield* service.setProjectMapping({
        connectionId: PULSE_ISSUES_CONNECTION_ID,
        projectId,
        providerProjectId: IntegrationProviderProjectId.make("pulse-project-2"),
      });

      expect(native.setProjectMapping).toHaveBeenCalledWith({
        projectId,
        pulseProjectId: "pulse-project-2",
      });
      expect(result.mappings[0]?.providerProjectId).toBe("pulse-project-2");
    }),
  );

  it.effect(
    "delegates disconnect and mapping removal while leaving domain methods outside the adapter",
    () =>
      Effect.gen(function* () {
        const native = lifecycle();
        const service = makeIntegrationService([adapter(native.service)]);

        const removed = yield* service.removeProjectMapping({
          connectionId: PULSE_ISSUES_CONNECTION_ID,
          projectId,
        });
        const disconnected = yield* service.disconnect({
          connectionId: PULSE_ISSUES_CONNECTION_ID,
        });

        expect(native.removeProjectMapping).toHaveBeenCalledWith({ projectId });
        expect(removed.mappings).toEqual([]);
        expect(disconnected).toMatchObject({
          state: "disconnected",
          credentialConfigured: false,
          mappings: [],
        });
        expect("list" in adapter(native.service)).toBe(false);
        expect("update" in adapter(native.service)).toBe(false);
      }),
  );

  it.effect("translates stable native failures without exposing their causes", () =>
    Effect.gen(function* () {
      const secretCause = new Error("upstream body included secret-token");
      const native = lifecycle().service;
      const failed: PulseIssuesLifecycle = {
        ...native,
        getConnection: () =>
          Effect.fail(
            new IssueOperationError({
              operation: "issues.getConnection",
              reason: "authentication",
              detail: "Pulse authentication failed.",
              retryable: false,
              cause: secretCause,
            }),
          ),
      };

      const error = yield* adapter(failed).getConnection().pipe(Effect.flip);

      expect(error).toBeInstanceOf(IntegrationOperationError);
      expect(error.reason).toBe("reauthorization_required");
      expect(error.providerId).toBe(PULSE_INTEGRATION_PROVIDER_ID);
      expect(error).not.toHaveProperty("cause");
      expect(error.detail).not.toContain("secret-token");
    }),
  );

  it.effect(
    "bounds native error metadata instead of escaping the shared typed-error contract",
    () =>
      Effect.gen(function* () {
        const native = lifecycle().service;
        const failed: PulseIssuesLifecycle = {
          ...native,
          getConnection: () =>
            Effect.fail(
              new IssueOperationError({
                operation: `issues.${"x".repeat(200)}`,
                reason: "unavailable",
                detail: "d".repeat(5_000),
                retryable: true,
              }),
            ),
        };

        const error = yield* adapter(failed).getConnection().pipe(Effect.flip);

        expect(error.operation).toHaveLength(128);
        expect(error.detail).toHaveLength(4_000);
        expect(error.reason).toBe("unavailable");
      }),
  );

  it.effect("rejects lifecycle metadata outside shared bounds at the adapter boundary", () =>
    Effect.gen(function* () {
      const { service: issues } = lifecycle(
        legacySnapshot({
          mappings: [
            {
              ...legacySnapshot().mappings[0]!,
              pulseProjectId: PulseProjectId.make("x".repeat(257)),
            },
          ],
        }),
      );

      const error = yield* adapter(issues).getConnection().pipe(Effect.flip);

      expect(error.reason).toBe("invalid_response");
      expect(error.operation).toBe("integration.pulse.snapshot");
    }),
  );
});

describe("IntegrationService", () => {
  it.effect("delegates only registered lifecycle connections and rejects unknown identities", () =>
    Effect.gen(function* () {
      const pulseAdapter = adapter(lifecycle().service);
      const service = makeIntegrationService([pulseAdapter]);

      expect(yield* service.listConnections()).toHaveLength(1);
      expect(
        yield* service.getConnection(IntegrationProviderId.make("linear")).pipe(Effect.flip),
      ).toMatchObject({ reason: "unsupported_capability" });
      expect(
        yield* service
          .disconnect({ connectionId: IntegrationConnectionId.make("unknown") })
          .pipe(Effect.flip),
      ).toMatchObject({ reason: "not_found" });
    }),
  );

  it.effect("rejects an adapter snapshot whose registered identity changes", () =>
    Effect.gen(function* () {
      const pulseAdapter = adapter(lifecycle().service);
      const service = makeIntegrationService([
        {
          ...pulseAdapter,
          getConnection: () =>
            pulseAdapter.getConnection().pipe(
              Effect.map((snapshot) => ({
                ...snapshot,
                connectionId: IntegrationConnectionId.make("mismatched"),
              })),
            ),
        },
      ]);

      const error = yield* service.listConnections().pipe(Effect.flip);

      expect(error.reason).toBe("invalid_response");
      expect(error.operation).toBe("integration.adapter.snapshot");
    }),
  );
});
