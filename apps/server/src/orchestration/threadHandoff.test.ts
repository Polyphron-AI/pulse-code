import { describe, expect, it } from "vite-plus/test";
import {
  CheckpointRef,
  MessageId,
  TurnId,
  type OrchestrationCheckpointSummary,
  type OrchestrationMessage,
} from "@t3tools/contracts";

import {
  collectThreadHandoffMessages,
  planThreadHandoff,
  renderFallbackThreadHandoffSummary,
  renderThreadHandoffDigest,
  renderThreadHandoffTranscript,
} from "./threadHandoff.ts";

const AT = "2026-01-01T00:00:00.000Z";

function message(input: {
  id: string;
  role: OrchestrationMessage["role"];
  text: string;
  turnId?: string | null;
  streaming?: boolean;
  createdAt?: string;
}): OrchestrationMessage {
  const createdAt = input.createdAt ?? AT;
  return {
    id: MessageId.make(input.id),
    role: input.role,
    text: input.text,
    turnId:
      input.turnId === undefined ? null : input.turnId === null ? null : TurnId.make(input.turnId),
    streaming: input.streaming ?? false,
    createdAt,
    updatedAt: createdAt,
  };
}

function checkpoint(
  turnCount: number,
  paths: ReadonlyArray<string>,
): OrchestrationCheckpointSummary {
  return {
    turnId: TurnId.make(`turn-${turnCount}`),
    checkpointTurnCount: turnCount,
    checkpointRef: CheckpointRef.make(`refs/t3/checkpoints/x/turn/${turnCount}`),
    status: "ready",
    files: paths.map((path) => ({ path, kind: "modified", additions: 1, deletions: 0 })),
    assistantMessageId: null,
    completedAt: AT,
  };
}

