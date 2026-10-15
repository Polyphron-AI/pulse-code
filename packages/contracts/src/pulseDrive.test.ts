import { expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import { DriveConnectionInput, DriveFileId, PulseDriveRpcs } from "./pulseDrive.ts";
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
  expect(PulseDriveRpcs).toHaveLength(12);
  expect(PulseDriveRpcs.some((rpc) => /upload|deleteFile|send|write/.test(rpc._tag))).toBe(false);
});
