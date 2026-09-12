/**
 * threadHandoff - builds the text that bridges a thread from one provider to
 * another.
 *
 * A provider switch starts a brand-new provider session, so the new model sees
 * nothing of the old one. This module turns the thread's visible messages into
 * a plain-text digest: recent messages verbatim, older ones summarized, plus
 * the files checkpoints touched. Everything here is pure; the caller decides
 * whether the summary of the omitted part comes from the destination model or
 * from the deterministic fallback below.
 *
 * Only user text and final assistant text are used. Tool payloads, reasoning,
 * approvals, and other activities stay out so provider-native structure never
 * leaks into another provider's prompt.
 *
 * @module threadHandoff
 */
import type {
  OrchestrationCheckpointSummary,
  OrchestrationMessage,
  OrchestrationThreadHandoffDigest,
} from "@t3tools/contracts";

export interface ThreadHandoffMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
}

export interface ThreadHandoffLimits {
  /** Most messages kept verbatim at the end of the conversation. */
  readonly maxVerbatimMessages: number;
  /** Most characters of verbatim conversation. */
  readonly maxVerbatimChars: number;
  /** Most file paths listed. */
  readonly maxFiles: number;
}

export const DEFAULT_THREAD_HANDOFF_LIMITS: ThreadHandoffLimits = {
  maxVerbatimMessages: 60,
  maxVerbatimChars: 60_000,
  maxFiles: 40,
};

export interface ThreadHandoffPlan {
  /** Every message the digest draws on, oldest first. */
  readonly messages: ReadonlyArray<ThreadHandoffMessage>;
  /** Older messages that will be summarized rather than quoted. */
  readonly omitted: ReadonlyArray<ThreadHandoffMessage>;
  /** Recent messages quoted as they are. */
  readonly verbatim: ReadonlyArray<ThreadHandoffMessage>;
  readonly files: ReadonlyArray<string>;
}

export const DEFAULT_THREAD_HANDOFF_INSTRUCTION = "Continue from where the conversation left off.";

const FALLBACK_LINE_CHARS = 240;

/**
 * Pick the messages worth handing over: every user message, and one final
 * assistant message per turn. Streaming (unfinished) assistant text and empty
 * messages are dropped. Messages are returned oldest first.
 */
