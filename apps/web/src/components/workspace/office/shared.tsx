import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OfficeRequest, OfficeResult, TalkRequest, TalkResult } from "@t3tools/contracts";

import { createRequestQueue } from "../communicationsChat";

export const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
export function useDesktopRequest<Q, R extends { ok: boolean }>(
  invoke: ((request: Q) => Promise<R>) | undefined,
  queued = false,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef(0);
  const generation = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const queue = useMemo(
    () =>
      createRequestQueue(async (request: Q) => {
        if (!mounted.current || !invoke) return undefined;
        return invoke(request);
      }),
    [invoke],
  );
  const run = useCallback(
    async (request: Q): Promise<Extract<R, { ok: true }> | undefined> => {
      if ((!queued && pending.current) || !invoke || !mounted.current) return;
      pending.current++;
      const requestGeneration = ++generation.current;
      setBusy(true);
      setError(undefined);
      try {
        const result = await (queued ? queue(request) : invoke(request));
        if (!mounted.current || !result) return;
        if (!result.ok) {
          if (requestGeneration === generation.current)
            setError((result as R & { error: { message: string } }).error.message);
          return;
        }
        return result as Extract<R, { ok: true }>;
      } catch (cause) {
        if (!mounted.current || requestGeneration !== generation.current) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "The desktop service could not be reached. Try again.",
        );
        return;
      } finally {
        pending.current--;
        if (mounted.current) setBusy(pending.current > 0);
      }
    },
    [invoke, queue, queued],
  );
  return { run, busy, error };
}
export function useOfficeRequest(options?: { queue?: boolean }) {
  return useDesktopRequest<OfficeRequest, OfficeResult>(
    window.desktopBridge?.officeInvoke,
    options?.queue,
  );
}
export function useTalkRequest() {
  return useDesktopRequest<TalkRequest, TalkResult>(window.desktopBridge?.talkInvoke);
}
export function RequestState({ busy, error }: { busy: boolean; error: string | undefined }) {
  return (
    <div aria-live="polite">
      {busy && <p className="text-sm text-muted-foreground">Working…</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive-foreground">
          {error} Previously loaded information may be out of date.
        </p>
      )}
    </div>
  );
}
