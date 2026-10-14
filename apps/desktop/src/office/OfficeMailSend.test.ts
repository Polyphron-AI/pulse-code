import { describe, expect, it, vi } from "vite-plus/test";
import { createMailSender } from "./OfficeMailSend.ts";
import type { ProviderContext } from "./OfficeProviders.ts";
const context = (provider: "google" | "microsoft" | "imap" = "google"): ProviderContext => ({
  account: {
    id: "account",
    provider,
    email: "sender@example.com",
    capabilities: ["mail", "mailSend"],
    status: "connected",
    selectedCalendarIds: [],
  },
  credentials: { oauth: { accessToken: "secret", refreshToken: "secret", expiresAt: 999999 } },
  signal: new AbortController().signal,
});
const message = { to: ["recipient@example.com"], subject: "Proposal", text: "Hello 😀" };
describe("Office email sending", () => {
  it("sends Gmail MIME with native thread identity and bounded References", async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes("format=metadata"))
        return Response.json({
          threadId: "thread",
          payload: {
            headers: [
              { name: "Message-ID", value: "<original@example.com>" },
              { name: "References", value: "<older@example.com>" },
              { name: "Subject", value: "Proposal" },
            ],
          },
        });
      expect(String(url)).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("error");
      const payload = JSON.parse(String(init?.body));
      expect(payload.threadId).toBe("thread");
      const raw = Buffer.from(payload.raw, "base64url").toString();
      expect(raw).toContain("To: recipient@example.com");
      expect(raw).toContain("In-Reply-To: <original@example.com>");
      expect(raw).toContain("References: <older@example.com>\r\n <original@example.com>");
      expect(raw).toContain(Buffer.from(message.text).toString("base64"));
      return Response.json({ id: "sent" });
    });
    await createMailSender(fetcher)(context(), { ...message, sourceMessageId: "source" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("uses Graph reply with explicitly reviewed recipients and accepts 202 without a JSON body", async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://graph.microsoft.com/v1.0/me/messages/source/reply");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        message: {
          toRecipients: [{ emailAddress: { address: "recipient@example.com" } }],
          body: { contentType: "Text", content: message.text },
        },
      });
      return new Response(null, { status: 202 });
    });
    await createMailSender(fetcher)(context("microsoft"), {
      ...message,
      sourceMessageId: "source",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("uses Graph sendMail for a new message", async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toBe("https://graph.microsoft.com/v1.0/me/sendMail");
      expect(JSON.parse(String(init?.body)).saveToSentItems).toBe(true);
      return new Response(null, { status: 202 });
    });
    await createMailSender(fetcher)(context("microsoft"), message);
  });
  it("never retries an ambiguous send failure", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("connection lost secret");
    });
    await expect(createMailSender(fetcher)(context(), message)).rejects.toThrow(
      "Check Sent mail before trying again",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects header injection and unconfigured IMAP before any network request", async () => {
    const fetcher = vi.fn();
    const send = createMailSender(fetcher);
    await expect(
      send(context(), { ...message, subject: "Hello\r\nBcc: victim@example.com" }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    await expect(send(context(), { ...message, to: ["bad\n@example.com"] })).rejects.toMatchObject({
      code: "invalid_request",
    });
    await expect(send(context("imap"), message)).rejects.toMatchObject({ code: "unsupported" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
