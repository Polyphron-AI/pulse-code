import * as Schema from "effect/Schema";
import {
  chatResourceId,
  ChatResource,
  normalizeLinkUrl,
  type ChatAccount,
  type ChatConversation,
  type ChatMessage,
  type WorkspaceLinkEndpoint,
} from "@t3tools/contracts";
import { endpointTitle } from "./mail/linkedItems";

const isChatResource = Schema.is(ChatResource);

/** Capture source metadata once for menus, drag, retained chips and saved references. */
export function chatEndpoint(
  account: ChatAccount,
  conversation: ChatConversation,
  message?: ChatMessage,
): WorkspaceLinkEndpoint | undefined {
  return chatItem(account, conversation, message).endpoint;
}

/** Keep unavailable rows visible with the cause that prevents linking them. */
export function chatItem(
  account: ChatAccount,
  conversation: ChatConversation,
  message?: ChatMessage,
):
  | { endpoint: WorkspaceLinkEndpoint; reason?: undefined }
  | { endpoint?: undefined; reason: string } {
  if (account.provider !== "slack" && account.provider !== "discord")
    return { reason: "Linking is not available for this connection." };
  if (!conversation.workspaceId)
    return { reason: "Reopen this account in an updated desktop app to use chat actions." };
  if (
    conversation.accountId !== account.id ||
    (message && (message.accountId !== account.id || message.conversationId !== conversation.id))
  )
    return { reason: "This conversation or message belongs to a different account." };
  const resource = {
    version: 1 as const,
    transport: "desktop" as const,
    connectionId: account.id,
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    ...(message
      ? {
          messageId: message.id,
          ...(account.provider === "slack" ? { replyRootId: message.threadId ?? message.id } : {}),
        }
      : {}),
  };
  const tooLong = "This conversation or message address is too long to link.";
  if (!isChatResource(resource)) return { reason: tooLong };
  try {
    return {
      endpoint: {
        ref: {
          type: "provider-resource",
          provider: account.provider,
          resourceId: chatResourceId(resource),
        },
        title: endpointTitle(
          message ? `${message.author}: ${message.text || "Message"}` : conversation.title,
        ),
      },
    };
  } catch {
    return { reason: tooLong };
  }
}

export interface SavedChatReference {
  provider: string;
  accountId: string;
  conversationId: string;
  messageId: string;
  environmentId?: string;
  resourceId?: string;
}

export function chatReferenceKey(reference: SavedChatReference) {
  if (reference.resourceId)
    return JSON.stringify([reference.environmentId, reference.provider, reference.resourceId]);
  return JSON.stringify([
    reference.provider,
    reference.accountId,
    reference.conversationId,
    reference.messageId,
  ]);
}

export function mergeChatMessages(
  previous: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
) {
  const rows = new Map(
    previous.map((message) => [
      JSON.stringify([message.accountId, message.conversationId, message.id]),
      message,
    ]),
  );
  for (const message of incoming)
    rows.set(JSON.stringify([message.accountId, message.conversationId, message.id]), message);
  return [...rows.values()].sort((left, right) => {
    const date = Date.parse(left.date) - Date.parse(right.date);
    if (Number.isFinite(date) && date !== 0) return date;
    return (
      compareText(left.accountId, right.accountId) ||
      compareText(left.conversationId, right.conversationId) ||
      compareMessageIds(left.id, right.id)
    );
  });
}

export function createRequestQueue<Q, R>(invoke: (request: Q) => Promise<R>) {
  let previous: Promise<unknown> = Promise.resolve();
  return (request: Q): Promise<R> => {
    const next = previous.then(() => invoke(request));
    previous = next.catch(() => undefined);
    return next;
  };
}

export function sendAttempt(
  text: string,
  previous: { text: string; nonce: string; destination: string } | undefined,
  createNonce: () => string,
  destination = "",
  generation = 0,
) {
  const scopedDestination = JSON.stringify([destination, generation]);
  return previous?.text === text && previous.destination === scopedDestination
    ? previous
    : { text, nonce: createNonce(), destination: scopedDestination };
}

export function appendDraftLink(text: string, raw: string): string | undefined {
  const url = normalizeLinkUrl(raw);
  if (url === undefined) return undefined;
  return `${text}${text.length && !text.endsWith("\n") ? "\n" : ""}${url}`;
}

