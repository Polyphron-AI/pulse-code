export function relativeTime(input: string): string {
  const timestamp = Date.parse(input);
  if (Number.isNaN(timestamp)) {
    return "<1m";
  }

  // Anything under a minute renders as "<1m" rather than a live seconds count.
  // The seconds ticker changed width every second and reflowed the surrounding row.
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 60) return "<1m";

  const deltaMinutes = Math.floor(deltaSeconds / 60);
  if (deltaMinutes < 60) return `${deltaMinutes}m`;

  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h`;

  const deltaDays = Math.floor(deltaHours / 24);
  return `${deltaDays}d`;
}

/** "2h 10m" for a positive millisecond delta, rounded up to the next minute. */
export function formatCountdown(deltaMs: number): string {
  const totalMinutes = Math.ceil(deltaMs / 60_000);
  if (totalMinutes < 60) return `${Math.max(totalMinutes, 1)}m`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `${totalHours}h` : `${totalHours}h ${minutes}m`;
  }
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours === 0 ? `${days}d` : `${days}d ${hours}h`;
}