export function collectThreadHandoffMessages(
  messages: ReadonlyArray<OrchestrationMessage>,
): ReadonlyArray<ThreadHandoffMessage> {
  const ordered = [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const lastAssistantIndexByTurn = new Map<string, number>();
  ordered.forEach((message, index) => {
    if (message.role === "assistant" && !message.streaming && message.text.trim().length > 0) {
      lastAssistantIndexByTurn.set(message.turnId ?? `message:${message.id}`, index);
    }
  });
  const keptAssistantIndexes = new Set(lastAssistantIndexByTurn.values());
  const result: ThreadHandoffMessage[] = [];
  ordered.forEach((message, index) => {
    const text = message.text.trim();
    if (text.length === 0) return;
    if (message.role === "user") {
      result.push({ role: "user", text });
      return;
    }
    if (message.role === "assistant" && keptAssistantIndexes.has(index)) {
      result.push({ role: "assistant", text });
    }
  });
  return result;
}

/** Paths touched by checkpoints, oldest first, deduped, capped. */
export function collectThreadHandoffFiles(
  checkpoints: ReadonlyArray<OrchestrationCheckpointSummary>,
  maxFiles: number,
): ReadonlyArray<string> {
  const seen = new Set<string>();
  const files: string[] = [];
  const ordered = [...checkpoints].sort((a, b) => a.checkpointTurnCount - b.checkpointTurnCount);
  for (const checkpoint of ordered) {
    for (const file of checkpoint.files) {
      if (seen.has(file.path)) continue;
      seen.add(file.path);
      files.push(file.path);
      if (files.length >= maxFiles) return files;
    }
  }
  return files;
}

/**
 * Split messages into an omitted head and a verbatim tail. The tail is the
 * longest suffix that fits both limits; the newest message always makes it in
 * even when it alone exceeds the character budget, so the new model never
 * loses the latest exchange.
 */
export function planThreadHandoff(input: {
  readonly messages: ReadonlyArray<OrchestrationMessage>;
  readonly checkpoints: ReadonlyArray<OrchestrationCheckpointSummary>;
  readonly limits?: ThreadHandoffLimits;
}): ThreadHandoffPlan {
  const limits = input.limits ?? DEFAULT_THREAD_HANDOFF_LIMITS;
  const messages = collectThreadHandoffMessages(input.messages);
  let start = messages.length;
  let chars = 0;
  while (start > 0) {
    const candidate = messages[start - 1]!;
    const nextChars = chars + candidate.text.length;
    const count = messages.length - start + 1;
    if (count > limits.maxVerbatimMessages) break;
    if (nextChars > limits.maxVerbatimChars && start !== messages.length) break;
    chars = nextChars;
    start -= 1;
  }
  return {
    messages,
    omitted: messages.slice(0, start),
    verbatim: messages.slice(start),
    files: collectThreadHandoffFiles(input.checkpoints, limits.maxFiles),
  };
}

/** Transcript text sent to the summarizer and quoted in the digest. */
export function renderThreadHandoffTranscript(
  messages: ReadonlyArray<ThreadHandoffMessage>,
): string {
  return messages
    .map((message) => `${message.role === "user" ? "User" : "Assistant"}: ${message.text}`)
    .join("\n\n");
}

/**
 * Summary used when no model wrote one: the first line of each omitted
 * message, cut short. Lossy on purpose. It keeps the switch working when the
 * destination provider cannot run a one-shot generation.
 */
export function renderFallbackThreadHandoffSummary(
  omitted: ReadonlyArray<ThreadHandoffMessage>,
): string {
  const lines = omitted.map((message) => {
    const firstLine = message.text.split(/\r?\n/, 1)[0]?.trim() ?? "";
    const cut =
      firstLine.length > FALLBACK_LINE_CHARS
        ? `${firstLine.slice(0, FALLBACK_LINE_CHARS)}...`
        : firstLine;
    return `- ${message.role === "user" ? "User" : "Assistant"}: ${cut}`;
  });
  return ["No model summary was available. First line of each omitted message:", ...lines].join(
    "\n",
  );
}

export interface RenderThreadHandoffDigestInput {
  readonly sourceLabel: string;
  readonly plan: ThreadHandoffPlan;
  /** Model-written summary of `plan.omitted`, or null to use the fallback.
      Ignored when nothing was omitted. */
  readonly summary: string | null;
}

/**
 * Assemble the digest handed to the new model. The text ends with a heading
 * for the user's next instruction; the reactor appends that instruction after
 * a blank line, so the prompt reads as one document.
 */
export function renderThreadHandoffDigest(
  input: RenderThreadHandoffDigestInput,
): OrchestrationThreadHandoffDigest {
  const { plan } = input;
  const header = [
    `[Handoff. A different model (${input.sourceLabel}) worked on this thread until now.`,
    "What follows is the visible conversation so far. Tool output and that model's private",
    "reasoning are not included. Files on disk reflect all prior work; verify before assuming.]",
  ].join("\n");

  const hasOmitted = plan.omitted.length > 0;
  const basis: OrchestrationThreadHandoffDigest["basis"] = !hasOmitted
    ? "verbatim"
    : input.summary !== null && input.summary.trim().length > 0
      ? "generated"
      : "fallback";
  const summaryBlock = hasOmitted
    ? [
        `[${plan.omitted.length} earlier ${plan.omitted.length === 1 ? "message" : "messages"} omitted. Summary of the omitted part:]`,
        basis === "generated"
          ? input.summary!.trim()
          : renderFallbackThreadHandoffSummary(plan.omitted),
      ].join("\n\n")
    : null;

  const conversation =
    plan.verbatim.length > 0 ? renderThreadHandoffTranscript(plan.verbatim) : "(No messages yet.)";

  const filesBlock =
    plan.files.length > 0
      ? ["## Files touched in this thread", plan.files.map((path) => `- ${path}`).join("\n")]
      : [];

  const text = [
    header,
    "## Conversation",
    ...(summaryBlock === null ? [] : [summaryBlock]),
    conversation,
    ...filesBlock,
    "## Next instruction from the user",
  ].join("\n\n");

  return {
    basis,
    text,
    messageCount: plan.messages.length,
    omittedCount: plan.omitted.length,
    files: plan.files,
  };
}
