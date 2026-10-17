import type {
  EnvironmentId,
  ProjectId,
  WorkspaceItemRef,
  WorkspaceLinkEndpoint,
} from "@t3tools/contracts";
import { WorkspaceItemRef as ItemSchema, WorkspaceNoteId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import type { WorkspaceResourcesState } from "../workspaceResourceState";

const isNoteId = Schema.is(WorkspaceNoteId);
const isItem = Schema.is(ItemSchema);

export type WorkspaceNoteRef = Extract<WorkspaceItemRef, { type: "provider-resource" }> & {
  readonly provider: "workspace-note";
};
export function isWorkspaceNote(ref: WorkspaceItemRef): ref is WorkspaceNoteRef {
  return (
    ref.type === "provider-resource" &&
    ref.provider === "workspace-note" &&
    isNoteId(ref.resourceId)
  );
}
export function parseNoteLocation(raw: string | undefined) {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    return isItem(value) && isWorkspaceNote(value) ? value : null;
  } catch {
    return null;
  }
}
interface CreateMeetingNoteInput {
  readonly environmentId: EnvironmentId;
  readonly requestId: string;
  readonly title: string;
  readonly body: string;
  readonly meeting: WorkspaceLinkEndpoint;
  readonly projectId?: ProjectId;
}
interface MeetingNoteCommands {
  readonly create: (input: {
    requestId: string;
    title: string;
    body: string;
  }) => Promise<{ id: string; title: string }>;
  readonly link: (input: {
    a: WorkspaceLinkEndpoint;
    b: WorkspaceLinkEndpoint;
    viewing: WorkspaceLinkEndpoint;
    source: { type: "user" };
  }) => Promise<unknown>;
}
export class MeetingNoteLinkError extends Error {
  constructor(
    readonly note: { ref: WorkspaceNoteRef; title: string },
    cause: unknown,
  ) {
    super("Note saved. Linking did not finish. Retry linking.", { cause });
  }
}
/** Commands are bound once to input.environmentId. The journal replays create on repair. */
export async function createMeetingNote(
  commands: MeetingNoteCommands,
  input: CreateMeetingNoteInput,
  onCreated?: (note: { ref: WorkspaceNoteRef; title: string }) => void,
) {
  const saved = await commands.create({
    requestId: input.requestId,
    title: input.title,
    body: input.body,
  });
  const note = {
    ref: {
      type: "provider-resource" as const,
      provider: "workspace-note" as const,
      resourceId: saved.id,
    },
    title: saved.title,
  };
  onCreated?.(note);
  try {
    await commands.link({
      a: input.meeting,
      b: note,
      viewing: input.meeting,
      source: { type: "user" },
    });
    if (input.projectId !== undefined)
      await commands.link({
        a: { ref: { type: "project", projectId: input.projectId } },
        b: note,
        viewing: input.meeting,
        source: { type: "user" },
      });
  } catch (cause) {
    throw new MeetingNoteLinkError(note, cause);
  }
  return note;
}
/** Resource selection changes neither calendar navigation nor graph grants. */
export function openMeetingNote(
  resources: WorkspaceResourcesState,
  input: { environmentId: EnvironmentId; note: WorkspaceNoteRef; projectId?: ProjectId },
) {
  if (resources.environmentId !== input.environmentId) return "wrong-environment";
  if (input.projectId === undefined) {
    resources.reopen();
    return "choose-project";
  }
  resources.openResource({ tab: "docs", projectId: input.projectId, request: input.note });
  return "opened";
}