describe("threadHandoff", () => {
  it("keeps user messages and only the final assistant message per turn", () => {
    const messages = collectThreadHandoffMessages([
      message({ id: "u1", role: "user", text: "Fix the bug", createdAt: "2026-01-01T00:00:01Z" }),
      message({
        id: "a1",
        role: "assistant",
        text: "Looking...",
        turnId: "t1",
        createdAt: "2026-01-01T00:00:02Z",
      }),
      message({
        id: "a2",
        role: "assistant",
        text: "Fixed in foo.ts",
        turnId: "t1",
        createdAt: "2026-01-01T00:00:03Z",
      }),
      message({
        id: "a3",
        role: "assistant",
        text: "partial",
        turnId: "t2",
        streaming: true,
        createdAt: "2026-01-01T00:00:04Z",
      }),
      message({ id: "u2", role: "user", text: "   ", createdAt: "2026-01-01T00:00:05Z" }),
    ]);

    expect(messages).toEqual([
      { role: "user", text: "Fix the bug" },
      { role: "assistant", text: "Fixed in foo.ts" },
    ]);
  });

  it("splits into an omitted head and a verbatim tail within limits", () => {
    const source = Array.from({ length: 10 }, (_, index) =>
      message({
        id: `m${index}`,
        role: index % 2 === 0 ? "user" : "assistant",
        text: `message ${index}`,
        turnId: `t${Math.floor(index / 2)}`,
        createdAt: `2026-01-01T00:00:${String(index).padStart(2, "0")}Z`,
      }),
    );
    const plan = planThreadHandoff({
      messages: source,
      checkpoints: [],
      limits: { maxVerbatimMessages: 4, maxVerbatimChars: 10_000, maxFiles: 40 },
    });

    expect(plan.messages).toHaveLength(10);
    expect(plan.omitted).toHaveLength(6);
    expect(plan.verbatim.map((entry) => entry.text)).toEqual([
      "message 6",
      "message 7",
      "message 8",
      "message 9",
    ]);
  });

  it("always keeps the newest message even when it alone exceeds the character budget", () => {
    const plan = planThreadHandoff({
      messages: [
        message({ id: "u1", role: "user", text: "short", createdAt: "2026-01-01T00:00:01Z" }),
        message({
          id: "a1",
          role: "assistant",
          text: "x".repeat(500),
          turnId: "t1",
          createdAt: "2026-01-01T00:00:02Z",
        }),
      ],
      checkpoints: [],
      limits: { maxVerbatimMessages: 60, maxVerbatimChars: 100, maxFiles: 40 },
    });

    expect(plan.verbatim).toHaveLength(1);
    expect(plan.verbatim[0]?.role).toBe("assistant");
    expect(plan.omitted).toHaveLength(1);
  });

  it("dedupes and caps checkpoint files in turn order", () => {
    const plan = planThreadHandoff({
      messages: [],
      checkpoints: [
        checkpoint(2, ["src/b.ts", "src/c.ts"]),
        checkpoint(1, ["src/a.ts", "src/b.ts"]),
      ],
      limits: { maxVerbatimMessages: 60, maxVerbatimChars: 60_000, maxFiles: 3 },
    });

    expect(plan.files).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
  });

  it("renders a verbatim digest when nothing was omitted", () => {
    const plan = planThreadHandoff({
      messages: [
        message({ id: "u1", role: "user", text: "Add tests", createdAt: "2026-01-01T00:00:01Z" }),
        message({
          id: "a1",
          role: "assistant",
          text: "Added foo.test.ts",
          turnId: "t1",
          createdAt: "2026-01-01T00:00:02Z",
        }),
      ],
      checkpoints: [checkpoint(1, ["foo.test.ts"])],
    });
    const digest = renderThreadHandoffDigest({
      sourceLabel: "Codex / gpt-5.4",
      plan,
      summary: null,
    });

    expect(digest.basis).toBe("verbatim");
    expect(digest.messageCount).toBe(2);
    expect(digest.omittedCount).toBe(0);
    expect(digest.files).toEqual(["foo.test.ts"]);
    expect(digest.text).toContain("A different model (Codex / gpt-5.4)");
    expect(digest.text).toContain(
      "## Conversation\n\nUser: Add tests\n\nAssistant: Added foo.test.ts",
    );
    expect(digest.text).toContain("## Files touched in this thread\n\n- foo.test.ts");
    expect(digest.text).not.toContain("omitted");
    expect(digest.text.endsWith("## Next instruction from the user")).toBe(true);
  });

  it("uses the generated summary for the omitted part when one is provided", () => {
    const plan = planThreadHandoff({
      messages: [
        message({ id: "u1", role: "user", text: "old", createdAt: "2026-01-01T00:00:01Z" }),
        message({ id: "u2", role: "user", text: "new", createdAt: "2026-01-01T00:00:02Z" }),
      ],
      checkpoints: [],
      limits: { maxVerbatimMessages: 1, maxVerbatimChars: 60_000, maxFiles: 40 },
    });
    const digest = renderThreadHandoffDigest({
      sourceLabel: "Claude Code / claude-opus-5",
      plan,
      summary: "## Objective\n- Ship it",
    });

    expect(digest.basis).toBe("generated");
    expect(digest.omittedCount).toBe(1);
    expect(digest.text).toContain("[1 earlier message omitted. Summary of the omitted part:]");
    expect(digest.text).toContain("## Objective\n- Ship it");
    expect(digest.text).toContain("User: new");
    expect(digest.text).not.toContain("User: old");
  });

  it("falls back to first lines when the summary is missing or blank", () => {
    const omitted = [
      { role: "user" as const, text: "First line of a long request\nsecond line" },
      { role: "assistant" as const, text: "y".repeat(300) },
    ];
    const fallback = renderFallbackThreadHandoffSummary(omitted);

    expect(fallback).toContain("- User: First line of a long request");
    expect(fallback).not.toContain("second line");
    expect(fallback).toContain(`- Assistant: ${"y".repeat(240)}...`);

    const plan = planThreadHandoff({
      messages: [
        message({ id: "u1", role: "user", text: "old", createdAt: "2026-01-01T00:00:01Z" }),
        message({ id: "u2", role: "user", text: "new", createdAt: "2026-01-01T00:00:02Z" }),
      ],
      checkpoints: [],
      limits: { maxVerbatimMessages: 1, maxVerbatimChars: 60_000, maxFiles: 40 },
    });
    const digest = renderThreadHandoffDigest({ sourceLabel: "Codex", plan, summary: "   " });
    expect(digest.basis).toBe("fallback");
    expect(digest.text).toContain("No model summary was available.");
  });

  it("renders transcripts with role prefixes", () => {
    expect(
      renderThreadHandoffTranscript([
        { role: "user", text: "hi" },
        { role: "assistant", text: "hello" },
      ]),
    ).toBe("User: hi\n\nAssistant: hello");
  });
});
