import type { OfficeMailSendInput } from "@t3tools/contracts";
import type { ProviderContext } from "./OfficeProviders.ts";
import { OfficeError, items, object, responseJson, string } from "./OfficeErrors.ts";

const mailbox = /^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/;
function encodedSubject(value: string) {
  return (value.match(/.{1,20}/gu) ?? [""])
    .map((part) => `=?UTF-8?B?${Buffer.from(part).toString("base64")}?=`)
    .join("\r\n ");
}

/** Each explicit invocation makes at most one send request. An uncertain response is never retried. */
export function createMailSender(fetcher: typeof globalThis.fetch = globalThis.fetch) {
  return async (context: ProviderContext, input: OfficeMailSendInput): Promise<void> => {
    if (context.account.provider === "imap")
      throw new OfficeError(
        "unsupported",
        "Sending from IMAP accounts is not configured. Use Gmail or Microsoft.",
      );
    if (
      !input.to.length ||
      input.to.length > 100 ||
      input.to.some((entry) => !mailbox.test(entry)) ||
      /[\r\n\0]/.test(input.subject) ||
      !input.text.trim()
    )
      throw new OfficeError(
        "invalid_request",
        "Enter valid recipient email addresses, a single-line subject and a message.",
      );
    if (!context.credentials.oauth)
      throw new OfficeError("authentication", "Reconnect this account before sending email.");
    const headers = {
      Authorization: `Bearer ${context.credentials.oauth.accessToken}`,
      "Content-Type": "application/json",
    };
    const signal = AbortSignal.any([context.signal, AbortSignal.timeout(30_000)]);
    let endpoint: string;
    let payload: object;
    if (context.account.provider === "google") {
      let threadId: string | undefined;
      let replyHeaders: string[] = [];
      let subject = input.subject;
      if (input.sourceMessageId) {
        const source = await responseJson(
          await fetcher(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(input.sourceMessageId)}?format=metadata`,
            { headers, signal, redirect: "error" },
          ),
        );
        const sourceHeaders = items(object(source.payload).headers).map(object);
        const header = (name: string) =>
          string(sourceHeaders.find((row) => string(row.name).toLowerCase() === name)?.value);
        const messageId = header("message-id");
        threadId = string(source.threadId);
        if (!threadId || !/^<[^<>\s]+>$/.test(messageId))
          throw new OfficeError(
            "unsupported",
            "This message has no valid reply identity. Compose a new email instead.",
          );
        const references = header("references").match(/<[^<>\s]+>/g) ?? [];
        replyHeaders = [
          `In-Reply-To: ${messageId}`,
          `References: ${[...references.slice(-20), messageId].join("\r\n ")}`,
        ];
        const originalSubject = header("subject");
        if (/[\r\n\0]/.test(originalSubject))
          throw new OfficeError("invalid_request", "The original email has an invalid subject.");
        subject = /^re:/i.test(originalSubject) ? originalSubject : `Re: ${originalSubject}`;
      }
      if (!mailbox.test(context.account.email))
        throw new OfficeError(
          "invalid_request",
          "Reconnect the account to verify its sender address.",
        );
      const mime = [
        `From: ${context.account.email}`,
        `To: ${input.to.join(",\r\n ")}`,
        `Subject: ${encodedSubject(subject)}`,
        ...replyHeaders,
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: base64",
        "",
        Buffer.from(input.text)
          .toString("base64")
          .match(/.{1,76}/g)
          ?.join("\r\n") ?? "",
      ].join("\r\n");
      endpoint = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
      payload = { raw: Buffer.from(mime).toString("base64url"), ...(threadId ? { threadId } : {}) };
    } else {
      const message = {
        subject: input.subject,
        body: { contentType: "Text", content: input.text },
        toRecipients: input.to.map((address) => ({ emailAddress: { address } })),
      };
      endpoint = input.sourceMessageId
        ? `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(input.sourceMessageId)}/reply`
        : "https://graph.microsoft.com/v1.0/me/sendMail";
      payload = input.sourceMessageId ? { message } : { message, saveToSentItems: true };
    }
    let response: Response;
    try {
      response = await fetcher(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal,
        redirect: "error",
      });
    } catch {
      throw new OfficeError(
        "network",
        "The send result could not be confirmed. Check Sent mail before trying again. Your draft has been kept.",
      );
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        throw new OfficeError(
          "authentication",
          "Sending was denied. Reconnect this account with permission to send email. Your draft has been kept.",
        );
      throw new OfficeError(
        "network",
        `Sending was not confirmed (HTTP ${response.status}). Check Sent mail before trying again. Your draft has been kept.`,
      );
    }
  };
}
