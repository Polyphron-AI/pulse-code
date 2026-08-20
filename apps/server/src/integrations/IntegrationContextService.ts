import {
  IntegrationActionConfirmationToken,
  IntegrationActionPreviewId,
  IntegrationAuditReceipt,
  IntegrationAuditReceiptId,
  type IntegrationCapability,
  type IntegrationConnectionSnapshot,
  type IntegrationIssueContext,
  IntegrationIssueContext as IntegrationIssueContextSchema,
  type IntegrationIssueContextReadInput,
  type IntegrationIssueStatusActionPreview,
  IntegrationIssueStatusActionPreview as IntegrationIssueStatusActionPreviewSchema,
  type IntegrationIssueStatusConfirmInput,
  type IntegrationIssueStatusPreviewInput,
  IntegrationOperationError,
  type IntegrationOperationFailureReason,
  IsoDateTime,
  type Issue,
  type IssueStatus,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { IssuesService } from "../issues/IssuesService.ts";
import { fromIssueOperationError, PULSE_INTEGRATION_PROVIDER_ID } from "./IntegrationAdapter.ts";
import { IntegrationService } from "./IntegrationService.ts";

const PREVIEW_TTL_MS = 5 * 60 * 1_000;
const MAX_PENDING_PREVIEWS = 100;
const DESCRIPTION_EXCERPT_LIMIT = 2_000;
const DESCRIPTION_DETAIL_LIMIT = 20_000;
const LABEL_LIMIT = 50;
const LABEL_LENGTH_LIMIT = 200;
const decodeIntegrationIssueContext = Schema.decodeUnknownEffect(IntegrationIssueContextSchema);
const decodeIntegrationIssueStatusActionPreview = Schema.decodeUnknownEffect(
  IntegrationIssueStatusActionPreviewSchema,
);
const decodeIntegrationAuditReceipt = Schema.decodeUnknownEffect(IntegrationAuditReceipt);

export type IntegrationIssueLifecycle = Pick<IssuesService["Service"], "detail" | "update">;
export type IntegrationConnectionLifecycle = Pick<IntegrationService["Service"], "getConnection">;

interface PendingIssueStatusAction {
  readonly envelope: IntegrationIssueStatusActionPreview;
  readonly projectId: IntegrationIssueStatusPreviewInput["projectId"];
  readonly issueId: IntegrationIssueStatusPreviewInput["issueId"];
  readonly expectedVersion: number;
  readonly beforeStatus: IssueStatus;
  readonly afterStatus: IssueStatus;
}

export interface IntegrationContextServiceOptions {
  readonly integrations: IntegrationConnectionLifecycle;
  readonly issues: IntegrationIssueLifecycle;
  readonly clock: Effect.Effect<IsoDateTime>;
  readonly randomId: Effect.Effect<string, IntegrationOperationError>;
}

export class IntegrationContextService extends Context.Service<
  IntegrationContextService,
  {
    readonly readIssueContext: (
      input: IntegrationIssueContextReadInput,
    ) => Effect.Effect<IntegrationIssueContext, IntegrationOperationError>;
    readonly previewIssueStatusAction: (
      input: IntegrationIssueStatusPreviewInput,
    ) => Effect.Effect<IntegrationIssueStatusActionPreview, IntegrationOperationError>;
    readonly confirmIssueStatusAction: (
      input: IntegrationIssueStatusConfirmInput,
    ) => Effect.Effect<IntegrationAuditReceipt, IntegrationOperationError>;
  }
>()("t3/integrations/IntegrationContextService") {}

const boundedText = (value: string, maximum: number, fallback: string): string => {
  const normalized = value.trim();
  return (normalized.length === 0 ? fallback : normalized).slice(0, maximum);
};

const operationError = (
  operation: string,
  reason: IntegrationOperationFailureReason,
  detail: string,
  retryable: boolean,
): IntegrationOperationError =>
  new IntegrationOperationError({
    operation,
    reason,
    detail: boundedText(detail, 4_000, "Integration operation failed."),
    retryable,
    providerId: PULSE_INTEGRATION_PROVIDER_ID,
  });

const expiresAt = (createdAt: IsoDateTime): IsoDateTime =>
  IsoDateTime.make(
    DateTime.formatIso(
      DateTime.add(DateTime.makeUnsafe(createdAt), { milliseconds: PREVIEW_TTL_MS }),
    ),
  );

const mappedConnection = (
  snapshot: IntegrationConnectionSnapshot,
  input: Pick<IntegrationIssueContextReadInput, "connectionId" | "projectId">,
  capability: IntegrationCapability,
): Effect.Effect<
  {
    readonly snapshot: IntegrationConnectionSnapshot;
    readonly mapping: IntegrationConnectionSnapshot["mappings"][number];
  },
  IntegrationOperationError
> => {
  if (snapshot.connectionId !== input.connectionId) {
    return Effect.fail(
      operationError(
        "integration.issue.context",
        "not_found",
        "The requested integration connection does not belong to Pulse Issues.",
        false,
      ),
    );
  }
  if (snapshot.state !== "connected") {
    const reason =
      snapshot.state === "reauthorization_required"
        ? "reauthorization_required"
        : snapshot.state === "disconnected"
          ? "not_connected"
          : "unavailable";
    return Effect.fail(
      operationError(
        "integration.issue.context",
        reason,
        snapshot.health.failure?.detail ?? "Connect Pulse before using Issue context.",
        snapshot.health.failure?.retryable ?? false,
      ),
    );
  }
  if (!snapshot.capabilities.includes(capability)) {
    return Effect.fail(
      new IntegrationOperationError({
        operation: "integration.issue.context",
        reason: "unsupported_capability",
        detail: `Pulse does not advertise the required '${capability}' capability.`,
        retryable: false,
        providerId: PULSE_INTEGRATION_PROVIDER_ID,
        requiredCapability: capability,
      }),
    );
  }
  const mapping = snapshot.mappings.find((candidate) => candidate.projectId === input.projectId);
  return mapping === undefined
    ? Effect.fail(
        operationError(
          "integration.issue.context",
          "unmapped_project",
          "Map this Pulse Code project to a Pulse project before using Issue context.",
          false,
        ),
      )
    : Effect.succeed({ snapshot, mapping });
};

const decodeContext = (candidate: unknown) =>
  decodeIntegrationIssueContext(candidate).pipe(
    Effect.mapError(() =>
      operationError(
        "integration.issue.context",
        "invalid_response",
        "Pulse Issue context exceeded the shared bounded-context contract.",
        false,
      ),
    ),
  );

const decodePreview = (candidate: unknown) =>
  decodeIntegrationIssueStatusActionPreview(candidate).pipe(
    Effect.mapError(() =>
      operationError(
        "integration.issue.status.preview",
        "invalid_response",
        "Pulse Issue action metadata exceeded the shared preview contract.",
        false,
      ),
    ),
  );

const contextResource = (
  issue: Issue,
  detailLevel: IntegrationIssueContextReadInput["detailLevel"],
) => {
  const labels = issue.labels
    .map((label) => label.trim())
    .filter((label) => label.length > 0)
    .slice(0, LABEL_LIMIT)
    .map((label) => label.slice(0, LABEL_LENGTH_LIMIT));
  const descriptionExcerpt = issue.description.slice(0, DESCRIPTION_EXCERPT_LIMIT);
  const detailDescription = issue.description.slice(0, DESCRIPTION_DETAIL_LIMIT);
  const assignedToId =
    issue.assignedToId === null ? null : boundedText(issue.assignedToId, 256, "unknown-assignee");
  const truncated =
    issue.description.length >
      (detailLevel === "detail" ? DESCRIPTION_DETAIL_LIMIT : DESCRIPTION_EXCERPT_LIMIT) ||
    issue.labels.length > LABEL_LIMIT ||
    issue.labels.some((label) => label.trim().length > LABEL_LENGTH_LIMIT);
  return {
    kind: "issue" as const,
    id: issue.id,
    ref: boundedText(issue.ref, 200, issue.id),
    title: boundedText(issue.title, 500, issue.ref),
    descriptionExcerpt,
    status: issue.status,
    severity: issue.severity,
    version: issue.version,
    updatedAt: issue.updatedAt,
    truncated,
    detail:
      detailLevel === "detail" ? { description: detailDescription, labels, assignedToId } : null,
  };
};

export function makeIntegrationContextService({
  integrations,
  issues,
  clock,
  randomId,
}: IntegrationContextServiceOptions): IntegrationContextService["Service"] {
  const pending = new Map<string, PendingIssueStatusAction>();

  const connectionMapping = (
    input: Pick<IntegrationIssueContextReadInput, "connectionId" | "projectId">,
    capability: IntegrationCapability,
  ) =>
    integrations
      .getConnection(PULSE_INTEGRATION_PROVIDER_ID)
      .pipe(Effect.flatMap((snapshot) => mappedConnection(snapshot, input, capability)));

  const nativeDetail = (input: Pick<IntegrationIssueContextReadInput, "projectId" | "issueId">) =>
    issues.detail(input).pipe(Effect.mapError(fromIssueOperationError));

  const readIssueContext: IntegrationContextService["Service"]["readIssueContext"] = (input) =>
    Effect.gen(function* () {
      const { snapshot, mapping } = yield* connectionMapping(input, "work.read");
      const result = yield* nativeDetail(input);
      if (String(result.mapping.pulseProjectId) !== String(mapping.providerProjectId)) {
        return yield* Effect.fail(
          operationError(
            "integration.issue.context",
            "invalid_response",
            "Pulse returned an Issue outside the shared project mapping.",
            false,
          ),
        );
      }
      const fetchedAt = yield* clock;
      return yield* decodeContext({
        provenance: {
          connectionId: input.connectionId,
          environmentId: snapshot.environmentId,
          projectId: input.projectId,
          providerId: PULSE_INTEGRATION_PROVIDER_ID,
          providerWorkspaceId: mapping.providerWorkspaceId,
          providerProjectId: mapping.providerProjectId,
          resourceKind: "issue",
          resourceId: result.issue.id,
          sourceUrl: mapping.sourceUrl,
          fetchedAt,
          detailLevel: input.detailLevel,
          stale: false,
        },
        resource: contextResource(result.issue, input.detailLevel),
      });
    });

  const previewIssueStatusAction: IntegrationContextService["Service"]["previewIssueStatusAction"] =
    (input) =>
      Effect.gen(function* () {
        yield* connectionMapping(input, "work.write");
        const context = yield* readIssueContext({
          connectionId: input.connectionId,
          projectId: input.projectId,
          issueId: input.issueId,
          detailLevel: "summary",
        });
        if (context.resource.version !== input.expectedVersion) {
          return yield* Effect.fail(
            operationError(
              "integration.issue.status.preview",
              "stale_version",
              "The Issue changed before the action preview was created. Refresh and review again.",
              false,
            ),
          );
        }
        if (context.resource.status === input.status) {
          return yield* Effect.fail(
            operationError(
              "integration.issue.status.preview",
              "invalid_input",
              `Pulse Issue ${context.resource.ref} already has status '${input.status}'.`,
              false,
            ),
          );
        }
        const [createdAt, previewIdRaw, confirmationTokenRaw] = yield* Effect.all([
          clock,
          randomId,
          randomId,
        ]);
        const envelope = yield* decodePreview({
          preview: {
            previewId: IntegrationActionPreviewId.make(previewIdRaw),
            connectionId: input.connectionId,
            environmentId: context.provenance.environmentId,
            projectId: input.projectId,
            providerId: PULSE_INTEGRATION_PROVIDER_ID,
            capability: "work.write",
            operation: "issue.status.update",
            resourceKind: "issue",
            resourceId: input.issueId,
            summary: `Change Pulse Issue ${context.resource.ref} status from ${context.resource.status} to ${input.status}.`,
            changes: [
              {
                field: "status",
                before: context.resource.status,
                after: input.status,
              },
            ],
            expiresAt: expiresAt(createdAt),
            requiresConfirmation: true,
          },
          confirmationToken: IntegrationActionConfirmationToken.make(confirmationTokenRaw),
        });
        yield* Effect.sync(() => {
          for (const [previewId, candidate] of pending) {
            if (Date.parse(candidate.envelope.preview.expiresAt) <= Date.parse(createdAt)) {
              pending.delete(previewId);
            }
          }
          while (pending.size >= MAX_PENDING_PREVIEWS) {
            const oldest = pending.keys().next().value;
            if (oldest === undefined) break;
            pending.delete(oldest);
          }
          pending.set(envelope.preview.previewId, {
            envelope,
            projectId: input.projectId,
            issueId: input.issueId,
            expectedVersion: input.expectedVersion,
            beforeStatus: context.resource.status,
            afterStatus: input.status,
          });
        });
        return envelope;
      });

  const confirmIssueStatusAction: IntegrationContextService["Service"]["confirmIssueStatusAction"] =
    (input) =>
      Effect.gen(function* () {
        const confirmedAt = yield* clock;
        const action = yield* Effect.sync(() => pending.get(input.previewId)).pipe(
          Effect.flatMap((candidate) =>
            candidate === undefined
              ? Effect.fail(
                  operationError(
                    "integration.issue.status.confirm",
                    "action_expired",
                    "This action preview is unavailable or has already been used.",
                    false,
                  ),
                )
              : Effect.succeed(candidate),
          ),
        );
        if (action.envelope.confirmationToken !== input.confirmationToken) {
          return yield* Effect.fail(
            operationError(
              "integration.issue.status.confirm",
              "action_not_confirmed",
              "The action confirmation token does not match this preview.",
              false,
            ),
          );
        }
        if (Date.parse(confirmedAt) >= Date.parse(action.envelope.preview.expiresAt)) {
          yield* Effect.sync(() => pending.delete(input.previewId));
          return yield* Effect.fail(
            operationError(
              "integration.issue.status.confirm",
              "action_expired",
              "This action preview expired. Refresh the Issue and create a new preview.",
              false,
            ),
          );
        }

        // Claim before the provider call so concurrent/replayed confirmations cannot execute twice.
        yield* Effect.sync(() => pending.delete(input.previewId));
        const execution = Effect.gen(function* () {
          yield* connectionMapping(
            {
              connectionId: action.envelope.preview.connectionId,
              projectId: action.projectId,
            },
            "work.write",
          );
          const current = yield* nativeDetail({
            projectId: action.projectId,
            issueId: action.issueId,
          });
          if (
            current.issue.version !== action.expectedVersion ||
            current.issue.status !== action.beforeStatus
          ) {
            return yield* Effect.fail(
              operationError(
                "integration.issue.status.confirm",
                "stale_version",
                "The Issue changed after preview. Refresh it and review the preserved action again.",
                false,
              ),
            );
          }
          return yield* issues
            .update({
              projectId: action.projectId,
              issueId: action.issueId,
              expectedVersion: action.expectedVersion,
              status: action.afterStatus,
            })
            .pipe(Effect.mapError(fromIssueOperationError));
        });
        const outcome = yield* execution.pipe(
          Effect.matchEffect({
            onFailure: (error) => Effect.succeed({ _tag: "failure" as const, error }),
            onSuccess: (updated) => Effect.succeed({ _tag: "success" as const, updated }),
          }),
        );
        const occurredAt = yield* clock;
        const receiptId = IntegrationAuditReceiptId.make(yield* randomId);
        const failure = outcome._tag === "failure" ? outcome.error : null;
        return yield* decodeIntegrationAuditReceipt({
          receiptId,
          connectionId: action.envelope.preview.connectionId,
          environmentId: action.envelope.preview.environmentId,
          projectId: action.projectId,
          providerId: PULSE_INTEGRATION_PROVIDER_ID,
          actorId: input.actorId,
          capability: "work.write",
          operation: "issue.status.update",
          resourceKind: "issue",
          resourceId: action.issueId,
          status: failure === null ? "succeeded" : "failed",
          reason: failure === null ? null : boundedText(failure.detail, 4_000, failure.reason),
          occurredAt,
        }).pipe(
          Effect.mapError(() =>
            operationError(
              "integration.issue.status.confirm",
              "invalid_response",
              "The action receipt exceeded the shared audit contract.",
              false,
            ),
          ),
        );
      });

  return IntegrationContextService.of({
    readIssueContext,
    previewIssueStatusAction,
    confirmIssueStatusAction,
  });
}

export const make = Effect.gen(function* () {
  const integrations = yield* IntegrationService;
  const issues = yield* IssuesService;
  const crypto = yield* Crypto.Crypto;
  return makeIntegrationContextService({
    integrations,
    issues,
    clock: DateTime.now.pipe(Effect.map((now) => IsoDateTime.make(DateTime.formatIso(now)))),
    randomId: crypto.randomUUIDv4.pipe(
      Effect.mapError(() =>
        operationError(
          "integration.issue.status.preview",
          "unavailable",
          "Unable to generate secure action confirmation metadata.",
          true,
        ),
      ),
    ),
  });
});

export const layer = Layer.effect(IntegrationContextService, make);
