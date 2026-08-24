/**
 * A clock that advances once a minute, for relative labels like "in 3 hours".
 * One interval per screen rather than per row, so a long schedule list does not
 * schedule a timer per item.
 *
 * @module features/settings/useMinuteTick
 */
import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;

export function useMinuteTick(intervalMs: number = MINUTE_MS): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return nowMs;
}
