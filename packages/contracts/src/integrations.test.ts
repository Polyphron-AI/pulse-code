import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { ExecutionEnvironmentDescriptor } from "./environment.ts";
import { WS_METHODS, WsRpcGroup } from "./rpc.ts";
import {
  IntegrationActionPreview,
  IntegrationAuditReceipt,
  IntegrationConnectionSnapshot,
  IntegrationContextProvenance,
  IntegrationOperationError,
} from "./integrations.ts";

const decodeConnection = Schema.decodeUnknownSync(IntegrationConnectionSnapshot);
const decodeContext = Schema.decodeUnknownSync(IntegrationContextProvenance);
const decodePreview = Schema.decodeUnknownSync(IntegrationActionPreview);
const decodeReceipt = Schema.decodeUnknownSync(IntegrationAuditReceipt);
const decodeEnvironment = Schema.decodeUnknownSync(ExecutionEnvironmentDescriptor);
const decodeLegacyEnvironment = Schema.decodeUnknownSync(
  Schema.Struct({
    environmentId: Schema.String,
    label: Schema.String,
    platform: Schema.Struct({
      os: Schema.Literals(["darwin", "linux", "windows", "unknown"]),
      arch: Schema.Literals(["arm64", "x64", "other"]),
    }),
    serverVersion: Schema.String,
    capabilities: Schema.Struct({ repositoryIdentity: Schema.Boolean }),
  }),
);

const connection = {
  connectionId: "connection-1",
  environmentId: "environment-1",
  providerId: "pulse",
  state: "connected",
  accountHint: "engineering@example.test",
  endpointHint: "https://pulse.example.test",
  credentialConfigured: true,
  capabilities: ["work.read", "work.write", "workspace.read"],
  health: {
    state: "connected",
    lastCheckedAt: "2026-08-19T17:00:00.000Z",
    lastSuccessfulAt: "2026-08-19T17:00:00.000Z",
    failure: null,
  },
  mappings: [
    {
      projectId: "project-1",
      providerWorkspaceId: "workspace-1",
      providerProjectId: "provider-project-1",
      providerProjectName: "Storefront",
      sourceUrl: "https://pulse.example.test/projects/storefront",
      updatedAt: "2026-08-19T17:00:00.000Z",
    },
  ],
  updatedAt: "2026-08-19T17:00:00.000Z",
} as const;

const preview = {
  previewId: "preview-1",
  connectionId: "connection-1",
  environmentId: "environment-1",
  projectId: "project-1",
  providerId: "pulse",
  capability: "work.write",
  operation: "issue.update",
  resourceKind: "issue",
  resourceId: "ISSUE-1",
  summary: "Move issue to done",
  changes: [{ field: "status", before: "in_progress", after: "done" }],
  expiresAt: "2026-08-19T17:10:00.000Z",
  requiresConfirmation: true,
} as const;

