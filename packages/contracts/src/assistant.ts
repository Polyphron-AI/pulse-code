import * as Schema from "effect/Schema";
import { AssistantId, CommandId, IsoDateTime, ThreadId } from "./baseSchemas.ts";
import { ModelSelection } from "./model.ts";
import type { ThreadOrigin } from "./schedule.ts";

/**
 * Assistant domain contracts. An assistant is a named, persistent,
 * read-mostly persona that proposes and never acts. Luna is the first and,
 * for now, the only one: the decider refuses a second create per environment.
 *
 * Its home is a sidebar panel, not a per-thread tab, and its thread lives in
 * the environment's system project under the `assistant:<id>` origin with a
 * read-only tool allow-list. See
 * docs/plans/2026-09-11-agent-roles-design.md section 1 (Assistant record)
 * and section 5 (Visual model).
 */

/** The name a fresh assistant is created with when the caller gives none. */
export const DEFAULT_ASSISTANT_NAME = "Luna";

/**
 * Short display token shown in the sidebar: an emoji, or one or two letters.
 * Capped so a paste cannot stretch the panel header.
 */
export const AssistantAvatar = Schema.String.check(Schema.isMaxLength(8));
export type AssistantAvatar = typeof AssistantAvatar.Type;

export const OrchestrationAssistant = Schema.Struct({
  id: AssistantId,
  name: Schema.String,
  /** Emoji or short token drawn beside the name; null renders the initial. */
  avatar: Schema.NullOr(AssistantAvatar),
  /** Null falls back to the environment's text-generation model. */
  modelSelection: Schema.NullOr(ModelSelection),
  /** Standing instruction re-sent as a preface on every turn. */
  instructions: Schema.String,
  /** The assistant's persistent thread; null until the first message binds one. */
  threadId: Schema.NullOr(ThreadId),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type OrchestrationAssistant = typeof OrchestrationAssistant.Type;

const ASSISTANT_ORIGIN_PREFIX = "assistant:";

/** Thread origin marking an assistant's own thread. Assistants have no children. */
export function assistantThreadOrigin(assistantId: AssistantId): ThreadOrigin {
  return `${ASSISTANT_ORIGIN_PREFIX}${assistantId}`;
}

export function isAssistantThreadOrigin(origin: ThreadOrigin): boolean {
  return (
    origin.startsWith(ASSISTANT_ORIGIN_PREFIX) && origin.length > ASSISTANT_ORIGIN_PREFIX.length
  );
}

export function assistantIdFromThreadOrigin(origin: ThreadOrigin): AssistantId | null {
  return isAssistantThreadOrigin(origin)
    ? AssistantId.make(origin.slice(ASSISTANT_ORIGIN_PREFIX.length))
    : null;
}

/**
 * Tool names an assistant may use, per provider driver. Read, search, and
 * fetch only: nothing here writes a file, edits a file, or runs a shell.
 *
 * A driver missing from this map has no allow-list to pass; see
 * `ASSISTANT_ALLOWED_TOOLS_UNSUPPORTED_DRIVERS` and the provider table in
 * docs/plans/2026-09-11-agent-roles-design.md section 1.
 */
export const ASSISTANT_READ_ONLY_TOOLS: Readonly<Record<string, ReadonlyArray<string>>> =
  Object.freeze({
    // Claude Code SDK tool names, passed straight through as `allowedTools`.
    claudeAgent: Object.freeze(["Read", "Glob", "Grep", "WebFetch", "WebSearch", "TodoWrite"]),
    // OpenCode permission names. The adapter turns these into an allow rule
    // per name plus a deny rule for everything that writes.
    opencode: Object.freeze(["read", "glob", "grep", "webfetch", "websearch", "codesearch"]),
  });

/**
 * Drivers with no tool allow-list of their own. An assistant on one of these
 * runs under `approval-required`, so every write is gated by the user instead.
 */
export const ASSISTANT_ALLOWED_TOOLS_UNSUPPORTED_DRIVERS: ReadonlyArray<string> = Object.freeze([
  "codex",
  "cursor",
  "grok",
  "omp",
]);

/** The read-only allow-list for one driver, or null when it has none. */
export function assistantReadOnlyTools(driverKind: string): ReadonlyArray<string> | null {
  return ASSISTANT_READ_ONLY_TOOLS[driverKind] ?? null;
}

/**
 * The union of every driver's read-only names, which is what a thread carries:
 * `allowedTools` is provider-agnostic on the wire and each adapter keeps only
 * the names it understands.
 */
export const ASSISTANT_THREAD_ALLOWED_TOOLS: ReadonlyArray<string> = Object.freeze(
  Array.from(new Set(Object.values(ASSISTANT_READ_ONLY_TOOLS).flat())).toSorted(),
);

// --- Commands ---

export const AssistantCreateCommand = Schema.Struct({
  type: Schema.Literal("assistant.create"),
  commandId: CommandId,
  assistantId: AssistantId,
  name: Schema.optional(Schema.String),
  avatar: Schema.optional(Schema.NullOr(AssistantAvatar)),
  modelSelection: Schema.optional(Schema.NullOr(ModelSelection)),
  instructions: Schema.optional(Schema.String),
  createdAt: IsoDateTime,
});
export type AssistantCreateCommand = typeof AssistantCreateCommand.Type;

export const AssistantUpdateCommand = Schema.Struct({
  type: Schema.Literal("assistant.update"),
  commandId: CommandId,
  assistantId: AssistantId,
  // Absent = leave unchanged; null on a nullable field = clear it.
  name: Schema.optional(Schema.String),
  avatar: Schema.optional(Schema.NullOr(AssistantAvatar)),
  modelSelection: Schema.optional(Schema.NullOr(ModelSelection)),
  instructions: Schema.optional(Schema.String),
});
export type AssistantUpdateCommand = typeof AssistantUpdateCommand.Type;

/**
 * Start over: archive the bound thread and clear `threadId`, so the next
 * message opens a fresh one. Identity fields survive.
 */
export const AssistantResetCommand = Schema.Struct({
  type: Schema.Literal("assistant.reset"),
  commandId: CommandId,
  assistantId: AssistantId,
});
export type AssistantResetCommand = typeof AssistantResetCommand.Type;

/**
 * "Talk to Luna". The server decides where the text lands: a bound thread, or
 * a new one created and bound first. Clients never name the thread, and never
 * choose `authoredBy`.
 */
export const AssistantMessageCommand = Schema.Struct({
  type: Schema.Literal("assistant.message"),
  commandId: CommandId,
  assistantId: AssistantId,
  text: Schema.String,
});
export type AssistantMessageCommand = typeof AssistantMessageCommand.Type;

/** Server-only: no client may point an assistant at a thread it did not create. */
export const AssistantThreadBindCommand = Schema.Struct({
  type: Schema.Literal("assistant.thread.bind"),
  commandId: CommandId,
  assistantId: AssistantId,
  threadId: ThreadId,
});
export type AssistantThreadBindCommand = typeof AssistantThreadBindCommand.Type;

// --- Event payloads ---

export const AssistantCreatedPayload = Schema.Struct({
  assistantId: AssistantId,
  name: Schema.String,
  avatar: Schema.NullOr(AssistantAvatar),
  modelSelection: Schema.NullOr(ModelSelection),
  instructions: Schema.String,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type AssistantCreatedPayload = typeof AssistantCreatedPayload.Type;

export const AssistantUpdatedPayload = Schema.Struct({
  assistantId: AssistantId,
  name: Schema.optional(Schema.String),
  avatar: Schema.optional(Schema.NullOr(AssistantAvatar)),
  modelSelection: Schema.optional(Schema.NullOr(ModelSelection)),
  instructions: Schema.optional(Schema.String),
  updatedAt: IsoDateTime,
});
export type AssistantUpdatedPayload = typeof AssistantUpdatedPayload.Type;

export const AssistantResetPayload = Schema.Struct({
  assistantId: AssistantId,
  /** The thread that was archived, or null when none was bound. */
  previousThreadId: Schema.NullOr(ThreadId),
  updatedAt: IsoDateTime,
});
export type AssistantResetPayload = typeof AssistantResetPayload.Type;

/**
 * A user asked the assistant something. The AssistantReactor turns this into
 * the thread bootstrap and the turn, because only the server knows the system
 * project root and the environment's default model.
 */
export const AssistantMessageRequestedPayload = Schema.Struct({
  assistantId: AssistantId,
  text: Schema.String,
  requestedAt: IsoDateTime,
});
export type AssistantMessageRequestedPayload = typeof AssistantMessageRequestedPayload.Type;

export const AssistantThreadBoundPayload = Schema.Struct({
  assistantId: AssistantId,
  threadId: ThreadId,
  updatedAt: IsoDateTime,
});
export type AssistantThreadBoundPayload = typeof AssistantThreadBoundPayload.Type;

// --- Prompt composition ---

/**
 * The preface prepended to every assistant turn, ahead of the user's text.
 * Named "system prompt" in the design; it rides the normal prompt because no
 * provider adapter takes a per-thread system prompt.
 */
export function assistantSystemPrompt(input: {
  readonly name: string;
  readonly instructions: string;
}): string {
  const lines = [
    `You are ${input.name}, the Pulse assistant.`,
    "You have read-only tools: you can read files, search, and fetch. You cannot write files, edit files, or run shell commands.",
    "Answer, explain, and propose. When work needs doing, say what you would do and let the user start a thread for it.",
  ];
  const instructions = input.instructions.trim();
  if (instructions.length > 0) {
    lines.push("", instructions);
  }
  return lines.join("\n");
}
