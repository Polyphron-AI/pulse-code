import type { OfficeAccount, OfficeCalendar, OfficeEvent, OfficeMessage } from "@t3tools/contracts";
import { OfficeError, items, object, responseJson, string } from "./OfficeErrors.ts";
import type { OAuthTokens } from "./OfficeOAuth.ts";

export interface ImapCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  tls: "implicit" | "starttls";
}
export interface OfficeCredentials {
  oauth?: OAuthTokens;
  imap?: ImapCredentials;
}
export interface ProviderContext {
  account: OfficeAccount;
  credentials: OfficeCredentials;
  signal: AbortSignal;
}
export interface MessagePage {
  messages: OfficeMessage[];
  nextCursor?: string;
}
export interface OfficeProviders {
  verifyImap: (input: ImapCredentials, signal: AbortSignal) => Promise<void>;
  calendars: (context: ProviderContext) => Promise<OfficeCalendar[]>;
  events: (context: ProviderContext, timeMin: string, timeMax: string) => Promise<OfficeEvent[]>;
  messages: (
    context: ProviderContext,
    cursor: string | undefined,
    limit: number,
  ) => Promise<MessagePage>;
  message: (context: ProviderContext, id: string) => Promise<OfficeMessage>;
  close: () => Promise<void>;
}
const text = (value: unknown, max = 4096) => string(value).slice(0, max);
const safeId = (value: unknown) => {
  const id = string(value);
  if (!id || id.length > 1024)
    throw new OfficeError("network", "The provider returned an invalid record.");
  return id;
};
const address = (value: unknown) => {
  const entry = object(object(value).emailAddress);
  return text(entry.address);
};

