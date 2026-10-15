import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";

import {
  WorkspaceItemRef,
  WorkspaceLinkId,
  WorkspaceLinkOrigin,
  WorkspaceLinkSource,
  type WorkspaceLinkEndpoint,
} from "@t3tools/contracts";

import {
  PersistenceDecodeError,
  PersistenceSqlError,
  type WorkspaceLinksRepositoryError,
} from "./Errors.ts";

/** How many links one item's list carries; past this the list says it was cut. */
export const MAX_LINKS_PER_ITEM = 200;
/** How many confirmed links a thread and its project contribute to agent context reads. */
export const MAX_CONTEXT_LINKS = 100;

export interface StoredWorkspaceLinkSide {
  readonly key: string;
  readonly endpoint: WorkspaceLinkEndpoint;
}

export interface StoredWorkspaceLink {
  readonly id: WorkspaceLinkId;
  readonly a: StoredWorkspaceLinkSide;
  readonly b: StoredWorkspaceLinkSide;
  readonly status: "confirmed" | "suggested" | "dismissed";
  readonly source: WorkspaceLinkSource;
  readonly origin: WorkspaceLinkOrigin | undefined;
  readonly updatedAt: string;
}

export interface StoredWorkspaceLinkPage {
  readonly links: ReadonlyArray<StoredWorkspaceLink>;
  readonly truncated: boolean;
}

/**
 * The link record. One row per unordered pair of item keys, never deleted: unlink marks the row
 * dismissed so a later link keeps its first origin.
 */
export class WorkspaceLinksRepository extends Context.Service<
  WorkspaceLinksRepository,
  {
    readonly confirm: (input: {
      readonly id: WorkspaceLinkId;
      readonly first: StoredWorkspaceLinkSide;
      readonly second: StoredWorkspaceLinkSide;
      readonly source: WorkspaceLinkSource;
      readonly origin: WorkspaceLinkOrigin;
      readonly now: string;
    }) => Effect.Effect<StoredWorkspaceLink, WorkspaceLinksRepositoryError>;
    readonly unlink: (
      id: WorkspaceLinkId,
      now: string,
    ) => Effect.Effect<Option.Option<StoredWorkspaceLink>, WorkspaceLinksRepositoryError>;
    readonly listFor: (
      key: string,
    ) => Effect.Effect<StoredWorkspaceLinkPage, WorkspaceLinksRepositoryError>;
    readonly confirmedFor: (
      keys: ReadonlyArray<string>,
    ) => Effect.Effect<StoredWorkspaceLinkPage, WorkspaceLinksRepositoryError>;
    readonly findConfirmed: (
      ownerKeys: ReadonlyArray<string>,
      otherKey: string,
    ) => Effect.Effect<Option.Option<StoredWorkspaceLink>, WorkspaceLinksRepositoryError>;
  }
>()("t3/persistence/WorkspaceLinks/WorkspaceLinksRepository") {}

const LinkRow = Schema.Struct({
  link_id: Schema.String,
  key_a: Schema.String,
  key_b: Schema.String,
  ref_a_json: Schema.String,
  ref_b_json: Schema.String,
  title_a: Schema.NullOr(Schema.String),
  title_b: Schema.NullOr(Schema.String),
  status: Schema.Literals(["confirmed", "suggested", "dismissed"]),
  source_json: Schema.String,
  origin_json: Schema.NullOr(Schema.String),
  updated_at: Schema.String,
});
type LinkRow = typeof LinkRow.Type;

const RefJson = Schema.fromJsonString(WorkspaceItemRef);
const SourceJson = Schema.fromJsonString(WorkspaceLinkSource);
const OriginJson = Schema.fromJsonString(WorkspaceLinkOrigin);
const decodeRef = Schema.decodeUnknownOption(RefJson);
const decodeSource = Schema.decodeUnknownOption(SourceJson);
const decodeOrigin = Schema.decodeUnknownOption(OriginJson);
const decodeId = Schema.decodeUnknownOption(WorkspaceLinkId);
const encodeRef = Schema.encodeSync(RefJson);
const encodeSource = Schema.encodeSync(SourceJson);
const encodeOrigin = Schema.encodeSync(OriginJson);
const isPersistenceDecodeError = Schema.is(PersistenceDecodeError);

