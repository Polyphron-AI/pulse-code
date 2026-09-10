import type { MailAccount, MailDraft, MailMessageDetail } from "@t3tools/contracts";

export type MailDraftContent = MailDraft["content"];

/** Splits an address field without splitting commas in quoted display names. */
function tokenizeMailRecipients(value: string) {
  const addresses: string[] = [];
  let token = "";
  let quoted = false;
  let escaped = false;
  let angle = false;
  for (const character of value) {
    if (escaped) {
      token += character;
      escaped = false;
      continue;
    }
    if (character === "\\" && quoted) {
      token += character;
      escaped = true;
      continue;
    }
    if (character === '"') quoted = !quoted;
    if (!quoted && character === "<") angle = true;
    if (!quoted && character === ">") angle = false;
    if (!quoted && !angle && (character === "," || character === ";" || character === "\n")) {
      if (token.trim()) addresses.push(token.trim());
      token = "";
    } else {
      token += character;
    }
  }
  if (token.trim()) addresses.push(token.trim());
  return { addresses, incomplete: quoted || angle };
}

/** Keeps unfinished recipients intact while autosaving a draft. */
export function splitMailRecipients(value: string): string[] {
  return tokenizeMailRecipients(value).addresses;
}

export function parseMailRecipients(value: string): string[] {
  const { addresses, incomplete } = tokenizeMailRecipients(value);
  if (incomplete || addresses.some((address) => !mailAddressKey(address))) {
    throw new Error("Enter complete email addresses, separated by commas.");
  }
  return uniqueMailRecipients(addresses);
}

/** Used for recipient matching, not as a claim that an address can receive mail. */
export function mailAddressKey(value: string): string | null {
  if (/[\r\n]/u.test(value)) return null;
  const bracket = value.match(/<([^<>]+)>\s*$/u);
  const address = (bracket?.[1] ?? value).trim();
  return /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/u.test(address) ? address.toLowerCase() : null;
}

export function uniqueMailRecipients(values: readonly string[], exclude: readonly string[] = []) {
  const seen = new Set(exclude.map(mailAddressKey).filter((value) => value !== null));
  return values.filter((value) => {
    const key = mailAddressKey(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createMailDraftContent(accountId: string): MailDraftContent {
  return { accountId, to: [], cc: [], bcc: [], subject: "", text: "", attachments: [] };
}

/** Replies stay on the source account and never copy Bcc recipients. */
export function buildMailReply(
  detail: MailMessageDetail,
  account: MailAccount,
  mode: "reply" | "replyAll" | "forward",
): MailDraftContent {
  const { message } = detail;
  const content = createMailDraftContent(account.id);
  const subject = message.subject;
  const quoted = detail.text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  if (mode === "forward") {
    return {
      ...content,
      subject: /^(fwd?|fw):/iu.test(subject) ? subject : `Fwd: ${subject}`,
      text: `\n\n---------- Forwarded message ----------\nFrom: ${message.from}\nDate: ${message.date ?? "Unknown"}\nSubject: ${subject}\nTo: ${message.to.join(", ")}\n\n${detail.text}`,
    };
  }
  const senders = detail.replyTo.length ? detail.replyTo : [message.from];
  const otherSenders = uniqueMailRecipients(senders, [account.email]);
  const to = uniqueMailRecipients(
    mode === "replyAll" || !otherSenders.length ? [...otherSenders, ...message.to] : otherSenders,
    [account.email],
  );
  return {
    ...content,
    to,
    cc: mode === "replyAll" ? uniqueMailRecipients(message.cc, [account.email, ...to]) : [],
    subject: /^re:/iu.test(subject) ? subject : `Re: ${subject}`,
    text: `\n\nOn ${message.date ?? "an unknown date"}, ${message.from} wrote:\n${quoted}`,
    ...(message.messageId ? { inReplyTo: message.messageId, references: [message.messageId] } : {}),
  };
}
