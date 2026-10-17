export function validatedConferenceUrl(raw: string): string | undefined {
  const value = raw.trim();
  // oxlint-disable-next-line no-control-regex -- Reject control bytes in handoff URLs.
  if (value.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(value)) return;
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
