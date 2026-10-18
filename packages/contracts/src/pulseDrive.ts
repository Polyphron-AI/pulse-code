import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";
import { EnvironmentAuthorizationError } from "./auth.ts";
import { NonNegativeInt, PositiveInt, ProjectId } from "./baseSchemas.ts";
import { WorkspaceLinkId } from "./pulseLinks.ts";

export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
export const DRIVE_SHORTCUT_MIME = "application/vnd.google-apps.shortcut";

export const DriveConnectionId = Schema.String.check(Schema.isPattern(/^drv_[a-f0-9-]{36}$/));
export const DriveFileId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,256}$/));
export const DriveIdentity = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.optionalKey(Schema.String),
});
export type DriveIdentity = typeof DriveIdentity.Type;
export const DriveConnection = Schema.Struct({
  id: DriveConnectionId,
  nickname: Schema.String,
  clientId: Schema.String,
  clientSecretConfigured: Schema.Boolean,
  connected: Schema.Boolean,
  identity: Schema.optionalKey(DriveIdentity),
  error: Schema.optionalKey(Schema.String),
});
export type DriveConnection = typeof DriveConnection.Type;
export const DriveFile = Schema.Struct({
  id: DriveFileId,
  name: Schema.String,
  mimeType: Schema.String,
  url: Schema.String,
  modifiedTime: Schema.optionalKey(Schema.String),
  size: Schema.optionalKey(Schema.String),
  owner: Schema.optionalKey(Schema.String),
  owners: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        displayName: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(160))),
        emailAddress: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
        me: Schema.optionalKey(Schema.Boolean),
      }),
    ).check(Schema.isMaxLength(100)),
  ),
  parents: Schema.optionalKey(Schema.Array(DriveFileId).check(Schema.isMaxLength(100))),
  driveId: Schema.optionalKey(DriveFileId),
  shortcutDetails: Schema.optionalKey(
    Schema.Struct({
      targetId: DriveFileId,
      targetMimeType: Schema.String.check(Schema.isMaxLength(160)),
    }),
  ),
});
export type DriveFile = typeof DriveFile.Type;
export const DriveBinding = Schema.Struct({ connectionId: DriveConnectionId, file: DriveFile });
export type DriveBinding = typeof DriveBinding.Type;
export const WorkspaceDriveRoot = Schema.Struct({
  linkId: WorkspaceLinkId,
  connectionId: DriveConnectionId,
  fileId: DriveFileId,
});
export type WorkspaceDriveRoot = typeof WorkspaceDriveRoot.Type;
export const DriveProjectRootResult = Schema.Struct({
  root: Schema.NullOr(WorkspaceDriveRoot),
  state: Schema.Literals([
    "unconfigured",
    "available",
    "unlinked",
    "disconnected",
    "binding-changed",
    "unavailable",
  ]),
  file: Schema.optionalKey(DriveFile),
});
export type DriveProjectRootResult = typeof DriveProjectRootResult.Type;
export const DriveBrowseInput = Schema.Struct({
  projectId: ProjectId,
  connectionId: DriveConnectionId,
  parentId: DriveFileId,
  path: Schema.Array(DriveFileId).check(Schema.isMaxLength(16)),
  query: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  type: Schema.optionalKey(
    Schema.Literals(["folder", "document", "spreadsheet", "presentation", "other"]),
  ),
  owner: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  modifiedAfter: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(64))),
  modifiedBefore: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(64))),
  sort: Schema.Literals(["name", "modifiedTime"]),
  direction: Schema.Literals(["asc", "desc"]),
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })),
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(8192))),
});
export type DriveBrowseInput = typeof DriveBrowseInput.Type;
export const DriveBrowsePage = Schema.Struct({
  files: Schema.Array(DriveFile).check(Schema.isMaxLength(50)),
  rootFile: Schema.optionalKey(DriveFile),
  nextCursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(8192))),
  incomplete: Schema.Boolean,
  limitation: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(512))),
});
export type DriveBrowsePage = typeof DriveBrowsePage.Type;
export const DriveReadResult = Schema.Struct({
  connectionId: DriveConnectionId,
  file: DriveFile,
  body: Schema.Struct({
    text: Schema.String,
    truncated: Schema.Boolean,
    nextOffset: Schema.optionalKey(NonNegativeInt),
  }),
  limitation: Schema.optionalKey(Schema.String),
});
export type DriveReadResult = typeof DriveReadResult.Type;
export const DriveConnectionInput = Schema.Struct({
  id: Schema.optionalKey(DriveConnectionId),
  nickname: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
  clientId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  clientSecret: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2048))),
  clearClientSecret: Schema.optionalKey(Schema.Boolean),
});
export type DriveConnectionInput = typeof DriveConnectionInput.Type;
export class DriveError extends Schema.TaggedError<DriveError>()("DriveError", {
  kind: Schema.Literals([
    "invalid-input",
    "not-found",
    "unavailable",
    "auth-required",
    "unsupported",
    "connection-required",
    "limit-exceeded",
    "conflict",
  ]),
  message: Schema.String,
}) {}
const error = Schema.Union([DriveError, EnvironmentAuthorizationError]);
const Connection = Schema.Struct({ connectionId: DriveConnectionId });
export const PULSE_DRIVE_METHODS = {
  driveListConnections: "pulse.drive.listConnections",
  driveUpsertConnection: "pulse.drive.upsertConnection",
  driveDisconnectConnection: "pulse.drive.disconnectConnection",
  driveRemoveConnection: "pulse.drive.removeConnection",
  driveStartOAuth: "pulse.drive.startOAuth",
  driveCompleteOAuth: "pulse.drive.completeOAuth",
  driveCancelOAuth: "pulse.drive.cancelOAuth",
  driveSubscribeChanges: "pulse.drive.subscribeChanges",
  driveSearch: "pulse.drive.search",
  driveGetBinding: "pulse.drive.getBinding",
  driveBindFile: "pulse.drive.bindFile",
  driveReadFile: "pulse.drive.readFile",
  driveGetProjectRoot: "pulse.drive.getProjectRoot",
  driveSetProjectRoot: "pulse.drive.setProjectRoot",
  driveListChildren: "pulse.drive.listChildren",
  driveGetBindings: "pulse.drive.getBindings",
} as const;
export const PulseDriveRpcs = [
  Rpc.make(PULSE_DRIVE_METHODS.driveListChildren, {
    payload: DriveBrowseInput,
    success: DriveBrowsePage,
    error,
  }),
  Rpc.make(PULSE_DRIVE_METHODS.driveGetBindings, {
    payload: Schema.Struct({ fileIds: Schema.Array(DriveFileId).check(Schema.isMaxLength(200)) }),
    success: Schema.Struct({ bindings: Schema.Array(DriveBinding).check(Schema.isMaxLength(200)) }),
    error,
  }),
  Rpc.make(PULSE_DRIVE_METHODS.driveGetProjectRoot, {
    payload: Schema.Struct({ projectId: ProjectId }),
    success: DriveProjectRootResult,
    error,
  }),
  Rpc.make(PULSE_DRIVE_METHODS.driveSetProjectRoot, {
    payload: Schema.Struct({ projectId: ProjectId, root: Schema.NullOr(WorkspaceDriveRoot) }),
    success: DriveProjectRootResult,
    error,
  }),
  Rpc.make(PULSE_DRIVE_METHODS.driveListConnections, {
    payload: Schema.Struct({}),
    success: Schema.Array(DriveConnection),
    error,
  }),
  Rpc.make(PULSE_DRIVE_METHODS.driveUpsertConnection, {
    payload: DriveConnectionInput,
    success: DriveConnection,
    error,
  }),
  Rpc.make(PULSE_DRIVE_METHODS.driveDisconnectConnection, {
    payload: Connection,
    success: Schema.Void,
    error,
  }),
  Rpc.make(PULSE_DRIVE_METHODS.driveRemoveConnection, {
    payload: Connection,
    success: Schema.Void,
    error,
  }),
  Rpc.make(PULSE_DRIVE_METHODS.driveStartOAuth, {
    payload: Connection,
    success: Schema.Struct({ flowId: Schema.String, authorizeUrl: Schema.String }),
    error,
  }),
  Rpc.make(PULSE_DRIVE_METHODS.driveCompleteOAuth, {
    payload: Schema.Struct({
      flowId: Schema.String.check(Schema.isMaxLength(128)),
      redirectUrl: Schema.String.check(Schema.isMaxLength(8192)),
    }),
    success: DriveConnection,
    error,
  }),
  Rpc.make(PULSE_DRIVE_METHODS.driveCancelOAuth, {
    payload: Schema.Struct({ flowId: Schema.String.check(Schema.isMaxLength(128)) }),
    success: Schema.Void,
    error,
  }),
  Rpc.make(PULSE_DRIVE_METHODS.driveSubscribeChanges, {
    payload: Schema.Struct({}),
    success: NonNegativeInt,
    error: EnvironmentAuthorizationError,
    stream: true,
  }),
  Rpc.make(PULSE_DRIVE_METHODS.driveSearch, {
    payload: Schema.Struct({
      ...Connection.fields,
      query: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
      limit: Schema.optionalKey(PositiveInt),
    }),
    success: Schema.Struct({ files: Schema.Array(DriveFile), incomplete: Schema.Boolean }),
    error,
  }),
  Rpc.make(PULSE_DRIVE_METHODS.driveGetBinding, {
    payload: Schema.Struct({ fileId: DriveFileId }),
    success: Schema.Struct({ binding: Schema.optionalKey(DriveBinding) }),
    error,
  }),
  Rpc.make(PULSE_DRIVE_METHODS.driveBindFile, {
    payload: Schema.Struct({ ...Connection.fields, fileId: DriveFileId }),
    success: DriveBinding,
    error,
  }),
  Rpc.make(PULSE_DRIVE_METHODS.driveReadFile, {
    payload: Schema.Struct({ fileId: DriveFileId, offset: Schema.optionalKey(NonNegativeInt) }),
    success: DriveReadResult,
    error,
  }),
] as const;
