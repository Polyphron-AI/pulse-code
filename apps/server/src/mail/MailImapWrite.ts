import { MailError, type MailMessageRef } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import type { ImapFlow } from "imapflow";

import type { StoredMailAccount } from "./MailConfigService.ts";
import {
  imapCall,
  withImap,
  type MailConnectionOptions,
  type MailLogin,
} from "./MailConnection.ts";
import {
  findByMessageId,
  openChecked,
  readSpecialUse,
  type MailSpecialUse,
} from "./MailImapRead.ts";

/*
 * Pulse never deletes mail. Nothing here sets \Deleted, targets Trash, expunges, or deletes a
 * mailbox, and imapflow's COPY+EXPUNGE move fallback is unreachable because MOVE is required.
 */

const fail = (kind: MailError["kind"], message: string) => new MailError({ kind, message });

const KEYWORD = /^[A-Za-z0-9$_.-]{1,64}$/;
const TRASH_NAME =
  /^(\\?trash|\\?deleted|bin|deleted items|deleted messages|\[gmail\]\/(trash|bin))$/i;

const isTrash = (name: string, special: MailSpecialUse) =>
  TRASH_NAME.test(name.trim()) || (special.trash !== undefined && name === special.trash);

const denyTrash = () => fail("access-denied", "Pulse does not move mail to Trash or delete it.");

const session = <A>(
  account: StoredMailAccount,
  login: MailLogin,
  options: MailConnectionOptions,
  use: (client: ImapFlow) => Effect.Effect<A, MailError>,
) => withImap(account, login, use, options);

const appendTo = (client: ImapFlow, mailbox: string, mime: Uint8Array, flags: Array<string>) =>
  imapCall(() => client.append(mailbox, Buffer.from(mime), flags));

const draftsOf = (special: MailSpecialUse) =>
  special.drafts === undefined || isTrash(special.drafts, special)
    ? Effect.fail(
        fail(
          "unsupported",
          "This account has no Drafts mailbox. Set one in Settings > Email > Folders > Drafts.",
        ),
      )
    : Effect.succeed(special.drafts);

/**
 * Appends a draft. An edit appends a new version and leaves the old one in Drafts. When the
 * connection drops mid-APPEND, Drafts is searched by Message-ID before reporting `outcome-unknown`.
 */
export const saveDraft = (
  account: StoredMailAccount,
  login: MailLogin,
  draft: {
    readonly mime: Uint8Array;
    /** The Message-ID header inside `mime`, used to find the draft after an ambiguous failure. */
    readonly messageId: string;
    readonly replacesRef?: MailMessageRef;
  },
  options: MailConnectionOptions = {},
) =>
  Effect.gen(function* () {
    let drafts: string | undefined;
    const appended = yield* session(account, login, options, (client) =>
      Effect.gen(function* () {
        drafts = yield* draftsOf(yield* readSpecialUse(client, account));
        const result = yield* appendTo(client, drafts, draft.mime, ["\\Draft", "\\Seen"]);
        if (result && result.uid !== undefined && result.uidValidity !== undefined) {
          return { uid: result.uid, uidValidity: Number(result.uidValidity) };
        }
        return yield* findByMessageId(client, drafts, draft.messageId);
      }),
    ).pipe(
      Effect.catchIf(
        (error) => error.kind === "unavailable" && drafts !== undefined,
        () =>
          session(account, login, options, (client) =>
            findByMessageId(client, drafts!, draft.messageId),
          ).pipe(
            Effect.catch(() => Effect.succeed(undefined)),
            Effect.flatMap((found) =>
              found
                ? Effect.succeed(found)
                : Effect.fail(
                    fail(
                      "outcome-unknown",
                      "The draft may or may not have been saved. Check Drafts before saving again.",
                    ),
                  ),
            ),
          ),
      ),
    );
    if (!appended) {
      return yield* fail("outcome-unknown", "The server saved the draft but did not report where.");
    }
    return {
      ref: { accountId: account.id, mailbox: drafts!, ...appended },
      ...(draft.replacesRef ? { previousDraftLeft: true as const } : {}),
    };
  });

/** Copies an accepted message into Sent. */
export const appendSent = (
  account: StoredMailAccount,
  login: MailLogin,
  mime: Uint8Array,
  options: MailConnectionOptions = {},
) =>
  session(account, login, options, (client) =>
    Effect.gen(function* () {
      const special = yield* readSpecialUse(client, account);
      if (special.sent === undefined || isTrash(special.sent, special)) {
        return yield* fail(
          "unsupported",
          "This account has no Sent mailbox. Set one in Settings > Email > Folders > Sent.",
        );
      }
      yield* appendTo(client, special.sent, mime, ["\\Seen"]);
      return { mailbox: special.sent };
    }),
  );

export interface MailFlagChange {
  readonly seen?: boolean | undefined;
  readonly flagged?: boolean | undefined;
  readonly answered?: boolean | undefined;
  readonly keywords?: {
    readonly add?: ReadonlyArray<string> | undefined;
    readonly remove?: ReadonlyArray<string> | undefined;
  };
}

const SYSTEM_FLAGS = { seen: "\\Seen", flagged: "\\Flagged", answered: "\\Answered" } as const;

