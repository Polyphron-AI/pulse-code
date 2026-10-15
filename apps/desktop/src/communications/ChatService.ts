// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalTimers:off -- Native credential owner manages opaque identifiers and expiring SDK sign-in resources outside Effect.
import * as NodeCrypto from "node:crypto";
import * as Schema from "effect/Schema";
import { ChatAccount, ChatRequest, ChatResult } from "@t3tools/contracts";
import { ChatError, type ChatAdapter } from "./ChatAdapter.ts";
import { connectRestChat, restoreRestChat } from "./RestChatAdapter.ts";

const Document = Schema.Struct({
  version: Schema.Literal(1),
  accounts: Schema.Array(
    Schema.Struct({ account: ChatAccount, credentials: Schema.Unknown }),
  ).check(Schema.isMaxLength(40)),
});
const decodeAccount = Schema.decodeUnknownSync(ChatAccount);
const decodeDocument = Schema.decodeUnknownSync(Document);
const decodeRequest = Schema.decodeUnknownSync(ChatRequest);
const decodeResult = Schema.decodeUnknownSync(ChatResult);
const DEFAULT_FACTORIES = {
  connectRestChat,
  restoreRestChat,
};

export class ChatService {
  private document: typeof Document.Type | undefined;
  private adapters = new Map<string, ChatAdapter>();
  private pending: Promise<unknown> = Promise.resolve();
  private closed = false;

  private readonly options;

  constructor(options: {
    storage: { read(): Promise<string | null>; write(value: string): Promise<void> };
    factories?: typeof DEFAULT_FACTORIES;
    id?: () => string;
  }) {
    this.options = options;
  }

  async invoke(raw: ChatRequest): Promise<ChatResult> {
    let request: ChatRequest;
    try {
      request = decodeRequest(raw);
    } catch {
      return {
        ok: false,
        error: { code: "invalid_request", message: "Check the connection details and try again." },
      };
    }
    const task = this.pending
      .catch(() => undefined)
      .then(async () => {
        if (this.closed)
          return {
            ok: false,
            error: { code: "closed", message: "Communications is closing." },
          } as const;
        try {
          await this.initialize();
          return decodeResult(await this.handle(request));
        } catch (error) {
          if (error instanceof ChatError)
            return {
              ok: false,
              error: {
                code: error.code,
                message: error.message,
                ...(error.retryAfterSeconds !== undefined
                  ? { retryAfterSeconds: error.retryAfterSeconds }
                  : {}),
              },
            } as const;
          return {
            ok: false,
            error: {
              code: "storage",
              message:
                "Communications could not complete the request. Check secure storage and reconnect the account if necessary.",
            },
          } as const;
        }
      });
    this.pending = task;
    return task;
  }

  private async initialize() {
    if (this.document) return;
    const saved = await this.options.storage.read();
    this.document =
      saved === null ? { version: 1, accounts: [] } : decodeDocument(JSON.parse(saved));
  }
  private async save(document: typeof Document.Type) {
    if (this.closed) throw new Error("closed");
    await this.options.storage.write(JSON.stringify(document));
    this.document = document;
  }
  private accounts() {
    return this.document!.accounts.map((item) => item.account);
  }
  private factories() {
    return this.options.factories ?? DEFAULT_FACTORIES;
  }
  private id() {
    return this.options.id?.() ?? NodeCrypto.randomUUID();
  }

  private async add(adapter: ChatAdapter) {
    if (this.document!.accounts.length >= 40) {
      await adapter.close();
      throw new ChatError("unsupported", "Disconnect an unused account before adding another.");
    }
    let account: ChatAccount;
    try {
      account = decodeAccount({ ...adapter.account, id: this.id() });
      await this.save({
        version: 1,
        accounts: [...this.document!.accounts, { account, credentials: adapter.credentials() }],
      });
      if (this.closed) throw new Error("closed");
    } catch (error) {
      await adapter.close().catch(() => undefined);
      throw error;
    }
    this.adapters.set(account.id, adapter);
    return { ok: true, account, accounts: this.accounts() } as const;
  }
  private async adapter(accountId: string) {
    const existing = this.adapters.get(accountId);
    if (existing) return existing;
    const saved = this.document!.accounts.find((item) => item.account.id === accountId);
    if (!saved) throw new ChatError("not_found", "This account is no longer connected.");
    if (saved.account.provider === "telegram")
      throw new ChatError(
        "unsupported",
        "Personal Telegram login has been retired. Connect a bot in Settings > Integrations > Telegram. Your saved personal account data has been retained.",
      );
    const adapter = await this.factories().restoreRestChat(
      saved.account.provider,
      saved.credentials,
    );
    if (this.closed) {
      await adapter.close();
      throw new Error("closed");
    }
    this.adapters.set(accountId, adapter);
    return adapter;
  }
  private async refreshCredentials(accountId: string, adapter: ChatAdapter) {
    const credentials = adapter.credentials();
    const saved = this.document!.accounts.find((item) => item.account.id === accountId);
    if (!saved || JSON.stringify(saved.credentials) === JSON.stringify(credentials)) return;
    await this.save({
      version: 1,
      accounts: this.document!.accounts.map((item) =>
        item.account.id === accountId ? { ...item, credentials } : item,
      ),
    });
  }
  private async handle(request: ChatRequest): Promise<ChatResult> {
    switch (request.operation) {
      case "accounts.list":
        return { ok: true, accounts: this.accounts() };
      case "accounts.connectToken":
        return this.add(await this.factories().connectRestChat(request.provider, request.token));
      case "accounts.telegram.begin":
      case "accounts.telegram.complete":
        throw new ChatError(
          "unsupported",
          "Personal Telegram login has been retired. Connect a bot in Settings > Integrations > Telegram. Your saved personal account data has been retained.",
        );
      case "accounts.telegram.cancel":
        return { ok: true };
      case "accounts.disconnect": {
        if (!this.document!.accounts.some((item) => item.account.id === request.accountId))
          throw new ChatError("not_found", "This account is no longer connected.");
        await this.save({
          version: 1,
          accounts: this.document!.accounts.filter((item) => item.account.id !== request.accountId),
        });
        const adapter = this.adapters.get(request.accountId);
        this.adapters.delete(request.accountId);
        await adapter?.close().catch(() => undefined);
        return { ok: true, accounts: this.accounts() };
      }
      case "conversations.list": {
        const adapter = await this.adapter(request.accountId);
        const page = await adapter.conversations(request.accountId, request.cursor);
        await this.refreshCredentials(request.accountId, adapter);
        return { ok: true, ...page };
      }
      case "messages.list": {
        const adapter = await this.adapter(request.accountId);
        const page = await adapter.messages(
          request.accountId,
          request.conversationId,
          request.cursor,
          request.threadId,
        );
        await this.refreshCredentials(request.accountId, adapter);
        return { ok: true, ...page };
      }
      case "messages.send": {
        const adapter = await this.adapter(request.accountId);
        const message = await adapter.send(
          request.accountId,
          request.conversationId,
          request.text,
          request.nonce,
          request.replyToId,
        );
        // A session refresh failure must never make an acknowledged send look unsent.
        await this.refreshCredentials(request.accountId, adapter).catch(() => undefined);
        return { ok: true, message };
      }
    }
  }
  async close() {
    this.closed = true;
    await Promise.allSettled([...this.adapters.values()].map((adapter) => adapter.close()));
    await this.pending;
    this.adapters.clear();
  }
}
