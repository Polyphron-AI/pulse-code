import {
  type EnvironmentId,
  IntegrationConnectionId,
  type IntegrationConnectionSnapshot,
  IntegrationConnectionSnapshot as IntegrationConnectionSnapshotSchema,
  IntegrationOperationError,
  type IntegrationOperationFailureReason,
  IntegrationProviderId,
  IntegrationProviderProjectId,
  IsoDateTime,
  type IssueConnectionSnapshot,
  type IssueOperationError,
  PulseProjectId,
  type ProjectId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import type { IssuesService } from "../issues/IssuesService.ts";

export const PULSE_INTEGRATION_PROVIDER_ID = IntegrationProviderId.make("pulse");
export const PULSE_ISSUES_CONNECTION_ID = IntegrationConnectionId.make("pulse-issues");

const PULSE_ISSUES_CAPABILITIES = [
  "work.read",
  "work.write",
  "evidence.read",
  "workspace.read",
] as const;

export interface IntegrationAdapterMappingInput {
  readonly projectId: ProjectId;
  readonly providerProjectId: IntegrationProviderProjectId;
}

/**
 * Provider-neutral lifecycle seam. Provider credentials, resource shapes, and domain mutations do
 * not cross this boundary: Pulse PAT configuration and all Issue behavior remain on IssuesService.
 */
export interface IntegrationAdapter {
  readonly providerId: IntegrationProviderId;
  readonly connectionId: IntegrationConnectionId;
  readonly getConnection: () => Effect.Effect<
    IntegrationConnectionSnapshot,
    IntegrationOperationError
  >;
  readonly disconnect: () => Effect.Effect<
    IntegrationConnectionSnapshot,
    IntegrationOperationError
  >;
  readonly setProjectMapping: (
    input: IntegrationAdapterMappingInput,
  ) => Effect.Effect<IntegrationConnectionSnapshot, IntegrationOperationError>;
  readonly removeProjectMapping: (
    projectId: ProjectId,
  ) => Effect.Effect<IntegrationConnectionSnapshot, IntegrationOperationError>;
}

export type PulseIssuesLifecycle = Pick<
  IssuesService["Service"],
  "getConnection" | "disconnect" | "setProjectMapping" | "removeProjectMapping"
>;

const nowIso = DateTime.now.pipe(Effect.map((now) => IsoDateTime.make(DateTime.formatIso(now))));
const decodeIntegrationConnectionSnapshot = Schema.decodeUnknownEffect(
  IntegrationConnectionSnapshotSchema,
);

const boundedText = (value: string, maximum: number, fallback: string): string => {
  const normalized = value.trim();
  return (normalized.length === 0 ? fallback : normalized).slice(0, maximum);
};

const integrationError = (
  operation: string,
  reason: IntegrationOperationFailureReason,
  detail: string,
  retryable: boolean,
): IntegrationOperationError =>
  new IntegrationOperationError({
    operation: boundedText(operation, 128, "integration.pulse"),
    reason,
    detail: boundedText(detail, 4_000, "Pulse integration operation failed."),
    retryable,
    providerId: PULSE_INTEGRATION_PROVIDER_ID,
  });

const issueReason = (reason: IssueOperationError["reason"]): IntegrationOperationFailureReason => {
  switch (reason) {
    case "not-connected":
      return "not_connected";
    case "unmapped-project":
      return "unmapped_project";
    case "authentication":
      return "reauthorization_required";
    case "permission":
    case "origin-not-allowed":
      return "permission_denied";
    case "not-found":
      return "not_found";
    case "stale-version":
      return "stale_version";
    case "invalid-response":
      return "invalid_response";
    case "invalid-input":
      return "invalid_input";
    case "upload-failed":
    case "unavailable":
      return "unavailable";
  }
};

export const fromIssueOperationError = (error: IssueOperationError): IntegrationOperationError =>
  integrationError(error.operation, issueReason(error.reason), error.detail, error.retryable);

const latestMappingUpdate = (mappings: IssueConnectionSnapshot["mappings"]): IsoDateTime | null =>
  mappings.reduce<IsoDateTime | null>(
    (latest, mapping) =>
      latest === null || mapping.updatedAt > latest ? mapping.updatedAt : latest,
    null,
  );

const integrationMapping = (mapping: IssueConnectionSnapshot["mappings"][number]) => ({
  projectId: mapping.projectId,
  providerWorkspaceId: null,
  providerProjectId: mapping.pulseProjectId,
  providerProjectName: mapping.pulseProjectName,
  sourceUrl: null,
  updatedAt: mapping.updatedAt,
});

const decodeSnapshot = (
  snapshot: IssueConnectionSnapshot,
  environmentId: EnvironmentId,
  observedAt: IsoDateTime,
): Effect.Effect<IntegrationConnectionSnapshot, IntegrationOperationError> => {
  const state = snapshot.status;
  const failure =
    state === "error"
      ? {
          reason: "unknown" as const,
          detail: snapshot.error?.trim() || "Pulse health check failed.",
          retryable: true,
        }
      : null;
  const candidate = {
    connectionId: PULSE_ISSUES_CONNECTION_ID,
    environmentId,
    providerId: PULSE_INTEGRATION_PROVIDER_ID,
    state,
    accountHint: null,
    endpointHint: snapshot.endpoint,
    credentialConfigured: snapshot.tokenConfigured,
    capabilities: PULSE_ISSUES_CAPABILITIES,
    health: {
      state,
      lastCheckedAt: snapshot.lastCheckedAt,
      lastSuccessfulAt: state === "connected" ? snapshot.lastCheckedAt : null,
      failure,
    },
    mappings: snapshot.mappings.map(integrationMapping),
    updatedAt: snapshot.lastCheckedAt ?? latestMappingUpdate(snapshot.mappings) ?? observedAt,
  };

  return decodeIntegrationConnectionSnapshot(candidate).pipe(
    Effect.mapError(() =>
      integrationError(
        "integration.pulse.snapshot",
        "invalid_response",
        "Pulse returned lifecycle metadata outside the shared integration bounds.",
        false,
      ),
    ),
  );
};

export interface PulseIssuesIntegrationAdapterOptions {
  readonly environmentId: EnvironmentId;
  readonly issues: PulseIssuesLifecycle;
  readonly observedAt?: Effect.Effect<IsoDateTime>;
}

/** Wraps the legacy/native Issues lifecycle without moving its records or secret reference. */
export function makePulseIssuesIntegrationAdapter({
  environmentId,
  issues,
  observedAt = nowIso,
}: PulseIssuesIntegrationAdapterOptions): IntegrationAdapter {
  const convert = (
    operation: Effect.Effect<IssueConnectionSnapshot, IssueOperationError>,
  ): Effect.Effect<IntegrationConnectionSnapshot, IntegrationOperationError> =>
    operation.pipe(
      Effect.mapError(fromIssueOperationError),
      Effect.flatMap((snapshot) =>
        observedAt.pipe(
          Effect.flatMap((timestamp) => decodeSnapshot(snapshot, environmentId, timestamp)),
        ),
      ),
    );

  return {
    providerId: PULSE_INTEGRATION_PROVIDER_ID,
    connectionId: PULSE_ISSUES_CONNECTION_ID,
    getConnection: () => convert(issues.getConnection()),
    disconnect: () => convert(issues.disconnect()),
    setProjectMapping: ({ projectId, providerProjectId }) =>
      convert(
        issues.setProjectMapping({
          projectId,
          pulseProjectId: PulseProjectId.make(providerProjectId),
        }),
      ),
    removeProjectMapping: (projectId) => convert(issues.removeProjectMapping({ projectId })),
  };
}
