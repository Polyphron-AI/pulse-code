import { useEffect, useState } from "react";
import type { OfficeAccount, OfficeCalendar, OfficeEvent } from "@t3tools/contracts";
import { Button } from "../../ui/button";
import { Card } from "../../ui/card";
import { fieldClass, RequestState, useOfficeRequest } from "./shared";
import { MailPanel } from "./MailPanel";

export function OfficePanel() {
  const { run, busy, error } = useOfficeRequest();
  const [accounts, setAccounts] = useState<readonly OfficeAccount[]>([]);
  const [configuration, setConfiguration] = useState<{
    google: boolean;
    microsoft: boolean;
    imap: boolean;
  }>();
  const [calendars, setCalendars] = useState<readonly OfficeCalendar[]>([]);
  const [events, setEvents] = useState<readonly OfficeEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [imap, setImap] = useState(false);
  const [host, setHost] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [port, setPort] = useState("993");
  const [tls, setTls] = useState<"implicit" | "starttls">("implicit");
  const [disconnectId, setDisconnectId] = useState<string>();
  async function refresh() {
    const result = await run({ operation: "accounts.list" });
    if (!result) return;
    if (result.accounts) setAccounts(result.accounts);
    if (result.configuration) setConfiguration(result.configuration);
    setLoaded(true);
  }
  useEffect(() => {
    void refresh();
  }, [run]);
  async function connect(provider: "google" | "microsoft") {
    const result = await run({
      operation: "accounts.connectOAuth",
      provider,
      capabilities: provider === "google" ? ["mail", "calendar"] : ["mail"],
    });
    if (result) await refresh();
  }
  async function loadAgenda(refreshEvents: boolean) {
    const nextCalendars: OfficeCalendar[] = [];
    const nextEvents: OfficeEvent[] = [];
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 7 * 86400000).toISOString();
    for (const account of accounts.filter((item) => item.capabilities.includes("calendar"))) {
      const calendarResult = await run({ operation: "calendars.list", accountId: account.id });
      if (!calendarResult) return;
      nextCalendars.push(...(calendarResult.calendars ?? []));
      const eventResult = await run({
        operation: refreshEvents ? "calendars.refresh" : "calendars.events",
        accountId: account.id,
        timeMin,
        timeMax,
      });
      if (!eventResult) return;
      nextEvents.push(...(eventResult.events ?? []));
    }
    setCalendars(nextCalendars);
    setEvents(nextEvents.sort((a, b) => a.start.localeCompare(b.start)));
  }
  useEffect(() => {
    if (loaded) void loadAgenda(false);
  }, [accounts, loaded]);
  return (
    <>
      <Card className="gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Office accounts</h2>
          <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
            Refresh accounts
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Connect Gmail and Google Calendar, Microsoft email, or another mailbox over IMAP. You can
          add multiple accounts.
        </p>
        <RequestState busy={busy} error={error} />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy || !configuration?.google}
            onClick={() => void connect("google")}
          >
            Connect Google
          </Button>
          <Button
            variant="outline"
            disabled={busy || !configuration?.microsoft}
            onClick={() => void connect("microsoft")}
          >
            Connect Microsoft
          </Button>
          <Button
            variant="outline"
            disabled={busy || !configuration?.imap}
            onClick={() => setImap(!imap)}
          >
            Other email · IMAP
          </Button>
        </div>
        {configuration && (!configuration.google || !configuration.microsoft) && (
          <p className="text-sm text-muted-foreground">
            {[!configuration.google && "Google", !configuration.microsoft && "Microsoft"]
              .filter(Boolean)
              .join(" and ")}{" "}
            sign-in needs OAuth configuration in this desktop installation.
          </p>
        )}
        {imap && (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              const secret = password;
              setPassword("");
              void (async () => {
                const result = await run({
                  operation: "accounts.connectImap",
                  host: host.trim(),
                  port: Number(port),
                  username: username.trim(),
                  password: secret,
                  tls,
                });
                if (result) {
                  setImap(false);
                  await refresh();
                }
              })();
            }}
          >
            <label className="space-y-1 text-sm">
              IMAP host
              <input
                required
                className={fieldClass}
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder="imap.example.com"
              />
            </label>
            <label className="space-y-1 text-sm">
              Username or email
              <input
                required
                autoComplete="username"
                className={fieldClass}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              Password or app password
              <input
                required
                type="password"
                autoComplete="off"
                className={fieldClass}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              Security
              <select
                className={fieldClass}
                value={tls}
                onChange={(event) => {
                  const value = event.target.value === "starttls" ? "starttls" : "implicit";
                  setTls(value);
                  setPort(value === "implicit" ? "993" : "143");
                }}
              >
                <option value="implicit">TLS</option>
                <option value="starttls">STARTTLS</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              Port
              <input
                required
                type="number"
                min={1}
                max={65535}
                className={fieldClass}
                value={port}
                onChange={(event) => setPort(event.target.value)}
              />
            </label>
            <div className="flex items-end gap-2">
              <Button type="submit" disabled={busy}>
                Connect mailbox
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setImap(false);
                  setPassword("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
        {loaded && accounts.length === 0 && (
          <p className="text-sm text-muted-foreground">No accounts connected.</p>
        )}
        {accounts.map((account) => (
          <div
            key={account.id}
            className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm"
          >
            <div className="min-w-0 break-words">
              {account.email}
              <p className="text-xs text-muted-foreground">
                {account.provider} · {account.status} · {account.capabilities.join(", ")}
              </p>
              {account.status !== "connected" && (
                <p className="text-xs text-muted-foreground">
                  Refresh or connect again to restore access.
                </p>
              )}
            </div>
            {disconnectId === account.id ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() =>
                    void (async () => {
                      const result = await run({
                        operation: "accounts.disconnect",
                        accountId: account.id,
                      });
                      if (result) {
                        setDisconnectId(undefined);
                        await refresh();
                      }
                    })()
                  }
                >
                  Confirm disconnect
                </Button>
                <Button variant="outline" onClick={() => setDisconnectId(undefined)}>
                  Keep account
                </Button>
              </div>
            ) : (
              <Button variant="ghost" disabled={busy} onClick={() => setDisconnectId(account.id)}>
                Disconnect
              </Button>
            )}
          </div>
        ))}
      </Card>
      <Card id="office-calendar" className="gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Calendar · next 7 days</h2>
          <Button
            variant="outline"
            disabled={
              busy || !accounts.some((account) => account.capabilities.includes("calendar"))
            }
            onClick={() => void loadAgenda(true)}
          >
            Refresh agenda
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Choose which Google calendars appear in your combined agenda. Meetings never start a
          recording automatically.
        </p>
        {calendars.map((calendar) => (
          <label
            key={`${calendar.accountId}:${calendar.id}`}
            className="flex items-start gap-2 text-sm"
          >
            <input
              type="checkbox"
              className="mt-1"
              checked={calendar.selected}
              disabled={busy}
              onChange={(event) => {
                const selected = event.target.checked;
                void (async () => {
                  const calendarIds = calendars
                    .filter(
                      (item) =>
                        item.accountId === calendar.accountId &&
                        (item.id === calendar.id ? selected : item.selected),
                    )
                    .map((item) => item.id);
                  const result = await run({
                    operation: "calendars.select",
                    accountId: calendar.accountId,
                    calendarIds,
                  });
                  if (result) await loadAgenda(false);
                })();
              }}
            />
            <span>
              {calendar.name}
              <span className="ml-2 text-xs text-muted-foreground">
                {accounts.find((account) => account.id === calendar.accountId)?.email}
              </span>
            </span>
          </label>
        ))}
        {events.map((event) => (
          <article
            key={`${event.accountId}:${event.calendarId}:${event.id}`}
            className="border-t border-border pt-3 text-sm"
          >
            <h3 className="font-medium">{event.title || "Untitled event"}</h3>
            <p className="text-muted-foreground">
              {new Date(event.start).toLocaleString()} ·{" "}
              {accounts.find((account) => account.id === event.accountId)?.email}
            </p>
            {event.location && (
              <p className="break-words text-muted-foreground">{event.location}</p>
            )}
          </article>
        ))}
        {events.length === 0 && !busy && (
          <p className="text-sm text-muted-foreground">
            {calendars.length
              ? "No events loaded for the selected calendars."
              : "Connect Google to choose calendars and load your agenda."}
          </p>
        )}
      </Card>
      <MailPanel key={accounts.map((account) => account.id).join("|")} accounts={accounts} />
    </>
  );
}
