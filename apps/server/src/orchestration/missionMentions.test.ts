import type {
  OrchestrationManager,
  OrchestrationProject,
  OrchestrationReadModel,
  OrchestrationSchedule,
  OrchestrationThread,
} from "@t3tools/contracts";
import { MENTION_SIZE_CAP } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { MENTION_TRUNCATION_MARKER, expandMissionMentions } from "./missionMentions.ts";

const now = "2026-09-11T00:00:00.000Z";

const project = (id: string, title: string) =>
  ({
    id,
    title,
    path: `/repo/${id}`,
    createdAt: now,
    updatedAt: now,
  }) as unknown as OrchestrationProject;

const thread = (id: string, title: string) =>
  ({
    id,
    title,
    projectId: "prj_a",
    createdAt: now,
    updatedAt: now,
  }) as unknown as OrchestrationThread;

const schedule = (id: string, prompt: string) =>
  ({ id, prompt, timezone: "UTC" }) as unknown as OrchestrationSchedule;

const manager = (id: string, name: string, mission: string) =>
  ({ id, name, mission }) as unknown as OrchestrationManager;

function readModel(overrides: Partial<OrchestrationReadModel> = {}): OrchestrationReadModel {
  return {
    snapshotSequence: 1,
    projects: [project("prj_a", "Pulse Code")],
    threads: [thread("thr_a", "Fix the sidebar")],
    schedules: [schedule("sch_a", "Sweep stale branches")],
    managers: [],
    updatedAt: now,
    ...overrides,
  } as OrchestrationReadModel;
}

