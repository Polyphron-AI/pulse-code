import { EnvironmentId, type MailMessageContent } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vite-plus/test";

import { useEnvironmentQuery } from "../../../state/query";
import { MailMessageView } from "./MailMessageView";

vi.mock("../../../state/query", () => ({ useEnvironmentQuery: vi.fn() }));
vi.mock("../../../mail/mailReadState", () => ({ pulseMailMessage: vi.fn() }));
vi.mock("../../ui/button", () => ({ Button: "button" }));

const cachedMessage = {
  ref: { accountId: "acct_1", mailbox: "INBOX", uidValidity: 4, uid: 7 },
  messageId: "<message@example.com>",
  subject: "Cached subject",
  seen: true,
  flagged: false,
  answered: false,
  body: { text: "Cached message body", truncated: false },
  attachments: [],
  sourceTruncated: false,
} satisfies MailMessageContent;

const refresh = vi.fn();
afterEach(() => vi.clearAllMocks());

it.each([cachedMessage, null])("shows a read failure and retry with data %j", (data) => {
  vi.mocked(useEnvironmentQuery).mockReturnValue({
    data,
    dataUpdatedAt: 0,
    error: "Mail refresh failed",
    failure: null,
    isPending: false,
    isSuccess: false,
    refresh,
  });

  const markup = renderToStaticMarkup(
    <MailMessageView
      environmentId={EnvironmentId.make("env_1")}
      item={{ type: "mail", accountId: "acct_1", messageId: "<message@example.com>" }}
      onBack={() => {}}
      onOpen={() => {}}
    />,
  );

  expect(markup).toContain('role="alert"');
  expect(markup).toContain("Mail refresh failed");
  expect(markup).toMatch(/<button[^>]*>Try again<\/button>/);
  if (data !== null) {
    expect(markup).toContain("Cached subject");
    expect(markup).toContain("Cached message body");
    expect(markup.indexOf('role="alert"')).toBeLessThan(markup.indexOf("Cached subject"));
  } else {
    expect(markup).toContain("This message is unavailable.");
    expect(markup).not.toContain("Loading");
  }
});
