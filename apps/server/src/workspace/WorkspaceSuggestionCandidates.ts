import { DriveService } from "../drive/DriveService.ts";
import {
  ProjectId,
  ThreadId,
  workspaceItemKey,
  type WorkspaceLinkEndpoint,
  type WorkspaceItemRef,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import { MailConfigService } from "../mail/MailConfigService.ts";
import { MailOAuth } from "../mail/MailOAuth.ts";
import * as MailRead from "../mail/MailImapRead.ts";
import type { MailConnectionOptions } from "../mail/MailConnection.ts";
import { TelegramService } from "../telegram/TelegramService.ts";
import { WorkspaceLinksRepository } from "../persistence/WorkspaceLinks.ts";
import type { WorkspaceSuggestionMetadata } from "../textGeneration/TextGeneration.ts";

interface Candidate {
  readonly item: WorkspaceLinkEndpoint;
  readonly metadata: WorkspaceSuggestionMetadata;
}
interface LocalRow {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
}
const metadata = (
  item: WorkspaceLinkEndpoint,
  extra: { sender?: string | undefined; date?: string | undefined } = {},
): WorkspaceSuggestionMetadata => ({
  key: workspaceItemKey(item.ref),
  type: item.ref.type,
  title: (
    item.title ??
    (item.ref.type === "url"
      ? item.ref.url
      : item.ref.type === "file"
        ? "Drive file"
        : item.ref.type)
  ).slice(0, 240),
  ...(extra.sender ? { sender: extra.sender.slice(0, 160) } : {}),
  ...(extra.date ? { date: extra.date.slice(0, 64) } : {}),
});

/** User-side discovery only. This is never an agent search or an expansion of a project's grants. */
export const make = (options: { readonly imap?: MailConnectionOptions } = {}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const config = yield* MailConfigService;
    const oauth = yield* MailOAuth;
    const drive = yield* Effect.serviceOption(DriveService);
    const telegram = yield* Effect.serviceOption(TelegramService);
    const links = yield* WorkspaceLinksRepository;
    const local = Effect.gen(function* () {
      const projects =
        yield* sql<LocalRow>`SELECT project_id AS id, title, updated_at AS "updatedAt" FROM projection_projects WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 20`;
      const threads =
        yield* sql<LocalRow>`SELECT thread_id AS id, title, updated_at AS "updatedAt" FROM orchestration_v2_projection_threads WHERE deleted_at IS NULL AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 20`;
      const known = yield* links.knownEndpoints;
      const items: WorkspaceLinkEndpoint[] = [
        ...projects.slice(0, 10).map((row): WorkspaceLinkEndpoint => ({
          ref: { type: "project", projectId: ProjectId.make(row.id) },
          title: row.title,
        })),
        ...threads.map((row): WorkspaceLinkEndpoint => ({
          ref: { type: "thread", threadId: ThreadId.make(row.id) },
          title: row.title,
        })),
        ...known
          .filter((side) => side.endpoint.ref.type === "file")
          .slice(0, 10)
          .map((side) => side.endpoint),
      ];
      const dates = new Map([...projects, ...threads].map((row) => [row.id, row.updatedAt]));
      return items.map((item): Candidate => ({
        item,
        metadata: metadata(item, {
          date:
            item.ref.type === "project"
              ? dates.get(item.ref.projectId)
              : item.ref.type === "thread"
                ? dates.get(item.ref.threadId)
                : undefined,
        }),
      }));
    });
    const source = (item: WorkspaceLinkEndpoint) =>
      Effect.gen(function* () {
        const { ref } = item;
        if (ref.type === "mail") {
          const account = yield* config.getAccount(ref.accountId);
          const message = yield* MailRead.fetchByReference(
            account,
            yield* oauth.login(account.id),
            { messageId: ref.messageId, location: ref.location },
            options.imap,
          );
          const endpoint = {
            ref,
            title: (message.subject ?? item.title ?? "Mail message").slice(0, 300),
          };
          return {
            item: endpoint,
            metadata: metadata(endpoint, { sender: message.from, date: message.date }),
            snippet: message.body.text,
            revision: { ref, message },
          };
        }
        if (
          ref.type === "provider-resource" &&
          ref.provider === "telegram" &&
          Option.isSome(telegram)
        ) {
          const content = yield* telegram.value.readResource(ref.resourceId);
          const messages = "messages" in content ? content.messages.slice(0, 3) : [content];
          const newest = messages[0];
          return {
            item,
            metadata: metadata(item, {
              sender: newest?.sender,
              date: newest ? DateTime.formatIso(DateTime.makeUnsafe(newest.sentAt)) : undefined,
            }),
            snippet: messages.map((message) => message.text).join("\n"),
            revision: content,
          };
        }
        if (ref.type === "file" && Option.isSome(drive)) {
          const content = yield* drive.value.readFile({ fileId: ref.fileId });
          const endpoint = { ref, title: content.file.name };
          return {
            item: endpoint,
            metadata: {
              ...metadata(endpoint, { date: content.file.modifiedTime }),
              ...(content.file.owner ? { owner: content.file.owner } : {}),
            },
            snippet: content.body.text,
            revision: { file: content.file, body: content.body },
          };
        }
        const known = (yield* local).find(
          (candidate) => workspaceItemKey(candidate.item.ref) === workspaceItemKey(ref),
        );
        const endpoint = known?.item ?? item;
        return {
          item: endpoint,
          metadata: known?.metadata ?? metadata(endpoint),
          snippet: "",
          revision: known?.metadata ?? metadata(endpoint),
        };
      });
    const candidates = (opened: WorkspaceSuggestionMetadata) =>
      Effect.gen(function* () {
        const items = yield* local;
        const accounts = (yield* config.listAccounts).filter(
          (account) => account.credentialConfigured,
        );
        const queryText = opened.title
          .replace(/^(?:(?:re|fw|fwd):\s*)+/i, "")
          .trim()
          .slice(0, 80);
        let mailCount = 0;
        let incomplete = accounts.length > 3;
        if (queryText || opened.sender)
          for (const account of accounts.slice(0, 3)) {
            if (mailCount >= 20) {
              incomplete = true;
              break;
            }
            const result = yield* Effect.gen(function* () {
              const stored = yield* config.getAccount(account.id);
              return yield* MailRead.search(
                stored,
                yield* oauth.login(account.id),
                {
                  mailbox: "INBOX",
                  query: opened.sender
                    ? {
                        from: (/<([^>]+)>/.exec(opened.sender)?.[1] ?? opened.sender).slice(0, 160),
                      }
                    : { subject: queryText },
                  limit: 20 - mailCount,
                },
                options.imap,
              );
            }).pipe(Effect.result);
            if (result._tag === "Failure") {
              incomplete = true;
              continue;
            }
            for (const message of result.success.messages) {
              const ref: WorkspaceItemRef = {
                type: "mail",
                accountId: account.id,
                ...(message.messageId ? { messageId: message.messageId } : {}),
                location: message.ref,
              };
              const item: WorkspaceLinkEndpoint = {
                ref,
                title: (message.subject ?? "Mail message").slice(0, 300),
              };
              items.push({
                item,
                metadata: metadata(item, { sender: message.from, date: message.date }),
              });
              mailCount += 1;
            }
            incomplete ||= result.success.nextCursor !== undefined;
          }
        if (Option.isSome(drive) && queryText) {
          const connections = yield* drive.value.listConnections.pipe(
            Effect.orElseSucceed(() => []),
          );
          const connected = connections.filter((value) => value.connected);
          let count = 0;
          incomplete ||= connected.length > 3;
          for (const connection of connected.slice(0, 3)) {
            if (count >= 20) {
              incomplete = true;
              break;
            }
            const result = yield* drive.value
              .search({ connectionId: connection.id, query: queryText, limit: 20 - count })
              .pipe(Effect.result);
            if (result._tag === "Failure") {
              incomplete = true;
              continue;
            }
            incomplete ||= result.success.incomplete;
            for (const file of result.success.files) {
              const item: WorkspaceLinkEndpoint = {
                ref: { type: "file", provider: "google-drive", fileId: file.id },
                title: file.name,
              };
              items.push({
                item,
                metadata: {
                  ...metadata(item, { date: file.modifiedTime }),
                  ...(file.owner ? { owner: file.owner } : {}),
                },
              });
              count++;
            }
          }
        }
        const unique = [
          ...new Map(
            items
              .filter((candidate) => candidate.metadata.key !== opened.key)
              .map((candidate) => [candidate.metadata.key, candidate]),
          ).values(),
        ].slice(0, 60);
        const blocked = new Set(
          yield* links.blockedCandidates(
            opened.key,
            unique.map((candidate) => candidate.metadata.key),
          ),
        );
        return {
          items: unique.filter((candidate) => !blocked.has(candidate.metadata.key)),
          incomplete,
        };
      });
    return { source, candidates };
  });
export class WorkspaceSuggestionCandidates extends Context.Service<
  WorkspaceSuggestionCandidates,
  Effect.Success<ReturnType<typeof make>>
>()("t3/workspace/WorkspaceSuggestionCandidates") {}
export const layer = (options?: Parameters<typeof make>[0]) =>
  Layer.effect(WorkspaceSuggestionCandidates, make(options));
