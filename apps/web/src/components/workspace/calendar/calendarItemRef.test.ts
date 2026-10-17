import { expect, it } from "vite-plus/test";
import { workspaceItemKey } from "@t3tools/contracts";
import { calendarItemRef, parseCalendarLocation } from "./calendarItemRef";

it("uses the one server occurrence identity", () => {
  const ref = calendarItemRef("wce_00000000-0000-0000-0000-000000000001");
  expect(ref.provider).toBe("workspace-calendar");
  expect(workspaceItemKey(ref)).toBe(
    "provider-resource:workspace-calendar:wce_00000000-0000-0000-0000-000000000001",
  );
  expect(parseCalendarLocation(JSON.stringify(ref))).toEqual(ref);
});

it("rejects aliases, malformed IDs and unrelated locations without host APIs", () => {
  for (const raw of [
    undefined,
    "{",
    JSON.stringify({ type: "task", taskId: "x" }),
    JSON.stringify({ type: "provider-resource", provider: "pulse-meeting", resourceId: "wce_one" }),
    JSON.stringify({
      type: "provider-resource",
      provider: "workspace-calendar",
      resourceId: "wce_one",
    }),
  ]) {
    expect(parseCalendarLocation(raw)).toBeNull();
  }
});
