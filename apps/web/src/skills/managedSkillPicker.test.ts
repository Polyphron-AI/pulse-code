import { describe, expect, it } from "vite-plus/test";

import {
  managedSkillsBlockedReason,
  staleManagedSkillSelections,
  toggleManagedSkillSelection,
} from "./managedSkillPickerLogic";

const first = { id: "review", revision: "a".repeat(64) };
const updated = { id: "review", revision: "b".repeat(64) };

describe("managed skill picker logic", () => {
  it("pins the selected revision and replaces another revision of the same skill", () => {
    expect(toggleManagedSkillSelection([], first)).toEqual([first]);
    expect(toggleManagedSkillSelection([first], updated)).toEqual([updated]);
    expect(toggleManagedSkillSelection([updated], updated)).toEqual([]);
  });

  it("does not add a thirty-third skill", () => {
    const selected = Array.from({ length: 32 }, (_, index) => ({
      id: `skill-${index}`,
      revision: index.toString(16).padStart(64, "0"),
    }));
    expect(toggleManagedSkillSelection(selected, first)).toBe(selected);
  });

  it("retains stale selections until the user removes or replaces them", () => {
    expect(staleManagedSkillSelections([first], [{ ...updated } as never])).toEqual([first]);
  });

  it("only blocks Codex turns that carry unavailable selections", () => {
    const base = {
      selected: [first],
      providerIsCodex: true,
      capabilityReady: true,
      supported: true,
      canRead: true,
      canOperate: true,
      loading: false,
      error: false,
      skills: [],
    };
    expect(managedSkillsBlockedReason(base)).toContain("changed or was removed");
    expect(managedSkillsBlockedReason({ ...base, providerIsCodex: false })).toBeNull();
    expect(managedSkillsBlockedReason({ ...base, selected: [] })).toBeNull();
  });
});
