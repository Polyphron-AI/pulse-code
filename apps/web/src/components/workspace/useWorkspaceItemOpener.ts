import * as Cause from "effect/Cause";
import { useAtomCommand } from "../../state/use-atom-command";
import { workspaceNotes } from "../../state/workspaceNotes";
import { workspaceLinks } from "../../state/workspaceLinks";
import { useConnectedEnvironmentIds } from "../../state/environments";
import { useWorkspaceCanOperate } from "./useWorkspaceCanOperate";
import { createMeetingNote } from "./meetings/meetingNotes";
import { isWorkspaceNote } from "./meetings/meetingNotes";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";
import { WorkspaceItemRef, parseTelegramResourceId, type EnvironmentId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useCallback } from "react";
import { useMailCapabilities } from "./mail/useMailCapabilities";
import { readLocalApi } from "../../localApi";
import { buildThreadRouteParams } from "../../threadRoutes";

import { isCalendarItem } from "./calendar/calendarItemRef";

const isWorkspaceItem = Schema.is(WorkspaceItemRef);

export function parseMailLocation(raw: string | undefined) {
  if (raw === undefined) return null;
  try {
    const ref: unknown = JSON.parse(raw);
    return isWorkspaceItem(ref) && ref.type === "mail" ? ref : null;
  } catch {
    return null;
  }
}

export function parseTaskLocation(raw: string | undefined) {
  if (raw === undefined) return null;
  try {
    const ref: unknown = JSON.parse(raw);
    return isWorkspaceItem(ref) && ref.type === "task" ? ref : null;
  } catch {
    return null;
  }
}

/** Open an item in its own environment, preserving the exact source-message reference. */
export function useWorkspaceItemOpener(environmentId: EnvironmentId | null) {
  const navigate = useNavigate();
  const { workspaceTasksV2 } = useMailCapabilities(environmentId ?? undefined);
  return useCallback(
    (ref: WorkspaceItemRef) => {
      if (environmentId === null) return;
      if (ref.type === "thread")
        void navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams(scopeThreadRef(environmentId, ref.threadId)),
        });
      if (ref.type === "project")
        void navigate({
          to: "/workspace",
          search: { space: "projects", environment: environmentId, project: ref.projectId },
        });
      if (ref.type === "task")
        void navigate({
          to: "/workspace",
          search: {
            space: workspaceTasksV2 ? "tasks" : "projects",
            environment: environmentId,
            item: JSON.stringify(ref),
          },
        });
      if (ref.type === "mail")
        void navigate({
          to: "/workspace",
          search: {
            space: "mail",
            environment: environmentId,
            account: ref.accountId,
            item: JSON.stringify(ref),
          },
        });
      if (isWorkspaceNote(ref))
        void navigate({
          to: "/workspace",
          search: { space: "meetings", environment: environmentId, item: JSON.stringify(ref) },
        });
      if (isCalendarItem(ref))
        void navigate({
          to: "/workspace",
          search: {
            space: "calendar",
            environment: environmentId,
            item: JSON.stringify(ref),
          },
        });
      if (ref.type === "provider-resource" && ref.provider === "telegram") {
        const resource = parseTelegramResourceId(ref.resourceId);
        if (resource)
          void navigate({
            to: "/workspace",
            search: {
              space: "office",
              officeView: "communications",
              communicationProvider: "telegram",
              environment: environmentId,
              account: resource.connectionId,
              item: ref.resourceId,
            },
          });
      }
      if (ref.type === "url" || ref.type === "file")
        void readLocalApi()?.shell.openExternal(
          ref.type === "url"
            ? ref.url
            : `https://drive.google.com/file/d/${encodeURIComponent(ref.fileId)}/view`,
        );
    },
    [environmentId, navigate, workspaceTasksV2],
  );
}

/** Capture one environment for the entire create/link sequence and any repair. */
export function useMeetingNoteCreator(environmentId: EnvironmentId) {
  const create = useAtomCommand(workspaceNotes.create, { reportFailure: false });
  const link = useAtomCommand(workspaceLinks.link, { reportFailure: false });
  const connected = useConnectedEnvironmentIds().includes(environmentId);
  const canOperate = useWorkspaceCanOperate(environmentId);
  return useCallback(
    async (
      input: Omit<Parameters<typeof createMeetingNote>[1], "environmentId">,
      onCreated?: Parameters<typeof createMeetingNote>[2],
    ) => {
      if (!connected || !canOperate)
        throw new Error("Connect with operate access to create or link notes.");
      return createMeetingNote(
        {
          create: async (input) => {
            const result = await create({ environmentId, input });
            if (result._tag === "Failure") throw Cause.squash(result.cause);
            return result.value;
          },
          link: async (input) => {
            const result = await link({ environmentId, input });
            if (result._tag === "Failure") throw Cause.squash(result.cause);
            return result.value;
          },
        },
        { ...input, environmentId },
        onCreated,
      );
    },
    [environmentId, create, link, connected, canOperate],
  );
}
