import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`CREATE TABLE telegram_connections (id TEXT PRIMARY KEY, bot_id TEXT NOT NULL, username TEXT NOT NULL, title TEXT NOT NULL, connected INTEGER NOT NULL, next_offset INTEGER NOT NULL DEFAULT 0, generation INTEGER NOT NULL DEFAULT 1, error TEXT, pairing_failures INTEGER NOT NULL DEFAULT 0, pairing_window INTEGER NOT NULL DEFAULT 0)`;
  yield* sql`CREATE TABLE telegram_chats (connection_id TEXT NOT NULL, chat_id TEXT NOT NULL, chat_type TEXT NOT NULL, title TEXT NOT NULL, paired_user_id TEXT NOT NULL, paired_user_label TEXT NOT NULL, active INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (connection_id, chat_id))`;
  yield* sql`CREATE TABLE telegram_messages (connection_id TEXT NOT NULL, chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, sender_label TEXT NOT NULL, text TEXT NOT NULL, sent_at INTEGER NOT NULL, edited INTEGER NOT NULL, PRIMARY KEY (connection_id, chat_id, message_id))`;
  yield* sql`CREATE TABLE telegram_pairing_codes (connection_id TEXT NOT NULL, code_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY (connection_id, code_hash))`;
  yield* sql`CREATE INDEX telegram_message_page ON telegram_messages (connection_id, chat_id, message_id DESC)`;
});
