import { describe, expect, it } from "vite-plus/test";

import {
  AssistantId,
  ManagerId,
  ProjectId,
  ProviderInstanceId,
  ScheduleId,
  ThreadId,
} from "@t3tools/contracts";
import type { OrchestrationShellSnapshot, OrchestrationShellStreamEvent } from "@t3tools/contracts";

import { applyShellStreamEvent } from "./shellReducer.ts";

const baseSnapshot: OrchestrationShellSnapshot = {
  snapshotSequence: 0,
  projects: [],
  threads: [],
  updatedAt: "2026-04-01T00:00:00.000Z",
};

const stubProject = {
  id: ProjectId.make("project-1"),
  title: "Test Project",
  workspaceRoot: "/workspace/test",
  repositoryIdentity: null,
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
} as const;

const stubThread = {
  id: ThreadId.make("thread-1"),
  projectId: ProjectId.make("project-1"),
  title: "Test Thread",
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
  runtimeMode: "full-access" as const,
  interactionMode: "default" as const,
  branch: null,
  worktreePath: null,
  latestTurn: null,
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  latestUserMessageAt: null,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
  session: null,
} as const;

const stubSchedule = {
  id: ScheduleId.make("schedule-1"),
  scope: { _tag: "project" as const, projectId: ProjectId.make("project-1") },
  hourLocal: 9,
  minuteLocal: 30,
  timezone: "Africa/Johannesburg",
  prompt: "Run the daily maintenance checklist.",
  handoffPathTemplate: "handoff/{date}.md",
  maxRunMinutes: 15,
  maxTurnMinutes: 10,
  pausedAt: null,
  projectStates: [],
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  deletedAt: null,
} as const;

const stubManager = {
  id: ManagerId.make("manager-1"),
  name: "Argo",
  scope: { _tag: "project" as const, projectId: ProjectId.make("project-1") },
  mission: "Keep the build green.",
  childModelSelection: null,
  childRuntimeMode: "auto-accept-edits" as const,
  maxChildren: 8 as const,
  intervalMinutes: 30 as const,
  threadId: null,
  pausedAt: null,
  lastCycleAt: null,
  cycleRequestedAt: null,
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
  deletedAt: null,
} as const;

const stubAssistant = {
  id: AssistantId.make("assistant-1"),
  name: "Luna",
  avatar: null,
  modelSelection: null,
  instructions: "",
  threadId: null,
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
} as const;

