import { expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import {
  createMeetingNote,
  openMeetingNote,
  parseNoteLocation,
  MeetingNoteLinkError,
} from "./meetingNotes";

it("retains the saved ref and repairs the same pairs", async () => {
  const create = vi.fn().mockResolvedValue({ id: "wsn_one", title: "Review" });
  const link = vi
    .fn()
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error("Disconnected"))
    .mockResolvedValue({});
  const input = {
    environmentId: EnvironmentId.make("original"),
    requestId: "00000000-0000-0000-0000-000000000001",
    title: "Review",
    body: "Agenda",
    projectId: ProjectId.make("project-a"),
    meeting: {
      ref: {
        type: "provider-resource" as const,
        provider: "workspace-calendar",
        resourceId: "wce_one",
      },
    },
  };
  let saved;
  try {
    await createMeetingNote({ create, link }, input);
  } catch (error) {
    expect(error).toBeInstanceOf(MeetingNoteLinkError);
    saved = (error as MeetingNoteLinkError).note;
  }
  expect(saved?.ref.resourceId).toBe("wsn_one");
  expect(await createMeetingNote({ create, link }, input)).toEqual(saved);
  expect(create.mock.calls.map(([value]) => value.requestId)).toEqual([
    input.requestId,
    input.requestId,
  ]);
  expect(link.mock.calls[0]).toEqual(link.mock.calls[2]);
  expect(link.mock.calls[1]).toEqual(link.mock.calls[3]);
});

it("opens Docs only with the original environment and an explicit project", () => {
  const ref = {
    type: "provider-resource",
    provider: "workspace-note",
    resourceId: "wsn_00000000-0000-0000-0000-000000000001",
  } as const;
  const openResource = vi.fn();
  const reopen = vi.fn();
  const resources = {
    environmentId: EnvironmentId.make("original"),
    openResource,
    reopen,
  } as unknown as Parameters<typeof openMeetingNote>[0];
  const input = { environmentId: EnvironmentId.make("original"), note: ref };
  expect(openMeetingNote(resources, input)).toBe("choose-project");
  expect(openResource).not.toHaveBeenCalled();
  expect(reopen).toHaveBeenCalledOnce();
  expect(openMeetingNote(resources, { ...input, projectId: ProjectId.make("p") })).toBe("opened");
  expect(openResource).toHaveBeenCalledWith({ tab: "docs", projectId: "p", request: ref });
  expect(
    openMeetingNote(resources, {
      ...input,
      environmentId: EnvironmentId.make("other"),
      projectId: ProjectId.make("p"),
    }),
  ).toBe("wrong-environment");
  expect(openResource).toHaveBeenCalledTimes(1);
  expect(parseNoteLocation(JSON.stringify(ref))).toEqual(ref);
  expect(parseNoteLocation(JSON.stringify({ ...ref, provider: "workspace-calendar" }))).toBeNull();
  expect(parseNoteLocation(JSON.stringify({ ...ref, resourceId: "wsn_invalid" }))).toBeNull();
});
