import type { EnvironmentId } from "@t3tools/contracts";
import { Link, getRouteApi } from "@tanstack/react-router";
import {
  ArrowUpRightIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  CheckSquareIcon,
  FileSearchIcon,
  MailIcon,
  MessageSquareIcon,
  PlugIcon,
  UsersIcon,
} from "lucide-react";
import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import { useEnvironments, usePrimaryEnvironmentId } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { mailEnvironment } from "../../state/mail";
import { Button } from "../ui/button";
import { SidebarInset } from "../ui/sidebar";
import { mailInputClass } from "../mail/MailSetup";
import { formatMailDate } from "../mail/mailPresentation";
import { OfficeHeader } from "./OfficeHeader";
import { MailPeoplePanel } from "../mail/MailPeoplePanel";

const plannedSpaces = [
  {
    name: "Tasks",
    icon: CheckSquareIcon,
    description:
      "One task and outcome across Office and Code. Assign, complete, and reopen from either view.",
  },
  {
    name: "Calendar",
    icon: CalendarDaysIcon,
    description:
      "Connect a calendar to review availability, prepare meetings, and keep invitations in sync.",
  },
  {
    name: "Meetings",
    icon: UsersIcon,
    description:
      "Keep agendas, decisions, notes, and follow-up tasks with the meeting they came from.",
  },
  {
    name: "SOPs",
    icon: BookOpenIcon,
    description: "Review procedures discovered from your work before using them to guide a task.",
  },
  {
    name: "Relationships",
    icon: UsersIcon,
    description:
      "Review people and organisations, then bring their linked correspondence into context.",
  },
  {
    name: "Explorer",
    icon: FileSearchIcon,
    description: "Find files and linked information within your connected accounts and workspace.",
  },
];

const officeRoute = getRouteApi("/_chat/office");

export function OfficeWorkspace() {
  const request = officeRoute.useSearch();
  const navigate = officeRoute.useNavigate();
  const enabled = useClientSettings((settings) => settings.mailAlphaEnabled);
  const update = useUpdateClientSettings();
  const { environments } = useEnvironments();
  const primary = usePrimaryEnvironmentId();
  const candidates = environments.filter(
    (item) => item.serverConfig?.environment.capabilities.mail === true,
  );
  const active = request.environment
    ? candidates.find((item) => item.environmentId === request.environment)
    : (candidates.find((item) => item.environmentId === primary) ?? candidates[0]);
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <OfficeHeader active="office" environmentId={request.environment ?? active?.environmentId}>
        {enabled && candidates.length > 0 && (
          <select
            aria-label="Office environment"
            className={mailInputClass}
            value={active?.environmentId ?? ""}
            onChange={(event) => {
              void navigate({ search: { environment: event.target.value } });
            }}
          >
            {!active && <option value="">Choose an available environment</option>}
            {candidates.map((item) => (
              <option key={item.environmentId} value={item.environmentId}>
                {item.label}
              </option>
            ))}
          </select>
        )}
      </OfficeHeader>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Your office</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Pick up a conversation, finish a draft, or connect the accounts you work from.
              </p>
            </div>
            <Link
              to="/mail"
              search={{ environment: request.environment ?? active?.environmentId }}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground outline-none hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MailIcon className="size-4" />
              Open mailbox
            </Link>
          </div>
          {!enabled ? (
            <section className="py-10">
              <h2 className="text-lg font-semibold">Start with your email</h2>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                Enable Mail alpha to connect an account, read and send messages, and keep useful
                tags and links alongside each conversation.
              </p>
              <Button className="mt-5" onClick={() => update({ mailAlphaEnabled: true })}>
                Enable Mail alpha
              </Button>
            </section>
          ) : active ? (
            <OfficeMailSummary key={active.environmentId} environmentId={active.environmentId} />
          ) : (
            <section className="py-8">
              <h2 className="text-lg font-semibold">Connect a Mail-capable environment</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Your current environments do not offer Mail. Connection settings let you manage the
                servers and services available to Pulse.
              </p>
              <Link
                to="/settings"
                className="mt-4 inline-block text-sm underline underline-offset-4"
              >
                Open settings
              </Link>
            </section>
          )}
          <section className="border-t border-border pt-7">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Workspace</h2>
              <span className="text-xs text-muted-foreground">More Office spaces are planned</span>
            </div>
            <div className="mt-3 grid gap-x-8 sm:grid-cols-2">
              {plannedSpaces.map(({ name, icon: Icon, description }) => (
                <details key={name} className="group border-b border-border py-4">
                  <summary className="flex cursor-pointer list-none items-center gap-3 rounded-sm text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="flex-1 font-medium">{name}</span>
                    <span className="text-xs text-muted-foreground group-open:hidden">Planned</span>
                    <span className="hidden text-xs text-muted-foreground group-open:inline">
                      Close
                    </span>
                  </summary>
                  <p className="mt-3 pl-7 text-sm leading-6 text-muted-foreground">
                    {description} This environment does not support this Office space yet.
                  </p>
                </details>
              ))}
            </div>
          </section>
          <div className="mt-8 flex flex-wrap gap-x-8 gap-y-4 text-sm">
            <Link
              to="/settings/integrations"
              className="inline-flex items-center gap-2 rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              <PlugIcon className="size-4 text-muted-foreground" />
              Manage connections
              <ArrowUpRightIcon className="size-3.5" />
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MessageSquareIcon className="size-4 text-muted-foreground" />
              Continue in Code
              <ArrowUpRightIcon className="size-3.5" />
            </Link>
          </div>
        </div>
      </main>
    </SidebarInset>
  );
}

