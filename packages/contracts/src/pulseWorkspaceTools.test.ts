import { expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { ServerConfig } from "./server.ts";
import {
  WorkspaceTask,
  WorkspaceTaskUpsert,
  WorkspaceTaskTransition,
  WorkspaceProjectConfig,
  WorkspaceProjectConfigSave,
  WorkspaceAutomationSave,
  PulseWorkspaceToolsRpcs,
} from "./pulseWorkspaceTools.ts";
const decodeTask = Schema.decodeUnknownSync(WorkspaceTask);
const decodeUpsert = Schema.decodeUnknownSync(WorkspaceTaskUpsert);
const decodeConfig = Schema.decodeUnknownSync(WorkspaceProjectConfig);
const decodeConfigSave = Schema.decodeUnknownSync(WorkspaceProjectConfigSave);
const decodeTransition = Schema.decodeUnknownSync(WorkspaceTaskTransition);
const decodeCapabilities = Schema.decodeUnknownSync(
  Schema.Struct({ pulseCapabilities: ServerConfig.fields.pulseCapabilities }),
);
const task = {
  id: "wskt_00000000-0000-0000-0000-000000000001",
  projectId: "project",
  title: "Review",
  column: "To do",
};
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
  expect(PulseWorkspaceToolsRpcs).toHaveLength(9);
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
