export function validatedConferenceUrl(raw: string): string | undefined {
  const value = raw.trim();
  // oxlint-disable-next-line no-control-regex -- Reject control bytes in handoff URLs.
  if (value.length > 2048 || /[\u0000-\u001f\u007f\\]/.test(raw) || value.includes(" ")) return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return;
  }
  // URL.port erases an explicit default port, so check the original authority too.
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    /:\d+$/.test(value.split("/")[2] ?? "")
  )
    return;
  const host = url.hostname.toLowerCase();
  const meet =
    host === "meet.google.com" && /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:\/|$)/.test(url.pathname);
  const zoom =
    (host === "zoom.us" || host.endsWith(".zoom.us")) &&
    /^\/(?:j|wc)\/\d+(?:\/|$)/.test(url.pathname);
  const teams =
    (host === "teams.microsoft.com" || host === "teams.live.com") &&
    /^\/(?:l\/meetup-join\/|meet\/)\S+/.test(url.pathname);
  return meet || zoom || teams ? value : undefined;
}

export function googleScheduleUrl(day: string, accountHint?: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Choose a valid calendar date.");
  // @effect-diagnostics-next-line globalDate:off -- Fixed UTC parsing validates a civil date without reading the host clock.
  const candidate = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(candidate.getTime()) || candidate.toISOString().slice(0, 10) !== day) {
    throw new Error("Choose a valid calendar date.");
  }
  const [year, month, date] = day.split("-").map(Number);
  const url = new URL(`https://calendar.google.com/calendar/r/day/${year}/${month}/${date}`);
  if (accountHint) url.searchParams.set("authuser", accountHint);
  return url.href;
}
