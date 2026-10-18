import {
  IsoDateTime,
  normalizeWorkspaceItemRef,
  WorkspaceItemRef,
  workspaceItemKey,
  WorkspaceSavedItemKey,
  WorkspaceSavedItemsError,
  WorkspaceSavedItemsListInput,
  type WorkspaceSavedItemPage,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/** Environment-owned bookmarks. Saving never grants source access; changes follow committed writes. */
export class WorkspaceSavedItems extends Context.Service<
  WorkspaceSavedItems,
  {
    readonly add: (ref: WorkspaceItemRef) => Effect.Effect<void, WorkspaceSavedItemsError>;
    readonly remove: (key: string) => Effect.Effect<void, WorkspaceSavedItemsError>;
    readonly list: (
      input: WorkspaceSavedItemsListInput,
    ) => Effect.Effect<WorkspaceSavedItemPage, WorkspaceSavedItemsError>;
    readonly changes: Stream.Stream<number>;
  }
>()("t3/workspace/WorkspaceSavedItems") {}

const fail = (kind: WorkspaceSavedItemsError["kind"], message: string) =>
  new WorkspaceSavedItemsError({ kind, message });
const isSavedError = Schema.is(WorkspaceSavedItemsError);
const safe = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.tapError((cause) =>
      isSavedError(cause) ? Effect.void : Effect.logWarning("Saved items operation failed.", cause),
    ),
    Effect.mapError((error) =>
      isSavedError(error) ? error : fail("unavailable", "Saved items are unavailable. Try again."),
    ),
  );
const decode = <S extends Schema.Top>(schema: S, input: unknown) =>
  Schema.decodeUnknownEffect(schema)(input).pipe(
    Effect.mapError(() => fail("invalid-input", "Use a valid saved item reference, key or page.")),
  );
const RefJson = Schema.fromJsonString(WorkspaceItemRef);
const encodeRef = Schema.encodeEffect(RefJson);
const StoredItem = Schema.Struct({
  key: WorkspaceSavedItemKey,
  ref: RefJson,
  savedAt: IsoDateTime,
});
const decodeItem = Schema.decodeUnknownOption(StoredItem);

/** Check stored key identity only on the server, including invalid Unicode from older rows. */
const readableItem = (row: { item_key: string; ref_json: string; saved_at: string }) => {
  const decoded = decodeItem({ key: row.item_key, ref: row.ref_json, savedAt: row.saved_at });
  return Option.flatMap(decoded, (item) => {
    const ref = normalizeWorkspaceItemRef(item.ref);
    if (ref === undefined) return Option.none();
    return Option.flatMap(Option.liftThrowable(workspaceItemKey)(ref), (key) =>
      key === item.key ? Option.some({ ...item, ref }) : Option.none(),
    );
  });
};
const CursorJson = Schema.fromJsonString(
  Schema.Struct({
    version: Schema.Literal(1),
    savedAt: Schema.String.check(
      Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      Schema.makeFilter((s) => Option.isSome(DateTime.make(s)) || "Invalid timestamp."),
    ),
    key: WorkspaceSavedItemKey,
  }),
);
const encodeCursor = Schema.encodeEffect(CursorJson);
const parseCursor = Effect.fnUntraced(function* (raw: string) {
  const bytes = Buffer.from(raw, "base64url");
  if (!/^[A-Za-z0-9_-]+$/.test(raw) || bytes.toString("base64url") !== raw)
    return yield* fail("invalid-input", "This saved items cursor is invalid.");
  return yield* decode(CursorJson, bytes.toString("utf8"));
});

