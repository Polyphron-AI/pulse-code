// @effect-diagnostics globalDate:off -- The standalone Promise service serializes ISO timestamps using an injected clock.
import * as NodeCrypto from "node:crypto";
import * as Schema from "effect/Schema";
import { OfficeAccount, OfficeDraft, OfficeRequest, type OfficeResult } from "@t3tools/contracts";
import { OfficeError } from "./OfficeErrors.ts";
import {
  authorizeOfficeOAuth,
  refreshOfficeOAuth,
  oauthEndpoints,
  oauthScopes,
  type OAuthInput,
  type OfficeOAuthConfiguration,
} from "./OfficeOAuth.ts";
import {
  createOfficeProviders,
  type OfficeCredentials,
  type OfficeProviders,
  type ProviderContext,
} from "./OfficeProviders.ts";

const Credentials = Schema.Struct({
  oauth: Schema.optionalKey(
    Schema.Struct({
      accessToken: Schema.String,
      refreshToken: Schema.String,
      expiresAt: Schema.Number,
    }),
  ),
  imap: Schema.optionalKey(
    Schema.Struct({
      host: Schema.String,
      port: Schema.Int,
      username: Schema.String,
      password: Schema.String,
      tls: Schema.Literals(["implicit", "starttls"]),
    }),
  ),
});
const Document = Schema.Struct({
  version: Schema.Literal(1),
  accounts: Schema.Array(Schema.Struct({ account: OfficeAccount, credentials: Credentials })),
  drafts: Schema.Array(OfficeDraft),
});
type Document = typeof Document.Type;
const decodeDocument = Schema.decodeUnknownSync(Document);
const decodeRequest = Schema.decodeUnknownSync(OfficeRequest);
export interface OfficeStorage {
  /** The host encrypts the complete document on write and decrypts only in main. */
  read: () => Promise<string | null>;
  write: (value: string) => Promise<void>;
}
export interface OfficeServiceOptions {
  storage: OfficeStorage;
  openExternal: (url: string) => Promise<void>;
  oauth?: OfficeOAuthConfiguration;
  fetch?: typeof globalThis.fetch;
  providers?: OfficeProviders;
  authorize?: typeof authorizeOfficeOAuth;
  refresh?: typeof refreshOfficeOAuth;
  now?: () => number;
  id?: () => string;
}

/** Device-local Office owner. Calls are serialized, including token rotation and persistence. */
export class OfficeService {
  private readonly options: OfficeServiceOptions;
  private readonly providers: OfficeProviders;
  private readonly abort = new AbortController();
  private document: Document | undefined;
  private queue: Promise<void> = Promise.resolve();
  private closed = false;

  constructor(options: OfficeServiceOptions) {
    this.options = options;
    this.providers = options.providers ?? createOfficeProviders(options.fetch);
  }

  invoke(raw: OfficeRequest): Promise<OfficeResult> {
    if (this.closed)
      return Promise.resolve({
        ok: false,
        error: { code: "closed", message: "Office has stopped." },
      });
    const result = this.queue.then(async (): Promise<OfficeResult> => {
      if (this.closed)
        return { ok: false, error: { code: "closed", message: "Office has stopped." } };
      let request: OfficeRequest;
      try {
        request = decodeRequest(raw);
      } catch {
        return {
          ok: false,
          error: { code: "invalid_request", message: "The Office request is invalid." },
        };
      }
      try {
        await this.load();
        return await this.run(request);
      } catch (error) {
        const failure =
          error instanceof OfficeError
            ? error
            : new OfficeError(
                "network",
                "Office could not complete the request. Check the connection and try again.",
              );
        if (
          (failure.code === "authentication" || failure.code === "network") &&
          "accountId" in request &&
          request.accountId &&
          this.document
        ) {
          const status = failure.code === "authentication" ? "expired" : "offline";
          try {
            await this.save({
              ...this.document,
              accounts: this.document.accounts.map((entry) =>
                entry.account.id === request.accountId
                  ? { ...entry, account: { ...entry.account, status } }
                  : entry,
              ),
            });
          } catch {
            /* Preserve the original operation failure if status persistence also fails. */
          }
        }
        return { ok: false, error: { code: failure.code, message: failure.message } };
      }
    });
    this.queue = result.then(() => {});
    return result;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.abort.abort();
    await this.providers.close();
    await this.queue;
  }

