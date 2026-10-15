import * as Schema from "effect/Schema";
import * as Rpc from "effect/unstable/rpc/Rpc";

import { EnvironmentAuthorizationError } from "./auth.ts";
import {
  ForwardCompatibleArray,
  IsoDateTime,
  NonNegativeInt,
  ProjectId,
  ThreadId,
} from "./baseSchemas.ts";
import { MailAccountId, MailMessageIdHeader, MailMessageRef } from "./pulseMail.ts";

const URL_MAX = 2_048;

/** A web address as a link key: http or https, no fragment, no utm_ parameters. */
export function normalizeLinkUrl(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > URL_MAX) return undefined;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  url.hash = "";
  // Filter raw segments so the surviving query keeps its original bytes and order.
  const segments = url.search.slice(1).split("&");
  const kept = segments.filter((segment) => {
    const [key = ""] = new URLSearchParams(`?${segment}`).keys();
    return !key.toLowerCase().startsWith("utm_");
  });
  if (kept.length !== segments.length) {
    url.search = kept.length === 0 ? "" : `?${kept.join("&")}`;
  }
  const normalized = url.toString();
  return normalized.length > URL_MAX ? undefined : normalized;
}

const ThreadItem = Schema.Struct({ type: Schema.Literal("thread"), threadId: ThreadId });
const ProjectItem = Schema.Struct({ type: Schema.Literal("project"), projectId: ProjectId });
const TaskItem = Schema.Struct({
  type: Schema.Literal("task"),
  taskId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
});
/** A message is keyed by Message-ID; `location` is where it was seen, used as a first guess. */
const MailItem = Schema.Struct({
  type: Schema.Literal("mail"),
  accountId: MailAccountId,
  messageId: Schema.optionalKey(MailMessageIdHeader),
  location: Schema.optionalKey(MailMessageRef),
}).check(
  Schema.makeFilter(
    (item) =>
      ((item.messageId !== undefined || item.location !== undefined) &&
        (item.location === undefined || item.location.accountId === item.accountId)) ||
      "A mail item needs a Message-ID or a location in the same account.",
  ),
);
const FileItem = Schema.Struct({
  type: Schema.Literal("file"),
  provider: Schema.Literal("google-drive"),
  fileId: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{1,256}$/)),
});
const UrlItem = Schema.Struct({
  type: Schema.Literal("url"),
  url: Schema.String.check(
    Schema.isMaxLength(URL_MAX),
    Schema.makeFilter(
      (url) => normalizeLinkUrl(url) !== undefined || "Expected an http or https address.",
    ),
  ),
});
const ProviderResourceItem = Schema.Struct({
  type: Schema.Literal("provider-resource"),
  provider: Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]{0,63}$/)),
  resourceId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512)),
});

export const WorkspaceItemRef = Schema.Union([
  ThreadItem,
  ProjectItem,
  TaskItem,
  MailItem,
  FileItem,
  UrlItem,
  ProviderResourceItem,
]);
export type WorkspaceItemRef = typeof WorkspaceItemRef.Type;

/** The same item in canonical form, or undefined when it cannot be a link endpoint. */
export function normalizeWorkspaceItemRef(ref: WorkspaceItemRef): WorkspaceItemRef | undefined {
  if (ref.type !== "url") return ref;
  const url = normalizeLinkUrl(ref.url);
  return url === undefined ? undefined : { type: "url", url };
}

const part = encodeURIComponent;

/** The stable key a link stores for an item. Normalise the ref first. */
export function workspaceItemKey(ref: WorkspaceItemRef): string {
  switch (ref.type) {
    case "thread":
      return `thread:${part(ref.threadId)}`;
    case "project":
      return `project:${part(ref.projectId)}`;
    case "task":
      return `task:${part(ref.taskId)}`;
    case "mail": {
      if (ref.messageId !== undefined) return `mail:${part(ref.accountId)}:${part(ref.messageId)}`;
      const location = ref.location;
      // The MailItem filter guarantees one of the two.
      if (location === undefined) throw new Error("A mail item needs a Message-ID or a location.");
      return `mail-location:${part(ref.accountId)}:${part(location.mailbox)}:${location.uidValidity}:${location.uid}`;
    }
    case "file":
      return `file:${ref.provider}:${part(ref.fileId)}`;
    case "url":
      return `url:${part(normalizeLinkUrl(ref.url) ?? ref.url)}`;
    case "provider-resource":
      return `provider-resource:${ref.provider}:${part(ref.resourceId)}`;
  }
}

