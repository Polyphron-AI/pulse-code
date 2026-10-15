import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import {
  type WorkspaceLinksError,
  MailMessageRef,
  MailSendApprovalStatus,
  MailSendSnapshot,
} from "@t3tools/contracts";

import { PersistenceDecodeError, PersistenceSqlError } from "./Errors.ts";

export type MailSendApprovalRepositoryError = PersistenceSqlError | PersistenceDecodeError;

const MailSendApprovalError = Schema.Struct({ code: Schema.String, message: Schema.String });

/** The draft a send came from, with its MODSEQ at prepare time when the server has CONDSTORE. */
export const MailSourceDraft = Schema.Struct({
  ...MailMessageRef.fields,
  modseq: Schema.optionalKey(Schema.String),
});
export type MailSourceDraft = typeof MailSourceDraft.Type;

/** A stored approval without its MIME bytes, which only `beginSubmit` hands out. */
export const MailSendApprovalRecord = Schema.Struct({
  id: Schema.String,
  environmentId: Schema.String,
  projectId: Schema.String,
  threadId: Schema.String,
  accountId: Schema.String,
  snapshot: Schema.fromJsonString(MailSendSnapshot),
  digest: Schema.String,
  sourceDraft: Schema.NullOr(Schema.fromJsonString(MailSourceDraft)),
  status: MailSendApprovalStatus,
  error: Schema.NullOr(Schema.fromJsonString(MailSendApprovalError)),
  createdAt: Schema.String,
  expiresAt: Schema.String,
  decidedAt: Schema.NullOr(Schema.String),
  completedAt: Schema.NullOr(Schema.String),
  sentLinksSavedAt: Schema.NullOr(Schema.String),
});
export type MailSendApprovalRecord = typeof MailSendApprovalRecord.Type;

const encodeSnapshot = Schema.encodeSync(Schema.fromJsonString(MailSendSnapshot));
const encodeRef = Schema.encodeSync(Schema.fromJsonString(MailSourceDraft));
const encodeError = Schema.encodeSync(Schema.fromJsonString(MailSendApprovalError));

const ClaimedRow = Schema.Struct({ ...MailSendApprovalRecord.fields, mime: Schema.Uint8Array });
export type ClaimedMailSendApproval = typeof ClaimedRow.Type;

