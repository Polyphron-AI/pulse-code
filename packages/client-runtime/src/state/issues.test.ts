import {
  EnvironmentId,
  type ExecutionEnvironmentDescriptor,
  IssueId,
  ProjectId,
  PulseProjectId,
  ThreadId,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Layer from "effect/Layer";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createIssueEnvironmentAtoms,
  issuesEnvironmentCommandKey,
  supportsNativeIssues,
} from "./issues.ts";

const descriptor = (issues: boolean | undefined): ExecutionEnvironmentDescriptor => ({
  environmentId: EnvironmentId.make("environment-1"),
  label: "Local",
  platform: { os: "windows", arch: "x64" },
  serverVersion: "0.0.33",
  capabilities: {
    repositoryIdentity: true,
    ...(issues === undefined ? {} : { issues }),
  },
});

describe("native Issues client runtime", () => {
  it("gates Issues probes on the advertised server capability", () => {
    expect(supportsNativeIssues(descriptor(true))).toBe(true);
    expect(supportsNativeIssues(descriptor(false))).toBe(false);
    expect(supportsNativeIssues(descriptor(undefined))).toBe(false);
  });

  it("isolates every query by environment before colliding project and Issue IDs", () => {
    const runtime = Atom.runtime(Layer.empty) as unknown as Atom.AtomRuntime<
      EnvironmentRegistry,
      never
    >;
    const issues = createIssueEnvironmentAtoms(runtime);
    const firstEnvironment = EnvironmentId.make("environment-1");
    const secondEnvironment = EnvironmentId.make("environment-2");
    const input = {
      projectId: ProjectId.make("project-1"),
      issueId: IssueId.make("issue-1"),
    };

    expect(issues.detail({ environmentId: firstEnvironment, input })).toBe(
      issues.detail({ environmentId: firstEnvironment, input: { ...input } }),
    );
    expect(issues.detail({ environmentId: firstEnvironment, input })).not.toBe(
      issues.detail({ environmentId: secondEnvironment, input }),
    );
    expect(issues.threadLink({ environmentId: firstEnvironment, input })).not.toBe(
      issues.forThread({
        environmentId: firstEnvironment,
        input: { threadId: ThreadId.make("issue-1") },
      }),
    );
  });

  it("exposes bounded query families, serialized mutations, and explicit refresh hooks", () => {
    const runtime = Atom.runtime(Layer.empty) as unknown as Atom.AtomRuntime<
      EnvironmentRegistry,
      never
    >;
    const issues = createIssueEnvironmentAtoms(runtime);
    const environmentId = EnvironmentId.make("environment-1");

    expect(issues.connection({ environmentId, input: {} })).toBe(
      issues.connection({ environmentId, input: {} }),
    );
    expect(issues.list).toBeTypeOf("function");
    expect(issues.reports).toBeTypeOf("function");
    expect(issues.reportDetail).toBeTypeOf("function");
    expect(issues.activity).toBeTypeOf("function");
    expect(issues.assignees).toBeTypeOf("function");
    expect(issues.update.label).toBe("environment-data:issues:update");
    expect(issues.capture.label).toBe("environment-data:issues:capture");
    expect(issues.refresh.connection).toBeTypeOf("function");
    expect(issues.refresh.detail).toBeTypeOf("function");
    expect(issues.refresh.forThread).toBeTypeOf("function");
    expect(issuesEnvironmentCommandKey({ environmentId })).toBe(environmentId);
    expect(
      issuesEnvironmentCommandKey({ environmentId: EnvironmentId.make("environment-2") }),
    ).not.toBe(issuesEnvironmentCommandKey({ environmentId }));
  });

  it("keys mapping and report queries without exposing Pulse ingest material", () => {
    const runtime = Atom.runtime(Layer.empty) as unknown as Atom.AtomRuntime<
      EnvironmentRegistry,
      never
    >;
    const issues = createIssueEnvironmentAtoms(runtime);
    const environmentId = EnvironmentId.make("environment-1");
    const projectId = ProjectId.make("project-1");

    expect(
      issues.reportDetail({
        environmentId,
        input: { projectId, reportId: "report-1" as never },
      }),
    ).not.toBe(
      issues.reportDetail({
        environmentId,
        input: { projectId, reportId: "report-2" as never },
      }),
    );
    expect(PulseProjectId.make("pulse-project-1")).toBe("pulse-project-1");
  });
});