export function createOfficeProviders(
  fetcher: typeof globalThis.fetch = globalThis.fetch,
): OfficeProviders {
  const activeImap = new Set<{ close: () => void }>();
  const get = async (
    context: ProviderContext,
    url: string,
    headers: Record<string, string> = {},
  ) => {
    if (!context.credentials.oauth)
      throw new OfficeError("authentication", "Reconnect this account to restore access.");
    return responseJson(
      await fetcher(url, {
        headers: { ...headers, Authorization: `Bearer ${context.credentials.oauth.accessToken}` },
        redirect: "error",
        signal: AbortSignal.any([context.signal, AbortSignal.timeout(30_000)]),
      }),
    );
  };
  const googleMessage = async (
    context: ProviderContext,
    id: string,
    full: boolean,
  ): Promise<OfficeMessage> => {
    const query = new URLSearchParams({ format: full ? "full" : "metadata" });
    const result = await get(
      context,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?${query}`,
    );
    const payload = object(result.payload);
    const headers = items(payload.headers).map(object);
    const header = (name: string) =>
      text(headers.find((entry) => string(entry.name).toLowerCase() === name)?.value);
    const parts: string[] = [];
    const visit = (part: Record<string, unknown>, depth = 0) => {
      if (depth > 30) return;
      if (part.mimeType === "text/plain" && !part.filename) {
        const data = string(object(part.body).data);
        if (data) parts.push(Buffer.from(data, "base64url").toString("utf8").slice(0, 2_000_000));
      }
      for (const child of items(part.parts)) visit(object(child), depth + 1);
    };
    if (full) visit(payload);
    return {
      id: safeId(result.id),
      accountId: context.account.id,
      subject: header("subject"),
      from: header("from"),
      to: header("to"),
      date: header("date"),
      preview: text(result.snippet),
      unread: items(result.labelIds).includes("UNREAD"),
      ...(full
        ? {
            text:
              parts.join("\n").slice(0, 2_000_000) ||
              "This message has no plain-text body. HTML and attachments are not displayed in this version.",
          }
        : {}),
    };
  };
  const graphMessage = (
    context: ProviderContext,
    result: Record<string, unknown>,
    full: boolean,
  ): OfficeMessage => ({
    id: safeId(result.id),
    accountId: context.account.id,
    subject: text(result.subject),
    from: address(result.from),
    to: items(result.toRecipients).map(address).join(", ").slice(0, 4096),
    date: text(result.receivedDateTime),
    preview: text(result.bodyPreview),
    unread: result.isRead === false,
    ...(full
      ? {
          text:
            object(result.body).contentType === "text"
              ? text(object(result.body).content, 2_000_000)
              : "This message has no plain-text body. HTML and attachments are not displayed in this version.",
        }
      : {}),
  });
  async function withImap<T>(
    credentials: ImapCredentials,
    signal: AbortSignal,
    run: (client: import("imapflow").ImapFlow) => Promise<T>,
  ): Promise<T> {
    if (signal.aborted) throw new OfficeError("cancelled", "The mailbox request was cancelled.");
    const { ImapFlow } = await import("imapflow");
    const client = new ImapFlow({
      host: credentials.host,
      port: credentials.port,
      secure: credentials.tls === "implicit",
      doSTARTTLS: credentials.tls === "starttls",
      auth: { user: credentials.username, pass: credentials.password },
      logger: false,
      tls: { rejectUnauthorized: true },
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 30_000,
    });
    // ImapFlow emits errors separately from command rejections. Never expose the raw error/log.
    client.on("error", () => {});
    const abort = () => client.close();
    signal.addEventListener("abort", abort, { once: true });
    activeImap.add(client);
    try {
      await client.connect();
      return await run(client);
    } catch (error) {
      if (error instanceof OfficeError) throw error;
      if (signal.aborted) throw new OfficeError("cancelled", "The mailbox request was cancelled.");
      if (object(error).authenticationFailed === true)
        throw new OfficeError(
          "authentication",
          "The mail server rejected authentication. Check the username and app password.",
        );
      throw new OfficeError(
        "network",
        "Unable to read the IMAP mailbox. Check the server, TLS settings and credentials.",
      );
    } finally {
      signal.removeEventListener("abort", abort);
      activeImap.delete(client);
      client.close();
    }
  }
  const imapCredentials = (context: ProviderContext) => {
    if (!context.credentials.imap)
      throw new OfficeError("authentication", "Reconnect the IMAP account.");
    return context.credentials.imap;
  };
  return {
    verifyImap: (input, signal) => withImap(input, signal, async () => {}),
    calendars: async (context) => {
      if (context.account.provider !== "google")
        throw new OfficeError("unsupported", "Calendar currently supports Google accounts.");
      const calendars: OfficeCalendar[] = [];
      let cursor = "";
      do {
        const result = await get(
          context,
          `https://www.googleapis.com/calendar/v3/users/me/calendarList?${new URLSearchParams({ maxResults: "250", ...(cursor ? { pageToken: cursor } : {}) })}`,
        );
        for (const item of items(result.items)) {
          const row = object(item);
          const id = safeId(row.id);
          calendars.push({
            id,
            accountId: context.account.id,
            name: text(row.summaryOverride) || text(row.summary),
            selected: context.account.selectedCalendarIds.includes(id),
          });
        }
        cursor = string(result.nextPageToken);
        if (calendars.length > 2000)
          throw new OfficeError(
            "unsupported",
            "This account has too many calendars to load in this version.",
          );
      } while (cursor);
      return calendars;
    },
    events: async (context, timeMin, timeMax) => {
      const events: OfficeEvent[] = [];
      for (const calendarId of context.account.selectedCalendarIds) {
        let cursor = "";
        do {
          const query = new URLSearchParams({
            timeMin,
            timeMax,
            singleEvents: "true",
            orderBy: "startTime",
            maxResults: "250",
            ...(cursor ? { pageToken: cursor } : {}),
          });
          const result = await get(
            context,
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${query}`,
          );
          for (const item of items(result.items)) {
            const row = object(item);
            if (row.status === "cancelled") continue;
            const start = object(row.start);
            const end = object(row.end);
            const meetingUrl = text(row.hangoutLink);
            events.push({
              id: safeId(row.id),
              accountId: context.account.id,
              calendarId,
              title: text(row.summary) || "Untitled event",
              start: text(start.dateTime) || text(start.date),
              end: text(end.dateTime) || text(end.date),
              ...(row.location ? { location: text(row.location) } : {}),
              ...(meetingUrl.startsWith("https://") ? { meetingUrl } : {}),
            });
          }
          cursor = string(result.nextPageToken);
          if (events.length > 5000)
            throw new OfficeError(
              "unsupported",
              "Choose a smaller date range to load this calendar.",
            );
        } while (cursor);
      }
      return events.sort((a, b) => a.start.localeCompare(b.start));
    },
    messages: async (context, cursor, limit) => {
      if (context.account.provider === "google") {
        const result = await get(
          context,
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ maxResults: String(limit), labelIds: "INBOX", ...(cursor ? { pageToken: cursor } : {}) })}`,
        );
        const messages: OfficeMessage[] = [];
        // Keep Gmail's per-message metadata reads bounded instead of fanning out an entire mailbox.
        const references = items(result.messages);
        for (let offset = 0; offset < references.length; offset += 5)
          messages.push(
            ...(await Promise.all(
              references
                .slice(offset, offset + 5)
                .map((item) => googleMessage(context, safeId(object(item).id), false)),
            )),
          );
        return {
          messages,
          ...(result.nextPageToken ? { nextCursor: string(result.nextPageToken) } : {}),
        };
      }
      if (context.account.provider === "microsoft") {
        const initial = `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?${new URLSearchParams({ $top: String(limit), $orderby: "receivedDateTime desc", $select: "id,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead" })}`;
        const url = new URL(cursor || initial);
        if (
          url.origin !== "https://graph.microsoft.com" ||
          !url.pathname.startsWith("/v1.0/me/mailFolders/inbox/messages") ||
          url.username ||
          url.password ||
          url.hash
        )
          throw new OfficeError("invalid_request", "The mailbox page cursor is invalid.");
        const result = await get(context, url.href);
        return {
          messages: items(result.value).map((item) => graphMessage(context, object(item), false)),
          ...(result["@odata.nextLink"] ? { nextCursor: string(result["@odata.nextLink"]) } : {}),
        };
      }
      return withImap(imapCredentials(context), context.signal, async (client) => {
        const mailbox = await client.mailboxOpen("INBOX", { readOnly: true });
        const total = mailbox.exists;
        const upper = cursor ? Number(cursor) : total;
        if (!Number.isSafeInteger(upper) || upper < 0 || upper > total)
          throw new OfficeError(
            "invalid_request",
            "The mailbox changed. Refresh the inbox before loading another page.",
          );
        if (upper === 0) return { messages: [] };
        const lower = Math.max(1, upper - limit + 1);
        const rows = await client.fetchAll(`${lower}:${upper}`, {
          uid: true,
          envelope: true,
          flags: true,
        });
        const renderAddress = (values: { address?: string; name?: string }[] | undefined) =>
          (values ?? [])
            .map((entry) => entry.address || entry.name || "")
            .join(", ")
            .slice(0, 4096);
        const messages = rows.toReversed().map(
          (row): OfficeMessage => ({
            id: `${mailbox.uidValidity}:${row.uid}`,
            accountId: context.account.id,
            subject: text(row.envelope?.subject),
            from: renderAddress(row.envelope?.from),
            to: renderAddress(row.envelope?.to),
            date: row.envelope?.date?.toISOString() ?? "",
            preview: "",
            unread: !row.flags?.has("\\Seen"),
          }),
        );
        return { messages, ...(lower > 1 ? { nextCursor: String(lower - 1) } : {}) };
      });
    },
    message: async (context, id) => {
      if (context.account.provider === "google") return googleMessage(context, id, true);
      if (context.account.provider === "microsoft")
        return graphMessage(
          context,
          await get(
            context,
            `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(id)}?$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview,isRead,body`,
            { Prefer: 'outlook.body-content-type="text"' },
          ),
          true,
        );
      return withImap(imapCredentials(context), context.signal, async (client) => {
        const mailbox = await client.mailboxOpen("INBOX", { readOnly: true });
        const [validity, uid] = id.split(":");
        if (validity !== String(mailbox.uidValidity) || !uid || !/^\d+$/.test(uid))
          throw new OfficeError("not_found", "This message reference is stale. Refresh the inbox.");
        const metadata = await client.fetchOne(uid, { size: true }, { uid: true });
        if (!metadata)
          throw new OfficeError("not_found", "This message is no longer in the inbox.");
        if ((metadata.size ?? 0) > 10_000_000)
          throw new OfficeError(
            "unsupported",
            "This message is larger than the 10 MB reading limit.",
          );
        const row = await client.fetchOne(uid, { source: true, flags: true }, { uid: true });
        if (!row || !row.source)
          throw new OfficeError("not_found", "This message is no longer available.");
        const { simpleParser } = await import("mailparser");
        const parsed = await simpleParser(row.source, {
          skipHtmlToText: true,
          skipTextToHtml: true,
          skipImageLinks: true,
        });
        const recipient = Array.isArray(parsed.to)
          ? parsed.to.map((entry) => entry.text).join(", ")
          : parsed.to?.text;
        return {
          id,
          accountId: context.account.id,
          subject: text(parsed.subject),
          from: text(parsed.from?.text),
          to: text(recipient),
          date: parsed.date?.toISOString() ?? "",
          preview: text(parsed.text),
          unread: !row.flags?.has("\\Seen"),
          text:
            text(parsed.text, 2_000_000) ||
            "This message has no plain-text body. HTML and attachments are not displayed in this version.",
        };
      });
    },
    close: async () => {
      for (const client of activeImap) client.close();
      activeImap.clear();
    },
  };
}
