import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";

import { EnvironmentAuthorizationError } from "./auth.ts";
import { ForwardCompatibleArray, IsoDateTime, NonNegativeInt } from "./baseSchemas.ts";
import { WorkspaceItemRef } from "./pulseLinks.ts";

export const WorkspaceSavedItemKey = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(16_384),
  Schema.isPattern(/^[^\p{Cc}]+$/u),
);

/** A saved reference is a bookmark, never a relationship or permission to read its source. */
export const WorkspaceSavedItem = Schema.Struct({
  key: WorkspaceSavedItemKey,
  ref: WorkspaceItemRef,
  savedAt: IsoDateTime,
});
export type WorkspaceSavedItem = typeof WorkspaceSavedItem.Type;

export const WorkspaceSavedItemsListInput = Schema.Struct({
  cursor: Schema.optionalKey(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(32_768)),
  ),
  limit: Schema.optionalKey(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(100)),
  ),
});
export type WorkspaceSavedItemsListInput = typeof WorkspaceSavedItemsListInput.Type;

export const WorkspaceSavedItemPage = Schema.Struct({
  items: ForwardCompatibleArray(WorkspaceSavedItem).check(Schema.isMaxLength(100)),
  nextCursor: Schema.optionalKey(
    Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(32_768)),
  ),
});
export type WorkspaceSavedItemPage = typeof WorkspaceSavedItemPage.Type;

export class WorkspaceSavedItemsError extends Schema.TaggedError<WorkspaceSavedItemsError>()(
  "WorkspaceSavedItemsError",
  {
    kind: Schema.Literals(["invalid-input", "limit", "unavailable", "unsupported"]),
    message: Schema.String,
  },
) {}

export const PULSE_WORKSPACE_SAVED_ITEMS_METHODS = {
  workspaceSavedItemsAdd: "pulse.workspaceSavedItems.add",
  workspaceSavedItemsRemove: "pulse.workspaceSavedItems.remove",
  workspaceSavedItemsList: "pulse.workspaceSavedItems.list",
  workspaceSavedItemsSubscribeChanges: "pulse.workspaceSavedItems.subscribeChanges",
} as const;
const SavedItemsError = Schema.Union([WorkspaceSavedItemsError, EnvironmentAuthorizationError]);
export const PulseWorkspaceSavedItemsRpcs = [
  Rpc.make(PULSE_WORKSPACE_SAVED_ITEMS_METHODS.workspaceSavedItemsAdd, {
    payload: Schema.Struct({ ref: WorkspaceItemRef }),
    success: Schema.Void,
    error: SavedItemsError,
  }),
  Rpc.make(PULSE_WORKSPACE_SAVED_ITEMS_METHODS.workspaceSavedItemsRemove, {
    payload: Schema.Struct({ key: WorkspaceSavedItemKey }),
    success: Schema.Void,
    error: SavedItemsError,
  }),
  Rpc.make(PULSE_WORKSPACE_SAVED_ITEMS_METHODS.workspaceSavedItemsList, {
    payload: WorkspaceSavedItemsListInput,
    success: WorkspaceSavedItemPage,
    error: SavedItemsError,
  }),
  Rpc.make(PULSE_WORKSPACE_SAVED_ITEMS_METHODS.workspaceSavedItemsSubscribeChanges, {
    payload: Schema.Struct({}),
    success: NonNegativeInt,
    error: EnvironmentAuthorizationError,
    stream: true,
  }),
] as const;
