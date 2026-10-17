import { expect, it, vi } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { ServerConfig } from "./server.ts";
import {
  WorkspaceNoteCreate,
  WorkspaceNoteUpdate,
  WorkspaceNoteDelete,
  WorkspaceNoteRead,
  WorkspaceNotesError,
  PulseNotesRpcs,
} from "./pulseNotes.ts";

const requestId = "00000000-0000-0000-0000-000000000001";
const id = `wsn_${requestId}`;
const create = { requestId, title: "  Launch review · Meeting notes  ", body: "Draft" };
const decodeCreate = Schema.decodeUnknownSync(WorkspaceNoteCreate);
const decodeUpdate = Schema.decodeSync(WorkspaceNoteUpdate);
const isUpdate = Schema.is(WorkspaceNoteUpdate);
const isDelete = Schema.is(WorkspaceNoteDelete);
const decodeRead = Schema.decodeUnknownSync(WorkspaceNoteRead);
const decodeError = Schema.decodeSync(WorkspaceNotesError);
const encodeError = Schema.encodeSync(WorkspaceNotesError);
const decodeCapabilities = Schema.decodeUnknownSync(
  Schema.Struct({ pulseCapabilities: ServerConfig.fields.pulseCapabilities }),
);

it("decodes native note text with neither Buffer nor TextEncoder", () => {
  vi.stubGlobal("Buffer", undefined);
  vi.stubGlobal("TextEncoder", undefined);
  try {
    const decode = decodeCreate;
    expect(decode({ ...create, body: "😀".repeat(16384) }).body).toHaveLength(32768);
    expect(() => decode({ ...create, body: "😀".repeat(16385) })).toThrow();
  } finally {
    vi.unstubAllGlobals();
  }
});

it("trims titles and bounds UTF-8 text independently of Node globals", () => {
  const decode = decodeCreate;
  expect(decode(create).title).toBe("Launch review · Meeting notes");
  expect(decode({ ...create, body: "😀".repeat(16384) }).body).toHaveLength(32768);
  for (const input of [
    { ...create, title: "  " },
    { ...create, title: "x".repeat(301) },
    { ...create, body: "😀".repeat(16385) },
    { ...create, body: "a".repeat(65537) },
    { ...create, requestId: "00000000-0000-0000-0000-00000000000z" },
  ])
    expect(() => decode(input)).toThrow();
});

it("requires positive integer revisions and valid native IDs at every boundary", () => {
  const update = { ...create, id, expectedRevision: 1 };
  expect(decodeUpdate(update).expectedRevision).toBe(1);
  for (const expectedRevision of [0, -1, 1.5]) {
    expect(isUpdate({ ...update, expectedRevision })).toBe(false);
    expect(isDelete({ requestId, id, expectedRevision })).toBe(false);
  }
  expect(isUpdate({ ...update, id: "wsn_not-a-uuid" })).toBe(false);
});

it("requires a revision on continuation reads and rejects unbounded offsets", () => {
  const decode = decodeRead;
  expect(decode({ id })).toEqual({ id });
  expect(decode({ id, offset: 24000, revision: 2 })).toEqual({ id, offset: 24000, revision: 2 });
  for (const input of [
    { id, offset: 1 },
    { id, offset: -1 },
    { id, offset: 65537, revision: 1 },
  ])
    expect(() => decode(input)).toThrow();
});

it("serializes typed conflicts and exposes six notes RPCs", () => {
  const error = new WorkspaceNotesError({ kind: "conflict", message: "Reload the note." });
  expect(decodeError(encodeError(error))).toMatchObject({
    _tag: "WorkspaceNotesError",
    kind: "conflict",
    message: "Reload the note.",
  });
  expect(PulseNotesRpcs.map((rpc) => rpc._tag)).toEqual([
    "pulse.notes.create",
    "pulse.notes.get",
    "pulse.notes.read",
    "pulse.notes.update",
    "pulse.notes.delete",
    "pulse.notes.subscribeChanges",
  ]);
});

it("decodes legacy server capabilities and preserves explicit notes support", () => {
  const decode = decodeCapabilities;
  expect(decode({})).toEqual({});
  for (const workspaceNotes of [false, true])
    expect(decode({ pulseCapabilities: { workspaceNotes } })).toEqual({
      pulseCapabilities: { workspaceNotes },
    });
});
