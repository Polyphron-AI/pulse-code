import { useCallback, useEffect, useRef, useState } from "react";
import type { OfficeRequest, OfficeResult, TalkRequest, TalkResult } from "@t3tools/contracts";

export const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
export function useDesktopRequest<Q, R extends { ok: boolean }>(
  invoke: ((request: Q) => Promise<R>) | undefined,
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const run = useCallback(
    async (request: Q): Promise<Extract<R, { ok: true }> | undefined> => {
      if (pending.current || !invoke) return;
      pending.current = true;
      setBusy(true);
      setError(undefined);
      try {
        const result = await invoke(request);
        if (!mounted.current) return;
        if (!result.ok) {
          setError((result as R & { error: { message: string } }).error.message);
          return;
        }
        return result as Extract<R, { ok: true }>;
      } catch (cause) {
        if (!mounted.current) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "The desktop service could not be reached. Try again.",
        );
        return;
      } finally {
        pending.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [invoke],
  );
  return { run, busy, error };
}
export function useOfficeRequest() {
  return useDesktopRequest<OfficeRequest, OfficeResult>(window.desktopBridge?.officeInvoke);
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