function OfficeMailSummary({ environmentId }: { environmentId: EnvironmentId }) {
  const status = useEnvironmentQuery(mailEnvironment.getStatus({ environmentId, input: {} }));
  const drafts = useEnvironmentQuery(mailEnvironment.listDrafts({ environmentId, input: {} }));
  const outbox = useEnvironmentQuery(mailEnvironment.listOutbox({ environmentId, input: {} }));
  const attention = outbox.data?.filter((item) => item.state !== "accepted") ?? [];
  const recentDrafts = [...(drafts.data ?? [])]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
  return (
    <div className="grid gap-8 py-7 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.65fr)]">
      <section aria-label="Mail activity">
        <h2 className="text-base font-semibold">Pick up where you left off</h2>
        {drafts.error ? (
          <QueryError message={drafts.error} retry={drafts.refresh} />
        ) : !drafts.data ? (
          <p role="status" className="py-5 text-sm text-muted-foreground">
            Loading saved drafts…
          </p>
        ) : recentDrafts.length ? (
          <div className="mt-3 divide-y divide-border">
            {recentDrafts.map((draft) => (
              <Link
                key={draft.id}
                to="/mail"
                search={{
                  environment: environmentId,
                  account: draft.content.accountId,
                  draft: draft.id,
                  tab: "drafts",
                }}
                className="block rounded-sm py-4 outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="truncate text-sm font-medium">
                  {draft.content.subject || "Untitled draft"}
                </p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  To {draft.content.to.join(", ") || "No recipients yet"}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Saved {formatMailDate(draft.updatedAt)}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="py-6">
            <p className="text-sm">No unfinished drafts</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Messages you save in Pulse will appear here, ready to continue in your mailbox.
            </p>
          </div>
        )}
        {[...new Set((drafts.data ?? []).map((draft) => draft.content.accountId))].map(
          (accountId) => (
            <Link
              key={accountId}
              to="/mail"
              search={{ environment: environmentId, account: accountId, tab: "drafts" }}
              className="flex min-h-9 items-center gap-2 text-sm underline underline-offset-4"
            >
              Drafts for{" "}
              {status.data?.accounts.find((account) => account.id === accountId)?.name ?? "account"}
              <ArrowUpRightIcon className="size-3.5" />
            </Link>
          ),
        )}
        {outbox.error ? (
          <QueryError message={outbox.error} retry={outbox.refresh} />
        ) : (
          attention.length > 0 && (
            <div role="status" className="mt-5 rounded-md border border-border p-4">
              <h3 className="text-sm font-medium">Check your Outbox</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {attention.length} send{" "}
                {attention.length === 1 ? "operation needs" : "operations need"} attention or
                confirmation. Open Outbox before retrying a message.
              </p>
              {[...new Set(attention.map((item) => item.accountId))].map((accountId) => (
                <Link
                  key={accountId}
                  to="/mail"
                  search={{ environment: environmentId, account: accountId, tab: "outbox" }}
                  className="mt-3 block text-sm underline underline-offset-4"
                >
                  Review Outbox for{" "}
                  {status.data?.accounts.find((account) => account.id === accountId)?.name ??
                    "account"}
                </Link>
              ))}
            </div>
          )
        )}
      </section>
      <section
        aria-label="Connected email accounts"
        className="lg:border-l lg:border-border lg:pl-8"
      >
        <h2 className="text-base font-semibold">Your accounts</h2>
        {status.error ? (
          <QueryError message={status.error} retry={status.refresh} />
        ) : !status.data ? (
          <p role="status" className="py-5 text-sm text-muted-foreground">
            Loading accounts…
          </p>
        ) : (
          <>
            {!status.data.enabled && (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Mail is disabled on this environment. Enable it in the mailbox to connect or use
                accounts.
              </p>
            )}
            {status.data.accounts.length ? (
              <ul className="mt-3 divide-y divide-border">
                {status.data.accounts.map((account) => (
                  <li key={account.id} className="py-4">
                    <Link
                      to="/mail"
                      search={{ environment: environmentId, account: account.id }}
                      className="block rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <p className="truncate text-sm font-medium">{account.name}</p>
                      <p className="mt-1 break-all text-xs text-muted-foreground">
                        {account.email}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {!account.connected
                          ? "Disconnected"
                          : !status.data?.enabled
                            ? "Paused"
                            : account.smtp
                              ? "Receiving and sending configured"
                              : "Sending setup needed"}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-5 text-sm leading-6 text-muted-foreground">
                Connect an email account to bring your folders, messages, and Sent mail into Pulse.
              </p>
            )}
            <Link
              to="/mail"
              search={{ environment: environmentId }}
              className="inline-flex min-h-9 items-center gap-2 text-sm underline underline-offset-4"
            >
              Set up email
              <ArrowUpRightIcon className="size-3.5" />
            </Link>
            {status.data.enabled &&
              status.data.accounts.map((account) => (
                <div key={account.id} className="mt-5">
                  <h3 className="mb-2 text-sm font-medium">People at {account.name}</h3>
                  <MailPeoplePanel environmentId={environmentId} accountId={account.id} />
                </div>
              ))}
          </>
        )}
      </section>
    </div>
  );
}

function QueryError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div role="alert" className="py-4 text-sm">
      <p className="text-destructive">{message}</p>
      <Button size="sm" variant="outline" className="mt-2" onClick={retry}>
        Retry
      </Button>
    </div>
  );
}
