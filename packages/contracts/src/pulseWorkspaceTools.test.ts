import { expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import {
  WorkspaceProjectConfig,
  WorkspaceTaskUpsert,
  WorkspaceAutomationSave,
  PulseWorkspaceToolsRpcs,
} from "./pulseWorkspaceTools.ts";
const isConfig = Schema.is(WorkspaceProjectConfig);
const isTask = Schema.is(WorkspaceTaskUpsert);
const isAutomation = Schema.is(WorkspaceAutomationSave);
it("bounds basic task settings and exposes an optional workspace family without recurrence or dependency fields", () => {
  expect(PulseWorkspaceToolsRpcs).toHaveLength(8);
  expect(
    isConfig({
      projectId: "p",
      taskColumns: Array.from({ length: 13 }, () => "Column"),
      browserThreadId: null,
    }),
  ).toBe(false);
  expect(isTask({ projectId: "p", title: "x".repeat(241), column: "To do" })).toBe(false);
  expect(isTask({ projectId: "p", title: "Review", column: "To do" })).toBe(true);
  expect(
    isAutomation({
      requestId: "invalid",
      source: { ref: { type: "url", url: "https://example.test" } },
      task: {},
    }),
  ).toBe(false);
});