export interface InsertPendingMailSendApproval {
  readonly id: string;
  readonly environmentId: string;
  readonly projectId: string;
  readonly threadId: string;
  readonly accountId: string;
  readonly snapshot: MailSendSnapshot;
  readonly mime: Uint8Array;
  readonly digest: string;
  readonly sourceDraft: MailSourceDraft | null;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export type MailSendApprovalInvalidation =
  | { readonly id: string }
  | { readonly accountId: string; readonly projectId?: string };

export type MailSendOutcome = "accepted" | "failed" | "outcome_unknown";

/**
 * Durable send approvals. Every transition is a single conditional UPDATE, so a pending row can be
 * claimed for submission exactly once no matter how many clients approve at the same time.
 */
export class MailSendApprovalRepository extends Context.Service<
  MailSendApprovalRepository,
  {
    readonly insertPending: (
      input: InsertPendingMailSendApproval,
    ) => Effect.Effect<void, MailSendApprovalRepositoryError>;
    /** Links and completion marker commit together, so later unlinks stay removed. */
    readonly saveAcceptedLinks: (
      id: string,
      at: string,
      persist: Effect.Effect<void, WorkspaceLinksError>,
    ) => Effect.Effect<void, MailSendApprovalRepositoryError | WorkspaceLinksError>;
    readonly get: (
      id: string,
    ) => Effect.Effect<Option.Option<MailSendApprovalRecord>, MailSendApprovalRepositoryError>;
    readonly listForThread: (
      threadId: string,
    ) => Effect.Effect<ReadonlyArray<MailSendApprovalRecord>, MailSendApprovalRepositoryError>;
    /** Claims a pending, unexpired row whose digest matches. Returns the stored bytes on success. */
    readonly beginSubmit: (input: {
      readonly id: string;
      readonly digest: string;
      readonly now: string;
    }) => Effect.Effect<Option.Option<ClaimedMailSendApproval>, MailSendApprovalRepositoryError>;
    readonly complete: (input: {
      readonly id: string;
      readonly status: MailSendOutcome;
      readonly error?: { readonly code: string; readonly message: string };
      readonly now: string;
    }) => Effect.Effect<void, MailSendApprovalRepositoryError>;
    readonly decline: (input: {
      readonly id: string;
      readonly now: string;
    }) => Effect.Effect<Option.Option<MailSendApprovalRecord>, MailSendApprovalRepositoryError>;
    /** Marks matching pending rows invalidated and returns them. */
    readonly invalidate: (
      filter: MailSendApprovalInvalidation,
      now: string,
    ) => Effect.Effect<ReadonlyArray<MailSendApprovalRecord>, MailSendApprovalRepositoryError>;
    /** Invalidates earlier pending rows for the same thread and account before a new prepare. */
    readonly supersedeForThread: (input: {
      readonly threadId: string;
      readonly accountId: string;
      readonly now: string;
    }) => Effect.Effect<ReadonlyArray<MailSendApprovalRecord>, MailSendApprovalRepositoryError>;
    /**
     * Startup recovery: a row still `submitting` may have reached the server, so it becomes
     * `outcome_unknown` and is never retried. Expired pending rows become `expired`.
     */
    readonly sweepAfterRestart: (
      now: string,
    ) => Effect.Effect<
      { readonly outcomeUnknown: number; readonly expired: number },
      MailSendApprovalRepositoryError
    >;
  }
>()("t3/persistence/MailSendApprovals/MailSendApprovalRepository") {}

const toError = (operation: string) => (cause: unknown) =>
  Schema.isSchemaError(cause)
    ? PersistenceDecodeError.fromSchemaError(operation, cause)
    : new PersistenceSqlError({ operation, cause });

const INTERRUPTED_ERROR = encodeError({
  code: "interrupted",
  message: "The server stopped while this message was being submitted.",
});

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const columns = sql`
    id AS "id",
    environment_id AS "environmentId",
    project_id AS "projectId",
    thread_id AS "threadId",
    account_id AS "accountId",
    snapshot_json AS "snapshot",
    digest AS "digest",
    source_draft_json AS "sourceDraft",
    status AS "status",
    error_json AS "error",
    created_at AS "createdAt",
    expires_at AS "expiresAt",
    decided_at AS "decidedAt",
    completed_at AS "completedAt",
    sent_links_saved_at AS "sentLinksSavedAt"
  `;

  const getRow = SqlSchema.findOneOption({
    Request: Schema.String,
    Result: MailSendApprovalRecord,
    execute: (id) => sql`SELECT ${columns} FROM mail_send_approvals WHERE id = ${id}`,
  });

  const listRows = SqlSchema.findAll({
    Request: Schema.String,
    Result: MailSendApprovalRecord,
    execute: (threadId) => sql`
      SELECT ${columns} FROM mail_send_approvals
      WHERE thread_id = ${threadId}
      ORDER BY created_at DESC
      LIMIT 50
    `,
  });

  const claimRow = SqlSchema.findOneOption({
    Request: Schema.Struct({ id: Schema.String, digest: Schema.String, now: Schema.String }),
    Result: ClaimedRow,
    execute: ({ id, digest, now }) => sql`
      UPDATE mail_send_approvals
      SET status = 'submitting', decided_at = ${now}
      WHERE id = ${id}
        AND status = 'pending'
        AND digest = ${digest}
        AND expires_at > ${now}
      RETURNING ${columns}, mime_blob AS "mime"
    `,
  });

  const declineRow = SqlSchema.findOneOption({
    Request: Schema.Struct({ id: Schema.String, now: Schema.String }),
    Result: MailSendApprovalRecord,
    execute: ({ id, now }) => sql`
      UPDATE mail_send_approvals
      SET status = 'declined', decided_at = ${now}
      WHERE id = ${id} AND status = 'pending' AND expires_at > ${now}
      RETURNING ${columns}
    `,
  });

  const invalidateRows = SqlSchema.findAll({
    Request: Schema.Struct({
      now: Schema.String,
      id: Schema.NullOr(Schema.String),
      accountId: Schema.NullOr(Schema.String),
      projectId: Schema.NullOr(Schema.String),
      threadId: Schema.NullOr(Schema.String),
    }),
    Result: MailSendApprovalRecord,
    execute: ({ now, id, accountId, projectId, threadId }) => sql`
      UPDATE mail_send_approvals
      SET status = 'invalidated', decided_at = ${now}
      WHERE status = 'pending'
        AND (${id} IS NULL OR id = ${id})
        AND (${accountId} IS NULL OR account_id = ${accountId})
        AND (${projectId} IS NULL OR project_id = ${projectId})
        AND (${threadId} IS NULL OR thread_id = ${threadId})
      RETURNING ${columns}
    `,
  });

