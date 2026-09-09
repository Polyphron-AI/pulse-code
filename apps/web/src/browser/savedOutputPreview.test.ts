import { describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, MessageId, ThreadId, type AssetCreateUrlResult } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import * as Cause from "effect/Cause";
import {
  forgetSavedOutputPreview,
  readSavedOutputPreview,
  rememberSavedOutputPreview,
  resolveSavedOutputPreviewUrl,
} from "./savedOutputPreview";

const threadRef = {
  environmentId: EnvironmentId.make("remote-output"),
  threadId: ThreadId.make("thread-output"),
};
const resource = {
  _tag: "session-output" as const,
  threadId: threadRef.threadId,
  messageId: MessageId.make("message"),
  path: "F:/reports/report.html",
};
const oldUrl = "https://old.example/api/assets/expired-token/report.html";

describe("saved output preview references", () => {
  it("renews expired URLs against the current environment origin using only output identity", async () => {
    rememberSavedOutputPreview(threadRef, "renew", resource, oldUrl);
    const createAssetUrl = vi.fn(async () =>
      AsyncResult.success({ relativeUrl: "/api/assets/new-token/report.html", expiresAt: 9000 }),
    );
    const url = await resolveSavedOutputPreviewUrl({
      threadRef,
      tabId: "renew",
      url: oldUrl,
      httpBaseUrl: "https://new.example",
      createAssetUrl,
    });
    expect(url).toBe("https://new.example/api/assets/new-token/report.html");
    expect(createAssetUrl).toHaveBeenCalledWith({
      environmentId: threadRef.environmentId,
      input: { resource },
    });
    expect(readSavedOutputPreview(threadRef, "renew", url!)).toEqual(resource);
    forgetSavedOutputPreview(threadRef, "renew");
  });

  it("clears the association after navigating away and does not hijack refresh", async () => {
    rememberSavedOutputPreview(threadRef, "away", resource, oldUrl);
    expect(readSavedOutputPreview(threadRef, "away", "https://example.com/")).toBeNull();
    expect(readSavedOutputPreview(threadRef, "away", oldUrl)).toBeNull();
  });

  it("keeps references isolated by environment and tab", () => {
    rememberSavedOutputPreview(threadRef, "isolated", resource, oldUrl);
    expect(
      readSavedOutputPreview(
        { ...threadRef, environmentId: EnvironmentId.make("other") },
        "isolated",
        oldUrl,
      ),
    ).toBeNull();
    expect(readSavedOutputPreview(threadRef, "other-tab", oldUrl)).toBeNull();
    forgetSavedOutputPreview(threadRef, "isolated");
  });

  it("surfaces permanent failure once and retains the reference for explicit recovery", async () => {
    rememberSavedOutputPreview(threadRef, "missing", resource, oldUrl);
    const createAssetUrl = vi.fn(async () =>
      AsyncResult.failure<AssetCreateUrlResult, Error>(Cause.fail(new Error("Output missing"))),
    );
    await expect(
      resolveSavedOutputPreviewUrl({
        threadRef,
        tabId: "missing",
        url: oldUrl,
        httpBaseUrl: "https://remote.example",
        createAssetUrl,
      }),
    ).rejects.toThrow("Output missing");
    expect(createAssetUrl).toHaveBeenCalledTimes(1);
    expect(readSavedOutputPreview(threadRef, "missing", oldUrl)).toEqual(resource);
    forgetSavedOutputPreview(threadRef, "missing");
  });
});
