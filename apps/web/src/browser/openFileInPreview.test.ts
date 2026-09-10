import { describe, expect, it, vi } from "vite-plus/test";
import {
  EnvironmentId,
  MessageId,
  ThreadId,
  type AssetCreateUrlResult,
  type PreviewSessionSnapshot,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";

vi.mock("~/previewStateStore", () => ({
  applyPreviewServerSnapshot: vi.fn(),
  isPreviewSupportedInRuntime: () => true,
  rememberPreviewUrl: vi.fn(),
}));
vi.mock("~/rightPanelStore", () => ({
  useRightPanelStore: { getState: () => ({ openBrowser: vi.fn() }) },
}));
vi.mock("./browserDefaults", () => ({
  resolveBrowserDefaults: async () => ({ viewport: { mode: "fill" }, profileId: "default" }),
  browserDefaultOpenViewport: (defaults: { viewport: unknown }) => defaults.viewport,
  browserDefaultOpenProfileId: (defaults: { profileId: string }) => defaults.profileId,
}));
import { rememberPreviewUrl } from "~/previewStateStore";
import { openFileInPreview } from "./openFileInPreview";

const threadRef = {
  environmentId: EnvironmentId.make("remote"),
  threadId: ThreadId.make("thread"),
};
const messageId = MessageId.make("message");

describe("saved output preview", () => {
  it.each([
    ["F:/workspace/report.html", "workspace-file"],
    ["F:/outside/report.pdf", "media-file"],
  ])("opens %s with its own asset boundary", async (filePath, tag) => {
    const createAssetUrl = vi.fn(async () =>
      AsyncResult.success({ relativeUrl: "/api/assets/document", expiresAt: 3600000 }),
    );
    const openPreview = vi.fn(async () =>
      AsyncResult.success({ tabId: "tab" } as PreviewSessionSnapshot),
    );
    await openFileInPreview({
      threadRef,
      filePath,
      workspaceRoot: "F:/workspace",
      httpBaseUrl: "https://remote.example",
      createAssetUrl,
      openPreview,
    });
    expect(createAssetUrl).toHaveBeenCalledWith({
      environmentId: threadRef.environmentId,
      input: { resource: { _tag: tag, threadId: threadRef.threadId, path: filePath } },
    });
    expect(openPreview).toHaveBeenCalledOnce();
  });

  it("resolves the owning message afresh on each open and does not remember signed credentials", async () => {
    let token = 0;
    const createAssetUrl = vi.fn(async () =>
      AsyncResult.success({
        relativeUrl: `/api/assets/output?token=${++token}`,
        expiresAt: 3600000,
      }),
    );
    const openPreview = vi.fn(async () =>
      AsyncResult.success({ tabId: "tab" } as PreviewSessionSnapshot),
    );
    const input = {
      threadRef,
      messageId,
      filePath: "F:/Output Files/report.html",
      workspaceRoot: "F:/workspace",
      httpBaseUrl: "https://remote.example",
      createAssetUrl,
      openPreview,
    };
    await openFileInPreview(input);
    await openFileInPreview(input);
    expect(createAssetUrl).toHaveBeenCalledTimes(2);
    expect(createAssetUrl).toHaveBeenCalledWith({
      environmentId: threadRef.environmentId,
      input: {
        resource: {
          _tag: "session-output",
          threadId: threadRef.threadId,
          messageId,
          path: input.filePath,
        },
      },
    });
    expect(openPreview.mock.calls[0]).not.toEqual(openPreview.mock.calls[1]);
    expect(rememberPreviewUrl).not.toHaveBeenCalled();
  });

  it("stops after a missing output failure without opening or retrying", async () => {
    const createAssetUrl = vi.fn(async () =>
      AsyncResult.failure<AssetCreateUrlResult, Error>(
        Cause.fail(new Error("Saved output is missing.")),
      ),
    );
    const openPreview = vi.fn(async () =>
      AsyncResult.success({ tabId: "tab" } as PreviewSessionSnapshot),
    );
    const result = await openFileInPreview({
      threadRef,
      messageId,
      filePath: "/tmp/report.pdf",
      workspaceRoot: "/workspace",
      httpBaseUrl: "https://remote.example",
      createAssetUrl,
      openPreview,
    });
    expect(result._tag).toBe("Failure");
    expect(createAssetUrl).toHaveBeenCalledTimes(1);
    expect(openPreview).not.toHaveBeenCalled();
  });
});
