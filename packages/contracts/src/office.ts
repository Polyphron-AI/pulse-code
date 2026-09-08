import * as Schema from "effect/Schema";

const Id = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(1024));
const ShortText = Schema.String.check(Schema.isMaxLength(4096));
const Body = Schema.String.check(Schema.isMaxLength(2_000_000));
const Limit = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(100));
export const OfficeProvider = Schema.Literals(["google", "microsoft", "imap"]);
export const OfficeCapability = Schema.Literals(["mail", "calendar"]);
export const OfficeAccount = Schema.Struct({
  id: Id,
  provider: OfficeProvider,
  email: ShortText,
  capabilities: Schema.Array(OfficeCapability),
  status: Schema.Literals(["connected", "expired", "offline"]),
  selectedCalendarIds: Schema.Array(Id),
});
export type OfficeAccount = typeof OfficeAccount.Type;
export const OfficeCalendar = Schema.Struct({
  id: Id,
  accountId: Id,
  name: ShortText,
  selected: Schema.Boolean,
});
export type OfficeCalendar = typeof OfficeCalendar.Type;
export const OfficeEvent = Schema.Struct({
  id: Id,
  accountId: Id,
  calendarId: Id,
  title: ShortText,
  start: ShortText,
  end: ShortText,
  location: Schema.optionalKey(ShortText),
  meetingUrl: Schema.optionalKey(ShortText),
});
export type OfficeEvent = typeof OfficeEvent.Type;
export const OfficeMessage = Schema.Struct({
  id: Id,
  accountId: Id,
  subject: ShortText,
  from: ShortText,
  to: ShortText,
  date: ShortText,
  preview: ShortText,
  unread: Schema.Boolean,
  text: Schema.optionalKey(Body),
});
export type OfficeMessage = typeof OfficeMessage.Type;
export const OfficeDraft = Schema.Struct({
  id: Id,
  accountId: Id,
  to: ShortText,
  subject: ShortText,
  text: Body,
  updatedAt: ShortText,
});
export type OfficeDraft = typeof OfficeDraft.Type;
const AccountInput = { accountId: Id };
const PageInput = {
  ...AccountInput,
  cursor: Schema.optionalKey(Id),
  limit: Schema.optionalKey(Limit),
};
const EventInput = { ...AccountInput, timeMin: ShortText, timeMax: ShortText };
export const OfficeRequest = Schema.Union([
  Schema.Struct({ operation: Schema.Literal("accounts.list") }),
  Schema.Struct({
    operation: Schema.Literal("accounts.connectOAuth"),
    provider: Schema.Literals(["google", "microsoft"]),
    capabilities: Schema.Array(OfficeCapability).check(
      Schema.isMinLength(1),
      Schema.isMaxLength(2),
    ),
  }),
  Schema.Struct({
    operation: Schema.Literal("accounts.connectImap"),
    host: Id,
    port: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(65535)),
    username: Id,
    password: Id,
    tls: Schema.Literals(["implicit", "starttls"]),
  }),
  Schema.Struct({ operation: Schema.Literal("accounts.disconnect"), ...AccountInput }),
  Schema.Struct({ operation: Schema.Literal("calendars.list"), ...AccountInput }),
  Schema.Struct({
    operation: Schema.Literal("calendars.select"),
    ...AccountInput,
    calendarIds: Schema.Array(Id).check(Schema.isMaxLength(100)),
  }),
  Schema.Struct({ operation: Schema.Literal("calendars.events"), ...EventInput }),
  Schema.Struct({ operation: Schema.Literal("calendars.refresh"), ...EventInput }),
  Schema.Struct({ operation: Schema.Literal("mail.list"), ...PageInput }),
  Schema.Struct({ operation: Schema.Literal("mail.get"), ...AccountInput, messageId: Id }),
  Schema.Struct({ operation: Schema.Literal("drafts.list"), accountId: Schema.optionalKey(Id) }),
  Schema.Struct({
    operation: Schema.Literal("drafts.save"),
    ...AccountInput,
    id: Schema.optionalKey(Id),
    to: ShortText,
    subject: ShortText,
    text: Body,
  }),
  Schema.Struct({ operation: Schema.Literal("drafts.delete"), id: Id }),
]);
export type OfficeRequest = typeof OfficeRequest.Type;
export const OfficeResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    accounts: Schema.optionalKey(Schema.Array(OfficeAccount)),
    configuration: Schema.optionalKey(
      Schema.Struct({ google: Schema.Boolean, microsoft: Schema.Boolean, imap: Schema.Boolean }),
    ),
    calendars: Schema.optionalKey(Schema.Array(OfficeCalendar)),
    events: Schema.optionalKey(Schema.Array(OfficeEvent)),
    messages: Schema.optionalKey(Schema.Array(OfficeMessage)),
    message: Schema.optionalKey(OfficeMessage),
    drafts: Schema.optionalKey(Schema.Array(OfficeDraft)),
    nextCursor: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Struct({
      code: Schema.Literals([
        "setup_required",
        "invalid_request",
        "not_found",
        "unsupported",
        "authentication",
        "network",
        "storage",
        "cancelled",
        "closed",
      ]),
      message: ShortText,
    }),
  }),
]);
export type OfficeResult = typeof OfficeResult.Type;
