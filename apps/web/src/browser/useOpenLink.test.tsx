import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const mocks = vi.hoisted(() => ({
  preference: vi.fn(),
  preview: vi.fn(),
  external: vi.fn(),
  record: vi.fn(),
  supported: true,
}));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("~/localApi", () => ({
  readLocalApi: () => ({ shell: { openExternal: mocks.external } }),
}));
vi.mock("~/browserHistoryStore", () => ({ recordVisitForThread: mocks.record }));
vi.mock("./openFileInPreview", () => ({ openUrlInPreview: mocks.preview }));
vi.mock("./browserLinkTarget", async (original) => ({
  ...(await original<typeof import("./browserLinkTarget")>()),
  resolveBrowserLinkTargetPreference: mocks.preference,
  canOpenLinksInApp: (hasThread: boolean) => hasThread && mocks.supported,
}));
import { useOpenLink } from "./useOpenLink";

const thread = {
  environmentId: EnvironmentId.make("remote-owner"),
  threadId: ThreadId.make("thread"),
};
let renderer: ReactTestRenderer | undefined;
let open: ReturnType<typeof useOpenLink>;
function Probe() {
  open = useOpenLink(thread);
  return null;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.supported = true;
  mocks.preference.mockReset().mockResolvedValue("app");
  mocks.preview.mockReset().mockResolvedValue(AsyncResult.success(undefined));
  mocks.external.mockReset().mockResolvedValue(undefined);
  mocks.record.mockReset();
  act(() => {
    renderer = create(<Probe />);
  });
});
afterEach(() => {
  act(() => renderer?.unmount());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useOpenLink", () => {
  it("waits for the preference and uses the explicitly targeted environment", async () => {
    let hydrate!: (value: "app") => void;
    mocks.preference.mockReturnValue(
      new Promise((resolve) => {
        hydrate = resolve;
      }),
    );
    const target = { ...thread, environmentId: EnvironmentId.make("other-owner") };
    const pending = open("https://example.com", { threadRef: target });
    expect(mocks.preview).not.toHaveBeenCalled();
    hydrate("app");
    await pending;
    expect(mocks.preview).toHaveBeenCalledWith(expect.objectContaining({ threadRef: target }));
    expect(mocks.record).toHaveBeenCalledWith(target, "https://example.com");
    expect(mocks.external).not.toHaveBeenCalled();
  });
  it("falls back to the system browser when in-app opening fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.preview.mockResolvedValue(AsyncResult.failure(Cause.fail(new Error("unavailable"))));
    await open("https://example.com");
    expect(mocks.external).toHaveBeenCalledWith("https://example.com");
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("leaves an interrupted preview open cancelled", async () => {
    mocks.preview.mockResolvedValue(AsyncResult.failure(Cause.interrupt()));
    await open("https://example.com");
    expect(mocks.external).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it("uses the system browser when the client cannot host a preview", async () => {
    mocks.supported = false;
    await open("https://example.com");
    expect(mocks.external).toHaveBeenCalledWith("https://example.com");
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("honors a modifier override", async () => {
    await open("https://example.com", { event: { ctrlKey: true, metaKey: false } });
    expect(mocks.external).toHaveBeenCalledWith("https://example.com");
    expect(mocks.preview).not.toHaveBeenCalled();
  });
});
