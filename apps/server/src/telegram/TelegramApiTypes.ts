import * as Schema from "effect/Schema";

/**
 * The subset of Telegram Bot API objects the server reads. Unknown fields are
 * ignored on decode, so Telegram can add fields without breaking us.
 */
export const TgUser = Schema.Struct({
  id: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
  ),
  is_bot: Schema.Boolean,
  first_name: Schema.String,
  last_name: Schema.optionalKey(Schema.String),
  username: Schema.optionalKey(Schema.String),
});
export type TgUser = typeof TgUser.Type;

export const TgChat = Schema.Struct({
  id: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
  ),
  type: Schema.String,
  title: Schema.optionalKey(Schema.String),
  username: Schema.optionalKey(Schema.String),
  first_name: Schema.optionalKey(Schema.String),
  last_name: Schema.optionalKey(Schema.String),
});
export type TgChat = typeof TgChat.Type;

export const TgMessage = Schema.Struct({
  message_id: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
  ),
  date: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
  ),
  chat: TgChat,
  from: Schema.optionalKey(TgUser),
  text: Schema.optionalKey(Schema.String),
  caption: Schema.optionalKey(Schema.String),
  // Media markers only; the module never reads their contents.
  photo: Schema.optionalKey(Schema.Unknown),
  video: Schema.optionalKey(Schema.Unknown),
  voice: Schema.optionalKey(Schema.Unknown),
  audio: Schema.optionalKey(Schema.Unknown),
  document: Schema.optionalKey(Schema.Unknown),
  sticker: Schema.optionalKey(Schema.Unknown),
  reply_to_message: Schema.optionalKey(
    Schema.Struct({
      message_id: Schema.Number.check(
        Schema.isInt(),
        Schema.isBetween({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
      ),
      chat: Schema.optionalKey(TgChat),
    }),
  ),
});
export type TgMessage = typeof TgMessage.Type;

export const TgCallbackQuery = Schema.Struct({
  id: Schema.String,
  from: TgUser,
  message: Schema.optionalKey(TgMessage),
  data: Schema.optionalKey(Schema.String),
});
export type TgCallbackQuery = typeof TgCallbackQuery.Type;

export const TgChatMemberUpdated = Schema.Struct({
  chat: TgChat,
  from: TgUser,
  date: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
  ),
  new_chat_member: Schema.Struct({ status: Schema.String, user: TgUser }),
});
export type TgChatMemberUpdated = typeof TgChatMemberUpdated.Type;

export const TgUpdate = Schema.Struct({
  update_id: Schema.Number.check(
    Schema.isInt(),
    Schema.isBetween({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
  ),
  message: Schema.optionalKey(TgMessage),
  edited_message: Schema.optionalKey(TgMessage),
  callback_query: Schema.optionalKey(TgCallbackQuery),
  my_chat_member: Schema.optionalKey(TgChatMemberUpdated),
});
export type TgUpdate = typeof TgUpdate.Type;

export const TgWebhookInfo = Schema.Struct({ url: Schema.String });
export type TgWebhookInfo = typeof TgWebhookInfo.Type;

/** Every Bot API response is wrapped in this envelope, success or not. */
export const TgEnvelope = Schema.Struct({
  ok: Schema.Boolean,
  result: Schema.optionalKey(Schema.Unknown),
  description: Schema.optionalKey(Schema.String),
  error_code: Schema.optionalKey(
    Schema.Number.check(
      Schema.isInt(),
      Schema.isBetween({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
    ),
  ),
  parameters: Schema.optionalKey(
    Schema.Struct({
      retry_after: Schema.optionalKey(
        Schema.Number.check(
          Schema.isInt(),
          Schema.isBetween({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER }),
        ),
      ),
    }),
  ),
});
export type TgEnvelope = typeof TgEnvelope.Type;
