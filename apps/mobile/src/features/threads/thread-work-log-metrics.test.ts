import { describe, expect, it } from "vite-plus/test";

import type { ThreadFeedActivity } from "../../lib/threadActivity";
import {
  collapsedWorkLogHeight,
  fleetCardHeight,
  fleetCardMemberCount,
  fleetCardSlotCount,
  MAX_FLEET_CARD_CHIPS,
  visibleWorkLogActivities,
} from "./thread-work-log-metrics";

const BASE_FONT_SIZE = 16;

function activity(overrides: Partial<ThreadFeedActivity> & { id: string }): ThreadFeedActivity {
  return {
    createdAt: "2026-08-22T00:00:00.000Z",
    turnId: null,
    summary: "Ran a tool",
    detail: null,
    canExpand: false,
    getFullDetail: () => null,
    getCopyText: () => "",
    icon: "wrench",
    toolLike: true,
    status: "success",
    ...overrides,
  };
}

function spawnRow(
  id: string,
  agentTaskIds: ReadonlyArray<string>,
  workflowId: string | null = null,
) {
  return activity({
    id,
    summary: "Kicked off subagents",
    icon: "agent",
    status: "neutral",
    agentSpawn: { workflowId, agentTaskIds },
  });
}

describe("visibleWorkLogActivities", () => {
  it("drops neutral tool rows but keeps in-flight fleet rows", () => {
    const rows = visibleWorkLogActivities([
      activity({ id: "noise", status: "neutral" }),
      activity({ id: "done", status: "success" }),
      spawnRow("fleet", ["a", "b"]),
    ]);

    expect(rows.map((row) => row.id)).toEqual(["done", "fleet"]);
  });
});

describe("fleetCardSlotCount", () => {
  it("renders one slot per direct spawn", () => {
    expect(fleetCardSlotCount(spawnRow("f", ["a", "b"]).agentSpawn!)).toBe(2);
  });

  it("excludes the workflow coordinator, which is the card header", () => {
    expect(fleetCardMemberCount(spawnRow("f", ["run", "a", "b"], "run").agentSpawn!)).toBe(2);
    expect(fleetCardSlotCount(spawnRow("f", ["run", "a", "b"], "run").agentSpawn!)).toBe(2);
  });

  it("keeps a slot for a fleet that has only just spawned", () => {
    expect(fleetCardSlotCount(spawnRow("f", []).agentSpawn!)).toBe(1);
    expect(fleetCardSlotCount(spawnRow("f", ["run"], "run").agentSpawn!)).toBe(1);
  });

  it("caps a large fleet so the card cannot eat the feed", () => {
    const wide = spawnRow("f", ["a", "b", "c", "d", "e", "f", "g"]).agentSpawn!;
    expect(fleetCardSlotCount(wide)).toBe(MAX_FLEET_CARD_CHIPS);
    expect(fleetCardMemberCount(wide)).toBe(7);
  });
});

describe("fleetCardHeight", () => {
  it("grows one row per slot", () => {
    const one = fleetCardHeight(spawnRow("f", ["a"]).agentSpawn!);
    const two = fleetCardHeight(spawnRow("f", ["a", "b"]).agentSpawn!);

    expect(one).toBe(2 + 8 + 32 + 32);
    expect(two - one).toBe(33);
  });

  it("stops growing at the chip cap", () => {
    expect(fleetCardHeight(spawnRow("f", ["a", "b", "c"]).agentSpawn!)).toBe(
      fleetCardHeight(spawnRow("f", ["a", "b", "c", "d", "e"]).agentSpawn!),
    );
  });
});

describe("collapsedWorkLogHeight", () => {
  it("measures nothing when every row is filtered out", () => {
    expect(
      collapsedWorkLogHeight([activity({ id: "noise", status: "neutral" })], BASE_FONT_SIZE),
    ).toBe(0);
  });

  it("reserves the card's full height for a fleet row", () => {
    const fleet = spawnRow("fleet", ["a", "b"]);
    const withFleet = collapsedWorkLogHeight([activity({ id: "tool" }), fleet], BASE_FONT_SIZE);
    const withPlainRow = collapsedWorkLogHeight(
      [activity({ id: "tool" }), activity({ id: "other" })],
      BASE_FONT_SIZE,
    );

    expect(withFleet - withPlainRow).toBe(fleetCardHeight(fleet.agentSpawn!) - 32);
  });

  it("adds the label height only when a row is not tool-like", () => {
    const toolsOnly = collapsedWorkLogHeight([activity({ id: "tool" })], BASE_FONT_SIZE);
    const withMessage = collapsedWorkLogHeight(
      [activity({ id: "tool" }), activity({ id: "message", toolLike: false })],
      BASE_FONT_SIZE,
    );

    expect(withMessage - toolsOnly).toBe(32 + 1 + collapsedWorkLogHeaderHeight());
  });

  it("scales the label with the base font size", () => {
    const rows = [activity({ id: "message", toolLike: false })];

    expect(collapsedWorkLogHeight(rows, 22)).toBeGreaterThan(
      collapsedWorkLogHeight(rows, BASE_FONT_SIZE),
    );
  });
});

/** The label height the module adds, measured through the module itself. */
function collapsedWorkLogHeaderHeight(): number {
  const toolRow = activity({ id: "tool" });
  const messageRow = activity({ id: "message", toolLike: false });
  return (
    collapsedWorkLogHeight([messageRow], BASE_FONT_SIZE) -
    collapsedWorkLogHeight([toolRow], BASE_FONT_SIZE)
  );
}
