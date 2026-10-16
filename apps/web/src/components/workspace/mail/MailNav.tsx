import { EnvironmentId } from "@t3tools/contracts";
import { Link, useSearch } from "@tanstack/react-router";
import { FolderIcon, InboxIcon, MailIcon, SettingsIcon } from "lucide-react";

import { cn } from "../../../lib/utils";
import { pulseMailFolders } from "../../../mail/mailReadState";
import { pulseMailAccounts } from "../../../mail/mailState";
import { useEnvironmentQuery } from "../../../state/query";
import { useSidebar } from "../../ui/sidebar";
import { useState } from "react";
import { Popover, PopoverTrigger, PopoverPopup, PopoverTitle } from "../../ui/popover";
import { Button } from "../../ui/button";
import { mailFolderLabel } from "./mailItemRef";
import { MailError } from "./MailNotice";
import { useMailCapabilities } from "./useMailCapabilities";

const rowClass = (active: boolean) =>
  cn(
    "flex h-8 items-center gap-2 rounded-md px-2 text-sm",
    active
      ? "bg-sidebar-row-active font-medium"
      : "text-sidebar-muted-foreground hover:bg-sidebar-row-hover",
  );

/** Account/folder reads stay dormant until the user opens the disclosure. */
export function MailNav() {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button size="xs" variant="ghost" />}
        aria-label="Email accounts and folders"
      >
        <InboxIcon className="size-3" />
        Folders
      </PopoverTrigger>
      <PopoverPopup align="start" width="sm" padding="compact">
        <PopoverTitle>Email accounts and folders</PopoverTitle>
        <MailAccountFolders onSelectFolder={() => setOpen(false)} />
      </PopoverPopup>
    </Popover>
  );
}

function MailAccountFolders({ onSelectFolder }: { readonly onSelectFolder: () => void }) {
  const search = useSearch({ strict: false });
  const { environmentId, mailRead } = useMailCapabilities(
    search.environment ? EnvironmentId.make(search.environment) : undefined,
  );
  const { isMobile, setOpenMobile } = useSidebar();
  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };
  const accounts = useEnvironmentQuery(
    environmentId !== null && mailRead ? pulseMailAccounts({ environmentId, input: {} }) : null,
  );
  const account =
    accounts.data?.find((candidate) => candidate.id === search.account) ?? accounts.data?.[0];
  const folders = useEnvironmentQuery(
    environmentId !== null && account !== undefined
      ? pulseMailFolders({ environmentId, input: { accountId: account.id } })
      : null,
  );
  const folder = search.folder ?? "INBOX";
  return (
    <>
      <div className="mt-3">
        <div className="flex flex-col gap-1">
          {accounts.error !== null ? (
            <MailError
              className="px-2 text-xs"
              message={accounts.error}
              onRetry={accounts.refresh}
            />
          ) : null}
          {accounts.data !== null && accounts.data.length > 1 ? (
            <>
              <span className="px-2 pb-1 text-xs text-sidebar-muted-foreground">Accounts</span>
              {accounts.data.map((candidate) => (
                <Link
                  key={candidate.id}
                  onClick={closeMobileSidebar}
                  to="/workspace"
                  search={{
                    space: "mail",
                    ...(environmentId === null ? {} : { environment: environmentId }),
                    account: candidate.id,
                  }}
                  aria-current={candidate.id === account?.id ? "page" : undefined}
                  className={rowClass(candidate.id === account?.id)}
                >
                  <MailIcon className="size-4" />
                  <span className="truncate">{candidate.nickname}</span>
                </Link>
              ))}
            </>
          ) : null}
          {account !== undefined ? (
            <>
              <span className="px-2 pt-4 pb-1 text-xs text-sidebar-muted-foreground">Folders</span>
              {folders.error !== null ? (
                <MailError
                  className="px-2 text-xs"
                  message={folders.error}
                  onRetry={folders.refresh}
                />
              ) : null}
              {(folders.data?.folders ?? []).map((candidate) => {
                const active = search.project === undefined && candidate.name === folder;
                return (
                  <Link
                    key={candidate.name}
                    onClick={() => {
                      closeMobileSidebar();
                      onSelectFolder();
                    }}
                    to="/workspace"
                    search={{
                      space: "mail",
                      ...(environmentId === null ? {} : { environment: environmentId }),
                      account: account.id,
                      folder: candidate.name,
                    }}
                    aria-current={active ? "page" : undefined}
                    className={rowClass(active)}
                  >
                    {mailFolderLabel(candidate.name) === "Inbox" ? (
                      <InboxIcon className="size-4" />
                    ) : (
                      <FolderIcon className="size-4" />
                    )}
                    <span className="truncate">{mailFolderLabel(candidate.name)}</span>
                  </Link>
                );
              })}
            </>
          ) : null}
        </div>
      </div>
      <div className="mt-3 border-t border-border pt-2">
        <Link
          onClick={() => {
            closeMobileSidebar();
            onSelectFolder();
          }}
          to="/settings/email"
          className={rowClass(false)}
        >
          <SettingsIcon className="size-4" />
          Email accounts
        </Link>
      </div>
    </>
  );
}