  const invalidate = (
    filter: {
      id?: string | undefined;
      accountId?: string | undefined;
      projectId?: string | undefined;
      threadId?: string | undefined;
    },
    now: string,
  ) =>
    invalidateRows({
      now,
      id: filter.id ?? null,
      accountId: filter.accountId ?? null,
      projectId: filter.projectId ?? null,
      threadId: filter.threadId ?? null,
    }).pipe(Effect.mapError(toError("invalidateMailSendApprovals")));

  return MailSendApprovalRepository.of({
    insertPending: (input) =>
      sql`
        INSERT INTO mail_send_approvals (
          id, environment_id, project_id, thread_id, account_id, snapshot_json, mime_blob,
          digest, source_draft_json, status, error_json, created_at, expires_at
        )
        VALUES (
          ${input.id}, ${input.environmentId}, ${input.projectId}, ${input.threadId},
          ${input.accountId}, ${encodeSnapshot(input.snapshot)}, ${input.mime}, ${input.digest},
          ${input.sourceDraft === null ? null : encodeRef(input.sourceDraft)}, 'pending', NULL,
          ${input.createdAt}, ${input.expiresAt}
        )
      `.pipe(Effect.asVoid, Effect.mapError(toError("insertMailSendApproval"))),

    saveAcceptedLinks: (id, at, persist) =>
      sql
        .withTransaction(
          Effect.gen(function* () {
            const rows = yield* sql<{
              status: string;
              saved: string | null;
            }>`SELECT status, sent_links_saved_at AS saved FROM mail_send_approvals WHERE id = ${id}`;
            if (rows[0]?.status !== "accepted" || rows[0].saved !== null) return;
            yield* persist;
            yield* sql`UPDATE mail_send_approvals SET sent_links_saved_at = ${at} WHERE id = ${id} AND status = 'accepted'`;
          }),
        )
        .pipe(
          Effect.mapError((error) =>
            error._tag === "WorkspaceLinksError" ? error : toError("saveAcceptedMailLinks")(error),
          ),
        ),

    get: (id) => getRow(id).pipe(Effect.mapError(toError("getMailSendApproval"))),

    listForThread: (threadId) =>
      listRows(threadId).pipe(Effect.mapError(toError("listMailSendApprovals"))),

    beginSubmit: (input) => claimRow(input).pipe(Effect.mapError(toError("beginMailSubmit"))),

    complete: ({ id, status, error, now }) =>
      sql`
        UPDATE mail_send_approvals
        SET status = ${status},
            error_json = ${error === undefined ? null : encodeError(error)},
            completed_at = ${now}
        WHERE id = ${id} AND status = 'submitting'
      `.pipe(Effect.asVoid, Effect.mapError(toError("completeMailSubmit"))),

    decline: (input) => declineRow(input).pipe(Effect.mapError(toError("declineMailSend"))),

    invalidate: (filter, now) => invalidate(filter, now),

    supersedeForThread: ({ threadId, accountId, now }) => invalidate({ threadId, accountId }, now),

    sweepAfterRestart: (now) =>
      sql
        .withTransaction(
          Effect.gen(function* () {
            const unknown = yield* sql<{ id: string }>`
              UPDATE mail_send_approvals
              SET status = 'outcome_unknown',
                  error_json = ${INTERRUPTED_ERROR},
                  completed_at = ${now}
              WHERE status = 'submitting'
              RETURNING id
            `;
            const expired = yield* sql<{ id: string }>`
              UPDATE mail_send_approvals
              SET status = 'expired', decided_at = ${now}
              WHERE status = 'pending' AND expires_at <= ${now}
              RETURNING id
            `;
            return { outcomeUnknown: unknown.length, expired: expired.length };
          }),
        )
        .pipe(Effect.mapError(toError("sweepMailSendApprovals"))),
  });
});

export const layer = Layer.effect(MailSendApprovalRepository, make);