/** Sets or clears \Seen, \Flagged, \Answered, and keywords. \Deleted and \Draft are not settable. */
export const setFlags = (
  account: StoredMailAccount,
  login: MailLogin,
  ref: MailMessageRef,
  change: MailFlagChange,
  options: MailConnectionOptions = {},
) =>
  Effect.gen(function* () {
    const add: Array<string> = [...(change.keywords?.add ?? [])];
    const remove: Array<string> = [...(change.keywords?.remove ?? [])];
    if (![...add, ...remove].every((keyword) => KEYWORD.test(keyword))) {
      return yield* fail("invalid-input", "Keywords are plain words; system flags cannot be set.");
    }
    const usesKeywords = add.length + remove.length > 0;
    for (const [key, flag] of Object.entries(SYSTEM_FLAGS)) {
      const value = change[key as keyof typeof SYSTEM_FLAGS];
      if (value === true) add.push(flag);
      if (value === false) remove.push(flag);
    }
    if (add.length + remove.length === 0) {
      return yield* fail("invalid-input", "Name at least one flag to change.");
    }
    return yield* session(account, login, options, (client) =>
      Effect.gen(function* () {
        const mailbox = yield* openChecked(client, ref, false);
        if (usesKeywords && !mailbox.permanentFlags?.has("\\*")) {
          return yield* fail("unsupported", "This mailbox does not accept custom keywords.");
        }
        const uid = String(ref.uid);
        if (add.length > 0) {
          yield* imapCall(() => client.messageFlagsAdd(uid, add, { uid: true }));
        }
        if (remove.length > 0) {
          yield* imapCall(() => client.messageFlagsRemove(uid, remove, { uid: true }));
        }
        return { ref };
      }),
    );
  });

/** Gmail labels with X-GM-EXT-1, otherwise keywords where the mailbox allows them. Never Trash. */
export const setLabels = (
  account: StoredMailAccount,
  login: MailLogin,
  ref: MailMessageRef,
  change: {
    readonly add?: ReadonlyArray<string> | undefined;
    readonly remove?: ReadonlyArray<string> | undefined;
  },
  options: MailConnectionOptions = {},
) =>
  session(account, login, options, (client) =>
    Effect.gen(function* () {
      const add = [...(change.add ?? [])];
      const remove = [...(change.remove ?? [])];
      if (add.length + remove.length === 0) {
        return yield* fail("invalid-input", "Name at least one label to change.");
      }
      const special = yield* readSpecialUse(client, account);
      if (add.some((label) => isTrash(label, special))) return yield* denyTrash();
      const mailbox = yield* openChecked(client, ref, false);
      const uid = String(ref.uid);
      if (special.capabilities.gmailLabels) {
        if (add.length > 0) {
          yield* imapCall(() => client.messageFlagsAdd(uid, add, { uid: true, useLabels: true }));
        }
        if (remove.length > 0) {
          yield* imapCall(() =>
            client.messageFlagsRemove(uid, remove, { uid: true, useLabels: true }),
          );
        }
        return { ref, applied: "labels" as const };
      }
      if (!mailbox.permanentFlags?.has("\\*")) {
        return yield* fail("unsupported", "This server supports neither labels nor keywords.");
      }
      if (![...add, ...remove].every((keyword) => KEYWORD.test(keyword))) {
        return yield* fail("invalid-input", "Without Gmail labels, labels must be plain words.");
      }
      if (add.length > 0) yield* imapCall(() => client.messageFlagsAdd(uid, add, { uid: true }));
      if (remove.length > 0) {
        yield* imapCall(() => client.messageFlagsRemove(uid, remove, { uid: true }));
      }
      return { ref, applied: "keywords" as const };
    }),
  );

const moveWith = (
  client: ImapFlow,
  account: StoredMailAccount,
  ref: MailMessageRef,
  destination: (special: MailSpecialUse) => Effect.Effect<string, MailError>,
) =>
  Effect.gen(function* () {
    const special = yield* readSpecialUse(client, account);
    if (!special.capabilities.move) {
      return yield* fail("unsupported", "This server cannot move messages (no MOVE support).");
    }
    const target = yield* destination(special);
    if (isTrash(target, special)) return yield* denyTrash();
    yield* openChecked(client, ref, false);
    const moved = yield* imapCall(() => client.messageMove(String(ref.uid), target, { uid: true }));
    const uid = moved ? moved.uidMap?.get(ref.uid) : undefined;
    return {
      mailbox: target,
      ...(moved && uid !== undefined && moved.uidValidity !== undefined
        ? {
            ref: {
              accountId: account.id,
              mailbox: target,
              uidValidity: Number(moved.uidValidity),
              uid,
            },
          }
        : {}),
    };
  });

export const move = (
  account: StoredMailAccount,
  login: MailLogin,
  ref: MailMessageRef,
  mailbox: string,
  options: MailConnectionOptions = {},
) =>
  session(account, login, options, (client) =>
    moveWith(client, account, ref, () => Effect.succeed(mailbox)),
  );

/** Moves to the configured archive, else \Archive, else \All. */
export const archive = (
  account: StoredMailAccount,
  login: MailLogin,
  ref: MailMessageRef,
  options: MailConnectionOptions = {},
) =>
  session(account, login, options, (client) =>
    moveWith(client, account, ref, (special) => {
      const target = special.archive ?? special.all;
      return target === undefined
        ? Effect.fail(
            fail(
              "unsupported",
              "This account has no Archive mailbox. Set one in Settings > Email > Folders > Archive.",
            ),
          )
        : Effect.succeed(target);
    }),
  );
