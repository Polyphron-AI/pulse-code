import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { ExecutionEnvironmentDescriptor } from "./environment.ts";
import {
  IssueCaptureInput,
  IssueConnectionSnapshot,
  IssueListResult,
  IssueReport,
  IssueThreadLinkResult,
  IssueUpdateInput,
} from "./issues.ts";
import { WS_METHODS } from "./rpc.ts";

const decodeConnectionSnapshot = Schema.decodeUnknownSync(IssueConnectionSnapshot);
const decodeIssueList = Schema.decodeUnknownSync(IssueListResult);
const decodeIssueUpdate = Schema.decodeUnknownSync(IssueUpdateInput);
const decodeIssueCapture = Schema.decodeUnknownSync(IssueCaptureInput);
const decodeIssueReport = Schema.decodeUnknownSync(IssueReport);
const decodeIssueThreadLink = Schema.decodeUnknownSync(IssueThreadLinkResult);
const decodeEnvironmentDescriptor = Schema.decodeUnknownSync(ExecutionEnvironmentDescriptor);

describe("native Issues contracts", () => {
  it("keeps the stored Pulse token out of connection snapshots", () => {
    const snapshot = decodeConnectionSnapshot({
      status: "connected",
      endpoint: "https://pulse.example.test",
      tokenConfigured: true,
      projects: [
        {
          id: "pulse-project-1",
          name: "Storefront",
          slug: "storefront",
          archivedAt: null,
          allowLoopbackOrigins: true,
        },
      ],
      mappings: [
        {
          projectId: "project-1",
          pulseProjectId: "pulse-project-1",
          pulseProjectName: "Storefront",
          pulseProjectSlug: "storefront",
          updatedAt: "2026-08-19T00:00:00.000Z",
        },
      ],
      lastCheckedAt: "2026-08-19T00:00:00.000Z",
      error: null,
    });

    expect(snapshot.tokenConfigured).toBe(true);
    expect("token" in snapshot).toBe(false);
  });

  it("decodes a normalized Pulse ticket page", () => {
    const result = decodeIssueList({
      issues: [
        {
          id: "ticket-1",
          pulseProjectId: "pulse-project-1",
          ref: "T-42",
          title: "Checkout fails after returning",
          description: "The saved cart cannot be restored.",
          severity: "high",
          status: "triage",
          assignedToId: null,
          labels: ["checkout"],
          resolvedAt: null,
          archivedAt: null,
          version: 3,
          createdAt: "2026-08-19T00:00:00.000Z",
          updatedAt: "2026-08-19T00:05:00.000Z",
          assignedTo: null,
          reportCount: 2,
        },
      ],
      total: 1,
      limit: 50,
      offset: 0,
    });

    expect(result.issues[0]?.ref).toBe("T-42");
    expect(result.issues[0]?.reportCount).toBe(2);
  });

  it("preserves reverse lifecycle states on a patch", () => {
    const unassign = decodeIssueUpdate({
      projectId: "project-1",
      issueId: "ticket-1",
      expectedVersion: 4,
      status: "todo",
      assignedToId: null,
      labels: [],
    });

    expect(unassign.assignedToId).toBeNull();
    expect(unassign.labels).toEqual([]);
    expect(unassign.status).toBe("todo");
  });

  it("accepts one-time inline and server artifact capture media", () => {
    const capture = decodeIssueCapture({
      projectId: "project-1",
      origin: "http://localhost:3000",
      title: "Checkout button does nothing",
      description: "Captured from Preview.",
      severity: "high",
      pageUrl: "http://localhost:3000/checkout",
      media: [
        {
          source: "data-url",
          kind: "screenshot",
          fileName: "checkout.png",
          mimeType: "image/png",
          dataUrl: "data:image/png;base64,AAAA",
        },
        {
          source: "preview-artifact",
          kind: "video",
          fileName: "checkout.webm",
          mimeType: "video/webm",
          artifactPath: "C:/preview-artifacts/checkout.webm",
        },
      ],
    });

    expect(capture.media?.map((entry) => entry.source)).toEqual(["data-url", "preview-artifact"]);
  });

  it("decodes lazy report evidence and reversible thread linkage", () => {
    const report = decodeIssueReport({
      id: "report-1",
      pulseProjectId: "pulse-project-1",
      issueId: "ticket-1",
      title: "Checkout button does nothing",
      description: "Captured from Preview.",
      severity: "high",
      kind: "bug",
      status: "in_progress",
      duplicateOfId: null,
      environmentLabel: "local",
      reporterEmail: null,
      version: 2,
      createdAt: "2026-08-19T00:00:00.000Z",
      updatedAt: "2026-08-19T00:05:00.000Z",
      screenshotStatus: "uploaded",
      transcriptionStatus: "",
      transcriptionSource: "",
      transcriptionConfidence: null,
      labels: [],
      reporterIdentity: null,
      environment: { browser: "Chrome" },
      consoleEntries: [{ level: "error", message: "boom" }],
      networkEntries: [],
      errors: [{ message: "boom" }],
      breadcrumbs: [],
      backendContext: null,
      pageMetadata: { url: "http://localhost:3000/checkout" },
      screenshotUrl: "https://media.example.test/report-1.png",
      annotatedScreenshotUrl: null,
      audioUrl: null,
      videoUrl: null,
    });
    const removed = decodeIssueThreadLink({ link: null });

    expect(report.consoleEntries).toHaveLength(1);
    expect(removed.link).toBeNull();
  });

  it("treats a missing Issues capability as unsupported under version skew", () => {
    const descriptor = decodeEnvironmentDescriptor({
      environmentId: "environment-1",
      label: "Local",
      platform: { os: "windows", arch: "x64" },
      serverVersion: "0.0.33",
      capabilities: { repositoryIdentity: true },
    });

    expect(descriptor.capabilities.issues).toBeUndefined();
    expect(WS_METHODS.issuesCapture).toBe("issues.capture");
    expect(WS_METHODS.issuesRemoveThreadLink).toBe("issues.removeThreadLink");
  });
});
