import { describe, expect, it } from "vite-plus/test";

import { formatThreadHandoffContext, type ThreadHandoffMessage } from "./threadHandoffContext.ts";

const message = (role: ThreadHandoffMessage["role"], text: string): ThreadHandoffMessage => ({
  role,
  text,
});

describe("formatThreadHandoffContext", () => {
  it("formats the whole thread when it fits, skipping system messages", () => {
    const result = formatThreadHandoffContext([
      message("system", "internal preamble"),
      message("user", "Add a retry to the uploader"),
      message("assistant", "Done, retries three times"),
    ]);

    expect(result.truncated).toBe(false);
    expect(result.context).toBe(
      "USER:\nAdd a retry to the uploader\n\nASSISTANT:\nDone, retries three times",
    );
  });

  it("skips messages with no text and no attachments", () => {
    const result = formatThreadHandoffContext([message("user", "   ")]);

    expect(result.context).toBe("");
    expect(result.truncated).toBe(false);
  });

  it("pins the first user message and drops the middle when the thread overruns", () => {
    const result = formatThreadHandoffContext(
      [
        message("user", "GOAL: ship the uploader"),
        message("assistant", "x".repeat(400)),
        message("assistant", "the latest state"),
      ],
      200,
    );

    expect(result.truncated).toBe(true);
    expect(result.context.startsWith("USER:\nGOAL: ship the uploader")).toBe(true);
    expect(result.context).toContain("[Earlier thread content truncated]");
    expect(result.context.endsWith("ASSISTANT:\nthe latest state")).toBe(true);
    expect(result.context.length).toBeLessThanOrEqual(200);
  });

  it("keeps the tail of a message that only partially fits", () => {
    const result = formatThreadHandoffContext(
      [message("assistant", `${"a".repeat(200)}CONCLUSION`)],
      60,
    );

    expect(result.truncated).toBe(true);
    expect(result.context.endsWith("CONCLUSION")).toBe(true);
  });
});