const side = (key: string, refJson: string, title: string | null) =>
  decodeRef(refJson).pipe(
    Option.map((ref): StoredWorkspaceLinkSide => ({
      key,
      endpoint: title === null ? { ref } : { ref, title },
    })),
  );

const toStored = (row: LinkRow): Option.Option<StoredWorkspaceLink> =>
  Option.all({
    id: decodeId(row.link_id),
    a: side(row.key_a, row.ref_a_json, row.title_a),
    b: side(row.key_b, row.ref_b_json, row.title_b),
    source: decodeSource(row.source_json),
  }).pipe(
    Option.flatMap(({ id, a, b, source }): Option.Option<StoredWorkspaceLink> => {
      if (row.origin_json === null) {
        return Option.some({
          id,
          a,
          b,
          source,
          status: row.status,
          origin: undefined,
          updatedAt: row.updated_at,
        });
      }
      return decodeOrigin(row.origin_json).pipe(
        Option.map((origin) => ({
          id,
          a,
          b,
          source,
          status: row.status,
          origin,
          updatedAt: row.updated_at,
        })),
      );
    }),
  );

/** Rows that no longer decode are logged and left out, so one bad row never hides the rest. */
const readable = (rows: ReadonlyArray<LinkRow>) =>
  Effect.forEach(rows, (row): Effect.Effect<Option.Option<StoredWorkspaceLink>> => {
    const link = toStored(row);
    return Option.isSome(link)
      ? Effect.succeed(link)
      : Effect.logWarning("Skipping a workspace link row that could not be read.", {
          linkId: row.link_id,
        }).pipe(Effect.as(link));
  }).pipe(
    Effect.map((links) => links.flatMap((link) => (Option.isSome(link) ? [link.value] : []))),
  );

