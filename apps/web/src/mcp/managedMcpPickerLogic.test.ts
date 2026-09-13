import { describe, expect, it } from "vite-plus/test";

import {
  filterManagedMcpEntries,
  managedMcpStatusLabel,
  toggleManagedMcpSelection,
  type ManagedMcpEntry,
} from "./managedMcpPickerLogic";

const entries: ReadonlyArray<ManagedMcpEntry> = [
  { id: "github", name: "GitHub", source: "pulse", status: "available" },
  {
    id: "linear",
    name: "Linear",
    description: "Issues and projects",
    source: "pulse",
    status: "sign-in-required",
  },
];

describe("managed MCP picker logic", () => {
  it("filters by name, id, description, and status detail without changing an empty search", () => {
    expect(filterManagedMcpEntries(entries, "")).toBe(entries);
    expect(filterManagedMcpEntries(entries, "ISSUES")).toEqual([entries[1]]);
    expect(filterManagedMcpEntries(entries, "github")).toEqual([entries[0]]);
  });

  it("adds and removes an explicit selection without mutating the input", () => {
    const selected = ["github"];
    expect(toggleManagedMcpSelection(selected, "linear")).toEqual(["github", "linear"]);
    expect(toggleManagedMcpSelection(selected, "github")).toEqual([]);
    expect(selected).toEqual(["github"]);
  });

  it("uses honest labels for known, unknown, and failed states", () => {
    expect(managedMcpStatusLabel(entries[0]!)).toBe("Available");
    expect(managedMcpStatusLabel({ ...entries[0]!, status: "unknown" })).toBe("Status unknown");
    expect(managedMcpStatusLabel({ ...entries[0]!, status: "error" })).toBe("Connection error");
    expect(managedMcpStatusLabel({ ...entries[0]!, statusMessage: "Token expired" })).toBe(
      "Token expired",
    );
  });
});
