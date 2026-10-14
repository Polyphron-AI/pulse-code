import { act, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { useDesktopRequest } from "./shared";

type Result = { ok: true; value: string } | { ok: false; error: { message: string } };
function deferred() {
  let resolve!: (value: Result) => void;
  const promise = new Promise<Result>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let renderer: ReactTestRenderer | undefined;
let request: ReturnType<typeof useDesktopRequest<string, Result>>;
function Probe({
  invoke,
  queued,
}: {
  invoke: (input: string) => Promise<Result>;
  queued: boolean;
}) {
  const value = useDesktopRequest(invoke, queued);
  useLayoutEffect(() => {
    request = value;
  });
  return null;
}
afterEach(() => {
  if (renderer) act(() => renderer?.unmount());
  renderer = undefined;
  vi.unstubAllGlobals();
});
it("queues overlapping reads, holds busy, and surfaces the latest failure", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const first = deferred();
  const last = deferred();
  const invoke = vi.fn((input: string) => (input === "first" ? first.promise : last.promise));
  await act(async () => {
    renderer = create(<Probe invoke={invoke} queued />);
  });
  let requests: Promise<unknown>[] = [];
  await act(async () => {
    requests = [request.run("first"), request.run("last")];
  });
  expect(invoke.mock.calls).toEqual([["first"]]);
  expect(request.busy).toBe(true);
  await act(async () => {
    first.resolve({ ok: true, value: "first" });
    await requests[0];
  });
  expect(invoke.mock.calls).toEqual([["first"], ["last"]]);
  expect(request.busy).toBe(true);
  await act(async () => {
    last.resolve({ ok: false, error: { message: "Access denied" } });
    await requests[1];
  });
  expect(request.busy).toBe(false);
  expect(request.error).toBe("Access denied");
});
it("does not execute queued reads after unmount", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const first = deferred();
  const invoke = vi.fn(() => first.promise);
  await act(async () => {
    renderer = create(<Probe invoke={invoke} queued />);
  });
  let requests: Promise<unknown>[] = [];
  await act(async () => {
    requests = [request.run("first"), request.run("last")];
  });
  act(() => renderer?.unmount());
  first.resolve({ ok: true, value: "first" });
  await Promise.all(requests);
  expect(invoke).toHaveBeenCalledTimes(1);
});
it("retains duplicate-action rejection for existing nonqueued callers", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const first = deferred();
  const invoke = vi.fn(() => first.promise);
  await act(async () => {
    renderer = create(<Probe invoke={invoke} queued={false} />);
  });
  let requests: Promise<unknown>[] = [];
  await act(async () => {
    requests = [request.run("first"), request.run("duplicate")];
  });
  expect(invoke).toHaveBeenCalledTimes(1);
  await act(async () => {
    first.resolve({ ok: true, value: "first" });
    await Promise.all(requests);
  });
  expect(request.busy).toBe(false);
});
