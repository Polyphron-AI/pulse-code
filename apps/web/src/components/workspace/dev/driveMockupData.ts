import {
  DRIVE_FOLDER_MIME,
  DriveFile,
  DriveConnection,
  WorkspaceLinkList,
  type DriveBinding,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import type { WorkspaceMockupSession } from "./workspaceMockupFixtures";

export const driveMockupStates = [
  "drive-t1-1",
  "drive-t1-2",
  "drive-t1-3",
  "drive-t1-4",
  "drive-t1-5",
  "drive-t1-6",
  "drive-t1-6-old",
  "drive-t1-7",
  "drive-t1-8",
  "drive-t1-9",
  "drive-t1-10-unlinked",
  "drive-t1-10-binding",
  "drive-t1-10-unavailable",
  "drive-t1-11",
  "drive-t1-12",
  "drive-t1-13",
  "drive-t1-14-disconnected",
  "drive-t1-14-old",
  "drive-t1-15",
  "drive-t1-16",
  "drive-t1-17",
  "drive-t1-18",
  "drive-t1-19",
  "drive-t1-20",
  "drive-t1-21",
  "drive-t2-1",
  "drive-t2-2",
  "drive-t2-3",
  "drive-t2-4",
  "drive-t2-5",
  "drive-t2-6",
  "drive-t2-7",
  "drive-t2-8",
  "drive-t2-retry",
  "drive-t2-retained-error",
  "drive-nested",
  "drive-grid",
  "drive-empty",
  "drive-error",
  "drive-incomplete",
  "drive-loading",
  "drive-filtered-empty",
  "drive-paged",
  "drive-page-limit",
] as const;
export type DriveMockupState = (typeof driveMockupStates)[number];
const decodeFile = Schema.decodeUnknownSync(DriveFile);
const decodeConnection = Schema.decodeUnknownSync(DriveConnection);
const decodeLinks = Schema.decodeUnknownSync(WorkspaceLinkList);
export function driveMockupData(session: WorkspaceMockupSession) {
  const connectionId = "drv_00000000-0000-4000-8000-000000000007";
  const root = decodeFile({
    id: session.seed.drive.rootId,
    name: "SynKEK",
    mimeType: DRIVE_FOLDER_MIME,
    url: `https://drive.google.com/drive/folders/${session.seed.drive.rootId}`,
  });
  // The reference's nonalphabetical order is confined to this marked presentation fixture.
  const files = [
    ...session.seed.drive.folders.map((folder) =>
      decodeFile({
        id: folder.id,
        name: folder.title,
        mimeType: root.mimeType,
        url: `https://drive.google.com/drive/folders/${folder.id}`,
        modifiedTime: `${folder.modified}T10:30:00+02:00`,
        parents: [root.id],
      }),
    ),
    ...session.seed.drive.documents.map((file) =>
      decodeFile({
        id: file.id,
        name: file.title,
        mimeType: file.mimeType,
        url: `https://docs.google.com/document/d/${file.id}/edit`,
        modifiedTime: `${file.modified}T10:30:00+02:00`,
        parents: [root.id],
      }),
    ),
  ];
  const filesWithOwners = files.map((file) => ({
    ...file,
    owners: [{ displayName: "Sample Owner", emailAddress: "owner@example.invalid", me: true }],
  }));
  const connection = decodeConnection({
    id: connectionId,
    nickname: "Sample Work",
    clientId: "sample.apps.googleusercontent.com",
    clientSecretConfigured: true,
    connected: true,
    identity: { id: "sample-owner", name: "Sample Owner", email: "owner@example.invalid" },
  });
  const links = decodeLinks({
    linked: [
      root,
      files[0],
      files[4],
      { ...root, id: "unverified", name: "Unverified linked item" },
    ].map((file, index) => ({
      id: `wl_00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      item: {
        ref: { type: "file", provider: "google-drive", fileId: file!.id },
        title: file!.name,
      },
      status: "confirmed",
      source: { type: "user" },
      updatedAt: "2026-10-13T08:30:00Z",
    })),
    suggested: [],
    truncated: false,
  });
  const bindings: readonly DriveBinding[] = [
    { connectionId, file: root },
    ...files.map((file) => ({ connectionId, file })),
  ];
  return {
    root,
    files: filesWithOwners,
    connectionId,
    connection,
    links,
    bindings,
    designation: { linkId: links.linked[0]!.id, fileId: root.id, connectionId },
  };
}
