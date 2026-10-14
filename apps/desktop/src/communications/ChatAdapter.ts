import type {
  ChatAccount,
  ChatConversation,
  ChatMessage,
  ChatMembership,
} from "@t3tools/contracts";

export interface ChatAdapter {
  account: Omit<ChatAccount, "id">;
  credentials(): unknown;
  conversations(
    accountId: string,
    cursor?: string,
  ): Promise<{ conversations: ChatConversation[]; nextCursor?: string }>;
  members?(
    accountId: string,
    conversationId: string,
    cursor?: string,
    channelOnly?: boolean,
  ): Promise<ChatMembership>;
  messages(
    accountId: string,
    conversationId: string,
    cursor?: string,
    threadId?: string,
  ): Promise<{ messages: ChatMessage[]; nextCursor?: string }>;
  send(
    accountId: string,
    conversationId: string,
    text: string,
    nonce: string,
    replyToId?: string,
  ): Promise<ChatMessage>;
  close(): Promise<void>;
}

export class ChatError extends Error {
  readonly code:
    | "authentication"
    | "permission"
    | "network"
    | "rate_limit"
    | "not_found"
    | "unsupported";
  readonly retryAfterSeconds: number | undefined;
  constructor(
    code: "authentication" | "permission" | "network" | "rate_limit" | "not_found" | "unsupported",
    message: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
