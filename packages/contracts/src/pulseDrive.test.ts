import { expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import {
  DriveConnectionInput,
  DriveFileId,
  PulseDriveRpcs,
  WorkspaceDriveRoot,
  DriveProjectRootResult,
  DriveBrowseInput,
  DriveBrowsePage,
  DriveFile,
} from "./pulseDrive.ts";
const isFileId = Schema.is(DriveFileId);
const isConnectionInput = Schema.is(DriveConnectionInput);
const decodeFile = Schema.decodeSync(DriveFile);
const isFile = Schema.is(DriveFile);
const isBrowseInput = Schema.is(DriveBrowseInput);
const isBrowsePage = Schema.is(DriveBrowsePage);
it("bounds Drive identities and exposes only optional reader and connection RPCs", () => {
  expect(isFileId("../secret")).toBe(false);
  expect(isFileId("stable-file_1")).toBe(true);
  expect(
    isConnectionInput({
      nickname: "Drive",
      clientId: "client",
      clientSecret: "x".repeat(2049),
    }),
  ).toBe(false);
  expect(PulseDriveRpcs).toHaveLength(16);
  expect(PulseDriveRpcs.some((rpc) => /upload|deleteFile|send|write/.test(rpc._tag))).toBe(false);
});
it("keeps old file payloads compatible and bounds browse inputs and optional metadata", () => {
  const file = {
    id: "file",
    name: "File",
    mimeType: "text/plain",
    url: "https://drive.google.com/file/d/file/view",
  };
  expect(decodeFile(file)).toEqual(file);
  expect(isFile({ ...file, owners: [{ me: true }], parents: [], driveId: "shared-drive" })).toBe(
    true,
  );
  expect(isFile({ ...file, owners: Array.from({ length: 101 }, () => ({ me: true })) })).toBe(
    false,
  );
  const input = {
    projectId: "project",
    connectionId: "drv_00000000-0000-0000-0000-000000000001",
    parentId: "root",
    path: [],
    sort: "name",
    direction: "asc",
    limit: 20,
  };
  expect(isBrowseInput(input)).toBe(true);
  for (const invalid of [
    { limit: 51 },
    { limit: 0 },
    { path: Array(17).fill("folder") },
    { cursor: "x".repeat(8193) },
    { query: "x".repeat(257) },
    { owner: "x".repeat(257) },
  ])
    expect(isBrowseInput({ ...input, ...invalid })).toBe(false);
  expect(
    isBrowsePage({ files: Array.from({ length: 51 }, () => ({ ...file })), incomplete: false }),
  ).toBe(false);
  expect(isBrowsePage({ files: [], incomplete: false })).toBe(true);
});
const isRoot = Schema.is(WorkspaceDriveRoot);
const isResult = Schema.is(DriveProjectRootResult);
it("requires a stable confirmed-link designation and explicit account, with nullable unavailable states", () => {
  const root = {
    linkId: "wl_00000000-0000-0000-0000-000000000001",
    connectionId: "drv_00000000-0000-0000-0000-000000000001",
    fileId: "folder",
  };
  expect(isRoot(root)).toBe(true);
  for (const field of ["linkId", "connectionId", "fileId"])
    expect(isRoot({ ...root, [field]: "../invalid" })).toBe(false);
  expect(isResult({ root: null, state: "unconfigured" })).toBe(true);
  expect(isResult({ root, state: "binding-changed" })).toBe(true);
  expect(isResult({ root, state: "guessed" })).toBe(false);
});