describe("integration contracts", () => {
  it("decodes a credential-free connection snapshot with health and mappings", () => {
    expect(decodeConnection(connection)).toMatchObject({
      connectionId: "connection-1",
      credentialConfigured: true,
      state: "connected",
      mappings: [{ projectId: "project-1", providerProjectId: "provider-project-1" }],
    });
  });

  it.each(["token", "accessToken", "refreshToken", "secret"])(
    "rejects the credential-shaped field %s",
    (field) => {
      expect(() => decodeConnection({ ...connection, [field]: "do-not-serialize" })).toThrow();
    },
  );

  it("keeps the environment capability optional for older servers", () => {
    const descriptor = {
      environmentId: "environment-1",
      label: "Local",
      platform: { os: "darwin", arch: "arm64" },
      serverVersion: "0.0.32",
      capabilities: { repositoryIdentity: true },
    } as const;

    expect(decodeEnvironment(descriptor).capabilities.integrations).toBeUndefined();
    expect(
      decodeEnvironment({
        ...descriptor,
        capabilities: { ...descriptor.capabilities, integrations: true },
      }).capabilities.integrations,
    ).toBe(true);
  });

  it("lets an older client ignore the additive capability from a newer server", () => {
    expect(
      decodeLegacyEnvironment({
        environmentId: "environment-1",
        label: "Local",
        platform: { os: "windows", arch: "x64" },
        serverVersion: "0.0.33",
        capabilities: {
          repositoryIdentity: true,
          integrations: true,
        },
      }).capabilities,
    ).toEqual({ repositoryIdentity: true });
  });

  it("registers additive typed integration RPCs without credential payload methods", () => {
    const methods = [
      WS_METHODS.integrationsListConnections,
      WS_METHODS.integrationsDisconnect,
      WS_METHODS.integrationsSetProjectMapping,
      WS_METHODS.integrationsRemoveProjectMapping,
      WS_METHODS.integrationsIssueContext,
      WS_METHODS.integrationsIssuePreviewStatus,
      WS_METHODS.integrationsIssueConfirmStatus,
    ];

    expect(methods.every((method) => WsRpcGroup.requests.has(method))).toBe(true);
    expect(methods.some((method) => /token|secret|credential/i.test(method))).toBe(false);
  });

  it("drops provider capabilities introduced by newer servers", () => {
    expect(
      decodeConnection({
        ...connection,
        capabilities: ["work.read", "future.resource.read"],
      }).capabilities,
    ).toEqual(["work.read"]);
  });

  it("keeps provenance separate from provider-domain resource fields", () => {
    const provenance = {
      connectionId: "connection-1",
      environmentId: "environment-1",
      projectId: "project-1",
      providerId: "pulse",
      providerWorkspaceId: "workspace-1",
      providerProjectId: "provider-project-1",
      resourceKind: "issue",
      resourceId: "ISSUE-1",
      sourceUrl: "https://pulse.example.test/issues/ISSUE-1",
      fetchedAt: "2026-08-19T17:00:00.000Z",
      detailLevel: "detail",
      stale: false,
    } as const;

    expect(decodeContext(provenance)).toEqual(provenance);
    expect(() => decodeContext({ ...provenance, title: "Provider-owned title" })).toThrow();
    expect(() => decodeContext({ ...provenance, status: "done" })).toThrow();
  });

  it("requires confirmation and bounds action preview metadata", () => {
    expect(decodePreview(preview).requiresConfirmation).toBe(true);
    expect(() => decodePreview({ ...preview, requiresConfirmation: false })).toThrow();
    expect(() => decodePreview({ ...preview, operation: "x".repeat(129) })).toThrow();
    expect(() =>
      decodePreview({ ...preview, changes: Array.from({ length: 51 }, () => preview.changes[0]) }),
    ).toThrow();
  });

  it("bounds connection identifiers and project mappings", () => {
    expect(() => decodeConnection({ ...connection, providerId: "x".repeat(257) })).toThrow();
    expect(() =>
      decodeConnection({
        ...connection,
        mappings: Array.from({ length: 101 }, () => connection.mappings[0]),
      }),
    ).toThrow();
  });

  it("exposes stable public errors and audit receipts without secret payloads", () => {
    const error = new IntegrationOperationError({
      operation: "issue.update",
      reason: "permission_denied",
      detail: "Provider rejected the requested operation.",
      retryable: false,
      diagnosticId: "diagnostic-1",
    });
    const receipt = decodeReceipt({
      receiptId: "receipt-1",
      connectionId: "connection-1",
      environmentId: "environment-1",
      projectId: "project-1",
      providerId: "pulse",
      actorId: "user-1",
      capability: "work.write",
      operation: "issue.update",
      resourceKind: "issue",
      resourceId: "ISSUE-1",
      status: "failed",
      reason: "Provider rejected the requested operation.",
      occurredAt: "2026-08-19T17:00:00.000Z",
    });
    const serialized = JSON.stringify({ error, receipt });

    expect(error._tag).toBe("IntegrationOperationError");
    expect(error.message).toContain("permission_denied");
    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain("refreshToken");
    expect(serialized).not.toContain("secret");
  });
});
