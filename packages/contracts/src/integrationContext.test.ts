import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import {
  IntegrationIssueContext,
  IntegrationIssueStatusActionPreview,
} from "./integrationContext.ts";

const decodeIssueContext = Schema.decodeUnknownSync(IntegrationIssueContext);
const decodeIssueStatusActionPreview = Schema.decodeUnknownSync(
  IntegrationIssueStatusActionPreview,
);

const provenance = {
  connectionId: "pulse-issues",
  environmentId: "environment-local",
  projectId: "project-local",
  providerId: "pulse",
  providerWorkspaceId: null,
  providerProjectId: "pulse-project-1",
  resourceKind: "issue",
  resourceId: "issue-1",
  sourceUrl: null,
  fetchedAt: "2026-08-20T05:00:00.000Z",
  detailLevel: "detail",
  stale: false,
} as const;

const context = {
  provenance,
  resource: {
    kind: "issue",
    id: "issue-1",
    ref: "ISS-1",
    title: "Checkout total is stale",
    descriptionExcerpt: "The total does not refresh after quantity changes.",
    status: "todo",
    severity: "high",
    version: 7,
    updatedAt: "2026-08-20T04:55:00.000Z",
    truncated: false,
    detail: {
      description: "The total does not refresh after quantity changes.",
      labels: ["checkout"],
      assignedToId: null,
    },
  },
} as const;

const action = {
  preview: {
    previewId: "preview-1",
    connectionId: "pulse-issues",
    environmentId: "environment-local",
    projectId: "project-local",
    providerId: "pulse",
    capability: "work.write",
    operation: "issue.status.update",
    resourceKind: "issue",
    resourceId: "issue-1",
    summary: "Change Pulse Issue ISS-1 status from todo to resolved.",
    changes: [{ field: "status", before: "todo", after: "resolved" }],
    expiresAt: "2026-08-20T05:05:00.000Z",
    requiresConfirmation: true,
  },
  confirmationToken: "confirmation-1",
} as const;

describe("integration Issue context contracts", () => {
  it("decodes bounded Issue context with provenance separate from the resource", () => {
    expect(decodeIssueContext(context)).toEqual(context);
  });

  it("rejects credentials, provider payloads, heavy evidence, and oversized context", () => {
    expect(() => decodeIssueContext({ ...context, accessToken: "secret" })).toThrow();
    expect(() =>
      decodeIssueContext({
        ...context,
        resource: { ...context.resource, reports: [{ raw: "provider-body" }] },
      }),
    ).toThrow();
    expect(() =>
      decodeIssueContext({
        ...context,
        resource: { ...context.resource, descriptionExcerpt: "x".repeat(2_001) },
      }),
    ).toThrow();
    expect(() =>
      decodeIssueContext({
        ...context,
        resource: {
          ...context.resource,
          detail: { ...context.resource.detail!, labels: Array(51).fill("label") },
        },
      }),
    ).toThrow();
    expect(() =>
      decodeIssueContext({
        ...context,
        resource: {
          ...context.resource,
          detail: { ...context.resource.detail!, accessToken: "secret" },
        },
      }),
    ).toThrow();
  });

  it("requires an expiring confirm-before-write preview envelope without credentials", () => {
    expect(decodeIssueStatusActionPreview(action)).toEqual(action);
    expect(() =>
      decodeIssueStatusActionPreview({
        ...action,
        preview: { ...action.preview, requiresConfirmation: false },
      }),
    ).toThrow();
    expect(() =>
      decodeIssueStatusActionPreview({
        ...action,
        refreshToken: "secret",
      }),
    ).toThrow();
  });
});
