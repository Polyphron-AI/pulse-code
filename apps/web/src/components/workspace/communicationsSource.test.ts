import { expect, it } from "vite-plus/test";
import { communicationTaskDraft } from "./communicationsSource";
it("builds a host-independent source link that preserves exact native identities", () => {
  const draft = communicationTaskDraft({
    provider: "slack",
    accountId: "host account",
    conversationId: "channel&other",
    messageId: "123.456",
    threadId: "122.456",
    title: "  Follow up  ",
    text: "Quoted context",
  });
  expect(draft.source.url).toMatch(/^\/workspace\?/);
  const url = new URL(draft.source.url, "https://pulse.example");
  expect(url.searchParams.get("sourceConversation")).toBe("channel&other");
  expect(url.searchParams.get("sourceThread")).toBe("122.456");
  expect(url.searchParams.get("sourceMessage")).toBe("123.456");
  expect(draft).toMatchObject({ title: "Follow up", source: { excerpt: "Quoted context" } });
});
it("bounds editable task title and excerpt and routes email to its reader", () => {
  const draft = communicationTaskDraft({
    provider: "google",
    accountId: "a",
    conversationId: "c",
    messageId: "m",
    email: true,
    title: "x".repeat(300),
    text: "y".repeat(20000),
  });
  expect(draft.title).toHaveLength(240);
  expect(draft.source.excerpt).toHaveLength(10000);
  expect(new URL(draft.source.url, "https://pulse.example").searchParams.get("officeView")).toBe(
    "email",
  );
});
