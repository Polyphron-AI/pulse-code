// @effect-diagnostics nodeBuiltinImport:off -- Exercises the raw Node filesystem reader with disposable transcript files.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import { listTranscriptFiles, readTranscriptRecords } from "./usageTranscriptReader.ts";
import { UsageAggregator } from "./usageAggregation.ts";
import { parseRateTable } from "./usagePricing.ts";

it("reads only Grok usage logs and prices/deduplicates their records", async () => {
  const root = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "pulse-grok-usage-"));
  try {
    const session = NodePath.join(root, "synthetic-session");
    await NodeFSP.mkdir(session);
    const update = JSON.stringify({
      timestamp: Date.parse("2026-08-07T04:00:00Z"),
      params: {
        sessionId: "synthetic",
        update: {
          sessionUpdate: "turn_completed",
          prompt_id: "prompt-1",
          usage: {
            inputTokens: 100,
            outputTokens: 20,
            cachedReadTokens: 40,
            modelUsage: {
              "xai/grok-4.5": { inputTokens: 100, outputTokens: 20, cachedReadTokens: 40 },
            },
          },
        },
      },
    });
    await NodeFSP.writeFile(
      NodePath.join(session, "updates.jsonl"),
      `${update}\n${update}\nnot json\n`,
    );
    await NodeFSP.writeFile(NodePath.join(session, "chat_history.jsonl"), update);
    await NodeFSP.writeFile(NodePath.join(session, "events.jsonl"), update);
    const files = await listTranscriptFiles(root, 0, { fileName: "updates.jsonl" });
    expect(files.map((file) => NodePath.basename(file.path))).toEqual(["updates.jsonl"]);
    const records = await readTranscriptRecords(files[0]!.path, "grok");
    expect(records).toHaveLength(2);
    const aggregator = new UsageAggregator({
      timeZone: "UTC",
      sinceDay: "2026-08-01",
      untilDay: "2026-08-31",
      resolution: "day",
      rates: parseRateTable({
        "grok-4.5": {
          input_cost_per_token: 0.01,
          output_cost_per_token: 0.02,
          cache_read_input_token_cost: 0.005,
        },
      }),
    });
    for (const record of records ?? []) aggregator.add(record);
    const result = aggregator.finish();
    expect(result.duplicatesDropped).toBe(1);
    expect(result.buckets).toHaveLength(1);
    expect(result.buckets[0]).toMatchObject({
      provider: "grok",
      model: "xai/grok-4.5",
      costSource: "modelPriced",
    });
    expect(result.buckets[0]?.costUsd).toBeCloseTo(1.2);
  } finally {
    await NodeFSP.rm(root, { recursive: true, force: true });
  }
});