describe("expandMissionMentions", () => {
  it("leaves a mission with no mentions untouched", () => {
    const result = expandMissionMentions({ mission: "Keep CI green.", readModel: readModel() });
    expect(result).toEqual({ text: "Keep CI green.", truncated: false });
  });

  it("replaces a mention inline with the display name and the exact id", () => {
    const result = expandMissionMentions({
      mission: "Work only in @[project:prj_a].",
      readModel: readModel(),
    });
    expect(result.text.split("\n")[0]).toBe('Work only in Project "Pulse Code" (project prj_a).');
    expect(result.truncated).toBe(false);
  });

  it("appends one section per mentioned record", () => {
    const result = expandMissionMentions({
      mission: "Watch @[project:prj_a] and @[thread:thr_a].",
      readModel: readModel(),
    });
    expect(result.text).toBe(
      [
        'Watch Project "Pulse Code" (project prj_a) and Thread "Fix the sidebar" (thread thr_a).',
        "## Mentioned records",
        '### Project "Pulse Code" (project prj_a)',
        '### Thread "Fix the sidebar" (thread thr_a)',
      ].join("\n\n"),
    );
  });

  it("names a schedule by the first line of its prompt", () => {
    const result = expandMissionMentions({
      mission: "Coordinate with @[schedule:sch_a].",
      readModel: readModel(),
    });
    expect(result.text).toContain('Schedule "Sweep stale branches" (schedule sch_a)');
  });

  it("shortens a long schedule prompt so the pointer stays one line", () => {
    const result = expandMissionMentions({
      mission: "@[schedule:sch_long]",
      readModel: readModel({ schedules: [schedule("sch_long", "x".repeat(200))] }),
    });
    expect(result.text.split("\n")[0]).toBe(`Schedule "${"x".repeat(59)}…" (schedule sch_long)`);
  });

  it("renders an unknown id as a missing marker", () => {
    const result = expandMissionMentions({
      mission: "Watch @[thread:thr_gone].",
      readModel: readModel(),
    });
    expect(result.text).toBe(
      [
        "Watch (missing thread thr_gone).",
        "## Mentioned records",
        "### (missing thread thr_gone)",
      ].join("\n\n"),
    );
  });

  it("expands a mentioned Argo's mission in full at depth 2", () => {
    const result = expandMissionMentions({
      mission: "Defer releases to @[manager:mgr_b].",
      readModel: readModel({
        managers: [manager("mgr_b", "Release Argo", "Ship @[project:prj_a] every Friday.")],
      }),
    });
    expect(result.text).toBe(
      [
        'Defer releases to Argo "Release Argo" (manager mgr_b).',
        "## Mentioned records",
        [
          '### Argo "Release Argo" (manager mgr_b)',
          "",
          'Ship Project "Pulse Code" (project prj_a) every Friday.',
        ].join("\n"),
        '### Project "Pulse Code" (project prj_a)',
      ].join("\n\n"),
    );
  });

  it("stops at the depth cap so a third level never expands", () => {
    const result = expandMissionMentions({
      mission: "@[manager:mgr_b]",
      readModel: readModel({
        managers: [
          manager("mgr_b", "B", "@[manager:mgr_c]"),
          manager("mgr_c", "C", "@[thread:thr_a]"),
        ],
      }),
    });
    expect(result.text).toContain('### Argo "C" (manager mgr_c)');
    // thr_a is reachable only from C's mission, one level past the cap.
    expect(result.text).not.toContain("### Thread");
  });

  it("honours a caller's smaller depth", () => {
    const result = expandMissionMentions({
      mission: "@[manager:mgr_b]",
      depth: 1,
      readModel: readModel({ managers: [manager("mgr_b", "B", "@[thread:thr_a]")] }),
    });
    expect(result.text).toContain('### Argo "B" (manager mgr_b)');
    expect(result.text).not.toContain("### Thread");
  });

  it("marks a record reached twice as already expanded above", () => {
    const result = expandMissionMentions({
      mission: "@[project:prj_a] and @[manager:mgr_b]",
      readModel: readModel({ managers: [manager("mgr_b", "B", "Also @[project:prj_a].")] }),
    });
    expect(result.text).toContain(
      '### Project "Pulse Code" (project prj_a)\n\nAlready expanded above.',
    );
    expect(result.text.match(/### Project/g)).toHaveLength(2);
  });

  it("breaks a cycle between two Argos", () => {
    const result = expandMissionMentions({
      mission: "Pair with @[manager:mgr_b].",
      selfManagerId: "mgr_a",
      readModel: readModel({
        managers: [
          manager("mgr_a", "A", "Pair with @[manager:mgr_b]."),
          manager("mgr_b", "B", "Pair back with @[manager:mgr_a]."),
        ],
      }),
    });
    expect(result.text).toContain('### Argo "A" (manager mgr_a)\n\nAlready expanded above.');
    expect(result.text.match(/### Argo "A"/g)).toHaveLength(1);
  });

  it("truncates at the size cap and says so", () => {
    const body = "y".repeat(MENTION_SIZE_CAP);
    const result = expandMissionMentions({
      mission: "@[manager:mgr_big] and @[thread:thr_a]",
      readModel: readModel({ managers: [manager("mgr_big", "Big", body)] }),
    });
    expect(result.truncated).toBe(true);
    expect(result.text.endsWith(MENTION_TRUNCATION_MARKER)).toBe(true);
    expect(result.text).not.toContain('### Thread "Fix the sidebar"');
  });

  it("keeps the inline pointers when the sections are truncated", () => {
    const body = "y".repeat(MENTION_SIZE_CAP);
    const result = expandMissionMentions({
      mission: "@[manager:mgr_big]",
      readModel: readModel({ managers: [manager("mgr_big", "Big", body)] }),
    });
    expect(result.text.split("\n")[0]).toBe('Argo "Big" (manager mgr_big)');
  });

  it("replaces every occurrence inline but expands the record once", () => {
    const result = expandMissionMentions({
      mission: "@[thread:thr_a] then @[thread:thr_a]",
      readModel: readModel(),
    });
    expect(result.text.split("\n")[0]).toBe(
      'Thread "Fix the sidebar" (thread thr_a) then Thread "Fix the sidebar" (thread thr_a)',
    );
    expect(result.text.match(/### Thread/g)).toHaveLength(1);
  });

  it("gives an Argo with an empty mission a pointer, not a blank body", () => {
    const result = expandMissionMentions({
      mission: "@[manager:mgr_b]",
      readModel: readModel({ managers: [manager("mgr_b", "B", "   ")] }),
    });
    expect(result.text).toBe(
      ['Argo "B" (manager mgr_b)', "## Mentioned records", '### Argo "B" (manager mgr_b)'].join(
        "\n\n",
      ),
    );
  });
});
