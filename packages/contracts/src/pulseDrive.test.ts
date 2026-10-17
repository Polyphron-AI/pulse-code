import { expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import {
  DriveConnectionInput,
  DriveFileId,
  PulseDriveRpcs,
  WorkspaceDriveRoot,
  DriveProjectRootResult,
} from "./pulseDrive.ts";
const isFileId = Schema.is(DriveFileId);
const isConnectionInput = Schema.is(DriveConnectionInput);
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
  expect(PulseDriveRpcs).toHaveLength(14);
  expect(PulseDriveRpcs.some((rpc) => /upload|deleteFile|send|write/.test(rpc._tag))).toBe(false);
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
