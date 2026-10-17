import { expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { ServerConfig } from "./server.ts";
import {
  WorkspaceTask,
  WorkspaceTaskDueOn,
  WorkspaceTaskPatch,
  WorkspaceTaskUpsert,
  WorkspaceTaskTransition,
  WorkspaceProjectConfig,
  WorkspaceProjectConfigSave,
  WorkspaceAutomationSave,
  PulseWorkspaceToolsRpcs,
  WorkspaceToolsError,
} from "./pulseWorkspaceTools.ts";
const decodeTask = Schema.decodeUnknownSync(WorkspaceTask);
const decodeUpsert = Schema.decodeUnknownSync(WorkspaceTaskUpsert);
const decodeConfig = Schema.decodeUnknownSync(WorkspaceProjectConfig);
const decodeConfigSave = Schema.decodeUnknownSync(WorkspaceProjectConfigSave);
const decodeTransition = Schema.decodeUnknownSync(WorkspaceTaskTransition);
const decodeToolsError = Schema.decodeUnknownSync(WorkspaceToolsError);
const encodeToolsError = Schema.encodeSync(WorkspaceToolsError);
const decodeCapabilities = Schema.decodeUnknownSync(
  Schema.Struct({ pulseCapabilities: ServerConfig.fields.pulseCapabilities }),
);
const task = {
  id: "wskt_00000000-0000-0000-0000-000000000001",
  projectId: "project",
  title: "Review",
  column: "To do",
};
it("keeps owner optional and accepts only the environment owner or an explicit clear", () => {
  for (const decode of [decodeTask, decodeUpsert, Schema.decodeUnknownSync(WorkspaceTaskPatch)]) {
    const input = { ...task, expectedRevision: 0 };
    expect(decode(input)).not.toHaveProperty("owner");
    for (const owner of [null, "environment-owner"])
      expect(decode({ ...input, owner })).toHaveProperty("owner", owner);
    for (const owner of ["maya", "codex", "provider:claude", "", {}])
      expect(() => decode({ ...input, owner })).toThrow();
  }
});
it("decodes the optional typed confirmation reason and preserves legacy errors", () => {
  const legacy = { _tag: "WorkspaceToolsError", kind: "conflict", message: "Reload settings." };
  expect(decodeToolsError(legacy)).toMatchObject(legacy);
  const confirmation = { ...legacy, reason: "completion-confirmation-required" };
  const decoded = decodeToolsError(confirmation);
  expect(decoded).toMatchObject(confirmation);
  expect(encodeToolsError(decoded)).toEqual(confirmation);
  expect(() => decodeToolsError({ ...legacy, reason: "unknown" })).toThrow();
});
it("decodes legacy tasks, config and upsert without new fields", () => {
  expect(decodeTask(task)).toEqual(task);
  expect(decodeUpsert(task)).toEqual(task);
  const config = { projectId: "project", taskColumns: ["To do", "Done"], browserThreadId: null };
  expect(decodeConfig(config)).toEqual(config);
  expect(decodeConfigSave(config)).toEqual(config);
});
it("rejects negative revisions and invalid transition unions", () => {
  const decode = decodeTransition;
  const input = {
    id: task.id,
    expectedRevision: 0,
    change: { type: "completion", completed: true },
  };
  expect(decode(input)).toEqual(input);
  expect(decode({ ...input, change: { type: "column", column: "Done" } }).change).toEqual({
    type: "column",
    column: "Done",
  });
  for (const value of [
    { ...input, expectedRevision: -1 },
    { ...input, change: { type: "completion", column: "Done" } },
    { ...input, change: { type: "column", completed: true } },
    { ...input, change: { type: "unknown" } },
  ])
    expect(() => decode(value)).toThrow();
  expect(() => decodeTask({ ...task, revision: -1 })).toThrow();
  expect(() =>
    decodeConfigSave({
      projectId: "project",
      taskColumns: ["Done"],
      browserThreadId: null,
      expectedRevision: -1,
    }),
  ).toThrow();
});

const isConfig = Schema.is(WorkspaceProjectConfig);
const isTask = Schema.is(WorkspaceTaskUpsert);
const isAutomation = Schema.is(WorkspaceAutomationSave);
it("bounds basic task settings and exposes an optional workspace family without recurrence or dependency fields", () => {
  expect(PulseWorkspaceToolsRpcs).toHaveLength(10);
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

it("keeps task capability optional and preserves false and true when present", () => {
  expect(decodeCapabilities({})).toEqual({});
  for (const flag of [false, true])
    expect(decodeCapabilities({ pulseCapabilities: { workspaceTasksV2: flag } })).toEqual({
      pulseCapabilities: { workspaceTasksV2: flag },
    });
});

it("validates Gregorian date-only values without accepting timestamps", () => {
  const decode = Schema.decodeUnknownSync(WorkspaceTaskDueOn);
  for (const value of ["2024-02-29", "2000-02-29", "0001-01-01", "9999-12-31"])
    expect(decode(value)).toBe(value);
  for (const value of [
    "2026-02-29",
    "2026-02-30",
    "1900-02-29",
    "2026-00-10",
    "0000-01-01",
    "2026-13-01",
    "2026-01-00",
    "2026-10-16T00:00:00Z",
    "2026-1-01",
  ])
    expect(() => decode(value)).toThrow();
});
it("preserves absent patch keys and accepts explicit metadata clears and atomic creation", () => {
  const decode = Schema.decodeUnknownSync(WorkspaceTaskPatch);
  const input = { id: task.id, expectedRevision: 2 };
  expect(decode(input)).toEqual(input);
  expect(decode({ ...input, dueOn: null, areaLabel: null })).toEqual({
    ...input,
    dueOn: null,
    areaLabel: null,
  });
  expect(decodeUpsert({ ...task, dueOn: "2026-10-16", areaLabel: "  Marketing  " })).toMatchObject({
    dueOn: "2026-10-16",
    areaLabel: "Marketing",
  });
  for (const areaLabel of ["", "   ", "x".repeat(121)])
    expect(() => decode({ ...input, areaLabel })).toThrow();
  expect(() => decode({ ...input, dueOn: "2026-02-30" })).toThrow();
});
