import { CommunicationsError, type CommunicationConnection } from "@t3tools/contracts";
import { Context, Effect, Layer, Schema } from "effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

interface Account extends CommunicationConnection {
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly scopes: ReadonlyArray<string>;
  readonly isBot: boolean;
}
interface Row {
  id: string;
  workspace_id: string;
  subject_id: string;
  identity: string;
  label: string;
  connected: number;
  generation: number;
  error: string | null;
  scopes_json: string;
  is_bot: number;
}
const ScopesJson = Schema.fromJsonString(Schema.Array(Schema.String));
const decodeScopes = Schema.decodeEffect(ScopesJson);
const encodeScopes = Schema.encodeEffect(ScopesJson);
const account = (row: Row) =>
  decodeScopes(row.scopes_json).pipe(
    Effect.map((scopes): Account => ({
      id: row.id,
      provider: "slack",
      workspaceId: row.workspace_id,
      subjectId: row.subject_id,
      identity: row.identity,
      label: row.label,
      connected: row.connected === 1,
      generation: row.generation,
      scopes,
      isBot: row.is_bot === 1,
      ...(row.error === null ? {} : { error: row.error }),
    })),
  );
const unavailable = () =>
  new CommunicationsError({
    kind: "unavailable",
    message: "Slack connection storage is unavailable.",
  });

/** Metadata only. Credentials belong to ServerSecretStore. */
export class SlackAccountStore extends Context.Service<
  SlackAccountStore,
  {
    readonly list: Effect.Effect<ReadonlyArray<Account>, CommunicationsError>;
    readonly get: (id: string) => Effect.Effect<Account | undefined, CommunicationsError>;
    readonly find: (
      workspaceId: string,
      subjectId: string,
    ) => Effect.Effect<Account | undefined, CommunicationsError>;
    readonly save: (account: Account) => Effect.Effect<void, CommunicationsError>;
    readonly disconnect: (id: string) => Effect.Effect<void, CommunicationsError>;
    readonly setError: (id: string, message: string) => Effect.Effect<void, CommunicationsError>;
  }
>()("t3/communications/SlackAccountStore") {}

export const layer = Layer.effect(
  SlackAccountStore,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    return SlackAccountStore.of({
      list: sql<Row>`SELECT * FROM slack_connections ORDER BY id`.pipe(
        Effect.flatMap((rows) => Effect.forEach(rows, account)),
        Effect.mapError(unavailable),
      ),
      get: (id) =>
        sql<Row>`SELECT * FROM slack_connections WHERE id=${id}`.pipe(
          Effect.flatMap((rows) =>
            rows[0] === undefined ? Effect.succeed(undefined) : account(rows[0]),
          ),
          Effect.mapError(unavailable),
        ),
      find: (workspaceId, subjectId) =>
        sql<Row>`SELECT * FROM slack_connections WHERE workspace_id=${workspaceId} AND subject_id=${subjectId}`.pipe(
          Effect.flatMap((rows) =>
            rows[0] === undefined ? Effect.succeed(undefined) : account(rows[0]),
          ),
          Effect.mapError(unavailable),
        ),
      save: Effect.fnUntraced(function* (value) {
        const scopes = yield* encodeScopes(value.scopes);
        yield* sql`INSERT INTO slack_connections(id,workspace_id,subject_id,identity,label,connected,generation,error,scopes_json,is_bot)
          VALUES(${value.id},${value.workspaceId},${value.subjectId},${value.identity},${value.label},${value.connected ? 1 : 0},${value.generation},${value.error ?? null},${scopes},${value.isBot ? 1 : 0})
          ON CONFLICT(id) DO UPDATE SET identity=excluded.identity,label=excluded.label,connected=excluded.connected,generation=excluded.generation,error=excluded.error,scopes_json=excluded.scopes_json,is_bot=excluded.is_bot`;
      }, Effect.mapError(unavailable)),
      disconnect: (id) =>
        sql`UPDATE slack_connections SET connected=0,generation=generation+1,error=NULL WHERE id=${id}`.pipe(
          Effect.asVoid,
          Effect.mapError(unavailable),
        ),
      setError: (id, message) =>
        sql`UPDATE slack_connections SET error=${message} WHERE id=${id}`.pipe(
          Effect.asVoid,
          Effect.mapError(unavailable),
        ),
    });
  }),
);