  private now() {
    return (this.options.now ?? Date.now)();
  }
  private id() {
    return (this.options.id ?? NodeCrypto.randomUUID)();
  }
  private async load() {
    if (this.document) return;
    try {
      const saved = await this.options.storage.read();
      this.document =
        saved === null
          ? { version: 1, accounts: [], drafts: [] }
          : decodeDocument(JSON.parse(saved));
    } catch {
      throw new OfficeError(
        "storage",
        "Office data could not be read or decrypted. Existing account data has been preserved.",
      );
    }
  }
  private async save(document: Document) {
    try {
      await this.options.storage.write(JSON.stringify(document));
      this.document = document;
    } catch {
      throw new OfficeError(
        "storage",
        "Office data could not be saved securely. The change was not applied.",
      );
    }
  }
  private current(): Document {
    if (!this.document) throw new OfficeError("storage", "Office data is not available.");
    return this.document;
  }
  private accounts(): OfficeResult {
    const configuration = this.options.oauth ?? {};
    return {
      ok: true,
      accounts: this.current().accounts.map((entry) => entry.account),
      configuration: {
        google: Boolean(configuration.googleClientId?.trim()),
        microsoft: Boolean(configuration.microsoftClientId?.trim()),
        imap: true,
      },
    };
  }
  private oauthInput(
    provider: "google" | "microsoft",
    capabilities: OfficeAccount["capabilities"],
  ): OAuthInput {
    return {
      provider,
      capabilities,
      configuration: this.options.oauth ?? {},
      openExternal: this.options.openExternal,
      fetch: this.options.fetch ?? globalThis.fetch,
      signal: this.abort.signal,
      now: () => this.now(),
    };
  }
  private find(id: string) {
    const entry = this.current().accounts.find((item) => item.account.id === id);
    if (!entry)
      throw new OfficeError("not_found", "The Office account was disconnected or does not exist.");
    return entry;
  }
  private async context(id: string, capability: "mail" | "calendar"): Promise<ProviderContext> {
    let entry = this.find(id);
    if (!entry.account.capabilities.includes(capability))
      throw new OfficeError("unsupported", `This account is not connected for ${capability}.`);
    if (entry.account.provider !== "imap") {
      if (!entry.credentials.oauth)
        throw new OfficeError("authentication", "Reconnect this account to restore access.");
      if (entry.credentials.oauth.expiresAt <= this.now() + 60_000) {
        const oauth = await (this.options.refresh ?? refreshOfficeOAuth)(
          this.oauthInput(entry.account.provider, entry.account.capabilities),
          entry.credentials.oauth.refreshToken,
        );
        entry = { ...entry, credentials: { oauth } };
        await this.save({
          ...this.current(),
          accounts: this.current().accounts.map((item) => (item.account.id === id ? entry : item)),
        });
      }
    }
    return { ...entry, signal: this.abort.signal };
  }
  private async connected(id: string) {
    const entry = this.find(id);
    if (entry.account.status !== "connected")
      await this.save({
        ...this.current(),
        accounts: this.current().accounts.map((item) =>
          item.account.id === id
            ? { ...item, account: { ...item.account, status: "connected" } }
            : item,
        ),
      });
  }
  private async addAccount(account: OfficeAccount, credentials: OfficeCredentials) {
    const existing = this.current().accounts.find(
      (entry) =>
        entry.account.provider === account.provider &&
        entry.account.email.toLowerCase() === account.email.toLowerCase(),
    );
    if (existing)
      account = {
        ...account,
        id: existing.account.id,
        selectedCalendarIds: account.capabilities.includes("calendar")
          ? existing.account.selectedCalendarIds
          : [],
      };
    await this.save({
      ...this.current(),
      accounts: [
        ...this.current().accounts.filter((entry) => entry.account.id !== account.id),
        { account, credentials },
      ],
    });
    return this.accounts();
  }
  private async run(request: OfficeRequest): Promise<OfficeResult> {
    switch (request.operation) {
      case "accounts.list":
        return this.accounts();
      case "accounts.connectOAuth": {
        oauthEndpoints(request.provider, this.options.oauth ?? {});
        const capabilities = [...new Set(request.capabilities)];
        oauthScopes(request.provider, capabilities);
        const authorization = await (this.options.authorize ?? authorizeOfficeOAuth)(
          this.oauthInput(request.provider, capabilities),
        );
        return this.addAccount(
          {
            id: this.id(),
            provider: request.provider,
            email: authorization.email,
            capabilities,
            status: "connected",
            selectedCalendarIds: [],
          },
          {
            oauth: {
              accessToken: authorization.accessToken,
              refreshToken: authorization.refreshToken,
              expiresAt: authorization.expiresAt,
            },
          },
        );
      }
      case "accounts.connectImap": {
        if (/[:/\\\s]/.test(request.host) || request.host.length > 253)
          throw new OfficeError(
            "invalid_request",
            "Enter a mail server hostname without a URL or port.",
          );
        const imap = {
          host: request.host.trim(),
          port: request.port,
          username: request.username,
          password: request.password,
          tls: request.tls,
        };
        await this.providers.verifyImap(imap, this.abort.signal);
        return this.addAccount(
          {
            id: this.id(),
            provider: "imap",
            email: request.username,
            capabilities: ["mail"],
            status: "connected",
            selectedCalendarIds: [],
          },
          { imap },
        );
      }
      case "accounts.disconnect": {
        this.find(request.accountId);
        await this.save({
          ...this.current(),
          accounts: this.current().accounts.filter(
            (entry) => entry.account.id !== request.accountId,
          ),
          drafts: this.current().drafts.filter((draft) => draft.accountId !== request.accountId),
        });
        return this.accounts();
      }
      case "calendars.list": {
        const calendars = await this.providers.calendars(
          await this.context(request.accountId, "calendar"),
        );
        await this.connected(request.accountId);
        return { ok: true, calendars };
      }
      case "calendars.select": {
        const context = await this.context(request.accountId, "calendar");
        const calendars = await this.providers.calendars(context);
        const selected = [...new Set(request.calendarIds)];
        if (selected.some((id) => !calendars.some((calendar) => calendar.id === id)))
          throw new OfficeError(
            "invalid_request",
            "One of the selected calendars is no longer available.",
          );
        await this.save({
          ...this.current(),
          accounts: this.current().accounts.map((entry) =>
            entry.account.id === request.accountId
              ? {
                  ...entry,
                  account: { ...entry.account, selectedCalendarIds: selected, status: "connected" },
                }
              : entry,
          ),
        });
        return {
          ok: true,
          calendars: calendars.map((calendar) => ({
            ...calendar,
            selected: selected.includes(calendar.id),
          })),
        };
      }
      case "calendars.events":
      case "calendars.refresh": {
        const start = Date.parse(request.timeMin);
        const end = Date.parse(request.timeMax);
        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          end <= start ||
          end - start > 366 * 86_400_000
        )
          throw new OfficeError(
            "invalid_request",
            "Choose a valid calendar range of at most one year.",
          );
        const events = await this.providers.events(
          await this.context(request.accountId, "calendar"),
          new Date(start).toISOString(),
          new Date(end).toISOString(),
        );
        await this.connected(request.accountId);
        return { ok: true, events };
      }
      case "mail.list": {
        const page = await this.providers.messages(
          await this.context(request.accountId, "mail"),
          request.cursor,
          request.limit ?? 25,
        );
        await this.connected(request.accountId);
        return { ok: true, ...page };
      }
      case "mail.get": {
        const message = await this.providers.message(
          await this.context(request.accountId, "mail"),
          request.messageId,
        );
        await this.connected(request.accountId);
        return { ok: true, message };
      }
      case "drafts.list":
        return {
          ok: true,
          drafts: this.current().drafts.filter(
            (draft) => !request.accountId || draft.accountId === request.accountId,
          ),
        };
      case "drafts.save": {
        const account = this.find(request.accountId).account;
        if (!account.capabilities.includes("mail"))
          throw new OfficeError("unsupported", "Local email drafts require a mail account.");
        const existing = request.id
          ? this.current().drafts.find((draft) => draft.id === request.id)
          : undefined;
        if (request.id && (!existing || existing.accountId !== request.accountId))
          throw new OfficeError("not_found", "The local draft does not exist for this account.");
        if (!existing && this.current().drafts.length >= 500)
          throw new OfficeError(
            "unsupported",
            "Remove an old local draft before creating another.",
          );
        const draft: OfficeDraft = {
          id: request.id ?? this.id(),
          accountId: request.accountId,
          to: request.to,
          subject: request.subject,
          text: request.text,
          updatedAt: new Date(this.now()).toISOString(),
        };
        await this.save({
          ...this.current(),
          drafts: [...this.current().drafts.filter((entry) => entry.id !== draft.id), draft],
        });
        return {
          ok: true,
          drafts: this.current().drafts.filter((entry) => entry.accountId === request.accountId),
        };
      }
      case "drafts.delete": {
        await this.save({
          ...this.current(),
          drafts: this.current().drafts.filter((entry) => entry.id !== request.id),
        });
        return { ok: true, drafts: this.current().drafts };
      }
    }
  }
}