export const WorkspaceLinkId = Schema.String.check(Schema.isPattern(/^wl_[a-f0-9-]{36}$/));
export type WorkspaceLinkId = typeof WorkspaceLinkId.Type;

export const WorkspaceLinkEndpoint = Schema.Struct({
  ref: WorkspaceItemRef,
  title: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(300))),
});
export type WorkspaceLinkEndpoint = typeof WorkspaceLinkEndpoint.Type;

export const WorkspaceLinkAction = Schema.Literals([
  "start-thread",
  "start-project",
  "add-to-project",
  "draft-reply",
  "start-automation",
]);
const UserSource = Schema.Struct({ type: Schema.Literal("user") });
const ActionSource = Schema.Struct({ type: Schema.Literal("action"), action: WorkspaceLinkAction });
const ModelSource = Schema.Struct({
  type: Schema.Literal("model"),
  model: Schema.String.check(Schema.isMaxLength(128)),
  reason: Schema.String.check(Schema.isMaxLength(280)),
});
export const WorkspaceLinkSource = Schema.Union([UserSource, ActionSource, ModelSource]);
export type WorkspaceLinkSource = typeof WorkspaceLinkSource.Type;

/** When the link was first confirmed and what the user was looking at. Survives unlink. */
export const WorkspaceLinkOrigin = Schema.Struct({
  confirmedAt: IsoDateTime,
  viewing: Schema.optionalKey(WorkspaceLinkEndpoint),
});
export type WorkspaceLinkOrigin = typeof WorkspaceLinkOrigin.Type;

/** One link as seen from one of its items: `item` is the other end. */
export const WorkspaceLinkView = Schema.Struct({
  id: WorkspaceLinkId,
  item: WorkspaceLinkEndpoint,
  status: Schema.Literals(["confirmed", "suggested"]),
  source: WorkspaceLinkSource,
  origin: Schema.optionalKey(WorkspaceLinkOrigin),
  updatedAt: IsoDateTime,
});
export type WorkspaceLinkView = typeof WorkspaceLinkView.Type;

export const WorkspaceLinkList = Schema.Struct({
  linked: ForwardCompatibleArray(WorkspaceLinkView),
  suggested: ForwardCompatibleArray(WorkspaceLinkView),
  truncated: Schema.Boolean,
});
export type WorkspaceLinkList = typeof WorkspaceLinkList.Type;

export class WorkspaceLinksError extends Schema.TaggedError<WorkspaceLinksError>()(
  "WorkspaceLinksError",
  {
    kind: Schema.Literals(["not-found", "invalid-input", "unavailable", "unsupported"]),
    message: Schema.String,
  },
) {}

export const PULSE_LINKS_METHODS = {
  pulseLinksList: "pulse.links.list",
  pulseLinksLink: "pulse.links.link",
  pulseLinksUnlink: "pulse.links.unlink",
  pulseLinksSubscribeChanges: "pulse.links.subscribeChanges",
} as const;

const LinksError = Schema.Union([WorkspaceLinksError, EnvironmentAuthorizationError]);

export const PulseLinksRpcs = [
  Rpc.make(PULSE_LINKS_METHODS.pulseLinksList, {
    payload: Schema.Struct({ item: WorkspaceItemRef }),
    success: WorkspaceLinkList,
    error: LinksError,
  }),
  Rpc.make(PULSE_LINKS_METHODS.pulseLinksLink, {
    payload: Schema.Struct({
      a: WorkspaceLinkEndpoint,
      b: WorkspaceLinkEndpoint,
      viewing: Schema.optionalKey(WorkspaceLinkEndpoint),
      source: Schema.optionalKey(Schema.Union([UserSource, ActionSource])),
    }),
    success: Schema.Struct({ id: WorkspaceLinkId }),
    error: LinksError,
  }),
  Rpc.make(PULSE_LINKS_METHODS.pulseLinksUnlink, {
    payload: Schema.Struct({ id: WorkspaceLinkId }),
    error: LinksError,
  }),
  Rpc.make(PULSE_LINKS_METHODS.pulseLinksSubscribeChanges, {
    payload: Schema.Struct({}),
    success: NonNegativeInt,
    error: EnvironmentAuthorizationError,
    stream: true,
  }),
] as const;