export const layer = Layer.effect(
  WorkspaceSavedItems,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const counter = yield* SubscriptionRef.make(0);
    const announce = SubscriptionRef.update(counter, (n) => n + 1);
    return WorkspaceSavedItems.of({
      add: Effect.fn("WorkspaceSavedItems.add")(
        function* (input) {
          const decoded = yield* decode(WorkspaceItemRef, input);
          const ref = normalizeWorkspaceItemRef(decoded);
          if (ref === undefined) return yield* fail("invalid-input", "This item cannot be saved.");
          const key = yield* Effect.try({
            try: () => workspaceItemKey(ref),
            catch: () => fail("invalid-input", "This item cannot be saved."),
          });
          const json = yield* encodeRef(ref);
          const now = DateTime.formatIso(yield* DateTime.now);
          const hasLocation =
            ref.type === "mail" && ref.messageId !== undefined && ref.location !== undefined;
          const onConflict = hasLocation
            ? sql`DO UPDATE SET ref_json=excluded.ref_json WHERE workspace_saved_items.ref_json<>excluded.ref_json`
            : sql`DO NOTHING`;
          const changed = yield* sql.withTransaction(
            Effect.gen(function* () {
              const rows = yield* sql`
                INSERT INTO workspace_saved_items(item_key, ref_json, saved_at)
                SELECT ${key}, ${json}, ${now}
                WHERE (SELECT COUNT(*) FROM workspace_saved_items) < 500
                  OR EXISTS(SELECT 1 FROM workspace_saved_items WHERE item_key=${key})
                ON CONFLICT(item_key) ${onConflict}
                RETURNING item_key`;
              if (rows.length > 0) return true;
              const existing =
                yield* sql`SELECT 1 FROM workspace_saved_items WHERE item_key=${key}`;
              if (existing.length === 0)
                return yield* fail(
                  "limit",
                  "You can save up to 500 items. Remove one before saving another.",
                );
              return false;
            }),
          );
          if (changed) yield* announce;
        },
        Effect.uninterruptible,
        safe,
      ),
      remove: Effect.fn("WorkspaceSavedItems.remove")(
        function* (input) {
          const key = yield* decode(WorkspaceSavedItemKey, input);
          const removed =
            yield* sql`DELETE FROM workspace_saved_items WHERE item_key=${key} RETURNING item_key`;
          if (removed.length > 0) yield* announce;
        },
        Effect.uninterruptible,
        safe,
      ),
      list: Effect.fn("WorkspaceSavedItems.list")(function* (input) {
        const page = yield* decode(WorkspaceSavedItemsListInput, input);
        const cursor = page.cursor === undefined ? undefined : yield* parseCursor(page.cursor);
        // Ref field limits and 100 rows bound pages; there is no separate byte cap.
        const limit = page.limit ?? 100;
        const rows = yield* sql<{ item_key: string; ref_json: string; saved_at: string }>`
        SELECT item_key, ref_json, saved_at FROM workspace_saved_items
        WHERE ${cursor === undefined ? sql`1=1` : sql`(saved_at<${cursor.savedAt} OR (saved_at=${cursor.savedAt} AND item_key>${cursor.key}))`}
        ORDER BY saved_at DESC, item_key ASC LIMIT ${limit + 1}`;
        const rawPage = rows.slice(0, limit);
        const readable = yield* Effect.forEach(
          rawPage,
          (row): Effect.Effect<ReturnType<typeof readableItem>> => {
            const item = readableItem(row);
            return Option.isSome(item)
              ? Effect.succeed(item)
              : Effect.logWarning("Skipping a saved item row that could not be read.", {
                  itemKey: row.item_key,
                }).pipe(Effect.as(item));
          },
        );
        const items = readable.flatMap((item) => (Option.isSome(item) ? [item.value] : []));
        // Advance past skipped rows, including a page with no readable items.
        const last = rawPage.at(-1);
        return {
          items,
          ...(rows.length > limit && last !== undefined
            ? {
                nextCursor: Buffer.from(
                  yield* encodeCursor({ version: 1, savedAt: last.saved_at, key: last.item_key }),
                  "utf8",
                ).toString("base64url"),
              }
            : {}),
        };
      }, safe),
      // Emit the current committed revision on subscribe, including after a server restart.
      changes: SubscriptionRef.changes(counter),
    });
  }),
);
