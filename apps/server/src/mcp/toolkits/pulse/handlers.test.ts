import {
  EnvironmentId,
  type IssueListInput,
  IssueId,
  IssueOperationError,
  PreviewTabId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { describe, expect, vi } from "vite-plus/test";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as PulseAgentGateway from "./gateway.ts";
import { pulseToolHandlers } from "./handlers.ts";
import { PulseReportCaptureTool } from "./tools.ts";

const threadId = ThreadId.make("thread-1");
const threadProjectId = ProjectId.make("project-of-thread");
const otherProjectId = ProjectId.make("project-elsewhere");
const issueId = IssueId.make("issue-1");

const scope = (
  capabilities: ReadonlyArray<McpInvocationContext.McpCapability>,
): McpInvocationContext.McpInvocationScope => ({
  environmentId: EnvironmentId.make("environment-local"),
  threadId,
  providerSessionId: "session-1",
  providerInstanceId: ProviderInstanceId.make("codex"),
  capabilities: new Set(capabilities),
  issuedAt: 0,
});

interface GatewayStub {
  readonly issues: Partial<PulseAgentGateway.PulseAgentGateway["Service"]["issues"]>;
  readonly threadProjectId?: ProjectId | null;
}

const provide = <A, E>(
  effect: Effect.Effect<
    A,
    E,
    McpInvocationContext.McpInvocationContext | PulseAgentGateway.PulseAgentGateway
  >,
  stub: GatewayStub,
  capabilities: ReadonlyArray<McpInvocationContext.McpCapability> = ["pulse"],
) =>
  effect.pipe(
    Effect.provideService(
      PulseAgentGateway.PulseAgentGateway,
      PulseAgentGateway.PulseAgentGateway.of({
        issues: stub.issues as PulseAgentGateway.PulseAgentGateway["Service"]["issues"],
        threadProjectId: () => Effect.succeed(stub.threadProjectId ?? null),
      }),
    ),
    Effect.provideService(McpInvocationContext.McpInvocationContext, scope(capabilities)),
  );

describe("pulse toolkit handlers", () => {
  it.effect("scopes a call with no projectId to the project owning the thread", () =>
    Effect.gen(function* () {
      const detail = vi.fn(() => Effect.succeed({ marker: "detail" } as never));
      yield* provide(pulseToolHandlers.pulse_issue_get({ issueId }), {
        issues: { detail },
        threadProjectId,
      });
      expect(detail).toHaveBeenCalledWith({ projectId: threadProjectId, issueId });
    }),
  );

  it.effect("lets an explicit projectId reach across projects", () =>
    Effect.gen(function* () {
      const detail = vi.fn(() => Effect.succeed({ marker: "detail" } as never));
      yield* provide(pulseToolHandlers.pulse_issue_get({ projectId: otherProjectId, issueId }), {
        issues: { detail },
        threadProjectId,
      });
      expect(detail).toHaveBeenCalledWith({ projectId: otherProjectId, issueId });
    }),
  );

  it.effect("asks for a projectId instead of guessing when the thread has no project", () =>
    Effect.gen(function* () {
      const detail = vi.fn(() => Effect.succeed({ marker: "detail" } as never));
      const error = yield* provide(pulseToolHandlers.pulse_issue_get({ issueId }), {
        issues: { detail },
        threadProjectId: null,
      }).pipe(Effect.flip);
      expect(error).toBeInstanceOf(IssueOperationError);
      expect(error.reason).toBe("unmapped-project");
      expect(detail).not.toHaveBeenCalled();
    }),
  );

  it.effect("leaves an absent projectId absent on list so it spans every mapping", () =>
    Effect.gen(function* () {
      const list = vi.fn((_input: IssueListInput) => Effect.succeed({ marker: "list" } as never));
      yield* provide(pulseToolHandlers.pulse_issues_list({ search: "crash" }), {
        issues: { list },
        // A thread project is available; list must still not narrow to it.
        threadProjectId,
      });
      expect(list).toHaveBeenCalledWith({ search: "crash" });
    }),
  );

  it.effect("refuses every tool when the session lacks the pulse capability", () =>
    Effect.gen(function* () {
      const detail = vi.fn(() => Effect.succeed({ marker: "detail" } as never));
      const error = yield* provide(
        pulseToolHandlers.pulse_issue_get({ issueId }),
        { issues: { detail }, threadProjectId },
        ["preview"],
      ).pipe(Effect.flip);
      expect(error).toBeInstanceOf(IssueOperationError);
      expect(error.reason).toBe("permission");
      expect(detail).not.toHaveBeenCalled();
    }),
  );

  it.effect("links the thread it is running in rather than one the agent names", () =>
    Effect.gen(function* () {
      const setThreadLink = vi.fn(() => Effect.succeed({ link: null } as never));
      yield* provide(pulseToolHandlers.pulse_thread_issue_link({ issueId }), {
        issues: { setThreadLink },
        threadProjectId,
      });
      expect(setThreadLink).toHaveBeenCalledWith({
        projectId: threadProjectId,
        issueId,
        threadId,
      });
    }),
  );
});

/**
 * A `preview_recording_stop` result, verbatim in shape. The chain these tests
 * defend is: an agent records a reproduction in the collaborative browser,
 * then files it in Pulse without the recording ever passing through the model
 * as bytes -- only as the local artifact path the preview toolkit handed back.
 */
const recordingArtifact = {
  id: "artifact-1",
  tabId: PreviewTabId.make("tab-1"),
  path: "/home/dev/.t3/userdata/preview-artifacts/artifact-1.webm",
  mimeType: "video/webm",
  sizeBytes: 128_000,
  createdAt: "2026-08-23T10:00:00.000Z",
};

const captureBase = {
  origin: "https://app.example.com",
  title: "Checkout hangs after payment",
  description: "The spinner never resolves.",
  severity: "high",
} as const;

const artifactMedia = {
  source: "preview-artifact",
  kind: "video",
  fileName: "checkout-hang.webm",
  mimeType: recordingArtifact.mimeType,
  artifactPath: recordingArtifact.path,
} as const;

const inlineMedia = {
  source: "data-url",
  kind: "screenshot",
  fileName: "checkout-hang.png",
  mimeType: "image/png",
  dataUrl: "data:image/png;base64,iVBORw0KGgo=",
} as const;

const decodeCapture = Schema.decodeUnknownSync(PulseReportCaptureTool.parametersSchema);

describe("pulse_report_capture media", () => {
  it("accepts a preview-artifact reference built from preview_recording_stop", () => {
    const decoded = decodeCapture({ ...captureBase, media: [artifactMedia] });
    // The path is carried by reference, not inlined: nothing base64 crosses the
    // tool boundary, so a multi-megabyte recording costs the agent one string.
    expect(decoded.media?.[0]).toEqual(artifactMedia);
  });

  it("accepts inline data-url media alongside an artifact reference", () => {
    const decoded = decodeCapture({ ...captureBase, media: [inlineMedia, artifactMedia] });
    expect(decoded.media).toHaveLength(2);
    expect(decoded.media?.map((entry) => entry.source)).toEqual(["data-url", "preview-artifact"]);
  });

  it("rejects an artifact reference with no path rather than filing an empty report", () => {
    expect(() =>
      decodeCapture({
        ...captureBase,
        media: [{ ...artifactMedia, artifactPath: "   " }],
      }),
    ).toThrow();
  });

  it("keeps the contract's three-attachment cap on the tool surface", () => {
    expect(() =>
      decodeCapture({
        ...captureBase,
        media: [inlineMedia, inlineMedia, inlineMedia, artifactMedia],
      }),
    ).toThrow();
  });

  it.effect("files a recorded reproduction against the thread's project by default", () =>
    Effect.gen(function* () {
      const capture = vi.fn(() => Effect.succeed({ marker: "capture" } as never));
      yield* provide(
        pulseToolHandlers.pulse_report_capture(
          decodeCapture({ ...captureBase, media: [artifactMedia] }),
        ),
        { issues: { capture }, threadProjectId },
      );
      expect(capture).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: threadProjectId,
          media: [artifactMedia],
        }),
      );
    }),
  );

  it.effect("files against an explicit project when the agent names one", () =>
    Effect.gen(function* () {
      const capture = vi.fn(() => Effect.succeed({ marker: "capture" } as never));
      yield* provide(
        pulseToolHandlers.pulse_report_capture(
          decodeCapture({ ...captureBase, projectId: otherProjectId, media: [artifactMedia] }),
        ),
        { issues: { capture }, threadProjectId },
      );
      expect(capture).toHaveBeenCalledWith(expect.objectContaining({ projectId: otherProjectId }));
    }),
  );

  it.effect("refuses to file a report when the session lacks the pulse capability", () =>
    Effect.gen(function* () {
      const capture = vi.fn(() => Effect.succeed({ marker: "capture" } as never));
      const error = yield* provide(
        pulseToolHandlers.pulse_report_capture(
          decodeCapture({ ...captureBase, media: [artifactMedia] }),
        ),
        { issues: { capture }, threadProjectId },
        ["preview"],
      ).pipe(Effect.flip);
      expect(error).toBeInstanceOf(IssueOperationError);
      expect(error.reason).toBe("permission");
      expect(capture).not.toHaveBeenCalled();
    }),
  );
});