/** The reader retains drafts and unresolved sends while a composer is unmounted. */
export interface ChatDraft {
  text: string;
  generation: number;
  attempt?: ReturnType<typeof sendAttempt> | undefined;
  inFlight?: boolean;
  notice?: string;
}

export interface ConversationRow {
  readonly key: string;
  readonly title: string;
  readonly endpoint: WorkspaceLinkEndpoint;
  readonly kind: ChatConversation["kind"];
  readonly initials?: string;
  readonly knownUnread?: number;
}
export interface ConversationGroup {
  readonly key?: string;
  readonly label: string;
  readonly rows: readonly ConversationRow[];
  readonly project?: boolean;
}
export interface ConversationProject {
  readonly key: string;
  readonly label: string;
  readonly conversationKeys: readonly string[];
}
const nameSegments = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export function conversationInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initial = (word: string | undefined) =>
    word ? nameSegments.segment(word)[Symbol.iterator]().next().value?.segment : undefined;
  return (
    [initial(parts[0]), parts.length > 1 ? initial(parts.at(-1)) : undefined]
      .join("")
      .toUpperCase() || "?"
  );
}

/** Only confirmed link readers supply project membership, never provider workspace names. */
export function conversationGroups(
  rows: readonly ConversationRow[],
  projects: readonly ConversationProject[],
  provider: string,
): readonly ConversationGroup[] {
  const linked = new Set(projects.flatMap((project) => project.conversationKeys));
  const general = rows.filter((row) => row.kind !== "dm" && !linked.has(row.key));
  const direct = provider === "slack" ? rows.filter((row) => row.kind === "dm") : [];
  return [
    ...(general.length ? [{ label: "General", rows: general }] : []),
    ...projects
      .map((project) => ({
        key: project.key,
        label: project.label,
        project: true,
        rows: rows.filter((row) => project.conversationKeys.includes(row.key) && row.kind !== "dm"),
      }))
      .filter((group) => group.rows.length > 0),
    ...(direct.length ? [{ label: "Direct messages", rows: direct }] : []),
  ];
}
export interface ConversationMemberCount {
  readonly value: number;
  readonly complete: boolean;
  readonly observedAt: string;
}
/** Display-only freshness limit until generation-scoped membership readers are available. */
export const CONVERSATION_MEMBERSHIP_FRESHNESS_MS = 5 * 60_000;
/** Failed or disconnected sources omit membership without initiating a fetch. */
export function conversationSubtitle(
  providerLabel: string,
  projectTitle?: string,
  memberCount?: ConversationMemberCount,
  now = new Date().toISOString(),
  sourceAvailable = true,
) {
  const age = memberCount ? Date.parse(now) - Date.parse(memberCount.observedAt) : NaN;
  const fresh = sourceAvailable && age >= 0 && age <= CONVERSATION_MEMBERSHIP_FRESHNESS_MS;
  const memberText =
    memberCount?.complete === true &&
    fresh &&
    Number.isInteger(memberCount.value) &&
    memberCount.value >= 0
      ? ` · ${memberCount.value} members`
      : "";
  return `${projectTitle ? `${projectTitle} · ` : ""}${providerLabel}${memberText}`;
}
export function legacySlackNotice(
  provider: string,
  resource: Pick<ChatResource, "messageId" | "replyRootId">,
) {
  return provider === "slack" && resource.messageId && !resource.replyRootId
    ? "This legacy Slack message has no known reply root. Exact reply reading is unsupported until you reopen the source."
    : undefined;
}

const compareText = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
/** Native timestamps and snowflakes can exceed Date and Number precision. */
function compareMessageIds(left: string, right: string) {
  if (/^\d+(?:\.\d+)?$/.test(left) && /^\d+(?:\.\d+)?$/.test(right)) {
    const [leftWhole = "0", leftFraction = ""] = left.split(".");
    const [rightWhole = "0", rightFraction = ""] = right.split(".");
    const a = BigInt(leftWhole);
    const b = BigInt(rightWhole);
    if (a !== b) return a < b ? -1 : 1;
    const width = Math.max(leftFraction.length, rightFraction.length);
    const fraction = compareText(leftFraction.padEnd(width, "0"), rightFraction.padEnd(width, "0"));
    if (fraction) return fraction;
  }
  return compareText(left, right);
}
