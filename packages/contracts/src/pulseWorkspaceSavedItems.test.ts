import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { chatResourceId } from "./communications.ts";
import { workspaceItemKey, type WorkspaceItemRef } from "./pulseLinks.ts";
import { ServerConfig } from "./server.ts";
import {
  PulseWorkspaceSavedItemsRpcs,
  WorkspaceSavedItem,
  WorkspaceSavedItemPage,
  WorkspaceSavedItemsError,
  WorkspaceSavedItemsListInput,
} from "./pulseWorkspaceSavedItems.ts";

const ref = { type: "mail", accountId: "acct_a", messageId: "<m@test>" } as const;
const item = { key: workspaceItemKey(ref), ref, savedAt: "2026-10-17T00:00:00.000Z" };
const decode = Schema.decodeUnknownSync(WorkspaceSavedItem);
const isConfig = Schema.is(
  Schema.Struct({ pulseCapabilities: ServerConfig.fields.pulseCapabilities }),
);
const isPage = Schema.is(WorkspaceSavedItemPage);
const decodePage = Schema.decodeSync(WorkspaceSavedItemPage);
const decodeError = Schema.decodeUnknownSync(WorkspaceSavedItemsError);
const encodeError = Schema.encodeSync(WorkspaceSavedItemsError);

describe("saved reference contracts", () => {
  it("round trips refs only without recomputing server-owned keys", () => {
    expect(decode({ ...item, body: "private", snoozeUntil: "tomorrow", readGrant: true })).toEqual(
      item,
    );
    expect(decode({ ...item, key: "future:server-owned-key" }).key).toBe("future:server-owned-key");
    expect(() =>
      decode({
        ...item,
        ref: { ...ref, location: { accountId: "other", mailbox: "INBOX", uidValidity: 1, uid: 1 } },
      }),
    ).toThrow();
  });
  it("keeps moved Mail identity and location-only refs without inventing a Message-ID", () => {
    const location = { accountId: ref.accountId, mailbox: "Archive", uidValidity: 2, uid: 3 };
    expect(decode({ ...item, ref: { ...ref, location } }).key).toBe(item.key);
    const fragile: WorkspaceItemRef = { type: "mail", accountId: ref.accountId, location };
    expect(decode({ ...item, key: workspaceItemKey(fragile), ref: fragile }).ref).toEqual(fragile);
    expect(workspaceItemKey(fragile)).toMatch(/^mail-location:/);
  });
  it("retains exact W9-T1 chat workspace and provider identities", () => {
    const resource = {
      version: 1,
      transport: "server",
      connectionId: "a",
      workspaceId: "w",
      conversationId: "c",
      messageId: "1.000001",
    } as const;
    const chat = (provider: string, workspaceId: string): WorkspaceItemRef => ({
      type: "provider-resource",
      provider,
      resourceId: chatResourceId({ ...resource, workspaceId }),
    });
    const refs = [chat("slack", "w"), chat("slack", "other"), chat("discord", "w")];
    expect(new Set(refs.map(workspaceItemKey)).size).toBe(3);
    for (const ref of refs)
      expect(decode({ ...item, ref, key: workspaceItemKey(ref) }).ref).toEqual(ref);
  });
  it("bounds lists and input pages", () => {
    const valid = Schema.is(WorkspaceSavedItemsListInput);
    expect(valid({})).toBe(true);
    for (const limit of [0, -1, 101, 1.5]) expect(valid({ limit })).toBe(false);
    expect(valid({ limit: 100, cursor: "opaque" })).toBe(true);
    expect(valid({ cursor: "" })).toBe(false);
    expect(isPage({ items: Array.from({ length: 101 }, () => item) })).toBe(false);
  });
  it("skips future or malformed wire items while retaining the server cursor", () => {
    const cursor = "server-owned-cursor";
    const page = decodePage({
      items: [
        item,
        { ...item, ref: { type: "future", id: "a" } },
        { key: "bad" },
        { ...item, key: "future:key", ref: { type: "task", taskId: "\ud800" } },
      ],
      nextCursor: cursor,
    });
    expect(page).toEqual({
      items: [item, { ...item, key: "future:key", ref: { type: "task", taskId: "\ud800" } }],
      nextCursor: cursor,
    });
  });
  it("allows old capability fixtures and typed safe failures", () => {
    expect(isConfig({})).toBe(true);
    expect(isConfig({ pulseCapabilities: {} })).toBe(true);
    expect(isConfig({ pulseCapabilities: { workspaceSavedItems: true } })).toBe(true);
    const error = decodeError({
      _tag: "WorkspaceSavedItemsError",
      kind: "limit",
      message: "Full",
      cause: { token: "secret" },
    });
    expect(encodeError(error)).toEqual({
      _tag: "WorkspaceSavedItemsError",
      kind: "limit",
      message: "Full",
    });
  });
  it("declares add, remove, list and committed change streaming", () => {
    expect(PulseWorkspaceSavedItemsRpcs.map((rpc) => rpc._tag)).toEqual([
      "pulse.workspaceSavedItems.add",
      "pulse.workspaceSavedItems.remove",
      "pulse.workspaceSavedItems.list",
      "pulse.workspaceSavedItems.subscribeChanges",
    ]);
  });
});
