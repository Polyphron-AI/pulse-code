import type { ChatAttachment } from "@t3tools/contracts";

/**
 * Formats a thread's messages into the transcript a handoff summary is written
 * from. Threads routinely outrun any single context window, so the transcript
 * keeps the most recent exchanges (where the current state lives) and pins the
 * first user message (where the goal lives), dropping the middle.
 */

export const MAX_THREAD_HANDOFF_CONTEXT_CHARS = 60_000;
const MAX_FIRST_USER_SECTION_CHARS = 6_000;
const MAX_HANDOFF_ATTACHMENTS = 4;
const EARLIER_TRUNCATION_MARKER = "[Earlier thread content truncated]\n\n";
const FIRST_USER_TRUNCATION_MARKER = "\n[First user message truncated]";

export interface ThreadHandoffMessage {
  readonly role: "user" | "assistant" | "system";
  readonly text: string;
  readonly attachments?: ReadonlyArray<ChatAttachment> | undefined;
}

export interface ThreadHandoffContext {
  readonly context: string;
  readonly attachments: ReadonlyArray<ChatAttachment>;
  readonly truncated: boolean;
}

function formatSection(message: ThreadHandoffMessage): string | undefined {
  if (message.role === "system") {
    return undefined;
  }
  const text = message.text.trim();
  const attachmentSummary = (message.attachments ?? []).map((a) => a.name).join(", ");
  const contents = [
    ...(text.length > 0 ? [text] : []),
    ...(attachmentSummary.length > 0 ? [`[Attachments: ${attachmentSummary}]`] : []),
  ].join("\n");
  return contents.length > 0 ? `${message.role.toUpperCase()}:\n${contents}` : undefined;
}

function collectRecent(
  messages: ReadonlyArray<ThreadHandoffMessage>,
  maxChars: number,
): ThreadHandoffContext {
  let context = "";
  let truncated = false;
  const attachments: Array<ChatAttachment> = [];

  for (const message of messages.toReversed()) {
    const section = formatSection(message);
    if (section === undefined) {
      continue;
    }
    const separator = context.length > 0 ? "\n\n" : "";
    const available = maxChars - context.length - separator.length;
    if (section.length > available) {
      // A message that only partially fits keeps its tail: the end of a long
      // assistant turn is where its conclusion is.
      if (available > 0) {
        context = `${section.slice(-available)}${separator}${context}`;
        attachments.unshift(...(message.attachments ?? []));
      }
      truncated = true;
      break;
    }
    context = `${section}${separator}${context}`;
    attachments.unshift(...(message.attachments ?? []));
  }

  return { context, attachments, truncated };
}

function limitFirstUserSection(section: string): string {
  if (section.length <= MAX_FIRST_USER_SECTION_CHARS) {
    return section;
  }
  return `${section.slice(
    0,
    MAX_FIRST_USER_SECTION_CHARS - FIRST_USER_TRUNCATION_MARKER.length,
  )}${FIRST_USER_TRUNCATION_MARKER}`;
}

export function formatThreadHandoffContext(
  messages: ReadonlyArray<ThreadHandoffMessage>,
  maxChars: number = MAX_THREAD_HANDOFF_CONTEXT_CHARS,
): ThreadHandoffContext {
  const recent = collectRecent(messages, maxChars);
  if (!recent.truncated) {
    return { ...recent, attachments: recent.attachments.slice(-MAX_HANDOFF_ATTACHMENTS) };
  }

  const firstUserMessage = messages.find(
    (message) => message.role === "user" && formatSection(message) !== undefined,
  );
  const firstUserSection = firstUserMessage ? formatSection(firstUserMessage) : undefined;
  if (!firstUserMessage || firstUserSection === undefined) {
    return {
      context: `${EARLIER_TRUNCATION_MARKER}${recent.context}`,
      attachments: recent.attachments.slice(-MAX_HANDOFF_ATTACHMENTS),
      truncated: true,
    };
  }

  const pinnedSection = limitFirstUserSection(firstUserSection);
  const recentBudget =
    maxChars - pinnedSection.length - "\n\n".length - EARLIER_TRUNCATION_MARKER.length;
  const retainedRecent = collectRecent(messages, Math.max(recentBudget, 0));
  const pinnedAttachment = firstUserMessage.attachments?.[0];
  const recentAttachments = retainedRecent.attachments.filter(
    (attachment) => attachment.id !== pinnedAttachment?.id,
  );

  return {
    context: `${pinnedSection}\n\n${EARLIER_TRUNCATION_MARKER}${retainedRecent.context}`,
    attachments: [
      ...(pinnedAttachment ? [pinnedAttachment] : []),
      ...recentAttachments.slice(-(MAX_HANDOFF_ATTACHMENTS - (pinnedAttachment ? 1 : 0))),
    ],
    truncated: true,
  };
}