describe("applyShellStreamEvent", () => {
  it("ignores stale project upserts without mutating the snapshot", () => {
    const snapshotWithProject: OrchestrationShellSnapshot = {
      ...baseSnapshot,
      snapshotSequence: 4,
      projects: [stubProject],
    };

    for (const sequence of [3, 4]) {
      const next = applyShellStreamEvent(snapshotWithProject, {
        kind: "project-upserted",
        sequence,
        project: { ...stubProject, title: "Stale Title" },
      });

      expect(next).toBe(snapshotWithProject);
      expect(next.snapshotSequence).toBe(4);
      expect(next.projects[0]?.title).toBe("Test Project");
    }
  });

  describe("project-upserted", () => {
    it("adds a new project", () => {
      const event: OrchestrationShellStreamEvent = {
        kind: "project-upserted",
        sequence: 1,
        project: stubProject,
      };

      const next = applyShellStreamEvent(baseSnapshot, event);

      expect(next.projects).toHaveLength(1);
      expect(next.projects[0]?.id).toBe("project-1");
      expect(next.snapshotSequence).toBe(1);
    });

    it("updates an existing project", () => {
      const snapshotWithProject: OrchestrationShellSnapshot = {
        ...baseSnapshot,
        projects: [stubProject],
      };

      const updatedProject = { ...stubProject, title: "Updated Title" };
      const event: OrchestrationShellStreamEvent = {
        kind: "project-upserted",
        sequence: 2,
        project: updatedProject,
      };

      const next = applyShellStreamEvent(snapshotWithProject, event);

      expect(next.projects).toHaveLength(1);
      expect(next.projects[0]?.title).toBe("Updated Title");
      expect(next.snapshotSequence).toBe(2);
    });
  });

  describe("project-removed", () => {
    it("removes a project by id", () => {
      const snapshotWithProject: OrchestrationShellSnapshot = {
        ...baseSnapshot,
        projects: [stubProject],
      };

      const event: OrchestrationShellStreamEvent = {
        kind: "project-removed",
        sequence: 3,
        projectId: ProjectId.make("project-1"),
      };

      const next = applyShellStreamEvent(snapshotWithProject, event);

      expect(next.projects).toHaveLength(0);
      expect(next.snapshotSequence).toBe(3);
    });
  });

  describe("thread-upserted", () => {
    it("adds a new thread", () => {
      const event: OrchestrationShellStreamEvent = {
        kind: "thread-upserted",
        sequence: 4,
        thread: stubThread,
      };

      const next = applyShellStreamEvent(baseSnapshot, event);

      expect(next.threads).toHaveLength(1);
      expect(next.threads[0]?.id).toBe("thread-1");
      expect(next.snapshotSequence).toBe(4);
    });

    it("updates an existing thread", () => {
      const snapshotWithThread: OrchestrationShellSnapshot = {
        ...baseSnapshot,
        threads: [stubThread],
      };

      const updatedThread = { ...stubThread, title: "Updated Thread" };
      const event: OrchestrationShellStreamEvent = {
        kind: "thread-upserted",
        sequence: 5,
        thread: updatedThread,
      };

      const next = applyShellStreamEvent(snapshotWithThread, event);

      expect(next.threads).toHaveLength(1);
      expect(next.threads[0]?.title).toBe("Updated Thread");
    });
  });

  describe("thread-removed", () => {
    it("removes a thread by id", () => {
      const snapshotWithThread: OrchestrationShellSnapshot = {
        ...baseSnapshot,
        threads: [stubThread],
      };

      const event: OrchestrationShellStreamEvent = {
        kind: "thread-removed",
        sequence: 6,
        threadId: ThreadId.make("thread-1"),
      };

      const next = applyShellStreamEvent(snapshotWithThread, event);

      expect(next.threads).toHaveLength(0);
      expect(next.snapshotSequence).toBe(6);
    });
  });

  describe("schedule events", () => {
    it("adds, updates, and removes a schedule", () => {
      const added = applyShellStreamEvent(baseSnapshot, {
        kind: "schedule-upserted",
        sequence: 7,
        schedule: stubSchedule,
      });
      const updated = applyShellStreamEvent(added, {
        kind: "schedule-upserted",
        sequence: 8,
        schedule: { ...stubSchedule, pausedAt: "2026-04-01T01:00:00.000Z" },
      });
      const removed = applyShellStreamEvent(updated, {
        kind: "schedule-removed",
        sequence: 9,
        scheduleId: stubSchedule.id,
      });

      expect(added.schedules).toEqual([stubSchedule]);
      expect(updated.schedules?.[0]?.pausedAt).toBe("2026-04-01T01:00:00.000Z");
      expect(removed.schedules).toEqual([]);
      expect(removed.snapshotSequence).toBe(9);
    });
  });

  describe("manager events", () => {
    it("adds, updates, and removes a manager", () => {
      const added = applyShellStreamEvent(baseSnapshot, {
        kind: "manager-upserted",
        sequence: 11,
        manager: stubManager,
      });
      const updated = applyShellStreamEvent(added, {
        kind: "manager-upserted",
        sequence: 12,
        manager: { ...stubManager, pausedAt: "2026-04-01T01:00:00.000Z" },
      });
      const removed = applyShellStreamEvent(updated, {
        kind: "manager-removed",
        sequence: 13,
        managerId: stubManager.id,
      });

      expect(added.managers).toEqual([stubManager]);
      expect(updated.managers).toHaveLength(1);
      expect(updated.managers?.[0]?.pausedAt).toBe("2026-04-01T01:00:00.000Z");
      expect(removed.managers).toEqual([]);
      expect(removed.snapshotSequence).toBe(13);
    });

    it("ignores a stale manager event", () => {
      const added = applyShellStreamEvent(baseSnapshot, {
        kind: "manager-upserted",
        sequence: 11,
        manager: stubManager,
      });
      const stale = applyShellStreamEvent(added, {
        kind: "manager-removed",
        sequence: 5,
        managerId: stubManager.id,
      });
      expect(stale).toBe(added);
    });
  });

  describe("assistant events", () => {
    it("adds and updates the assistant", () => {
      const added = applyShellStreamEvent(baseSnapshot, {
        kind: "assistant-upserted",
        sequence: 21,
        assistant: stubAssistant,
      });
      const updated = applyShellStreamEvent(added, {
        kind: "assistant-upserted",
        sequence: 22,
        assistant: { ...stubAssistant, name: "Nova" },
      });

      expect(added.assistants).toEqual([stubAssistant]);
      expect(updated.assistants).toHaveLength(1);
      expect(updated.assistants?.[0]?.name).toBe("Nova");
      expect(updated.snapshotSequence).toBe(22);
    });

    it("ignores a stale assistant event", () => {
      const added = applyShellStreamEvent(baseSnapshot, {
        kind: "assistant-upserted",
        sequence: 21,
        assistant: stubAssistant,
      });
      const stale = applyShellStreamEvent(added, {
        kind: "assistant-upserted",
        sequence: 5,
        assistant: { ...stubAssistant, name: "Nova" },
      });
      expect(stale).toBe(added);
    });
  });

  it("returns original snapshot for unrecognized event kinds", () => {
    const unknownEvent = { kind: "unknown-future-event", sequence: 99 } as any;
    const next = applyShellStreamEvent(baseSnapshot, unknownEvent);
    expect(next).toBe(baseSnapshot);
  });
});
