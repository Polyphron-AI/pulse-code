import type { ThreadHandoffTarget } from "@t3tools/client-runtime/state/thread-handoff";
import { ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildThreadHandoffMenuItems,
  resolveThreadHandoffMenuSelection,
} from "./threadHandoffMenu";

const target = (id: string, disabled = false): ThreadHandoffTarget => ({
  instanceId: ProviderInstanceId.make(id),
  label: id,
  disabled,
});

describe("buildThreadHandoffMenuItems", () => {
  it("omits the submenu when there is nowhere to hand off to", () => {
    expect(buildThreadHandoffMenuItems([])).toEqual([]);
  });

  it("nests one prefixed entry per target and carries the disabled state", () => {
    const [item] = buildThreadHandoffMenuItems([target("claude"), target("codex", true)]);
    expect(item?.id).toBe("continue-in");
    expect(item?.subactions?.map((action) => action.id)).toEqual([
      "continue-in:claude",
      "continue-in:codex",
    ]);
    expect(item?.subactions?.map((action) => action.attributes?.disabled)).toEqual([false, true]);
  });
});

describe("resolveThreadHandoffMenuSelection", () => {
  const targets = [target("claude"), target("codex", true)];

  it("ignores events that are not handoffs", () => {
    expect(resolveThreadHandoffMenuSelection({ event: "delete", targets })).toBeNull();
    // A snooze preset id is the other prefixed encoding in this menu.
    expect(resolveThreadHandoffMenuSelection({ event: "snooze:tonight", targets })).toBeNull();
  });

  it("resolves a live target", () => {
    expect(resolveThreadHandoffMenuSelection({ event: "continue-in:claude", targets })?.label).toBe(
      "claude",
    );
  });

  it("refuses targets that went away or cannot start", () => {
    expect(resolveThreadHandoffMenuSelection({ event: "continue-in:codex", targets })).toBeNull();
    expect(resolveThreadHandoffMenuSelection({ event: "continue-in:gone", targets })).toBeNull();
  });
});
