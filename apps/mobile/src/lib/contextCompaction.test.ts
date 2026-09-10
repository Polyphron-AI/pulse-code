import { EventId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import { isThreadContextCompacting } from "./contextCompaction";

const input: Parameters<typeof isThreadContextCompacting>[0] = {
  messages: [],
  activities: [],
  latestTurn: null,
  session: null,
  queuedMessages: [{ messageId: "compact-new", text: " /compact ", attachments: [] }],
  dispatchingMessageId: "compact-new",
};
describe("isThreadContextCompacting", () => {
  it("shows a dispatched request before server history arrives", () =>
    expect(isThreadContextCompacting(input)).toBe(true));
  it("ignores queued requests that are not dispatching", () =>
    expect(isThreadContextCompacting({ ...input, dispatchingMessageId: null })).toBe(false));
  it("treats attachments as a normal message", () =>
    expect(
      isThreadContextCompacting({
        ...input,
        queuedMessages: [{ ...input.queuedMessages[0]!, attachments: [{}] }],
      }),
    ).toBe(false));
  it.each(["context-compaction", "provider.turn.start.failed"])(
    "only clears matching %s receipts",
    (kind) => {
      const activity = {
        id: EventId.make("receipt"),
        kind,
        tone: "info" as const,
        summary: "Done",
        turnId: null,
        createdAt: "2026-09-01T00:00:00.000Z",
        payload: { requestId: "compact-old" },
      };
      expect(isThreadContextCompacting({ ...input, activities: [activity] })).toBe(true);
      expect(
        isThreadContextCompacting({
          ...input,
          activities: [{ ...activity, payload: { requestId: "compact-new" } }],
        }),
      ).toBe(false);
    },
  );
});
