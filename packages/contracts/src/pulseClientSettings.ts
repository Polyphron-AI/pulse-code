import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ComposerBusyBehavior, DEFAULT_COMPOSER_BUSY_BEHAVIOR } from "./orchestration.ts";

const values = {
  voiceShortcut: Schema.String,
  voiceGlobalShortcutEnabled: Schema.Boolean,
  voiceHoverEnabled: Schema.Boolean,
  mailAlphaEnabled: Schema.Boolean,
  composerBusyBehavior: ComposerBusyBehavior,
};

/** Flat, local-only Pulse settings composed into the upstream client settings. */
export const PulseClientSettingsSchema = Schema.Struct({
  voiceShortcut: values.voiceShortcut.pipe(
    Schema.withDecodingDefault(Effect.succeed("ctrl+shift+space")),
  ),
  voiceGlobalShortcutEnabled: values.voiceGlobalShortcutEnabled.pipe(
    Schema.withDecodingDefault(Effect.succeed(false)),
  ),
  voiceHoverEnabled: values.voiceHoverEnabled.pipe(
    Schema.withDecodingDefault(Effect.succeed(false)),
  ),
  mailAlphaEnabled: values.mailAlphaEnabled.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
  composerBusyBehavior: values.composerBusyBehavior.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_COMPOSER_BUSY_BEHAVIOR)),
  ),
});
export type PulseClientSettings = typeof PulseClientSettingsSchema.Type;

// Patches use raw values, not decoding defaults: omission must never reset a setting.
export const PulseClientSettingsPatch = Schema.Struct({
  voiceShortcut: Schema.optionalKey(values.voiceShortcut),
  voiceGlobalShortcutEnabled: Schema.optionalKey(values.voiceGlobalShortcutEnabled),
  voiceHoverEnabled: Schema.optionalKey(values.voiceHoverEnabled),
  mailAlphaEnabled: Schema.optionalKey(values.mailAlphaEnabled),
  composerBusyBehavior: Schema.optionalKey(values.composerBusyBehavior),
});
