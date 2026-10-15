import { Link, useSearch } from "@tanstack/react-router";
import { FolderIcon, InboxIcon, MailIcon, SettingsIcon } from "lucide-react";

import { isElectron } from "../../../env";
import { cn } from "../../../lib/utils";
import { pulseMailFolders } from "../../../mail/mailReadState";
import { pulseMailAccounts } from "../../../mail/mailState";
import { useEnvironmentQuery } from "../../../state/query";
import { SidebarChromeHeader } from "../../sidebar/SidebarChrome";
import { SidebarContent, SidebarGroup, useSidebar } from "../../ui/sidebar";
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

/** The Mail space's sidebar: accounts when there are several, then the account's folders. */
export function MailNav() {
  const search = useSearch({ strict: false });
  const { environmentId, mailRead } = useMailCapabilities();
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
      <SidebarChromeHeader isElectron={isElectron} />
      <SidebarContent>
        <SidebarGroup>
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
                    search={{ space: "mail", account: candidate.id }}
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
                <span className="px-2 pt-4 pb-1 text-xs text-sidebar-muted-foreground">
                  Folders
                </span>
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
                      onClick={closeMobileSidebar}
                      to="/workspace"
                      search={{ space: "mail", account: account.id, folder: candidate.name }}
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
        </SidebarGroup>
        <div className="mt-auto p-2">
          <Link onClick={closeMobileSidebar} to="/settings/email" className={rowClass(false)}>
            <SettingsIcon className="size-4" />
            Email accounts
          </Link>
        </div>
      </SidebarContent>
    </>
  );
}
