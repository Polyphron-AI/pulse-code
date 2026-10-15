import { Link, useSearch } from "@tanstack/react-router";
import { workspaceItemKey, type EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";

import { cn } from "../../../lib/utils";
import { pulseMailAccounts } from "../../../mail/mailState";
import { useEnvironmentQuery } from "../../../state/query";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../../../workspaceTitlebar";
import { SidebarInset } from "../../ui/sidebar";
import { MailMessageList } from "./MailMessageList";
import { MailMessageView } from "./MailMessageView";
import { MailError, MailNotice } from "./MailNotice";
import { mailFolderLabel, type MailItemRef } from "./mailItemRef";
import { useMailCapabilities } from "./useMailCapabilities";

/** The Mail space: a folder's messages beside the reader. On a phone, one pane at a time. */
export function MailSpace() {
  const search = useSearch({ strict: false });
  const { environmentId, ready, mailRead } = useMailCapabilities();
  const accounts = useEnvironmentQuery(
    environmentId !== null && mailRead ? pulseMailAccounts({ environmentId, input: {} }) : null,
  );
  const account =
    accounts.data?.find((candidate) => candidate.id === search.account) ?? accounts.data?.[0];
  const folder = search.folder ?? "INBOX";
  return (
    <SidebarInset className="min-w-0">
      <header
        className={cn(
          "flex h-[var(--workspace-topbar-height)] shrink-0 items-center border-b border-border px-4 text-sm text-muted-foreground",
          COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
        )}
      >
        {account === undefined ? "Mail" : `Mail / ${mailFolderLabel(folder)}`}
      </header>
      {environmentId === null ? (
        <MailNotice>No environment is connected.</MailNotice>
      ) : !ready ? (
        <MailNotice>Connecting…</MailNotice>
      ) : !mailRead ? (
        <MailNotice>Mail is not available on this server.</MailNotice>
      ) : accounts.data === null ? (
        accounts.error !== null ? (
          <MailError className="p-5 sm:p-8" message={accounts.error} onRetry={accounts.refresh} />
        ) : (
          <MailNotice>Loading accounts…</MailNotice>
        )
      ) : account === undefined ? (
        <MailNotice>
          Add an email account in Settings to read mail here.{" "}
          <Link to="/settings/email" className="underline underline-offset-4">
            Email accounts
          </Link>
        </MailNotice>
      ) : (
        <MailPanes
          key={`${account.id}\n${folder}`}
          environmentId={environmentId}
          accountId={account.id}
          folder={folder}
        />
      )}
    </SidebarInset>
  );
}

interface MailPanesProps {
  readonly environmentId: EnvironmentId;
  readonly accountId: string;
  readonly folder: string;
}

function MailPanes(props: MailPanesProps) {
  const [selected, setSelected] = useState<MailItemRef | null>(null);
  return (
    <div className="flex min-h-0 flex-1">
      <section
        aria-label="Messages"
        className={cn(
          "min-h-0 w-full overflow-y-auto md:w-80 md:shrink-0 md:border-r md:border-border",
          selected !== null && "hidden md:block",
        )}
      >
        <MailMessageList
          environmentId={props.environmentId}
          accountId={props.accountId}
          folder={props.folder}
          selected={selected}
          onSelect={setSelected}
        />
      </section>
      <section
        aria-label="Message"
        className={cn(
          "min-h-0 min-w-0 flex-1 overflow-y-auto",
          selected === null && "hidden md:block",
        )}
      >
        {selected === null ? (
          <MailNotice>Select a message to read it.</MailNotice>
        ) : (
          <MailMessageView
            key={workspaceItemKey(selected)}
            environmentId={props.environmentId}
            item={selected}
            onBack={() => setSelected(null)}
          />
        )}
      </section>
    </div>
  );
}
