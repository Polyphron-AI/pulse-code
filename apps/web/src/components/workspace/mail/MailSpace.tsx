import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  workspaceItemKey,
  EnvironmentId,
  type ProjectId,
  type WorkspaceItemRef,
} from "@t3tools/contracts";
import { useState, type ReactNode } from "react";

import { parseMailLocation } from "../useWorkspaceItemOpener";
import { WorkspaceEngagement } from "../WorkspaceEngagement";
import { LinkedSection } from "./LinkedSection";
import { cn } from "../../../lib/utils";
import { readLocalApi } from "../../../localApi";
import { pulseMailMessage } from "../../../mail/mailReadState";
import { pulseMailAccounts } from "../../../mail/mailState";
import { useAllEnvironmentProjectSnapshotsReady, useProjects } from "../../../state/entities";
import { useEnvironmentQuery } from "../../../state/query";
import { buildThreadRouteParams } from "../../../threadRoutes";
import { COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS } from "../../../workspaceTitlebar";
import { SidebarInset } from "../../ui/sidebar";
import { MailMessageList } from "./MailMessageList";
import { MailMessageView } from "./MailMessageView";
import { MailError, MailNotice } from "./MailNotice";
import {
  canonicalMailRef,
  mailFolderLabel,
  mailReadInput,
  mailItemRef,
  mailItemTitle,
  type MailItemRef,
} from "./mailItemRef";
import { ProjectMailList } from "./ProjectMailList";
import { useMailCapabilities } from "./useMailCapabilities";

/** Where the message list comes from: a folder, or the mail linked to a project. */
type MailSource =
  | { readonly type: "folder"; readonly accountId: string; readonly folder: string }
  | { readonly type: "project"; readonly projectId: ProjectId };

/** The Mail space: messages beside the reader. On a phone, one pane at a time. */
export function MailSpace() {
  const search = useSearch({ strict: false });
  const {
    environmentId,
    ready,
    mailRead,
    workspaceLinks: linksAvailable,
  } = useMailCapabilities(search.environment ? EnvironmentId.make(search.environment) : undefined);
  const accounts = useEnvironmentQuery(
    environmentId !== null && mailRead ? pulseMailAccounts({ environmentId, input: {} }) : null,
  );
  const account =
    accounts.data?.find((candidate) => candidate.id === search.account) ?? accounts.data?.[0];
  const folder = search.folder ?? "INBOX";
  const projects = useProjects();
  const projectsReady = useAllEnvironmentProjectSnapshotsReady();
  const project =
    search.project === undefined
      ? undefined
      : projects.find(
          (candidate) =>
            candidate.environmentId === environmentId && candidate.id === search.project,
        );
  const heading =
    search.project !== undefined
      ? `Mail / ${project?.title ?? "Project"}`
      : account === undefined
        ? "Mail"
        : `Mail / ${mailFolderLabel(folder)}`;

  const content = (): ReactNode => {
    if (environmentId === null) return <MailNotice>No environment is connected.</MailNotice>;
    if (!ready) return <MailNotice>Connecting…</MailNotice>;
    if (!mailRead) return <MailNotice>Mail is not available on this server.</MailNotice>;
    if (search.project !== undefined) {
      if (!linksAvailable) return <MailNotice>Links are not available on this server.</MailNotice>;
      if (project === undefined) {
        return (
          <MailNotice>
            {projectsReady ? "This project was removed." : "Loading projects…"}
          </MailNotice>
        );
      }
      return (
        <MailPanes
          key={`project\n${project.id}`}
          environmentId={environmentId}
          source={{ type: "project", projectId: project.id }}
        />
      );
    }
    if (accounts.data === null) {
      return accounts.error !== null ? (
        <MailError className="p-5 sm:p-8" message={accounts.error} onRetry={accounts.refresh} />
      ) : (
        <MailNotice>Loading accounts…</MailNotice>
      );
    }
    if (account === undefined) {
      return (
        <MailNotice>
          Add an email account in Settings to read mail here.{" "}
          <Link to="/settings/email" className="underline underline-offset-4">
            Email accounts
          </Link>
        </MailNotice>
      );
    }
    return (
      <MailPanes
        key={`${account.id}\n${folder}\n${search.item ?? ""}`}
        environmentId={environmentId}
        source={{ type: "folder", accountId: account.id, folder }}
        initialItem={parseMailLocation(search.item)}
      />
    );
  };

  return (
    <SidebarInset className="min-w-0">
      <header
        className={cn(
          "flex h-[var(--workspace-topbar-height)] shrink-0 items-center border-b border-border px-4 text-sm text-muted-foreground",
          COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS,
        )}
      >
        <span className="truncate">{heading}</span>
      </header>
      {accounts.data !== null && accounts.error !== null ? (
        <MailError className="p-5 sm:p-8" message={accounts.error} onRetry={accounts.refresh} />
      ) : null}
      {content()}
    </SidebarInset>
  );
}

interface MailPanesProps {
  readonly environmentId: EnvironmentId;
  readonly source: MailSource;
  readonly initialItem?: MailItemRef | null;
}

function MailPanes(props: MailPanesProps) {
  const [selected, setSelected] = useState<MailItemRef | null>(props.initialItem ?? null);
  const navigate = useNavigate();
  const selectedMessage = useEnvironmentQuery(
    selected === null
      ? null
      : pulseMailMessage({ environmentId: props.environmentId, input: mailReadInput(selected) }),
  );
  // Opens a linked item where it lives. canOpenLinkedItem keeps other types from offering Open.
  const open = (ref: WorkspaceItemRef) => {
    switch (ref.type) {
      case "mail":
        setSelected(canonicalMailRef(ref));
        return;
      case "project":
        void navigate({
          to: "/workspace",
          search: { space: "projects", environment: props.environmentId, project: ref.projectId },
        });
        return;
      case "thread":
        void navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams(scopeThreadRef(props.environmentId, ref.threadId)),
        });
        return;
      case "file":
        void readLocalApi()?.shell.openExternal(
          `https://drive.google.com/file/d/${encodeURIComponent(ref.fileId)}/view`,
        );
        return;
      case "url":
        void readLocalApi()?.shell.openExternal(ref.url);
        return;
      default:
        return;
    }
  };
  return (
    <WorkspaceEngagement
      space="mail"
      selected={selected !== null}
      list={
        props.source.type === "folder" ? (
          <MailMessageList
            environmentId={props.environmentId}
            accountId={props.source.accountId}
            folder={props.source.folder}
            selected={selected}
            onSelect={setSelected}
          />
        ) : (
          <ProjectMailList
            environmentId={props.environmentId}
            projectId={props.source.projectId}
            selected={selected}
            onSelect={setSelected}
          />
        )
      }
      linked={
        selected === null ? null : (
          <LinkedSection
            key={workspaceItemKey(selected)}
            environmentId={props.environmentId}
            item={selectedMessage.data === null ? selected : mailItemRef(selectedMessage.data)}
            title={
              selectedMessage.data === null
                ? "Message"
                : mailItemTitle(selectedMessage.data.subject)
            }
            onOpen={open}
          />
        )
      }
    >
      {selected === null ? (
        <MailNotice>Select a message to read it.</MailNotice>
      ) : (
        <MailMessageView
          key={workspaceItemKey(selected)}
          environmentId={props.environmentId}
          item={selected}
          onBack={() => setSelected(null)}
          onOpen={open}
          showLinked={false}
        />
      )}
    </WorkspaceEngagement>
  );
}
