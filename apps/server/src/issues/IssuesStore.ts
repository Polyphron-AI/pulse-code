import type {
  IssueId,
  IssueProjectMapping,
  IssueThreadLink,
  ProjectId,
  PulseProjectId,
  ThreadId,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { type PersistenceSqlError, toPersistenceSqlError } from "../persistence/Errors.ts";

export interface IssueConnectionConfig {
  readonly endpoint: string;
  readonly updatedAt: string;
}

/** Public mapping data plus the non-secret ingest key used only by the server capture path. */
export interface StoredIssueProjectMapping extends IssueProjectMapping {
  readonly ingestPublicKey: string;
}

export interface SetIssueProjectMappingInput {
  readonly projectId: ProjectId;
  readonly pulseProjectId: PulseProjectId;
  readonly pulseProjectName: string;
  readonly pulseProjectSlug: string;
  readonly ingestPublicKey: string;
  readonly updatedAt: string;
}

export interface SetIssueThreadLinkInput {
  readonly projectId: ProjectId;
  readonly pulseProjectId: PulseProjectId;
  readonly issueId: IssueId;
  readonly threadId: ThreadId;
  readonly now: string;
}

export class IssuesStore extends Context.Service<
  IssuesStore,
  {
    readonly getConnection: () => Effect.Effect<
      Option.Option<IssueConnectionConfig>,
      PersistenceSqlError
    >;
    readonly setConnection: (
      input: IssueConnectionConfig,
    ) => Effect.Effect<void, PersistenceSqlError>;
    /** Removes endpoint and project mappings. Historical thread links intentionally survive. */
    readonly clearConnection: () => Effect.Effect<void, PersistenceSqlError>;
    readonly listMappings: () => Effect.Effect<
      ReadonlyArray<StoredIssueProjectMapping>,
      PersistenceSqlError
    >;
    readonly getMapping: (
      projectId: ProjectId,
    ) => Effect.Effect<Option.Option<StoredIssueProjectMapping>, PersistenceSqlError>;
    readonly setMapping: (
      input: SetIssueProjectMappingInput,
    ) => Effect.Effect<StoredIssueProjectMapping, PersistenceSqlError>;
    readonly removeMapping: (projectId: ProjectId) => Effect.Effect<boolean, PersistenceSqlError>;
    readonly getLinkForIssue: (input: {
      readonly projectId: ProjectId;
      readonly issueId: IssueId;
    }) => Effect.Effect<Option.Option<IssueThreadLink>, PersistenceSqlError>;
    readonly getLinkForThread: (
      threadId: ThreadId,
    ) => Effect.Effect<Option.Option<IssueThreadLink>, PersistenceSqlError>;
    readonly setLink: (
      input: SetIssueThreadLinkInput,
    ) => Effect.Effect<IssueThreadLink, PersistenceSqlError>;
    readonly removeLinkForIssue: (input: {
      readonly projectId: ProjectId;
      readonly issueId: IssueId;
    }) => Effect.Effect<boolean, PersistenceSqlError>;
    readonly removeLinkForThread: (
      threadId: ThreadId,
    ) => Effect.Effect<boolean, PersistenceSqlError>;
  }
>()("t3/issues/IssuesStore") {}

interface ConnectionRow {
  readonly endpoint: string;
  readonly updatedAt: string;
}

interface MappingRow {
  readonly projectId: ProjectId;
  readonly pulseProjectId: PulseProjectId;
  readonly pulseProjectName: string;
  readonly pulseProjectSlug: string;
  readonly ingestPublicKey: string;
  readonly updatedAt: string;
}

interface LinkRow {
  readonly projectId: ProjectId;
  readonly issueId: IssueId;
  readonly threadId: ThreadId;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const firstOption = <A>(rows: ReadonlyArray<A>): Option.Option<A> =>
  rows[0] === undefined ? Option.none() : Option.some(rows[0]);

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const getConnection: IssuesStore["Service"]["getConnection"] = () =>
    sql<ConnectionRow>`
      SELECT endpoint, updated_at AS "updatedAt"
      FROM pulse_issue_connection
      WHERE singleton_key = 1
    `.pipe(
      Effect.map(firstOption),
      Effect.mapError(toPersistenceSqlError("IssuesStore.getConnection")),
    );

  const setConnection: IssuesStore["Service"]["setConnection"] = ({ endpoint, updatedAt }) =>
    sql`
      INSERT INTO pulse_issue_connection(singleton_key, endpoint, updated_at)
      VALUES (1, ${endpoint}, ${updatedAt})
      ON CONFLICT(singleton_key)
      DO UPDATE SET endpoint = excluded.endpoint, updated_at = excluded.updated_at
    `.pipe(Effect.asVoid, Effect.mapError(toPersistenceSqlError("IssuesStore.setConnection")));

  const clearConnection: IssuesStore["Service"]["clearConnection"] = () =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          yield* sql`DELETE FROM pulse_issue_project_mappings`;
          yield* sql`DELETE FROM pulse_issue_connection WHERE singleton_key = 1`;
        }),
      )
      .pipe(Effect.mapError(toPersistenceSqlError("IssuesStore.clearConnection")));

  const mappingSelect = sql<MappingRow>`
    SELECT
      project_id AS "projectId",
      pulse_project_id AS "pulseProjectId",
      pulse_project_name AS "pulseProjectName",
      pulse_project_slug AS "pulseProjectSlug",
      ingest_public_key AS "ingestPublicKey",
      updated_at AS "updatedAt"
    FROM pulse_issue_project_mappings
  `;

  const listMappings: IssuesStore["Service"]["listMappings"] = () =>
    sql<MappingRow>`
      ${mappingSelect}
      ORDER BY project_id ASC
    `.pipe(Effect.mapError(toPersistenceSqlError("IssuesStore.listMappings")));

  const getMapping: IssuesStore["Service"]["getMapping"] = (projectId) =>
    sql<MappingRow>`
      ${mappingSelect}
      WHERE project_id = ${projectId}
    `.pipe(
      Effect.map(firstOption),
      Effect.mapError(toPersistenceSqlError("IssuesStore.getMapping")),
    );

  const setMapping: IssuesStore["Service"]["setMapping"] = (input) => {
    const mapping: StoredIssueProjectMapping = { ...input };
    return sql`
      INSERT INTO pulse_issue_project_mappings(
        project_id,
        pulse_project_id,
        pulse_project_name,
        pulse_project_slug,
        ingest_public_key,
        updated_at
      )
      VALUES (
        ${input.projectId},
        ${input.pulseProjectId},
        ${input.pulseProjectName},
        ${input.pulseProjectSlug},
        ${input.ingestPublicKey},
        ${input.updatedAt}
      )
      ON CONFLICT(project_id)
      DO UPDATE SET
        pulse_project_id = excluded.pulse_project_id,
        pulse_project_name = excluded.pulse_project_name,
        pulse_project_slug = excluded.pulse_project_slug,
        ingest_public_key = excluded.ingest_public_key,
        updated_at = excluded.updated_at
    `.pipe(Effect.as(mapping), Effect.mapError(toPersistenceSqlError("IssuesStore.setMapping")));
  };

  const removeMapping: IssuesStore["Service"]["removeMapping"] = (projectId) =>
    sql<{ readonly projectId: ProjectId }>`
      DELETE FROM pulse_issue_project_mappings
      WHERE project_id = ${projectId}
      RETURNING project_id AS "projectId"
    `.pipe(
      Effect.map((rows) => rows.length > 0),
      Effect.mapError(toPersistenceSqlError("IssuesStore.removeMapping")),
    );

  const linkSelect = sql<LinkRow>`
    SELECT
      project_id AS "projectId",
      issue_id AS "issueId",
      thread_id AS "threadId",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM pulse_issue_thread_links
  `;

  const getLinkForIssue: IssuesStore["Service"]["getLinkForIssue"] = ({ projectId, issueId }) =>
    sql<LinkRow>`
      ${linkSelect}
      WHERE project_id = ${projectId} AND issue_id = ${issueId}
    `.pipe(
      Effect.map(firstOption),
      Effect.mapError(toPersistenceSqlError("IssuesStore.getLinkForIssue")),
    );

  const getLinkForThread: IssuesStore["Service"]["getLinkForThread"] = (threadId) =>
    sql<LinkRow>`
      ${linkSelect}
      WHERE thread_id = ${threadId}
    `.pipe(
      Effect.map(firstOption),
      Effect.mapError(toPersistenceSqlError("IssuesStore.getLinkForThread")),
    );

  const setLink: IssuesStore["Service"]["setLink"] = (input) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          const existing = yield* sql<LinkRow>`
            ${linkSelect}
            WHERE project_id = ${input.projectId} AND issue_id = ${input.issueId}
          `;
          const createdAt = existing[0]?.createdAt ?? input.now;
          // A thread implements at most one Issue. Relinking it is an explicit replacement.
          yield* sql`
            DELETE FROM pulse_issue_thread_links
            WHERE thread_id = ${input.threadId}
              AND NOT (project_id = ${input.projectId} AND issue_id = ${input.issueId})
          `;
          yield* sql`
            INSERT INTO pulse_issue_thread_links(
              project_id,
              pulse_project_id,
              issue_id,
              thread_id,
              created_at,
              updated_at
            )
            VALUES (
              ${input.projectId},
              ${input.pulseProjectId},
              ${input.issueId},
              ${input.threadId},
              ${createdAt},
              ${input.now}
            )
            ON CONFLICT(project_id, issue_id)
            DO UPDATE SET
              pulse_project_id = excluded.pulse_project_id,
              thread_id = excluded.thread_id,
              updated_at = excluded.updated_at
          `;
          return {
            projectId: input.projectId,
            issueId: input.issueId,
            threadId: input.threadId,
            createdAt,
            updatedAt: input.now,
          } satisfies IssueThreadLink;
        }),
      )
      .pipe(Effect.mapError(toPersistenceSqlError("IssuesStore.setLink")));

  const removeLinkForIssue: IssuesStore["Service"]["removeLinkForIssue"] = ({
    projectId,
    issueId,
  }) =>
    sql<{ readonly issueId: IssueId }>`
      DELETE FROM pulse_issue_thread_links
      WHERE project_id = ${projectId} AND issue_id = ${issueId}
      RETURNING issue_id AS "issueId"
    `.pipe(
      Effect.map((rows) => rows.length > 0),
      Effect.mapError(toPersistenceSqlError("IssuesStore.removeLinkForIssue")),
    );

  const removeLinkForThread: IssuesStore["Service"]["removeLinkForThread"] = (threadId) =>
    sql<{ readonly threadId: ThreadId }>`
      DELETE FROM pulse_issue_thread_links
      WHERE thread_id = ${threadId}
      RETURNING thread_id AS "threadId"
    `.pipe(
      Effect.map((rows) => rows.length > 0),
      Effect.mapError(toPersistenceSqlError("IssuesStore.removeLinkForThread")),
    );

  return {
    getConnection,
    setConnection,
    clearConnection,
    listMappings,
    getMapping,
    setMapping,
    removeMapping,
    getLinkForIssue,
    getLinkForThread,
    setLink,
    removeLinkForIssue,
    removeLinkForThread,
  } satisfies IssuesStore["Service"];
});

export const layer = Layer.effect(IssuesStore, make);