function toSqlOrDecodeError(sqlOperation: string, decodeOperation: string) {
  return (cause: unknown): WorkspaceLinksRepositoryError => {
    if (isPersistenceDecodeError(cause)) {
      return cause;
    }
    return Schema.isSchemaError(cause)
      ? PersistenceDecodeError.fromSchemaError(decodeOperation, cause)
      : new PersistenceSqlError({ operation: sqlOperation, cause });
  };
}

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const byKeys = SqlSchema.findAll({
    Request: Schema.Struct({ keyA: Schema.String, keyB: Schema.String }),
    Result: LinkRow,
    execute: ({ keyA, keyB }) =>
      sql`SELECT * FROM workspace_links WHERE key_a = ${keyA} AND key_b = ${keyB}`,
  });
  const byId = SqlSchema.findAll({
    Request: Schema.String,
    Result: LinkRow,
    execute: (id) => sql`SELECT * FROM workspace_links WHERE link_id = ${id}`,
  });
  const forKey = SqlSchema.findAll({
    Request: Schema.String,
    Result: LinkRow,
    execute: (key) => sql`
      SELECT * FROM workspace_links
      WHERE (key_a = ${key} OR key_b = ${key}) AND status IN ('confirmed', 'suggested')
      ORDER BY updated_at DESC, link_id
      LIMIT ${MAX_LINKS_PER_ITEM + 1}
    `,
  });
  const confirmedForKeys = SqlSchema.findAll({
    Request: Schema.Array(Schema.String),
    Result: LinkRow,
    execute: (keys) => sql`
      SELECT * FROM workspace_links
      WHERE status = 'confirmed' AND (${sql.in("key_a", keys)} OR ${sql.in("key_b", keys)})
      ORDER BY updated_at DESC, link_id
      LIMIT ${MAX_CONTEXT_LINKS + 1}
    `,
  });
  const confirmedPair = SqlSchema.findAll({
    Request: Schema.Struct({ owners: Schema.Array(Schema.String), other: Schema.String }),
    Result: LinkRow,
    execute: ({ owners, other }) => sql`
      SELECT * FROM workspace_links
      WHERE status = 'confirmed'
        AND ((${sql.in("key_a", owners)} AND key_b = ${other})
          OR (${sql.in("key_b", owners)} AND key_a = ${other}))
      ORDER BY key_a, key_b
      LIMIT ${new Set(owners).size}
    `,
  });

  const page = (rows: ReadonlyArray<LinkRow>, max: number) =>
    readable(rows.slice(0, max)).pipe(
      Effect.map((links) => ({ links, truncated: rows.length > max })),
    );
  const first = (rows: ReadonlyArray<LinkRow>) =>
    readable(rows).pipe(Effect.map((links) => Option.fromNullishOr(links[0])));

  return WorkspaceLinksRepository.of({
    // An existing pair keeps its id, its first origin, and its source while it stays confirmed.
    // Titles keep the latest provided snapshot.
    confirm: (input) => {
      const [a, b] =
        input.first.key < input.second.key
          ? [input.first, input.second]
          : [input.second, input.first];
      return sql
        .withTransaction(
          Effect.gen(function* () {
            yield* sql`
              INSERT INTO workspace_links (
                link_id, key_a, key_b, ref_a_json, ref_b_json, title_a, title_b, status,
                source_json, origin_json, created_at, updated_at
              ) VALUES (
                ${input.id}, ${a.key}, ${b.key}, ${encodeRef(a.endpoint.ref)}, ${encodeRef(b.endpoint.ref)},
                ${a.endpoint.title ?? null}, ${b.endpoint.title ?? null}, 'confirmed',
                ${encodeSource(input.source)}, ${encodeOrigin(input.origin)}, ${input.now}, ${input.now}
              )
              ON CONFLICT (key_a, key_b) DO UPDATE SET
                status = 'confirmed',
                ref_a_json = excluded.ref_a_json,
                ref_b_json = excluded.ref_b_json,
                title_a = COALESCE(excluded.title_a, workspace_links.title_a),
                title_b = COALESCE(excluded.title_b, workspace_links.title_b),
                source_json = CASE WHEN workspace_links.status = 'confirmed'
                  THEN workspace_links.source_json ELSE excluded.source_json END,
                origin_json = COALESCE(workspace_links.origin_json, excluded.origin_json),
                updated_at = excluded.updated_at
            `;
            const rows = yield* byKeys({ keyA: a.key, keyB: b.key });
            const link = yield* first(rows);
            return yield* Option.match(link, {
              onNone: () =>
                Effect.fail(
                  new PersistenceDecodeError({
                    operation: "WorkspaceLink",
                    issue: "A confirmed workspace link could not be read back.",
                  }),
                ),
              onSome: Effect.succeed,
            });
          }),
        )
        .pipe(Effect.mapError(toSqlOrDecodeError("confirmWorkspaceLink", "WorkspaceLink")));
    },

    unlink: (id, now) =>
      sql`
        UPDATE workspace_links SET status = 'dismissed', updated_at = ${now}
        WHERE link_id = ${id} AND status = 'confirmed'
      `.pipe(
        Effect.andThen(byId(id)),
        Effect.flatMap(first),
        Effect.mapError(toSqlOrDecodeError("unlinkWorkspaceLink", "WorkspaceLink")),
      ),

    listFor: (key) =>
      forKey(key).pipe(
        Effect.flatMap((rows) => page(rows, MAX_LINKS_PER_ITEM)),
        Effect.mapError(toSqlOrDecodeError("listWorkspaceLinks", "WorkspaceLink")),
      ),

    confirmedFor: (keys) =>
      keys.length === 0
        ? Effect.succeed({ links: [], truncated: false })
        : confirmedForKeys(keys).pipe(
            Effect.flatMap((rows) => page(rows, MAX_CONTEXT_LINKS)),
            Effect.mapError(toSqlOrDecodeError("confirmedWorkspaceLinks", "WorkspaceLink")),
          ),

    findConfirmed: (ownerKeys, otherKey) =>
      ownerKeys.length === 0
        ? Effect.succeedNone
        : confirmedPair({ owners: ownerKeys, other: otherKey }).pipe(
            Effect.flatMap(first),
            Effect.mapError(toSqlOrDecodeError("findWorkspaceLink", "WorkspaceLink")),
          ),
  });
});

export const layer = Layer.effect(WorkspaceLinksRepository, make);
