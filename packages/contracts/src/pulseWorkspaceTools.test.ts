import { expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { ServerConfig } from "./server.ts";
import {
  WorkspaceProjectOverviewQuery,
  WorkspaceProjectOverviewPage,
  WorkspaceTask,
  WorkspaceTaskQuery,
  WorkspaceTaskPage,
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
const isPulseCapabilities = Schema.is(ServerConfig.fields.pulseCapabilities);
const decodeQuery = Schema.decodeUnknownSync(WorkspaceTaskQuery);
const decodePage = Schema.decodeUnknownSync(WorkspaceTaskPage);
const decodeTask = Schema.decodeUnknownSync(WorkspaceTask);
const decodeUpsert = Schema.decodeUnknownSync(WorkspaceTaskUpsert);
const decodeConfig = Schema.decodeUnknownSync(WorkspaceProjectConfig);
it("decodes legacy and explicitly cleared Drive root configurations", () => {
  const legacy = { projectId: "project", taskColumns: ["To do", "Done"], browserThreadId: null };
  expect(decodeConfig(legacy).driveRoot).toBeUndefined();
  expect(decodeConfig({ ...legacy, driveRoot: null }).driveRoot).toBeNull();
});
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
it("serializes bounded confirmation counts while preserving omitted counts", () => {
  const config = {
    projectId: "project",
    taskColumns: ["To do", "Done"],
    browserThreadId: null,
    expectedRevision: 0,
    confirmCompletionChanges: true,
  };
  const error = {
    _tag: "WorkspaceToolsError",
    kind: "conflict",
    reason: "completion-confirmation-required",
    message: "Confirm completion changes.",
  };
  expect(decodeConfigSave(config)).not.toHaveProperty("expectedAffectedCount");
  expect(decodeToolsError(error)).not.toHaveProperty("affectedCount");
  for (const count of [0, 2]) {
    expect(decodeConfigSave({ ...config, expectedAffectedCount: count })).toHaveProperty(
      "expectedAffectedCount",
      count,
    );
    expect(encodeToolsError(decodeToolsError({ ...error, affectedCount: count }))).toEqual({
      ...error,
      affectedCount: count,
    });
  }
  for (const count of [-1, 1.5, "2", null]) {
    expect(() => decodeConfigSave({ ...config, expectedAffectedCount: count })).toThrow();
    expect(() => decodeToolsError({ ...error, affectedCount: count })).toThrow();
  }
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
  expect(PulseWorkspaceToolsRpcs).toHaveLength(12);
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

it("normalizes and bounds summary queries before paging", () => {
  const decode = decodeQuery;
  expect(decode({})).toEqual({ state: "all", owner: "all", limit: 50 });
  expect(decode({ text: "  keyword  ", owner: "unassigned", limit: 100 })).toMatchObject({
    text: "keyword",
    owner: "unassigned",
    limit: 100,
  });
  for (const input of [
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { text: "x".repeat(241) },
    { cursor: "x".repeat(8193) },
    { state: "unknown" },
    { owner: "maya" },
    { dueFrom: "2026-02-30" },
    { dueFrom: "2026-10-17", dueTo: "2026-10-16" },
  ])
    expect(() => decode(input)).toThrow();
  const page = {
    tasks: [
      {
        ...task,
        projectTitle: "Project",
        revision: 0,
        done: false,
        dueOn: null,
        areaLabel: null,
        owner: null,
      },
    ],
    total: 1,
    openTotal: 1,
    nextCursor: null,
    projects: [],
    laneTotals: [],
  };
  expect(decodePage(page)).toEqual(page);
  const { owner: _owner, ...withoutOwner } = page.tasks[0]!;
  expect(() => decodePage({ ...page, tasks: [withoutOwner] })).toThrow();
});

it("decodes old-server descriptions and preserves upstream config fields on the wire", () => {
  const legacy = {
    projectId: "project",
    taskColumns: ["Inbox", "Released"],
    browserThreadId: null,
    completedColumn: "Released",
    revision: 7,
    driveRoot: {
      linkId: "wl_00000000-0000-0000-0000-000000000001",
      connectionId: "drv_00000000-0000-0000-0000-000000000001",
      fileId: "folder",
    },
  };
  expect(decodeConfig(legacy)).toEqual(legacy);
  expect(decodeConfigSave(legacy)).not.toHaveProperty("description");
  for (const description of [null, "", "  Brand and growth  "]) {
    expect(decodeConfig({ ...legacy, description })).toEqual({ ...legacy, description });
    expect(decodeConfigSave({ ...legacy, description })).toHaveProperty("description", description);
  }
});
it.each(["x".repeat(600), "\u{1f680}".repeat(300), ` ${"x".repeat(598)} `])(
  "accepts a raw description of exactly 600 UTF-16 units %#",
  (description) => {
    const input = {
      projectId: "project",
      taskColumns: ["To do", "Done"],
      browserThreadId: null,
      description,
    };
    expect(description.length).toBe(600);
    expect(decodeConfig(input).description).toBe(description);
    expect(decodeConfigSave(input).description).toBe(description);
  },
);
it.each(["x".repeat(601), "\u{1f680}".repeat(300) + "x", ` ${"x".repeat(600)} `])(
  "rejects oversized raw descriptions before trimming %#",
  (description) => {
    const input = {
      projectId: "project",
      taskColumns: ["To do", "Done"],
      browserThreadId: null,
      description,
    };
    expect(() => decodeConfig(input)).toThrow();
    expect(() => decodeConfigSave(input)).toThrow();
  },
);

it("bounds overview queries and preserves raw multi-line descriptions", () => {
  const decode = Schema.decodeUnknownSync(WorkspaceProjectOverviewQuery);
  expect(decode({})).toEqual({ limit: 50, filter: "", drive: "all", order: "title" });
  for (const input of [
    { limit: 0 },
    { limit: 51 },
    { limit: 1.5 },
    { filter: "x".repeat(257) },
    { cursor: "x".repeat(2049) },
    { cursor: "" },
    { order: "recent" },
  ])
    expect(() => decode(input)).toThrow();
  const project = {
    projectId: "p",
    title: "",
    description: "Line 1\nLine 2",
    driveRoot: "none",
    channels: { count: null, complete: false, providers: [] },
  };
  const page = Schema.decodeUnknownSync(WorkspaceProjectOverviewPage);
  expect(page({ projects: [project], incomplete: false }).projects[0]?.description).toBe(
    project.description,
  );
  expect(() =>
    page({ projects: Array.from({ length: 51 }, () => project), incomplete: false }),
  ).toThrow();
  expect(() =>
    page({
      projects: [
        {
          ...project,
          members: { count: 8, complete: false, source: "Slack", observedAt: "2026-10-13" },
        },
      ],
      incomplete: false,
    }),
  ).toThrow();
  expect(() =>
    page({ projects: [{ ...project, members: { count: 8, complete: true } }], incomplete: false }),
  ).toThrow();
});
it("registers the optional project overview RPC", () => {
  expect(
    PulseWorkspaceToolsRpcs.some((rpc) => rpc._tag === "pulse.workspace.listProjectOverview"),
  ).toBe(true);
  expect(isPulseCapabilities({ workspaceProjectOverview: true })).toBe(true);
});
