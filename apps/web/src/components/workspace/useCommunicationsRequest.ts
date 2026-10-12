import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatRequest, ChatResult } from "@t3tools/contracts";
import { createRequestQueue } from "./communicationsChat";

export function useCommunicationsRequest() {
  const invoke = window.desktopBridge?.communicationsInvoke;
  const queue = useMemo(
    () => (invoke ? createRequestQueue<ChatRequest, ChatResult>(invoke) : undefined),
    [invoke],
  );
  const mounted = useRef(true);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string>();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const run = useCallback(
    async (request: ChatRequest): Promise<Extract<ChatResult, { ok: true }> | undefined> => {
      if (!queue) return;
      setPending((count) => count + 1);
      setError(undefined);
      try {
        const result = await queue(request);
        if (!mounted.current) return;
        if (!result.ok) {
          setError(result.error.message);
          return;
        }
        return result;
      } catch {
        if (mounted.current)
          setError(
            "The desktop communications service could not be reached. Your text and loaded history have been kept.",
          );
        return;
      } finally {
        if (mounted.current) setPending((count) => count - 1);
      }
    },
    [queue],
  );
  return { run, busy: pending > 0, error, available: !!invoke };
}
